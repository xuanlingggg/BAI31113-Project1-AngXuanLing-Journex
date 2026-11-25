"""
Local Folder Ingestion Background Worker & Concurrency Controller.
Manages:
1. Singleton background polling worker for local folder monitoring.
2. Concurrent scan protection (ensuring manual scan and background polling never overlap).
3. Guaranteed STOPPED state on server restart.
4. Clean start/stop lifecycle.
"""

import asyncio
import datetime
from pathlib import Path
from typing import Dict, Any, Optional, Callable
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session

from app.config import LOCAL_FOLDER_PATH, LOCAL_FOLDER_POLL_INTERVAL_SECONDS, MS_WANI_UPLOAD_FOLDER
from app.services.folder_ingestion.folder_service import LocalFolderIngestionService


def get_current_timestamp_str() -> str:
    """Returns local ISO formatted timestamp."""
    try:
        now = datetime.datetime.now(ZoneInfo("Asia/Kuala_Lumpur"))
    except Exception:
        now = datetime.datetime.now()
    return now.strftime("%Y-%m-%d %H:%M:%S")


class LocalFolderBackgroundWorker:
    """
    Singleton controller managing the Local Folder collection lifecycle.
    Guarantees default STOPPED state on backend initialization.
    """

    def __init__(self):
        # Default state: STOPPED
        self.is_running: bool = False
        self.poll_interval: int = LOCAL_FOLDER_POLL_INTERVAL_SECONDS
        self.folder_path: Path = LOCAL_FOLDER_PATH

        self.last_scan_time: Optional[str] = None
        self.last_result: Optional[Dict[str, Any]] = None
        self.last_error: Optional[str] = None

        self._lock: Optional[asyncio.Lock] = None
        self._task: Optional[asyncio.Task] = None
        self._stop_event: Optional[asyncio.Event] = None

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

    def _refresh_config(self):
        """Dynamically re-reads .env so path changes take effect immediately without server restart."""
        try:
            import os
            from dotenv import load_dotenv
            from app.config import BASE_DIR
            load_dotenv(BASE_DIR / ".env", override=True)
            env_path = os.getenv("LOCAL_FOLDER_PATH")
            if env_path:
                self.folder_path = Path(env_path).resolve()
            else:
                self.folder_path = LOCAL_FOLDER_PATH or MS_WANI_UPLOAD_FOLDER
            env_interval = os.getenv("LOCAL_FOLDER_POLL_INTERVAL_SECONDS")
            if env_interval:
                try:
                    self.poll_interval = int(env_interval)
                except ValueError:
                    pass
        except Exception:
            pass


    def get_status(self) -> Dict[str, Any]:
        """Returns comprehensive status of local folder collection."""
        self._refresh_config()
        folder_exists = self.folder_path.exists() and self.folder_path.is_dir()
        files_detected = 0
        if folder_exists:
            try:
                files_detected = len([p for p in self.folder_path.iterdir() if p.is_file() and not p.name.startswith((".", "~$")) and not p.name.endswith(".tmp")])
            except Exception:
                pass
        return {
            "status": "RUNNING" if self.is_running else "STOPPED",
            "is_running": self.is_running,
            "poll_interval_seconds": self.poll_interval,
            "folder_path": str(self.folder_path),
            "folder_exists": folder_exists,
            "files_detected": files_detected,
            "last_scan_time": self.last_scan_time or "Not started",
            "last_result": self.last_result or {
                "files_scanned": 0,
                "documents_imported": 0,
                "bank_transactions_imported": 0,
                "existing_bank_transactions_matched": 0,
                "duplicates_skipped": 0,
                "unsupported_skipped": 0,
                "errors_encountered": 0,
            },
            "last_error": self.last_error,
        }

    async def run_scan_cycle(
        self,
        db_session_factory: Callable[[], Session],
        company_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Executes a single folder scan cycle protected by concurrency lock.
        Can be called manually or from the polling loop.
        """
        self._refresh_config()
        if self.lock.locked():
            return {
                "success": False,
                "status": "CONCURRENT_BUSY",
                "message": "A folder scan operation is already currently running.",
                "last_result": self.last_result,
            }

        async with self.lock:
            db: Session = db_session_factory()
            try:
                service = LocalFolderIngestionService(
                    db=db,
                    folder_path=self.folder_path,
                    company_id=company_id,
                )
                # Run the scan in a worker thread to prevent blocking FastAPI's event loop
                result = await asyncio.to_thread(service.scan_and_ingest)

                self.last_scan_time = get_current_timestamp_str()
                self.last_result = {
                    "files_scanned": result.get("files_scanned", 0),
                    "files_detected": result.get("files_detected", 0),
                    "documents_imported": result.get("documents_imported", 0),
                    "bank_transactions_imported": result.get("bank_transactions_imported", 0),
                    "existing_bank_transactions_matched": result.get("existing_bank_transactions_matched", 0),
                    "duplicates_skipped": result.get("duplicates_skipped", 0),
                    "unsupported_skipped": result.get("unsupported_skipped", 0),
                    "errors_encountered": result.get("errors_encountered", 0),
                    "failed_files": result.get("failed_files", result.get("errors_encountered", 0)),
                    "documents": result.get("documents", []),
                    "bank_transactions": result.get("bank_transactions", []),
                }

                if result.get("success"):
                    self.last_error = None
                    return {
                        "success": True,
                        "status": "COMPLETED",
                        **result,
                    }
                else:
                    self.last_error = result.get("message")
                    return {
                        "success": False,
                        "status": "ERROR",
                        **result,
                    }

            except Exception as e:
                self.last_error = str(e)
                self.last_scan_time = get_current_timestamp_str()
                return {
                    "success": False,
                    "status": "ERROR",
                    "message": f"Error during folder scan: {str(e)}",
                    "files_scanned": 0,
                    "documents_imported": 0,
                    "duplicates_skipped": 0,
                    "unsupported_skipped": 0,
                    "errors_encountered": 1,
                }
            finally:
                db.close()

    async def _polling_loop(self, db_session_factory: Callable[[], Session]) -> None:
        """Internal background polling loop with responsive stop checking."""
        while self.is_running:
            try:
                await self.run_scan_cycle(db_session_factory)
            except Exception as e:
                self.last_error = f"Unhandled error in polling loop: {e}"

            # Wait for poll_interval seconds in small 1-second slices so stopping is immediate
            for _ in range(max(1, self.poll_interval)):
                if not self.is_running or self.stop_event.is_set():
                    break
                await asyncio.sleep(1)

    def start(
        self,
        db_session_factory: Callable[[], Session],
        poll_interval: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Starts the background polling worker if not already running."""
        self._refresh_config()
        if self.is_running:
            return {
                "started": False,
                "message": "Local folder collection worker is already running.",
                "status": self.get_status(),
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
            "message": f"Local folder collection worker started (monitoring '{self.folder_path}', interval {self.poll_interval}s).",
            "status": self.get_status(),
        }

    def stop(self) -> Dict[str, Any]:
        """Stops the background polling worker cleanly."""
        if not self.is_running:
            return {
                "stopped": False,
                "message": "Local folder collection worker is already stopped.",
                "status": self.get_status(),
            }

        self.is_running = False
        self.stop_event.set()
        if self._task and not self._task.done():
            self._task.cancel()

        return {
            "stopped": True,
            "message": "Local folder collection worker stopped.",
            "status": self.get_status(),
        }


# Global singleton instance (defaults to STOPPED on server restart)
folder_worker_singleton = LocalFolderBackgroundWorker()
