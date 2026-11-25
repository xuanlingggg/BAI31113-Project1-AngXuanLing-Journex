"""
ABC Bank Background Worker & Concurrency Controller.
Manages:
1. Singleton background polling worker for ABC Bank Simulator.
2. Concurrent fetch protection (ensuring manual fetch and polling never collide).
3. Guaranteed STOPPED state on backend initialization/restart.
4. Clean start/stop lifecycle.
"""

import asyncio
import datetime
from typing import Dict, Any, Optional, Callable
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session

from app.config import ABC_BANK_API_BASE_URL, ABC_BANK_POLL_INTERVAL_SECONDS
from app.services.bank_ingestion.bank_client import ABCBankClient
from app.services.bank_ingestion.bank_service import ABCBankIngestionService


def get_current_timestamp_str() -> str:
    """Returns local ISO formatted timestamp."""
    try:
        now = datetime.datetime.now(ZoneInfo("Asia/Kuala_Lumpur"))
    except Exception:
        now = datetime.datetime.now()
    return now.strftime("%Y-%m-%d %H:%M:%S")


class ABCBankBackgroundWorker:
    """
    Singleton controller managing the ABC Bank collection lifecycle.
    Guarantees default STOPPED state on backend startup.
    """

    def __init__(self):
        self.is_running: bool = False
        self.poll_interval: int = ABC_BANK_POLL_INTERVAL_SECONDS
        self.bank_api_url: str = ABC_BANK_API_BASE_URL
        self.company_id: Optional[str] = None

        self.last_collection_time: Optional[str] = None
        self.last_result: Optional[Dict[str, Any]] = None
        self.last_error: Optional[str] = None

        self._lock: Optional[asyncio.Lock] = None
        self._task: Optional[asyncio.Task] = None
        self._stop_event: Optional[asyncio.Event] = None
        self._client: Optional[ABCBankClient] = None

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

    def get_client(self) -> ABCBankClient:
        if self._client is None:
            self._client = ABCBankClient(base_url=self.bank_api_url)
        return self._client

    def set_client(self, client: ABCBankClient) -> None:
        """Allows injecting mocked client for testing."""
        self._client = client

    def test_connection(self) -> Dict[str, Any]:
        """Performs non-destructive reachability and health test."""
        client = self.get_client()
        return client.test_connection()

    def get_status(self, db: Optional[Session] = None, company_id: Optional[str] = None) -> Dict[str, Any]:
        """Returns comprehensive status without exposing sensitive credentials."""
        conn_check = self.test_connection()
        total_imported = 0
        last_cursor = None
        target_company = company_id or self.company_id

        session = db
        should_close = False
        if session is None:
            try:
                from app.db.database import SessionLocal
                session = SessionLocal()
                should_close = True
            except Exception:
                session = None

        if session is not None:
            try:
                from app.db.models import BankTransactionModel, SystemSettingModel
                from app.services.bank_ingestion.bank_service import LAST_CURSOR_SETTING_KEY
                q = session.query(BankTransactionModel).filter(
                    BankTransactionModel.source == "abc_bank"
                )
                if target_company:
                    q = q.filter(BankTransactionModel.company_id == target_company)
                total_imported = q.count()

                company_setting_key = f"{LAST_CURSOR_SETTING_KEY}_{target_company}" if target_company else LAST_CURSOR_SETTING_KEY
                setting = session.query(SystemSettingModel).filter(
                    SystemSettingModel.setting_key == company_setting_key
                ).first()
                if not setting and target_company:
                    setting = session.query(SystemSettingModel).filter(
                        SystemSettingModel.setting_key == LAST_CURSOR_SETTING_KEY
                    ).first()
                if setting and setting.setting_value:
                    last_cursor = setting.setting_value.strip()
            except Exception:
                pass
            finally:
                if should_close:
                    session.close()

        if not last_cursor and self.last_result and self.last_result.get("last_cursor"):
            last_cursor = self.last_result.get("last_cursor")

        return {
            "status": "RUNNING" if self.is_running else "STOPPED",
            "is_running": self.is_running,
            "poll_interval_seconds": self.poll_interval,
            "bank_api_url": self.bank_api_url,
            "connected": conn_check.get("connected", False),
            "bank_name": conn_check.get("bank_name", "ABC Bank"),
            "account_id": conn_check.get("account_id", ""),
            "account_number": conn_check.get("account_number", ""),
            "current_balance": conn_check.get("current_balance", 0.0),
            "last_collection_time": self.last_collection_time or "Not started",
            "last_cursor": last_cursor,
            "total_imported_transactions": total_imported,
            "last_result": self.last_result or {
                "transactions_checked": 0,
                "transactions_imported": 0,
                "duplicates_skipped": 0,
                "invalid_rejected": 0,
                "errors_encountered": 0,
                "last_cursor": last_cursor,
                "total_imported_transactions": total_imported,
            },
            "last_error": self.last_error,
            "connection_message": conn_check.get("message", ""),
        }

    async def run_fetch_cycle(
        self,
        db_session_factory: Callable[[], Session],
        company_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes a single ABC Bank collection cycle protected by concurrency lock.
        Can be called manually or from the polling loop.
        """
        if self.lock.locked():
            return {
                "success": False,
                "status": "CONCURRENT_BUSY",
                "message": "A bank transaction collection operation is already currently running.",
                "last_result": self.last_result,
            }

        async with self.lock:
            db: Session = db_session_factory()
            try:
                service = ABCBankIngestionService(
                    db=db,
                    company_id=company_id,
                    bank_client=self.get_client(),
                )
                result = service.collect_transactions(use_cursor=True)

                self.last_collection_time = get_current_timestamp_str()
                self.last_result = {
                    "transactions_checked": result.get("transactions_checked", 0),
                    "transactions_imported": result.get("transactions_imported", 0),
                    "duplicates_skipped": result.get("duplicates_skipped", 0),
                    "invalid_rejected": result.get("invalid_rejected", 0),
                    "errors_encountered": result.get("errors_encountered", 0),
                    "last_cursor": result.get("last_cursor"),
                    "total_imported_transactions": result.get("total_imported_transactions", 0),
                }

                if result.get("success"):
                    self.last_error = None
                    return {
                        "success": True,
                        "status": "COMPLETED",
                        **result,
                    }
                else:
                    self.last_error = result.get("error")
                    return {
                        "success": False,
                        "status": "ERROR",
                        **result,
                    }

            except Exception as e:
                self.last_error = str(e)
                self.last_collection_time = get_current_timestamp_str()
                return {
                    "success": False,
                    "status": "ERROR",
                    "message": f"Error during bank transaction collection: {str(e)}",
                    "transactions_checked": 0,
                    "transactions_imported": 0,
                    "duplicates_skipped": 0,
                    "invalid_rejected": 0,
                    "errors_encountered": 1,
                }
            finally:
                db.close()

    async def _polling_loop(self, db_session_factory: Callable[[], Session]) -> None:
        """Internal background polling loop with responsive stop checking."""
        while self.is_running:
            try:
                await self.run_fetch_cycle(db_session_factory, company_id=self.company_id)
            except Exception as e:
                self.last_error = f"Unhandled error in polling loop: {e}"

            # Wait in 1-second slices for immediate, responsive stop
            for _ in range(max(1, self.poll_interval)):
                if not self.is_running or self.stop_event.is_set():
                    break
                await asyncio.sleep(1)

    def start(
        self,
        db_session_factory: Callable[[], Session],
        poll_interval: Optional[int] = None,
        company_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Starts the background collection worker if not already running."""
        if company_id:
            self.company_id = company_id

        if self.is_running:
            return {
                "started": False,
                "message": "ABC Bank collection worker is already running.",
                "status": self.get_status(company_id=self.company_id),
            }

        conn_check = self.test_connection()
        if not conn_check.get("connected"):
            return {
                "started": False,
                "message": f"Cannot start worker: Unable to connect to ABC Bank ({conn_check.get('message')}).",
                "status": self.get_status(company_id=self.company_id),
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
            "message": f"ABC Bank collection worker started (polling interval: {self.poll_interval}s).",
            "status": self.get_status(company_id=self.company_id),
        }

    def stop(self) -> Dict[str, Any]:
        """Stops the background collection worker cleanly."""
        if not self.is_running:
            return {
                "stopped": False,
                "message": "ABC Bank collection worker is already stopped.",
                "status": self.get_status(),
            }

        self.is_running = False
        self.stop_event.set()
        if self._task and not self._task.done():
            self._task.cancel()

        return {
            "stopped": True,
            "message": "ABC Bank collection worker stopped.",
            "status": self.get_status(),
        }


# Global singleton instance (defaults to STOPPED on backend start)
bank_worker_singleton = ABCBankBackgroundWorker()
