"""
Gmail Ingestion Background Worker & Concurrency Controller.
Manages:
1. Singleton background polling worker.
2. Concurrent fetch protection (ensuring manual fetch and polling never overlap).
3. Guaranteed STOPPED state on server restart.
4. Clean start/stop lifecycle.
"""

import asyncio
import datetime
from typing import Dict, Any, Optional, Callable
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session

from app.config import GMAIL_COMPANY_INBOX, GMAIL_POLL_INTERVAL_SECONDS
from app.services.email_ingestion.gmail_client import GmailClient
from app.services.email_ingestion.ingestion_service import GmailIngestionService


def get_current_timestamp_str() -> str:
    """Returns local ISO formatted timestamp."""
    try:
        now = datetime.datetime.now(ZoneInfo("Asia/Kuala_Lumpur"))
    except Exception:
        now = datetime.datetime.now()
    return now.strftime("%Y-%m-%d %H:%M:%S")


class GmailBackgroundWorker:
    """
    Singleton controller managing the Gmail collection lifecycle.
    Guarantees default STOPPED state on backend initialization.
    """

    def __init__(self):
        # Default state: STOPPED
        self.is_running: bool = False
        self.poll_interval: int = GMAIL_POLL_INTERVAL_SECONDS
        self.company_inbox: str = GMAIL_COMPANY_INBOX

        self.last_check_time: Optional[str] = None
        self.last_result: Optional[Dict[str, Any]] = None
        self.last_error: Optional[str] = None

        self._lock: Optional[asyncio.Lock] = None
        self._task: Optional[asyncio.Task] = None
        self._stop_event: Optional[asyncio.Event] = None
        self._gmail_client: Optional[GmailClient] = None

    @property
    def lock(self) -> asyncio.Lock:
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    @property
    def stop_event(self) -> asyncio.Event:
        if self._stop_event is None:
            self._stop_event = asyncio.Event()
        return self._stop_event

    def get_gmail_client(self) -> GmailClient:
        if self._gmail_client is None:
            self._gmail_client = GmailClient(company_inbox=self.company_inbox)
        return self._gmail_client

    def set_gmail_client(self, client: GmailClient) -> None:
        """Allows injecting custom or mocked Gmail client."""
        self._gmail_client = client

    def get_status(self) -> Dict[str, Any]:
        """Returns comprehensive status without exposing credentials."""
        client = self.get_gmail_client()
        oauth_status = client.get_status()

        return {
            "status": "RUNNING" if self.is_running else "STOPPED",
            "is_running": self.is_running,
            "poll_interval_seconds": self.poll_interval,
            "company_inbox": self.company_inbox,
            "last_check_time": self.last_check_time or "Not started",
            "last_result": self.last_result or {
                "emails_checked": 0,
                "accounting_emails": 0,
                "attachments_downloaded": 0,
                "documents_created": 0,
                "duplicates_skipped": 0,
                "unsupported_skipped": 0,
                "errors_encountered": 0
            },
            "last_error": self.last_error,
            "oauth_configured": oauth_status.get("configured", False),
            "oauth_authorized": oauth_status.get("authorized", False),
            "needs_reauthorization": oauth_status.get("needs_reauthorization", False),
            "oauth_message": oauth_status.get("status_message", "")
        }

    async def reauthorize(self, open_browser: bool = True, timeout_seconds: int = 120):
        """
        Runs interactive OAuth re-authorization in an asynchronous threadpool
        to avoid blocking the main server loop.
        """
        client = self.get_gmail_client()
        success, message = await asyncio.to_thread(
            client.authorize,
            open_browser=open_browser,
            timeout_seconds=timeout_seconds
        )
        if success:
            self.last_error = None
            self._gmail_client = None
        return {"success": success, "message": message}

    async def run_fetch_cycle(
        self,
        db_session_factory: Callable[[], Session],
        company_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes a single Gmail fetch cycle protected by concurrency lock.
        Can be called manually or from the polling loop.
        """
        if self.lock.locked():
            return {
                "success": False,
                "status": "CONCURRENT_BUSY",
                "message": "A Gmail fetch or ingestion operation is already running.",
                "last_result": self.last_result
            }

        async with self.lock:
            client = self.get_gmail_client()
            oauth_status = client.get_status()

            if not oauth_status.get("authorized"):
                err_msg = f"Gmail is not authorized: {oauth_status.get('status_message')}"
                self.last_error = err_msg
                self.last_check_time = get_current_timestamp_str()
                return {
                    "success": False,
                    "status": "UNAUTHORIZED",
                    "needs_reauthorization": True,
                    "message": err_msg,
                    "emails_checked": 0,
                    "new_documents": 0,
                    "duplicates_skipped": 0,
                    "errors_encountered": 1
                }

            db: Session = db_session_factory()
            try:
                # 1. Retrieve message IDs from Gmail
                message_ids = client.list_message_ids(query="has:attachment", max_results=30)
                
                ingestion_service = GmailIngestionService(
                    db=db,
                    company_id=company_id,
                    gmail_client=client
                )

                emails_checked = len(message_ids)
                accounting_emails = 0
                attachments_downloaded = 0
                documents_created = 0
                duplicates_skipped = 0
                unsupported_skipped = 0
                errors_encountered = 0
                created_docs_list = []

                # 2. Process each message
                for msg_id in message_ids:
                    try:
                        msg_detail = client.get_message_detail(msg_id)
                        res = ingestion_service.process_email(msg_detail)

                        st = res.get("status", "")
                        if st == "DUPLICATE_MESSAGE_SKIPPED":
                            duplicates_skipped += 1
                        elif st == "SKIPPED_UNRELATED":
                            pass
                        elif st == "DEFERRED_UNCERTAIN":
                            pass
                        elif st in ["PROCESSED", "PARTIAL", "SKIPPED", "NO_ATTACHMENTS"]:
                            if res.get("classification") == "ACCOUNTING_RELATED" or st in ["PROCESSED", "PARTIAL"]:
                                accounting_emails += 1
                            
                            docs = res.get("documents_created", [])
                            documents_created += len(docs)
                            created_docs_list.extend(docs)
                            attachments_downloaded += res.get("attachments_processed", 0)
                            duplicates_skipped += res.get("attachments_skipped", 0)
                            errors_encountered += res.get("errors_encountered", 0)
                        elif st == "ERROR":
                            errors_encountered += 1
                    except Exception as e:
                        errors_encountered += 1

                # 3. Compile summary
                summary = {
                    "emails_checked": emails_checked,
                    "accounting_emails": accounting_emails,
                    "attachments_downloaded": attachments_downloaded,
                    "documents_created": documents_created,
                    "duplicates_skipped": duplicates_skipped,
                    "unsupported_skipped": unsupported_skipped,
                    "errors_encountered": errors_encountered,
                    "documents": created_docs_list
                }

                self.last_check_time = get_current_timestamp_str()
                self.last_result = summary
                self.last_error = None

                return {
                    "success": True,
                    "status": "COMPLETED",
                    "message": f"Fetch completed: {documents_created} new document(s) ingested.",
                    **summary
                }

            except Exception as e:
                self.last_error = str(e)
                self.last_check_time = get_current_timestamp_str()
                return {
                    "success": False,
                    "status": "ERROR",
                    "message": f"Error during Gmail fetch: {str(e)}",
                    "emails_checked": 0,
                    "documents_created": 0,
                    "duplicates_skipped": 0,
                    "errors_encountered": 1
                }
            finally:
                db.close()

    async def _polling_loop(self, db_session_factory: Callable[[], Session]) -> None:
        """Internal background polling loop with responsive stop checking."""
        while self.is_running:
            try:
                await self.run_fetch_cycle(db_session_factory)
            except Exception as e:
                self.last_error = f"Unhandled error in polling loop: {e}"

            # Wait for poll_interval seconds in small 1-second slices so stopping is immediate
            for _ in range(self.poll_interval):
                if not self.is_running or self.stop_event.is_set():
                    break
                await asyncio.sleep(1)

    def start(
        self,
        db_session_factory: Callable[[], Session],
        poll_interval: Optional[int] = None
    ) -> Dict[str, Any]:
        """Starts the background polling worker if not already running."""
        if self.is_running:
            return {
                "started": False,
                "message": "Gmail collection worker is already running.",
                "status": self.get_status()
            }

        client = self.get_gmail_client()
        oauth = client.get_status()
        if not oauth.get("authorized"):
            return {
                "started": False,
                "message": f"Cannot start worker: Gmail is not authorized ({oauth.get('status_message')}).",
                "status": self.get_status()
            }

        if poll_interval and poll_interval > 0:
            self.poll_interval = poll_interval

        self.is_running = True
        self.stop_event.clear()
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        self._task = loop.create_task(self._polling_loop(db_session_factory))

        return {
            "started": True,
            "message": f"Gmail collection worker started with {self.poll_interval}s interval.",
            "status": self.get_status()
        }

    def stop(self) -> Dict[str, Any]:
        """Stops the background polling worker cleanly."""
        if not self.is_running:
            return {
                "stopped": False,
                "message": "Gmail collection worker is already stopped.",
                "status": self.get_status()
            }

        self.is_running = False
        self.stop_event.set()
        if self._task and not self._task.done():
            self._task.cancel()

        return {
            "stopped": True,
            "message": "Gmail collection worker stopped.",
            "status": self.get_status()
        }


# Global singleton instance (defaults to STOPPED on server restart)
worker_singleton = GmailBackgroundWorker()
