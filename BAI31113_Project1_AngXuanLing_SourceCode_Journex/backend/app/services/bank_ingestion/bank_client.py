"""
ABC Bank Client Module.
Connects to the ABC Bank Simulator REST API to check health,
retrieve account metadata, fetch transactions, and download supporting PDFs.
"""

from typing import Dict, Any, List, Optional
import httpx

from app.config import ABC_BANK_API_BASE_URL, ABC_BANK_TIMEOUT_SECONDS


class BankConnectionError(Exception):
    """Raised when connection to ABC Bank API fails or times out."""
    pass


class BankCursorNotFoundError(Exception):
    """Raised when the after_id cursor transaction is not found on the bank server (HTTP 404)."""
    pass


class ABCBankClient:
    """
    HTTP client for interacting with the ABC Bank Simulator API.
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout: Optional[float] = None
    ):
        self.base_url = (base_url or ABC_BANK_API_BASE_URL).rstrip("/")
        self.timeout = timeout if timeout is not None else ABC_BANK_TIMEOUT_SECONDS

    def _get_client(self) -> httpx.Client:
        return httpx.Client(base_url=self.base_url, timeout=self.timeout)

    def health_check(self) -> Dict[str, Any]:
        """Checks the /api/health endpoint of ABC Bank."""
        try:
            with self._get_client() as client:
                resp = client.get("/api/health")
                resp.raise_for_status()
                return resp.json()
        except httpx.ConnectError as e:
            raise BankConnectionError(f"Failed to connect to ABC Bank at {self.base_url}: {e}")
        except httpx.TimeoutException as e:
            raise BankConnectionError(f"Connection to ABC Bank timed out after {self.timeout}s: {e}")
        except Exception as e:
            raise BankConnectionError(f"ABC Bank health check failed: {e}")

    def get_account(self) -> Dict[str, Any]:
        """Retrieves account summary and balance details from ABC Bank."""
        try:
            with self._get_client() as client:
                resp = client.get("/api/account")
                resp.raise_for_status()
                return resp.json()
        except httpx.ConnectError as e:
            raise BankConnectionError(f"Failed to connect to ABC Bank at {self.base_url}: {e}")
        except httpx.TimeoutException as e:
            raise BankConnectionError(f"ABC Bank account request timed out: {e}")
        except Exception as e:
            raise BankConnectionError(f"Failed to get ABC Bank account details: {e}")

    def get_transactions(
        self,
        after_id: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        direction: str = "all",
        search: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Retrieves transactions with optional filtering and cursor (after_id).
        Raises BankCursorNotFoundError if after_id returns 404.
        """
        params: Dict[str, Any] = {}
        if after_id:
            params["after_id"] = after_id
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        if direction and direction != "all":
            params["direction"] = direction
        if search:
            params["search"] = search

        try:
            with self._get_client() as client:
                resp = client.get("/api/transactions", params=params)
                if resp.status_code == 404 and after_id:
                    raise BankCursorNotFoundError(f"Cursor transaction '{after_id}' not found on bank server.")
                resp.raise_for_status()
                return resp.json()
        except BankCursorNotFoundError:
            raise
        except httpx.ConnectError as e:
            raise BankConnectionError(f"Failed to connect to ABC Bank at {self.base_url}: {e}")
        except httpx.TimeoutException as e:
            raise BankConnectionError(f"ABC Bank transactions request timed out: {e}")
        except Exception as e:
            raise BankConnectionError(f"Failed to fetch ABC Bank transactions: {e}")

    def get_transaction(self, transaction_id: str) -> Dict[str, Any]:
        """Retrieves details for a single bank transaction."""
        try:
            with self._get_client() as client:
                resp = client.get(f"/api/transactions/{transaction_id}")
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            raise BankConnectionError(f"Failed to fetch transaction {transaction_id}: {e}")

    def get_transaction_pdf(self, transaction_id: str) -> bytes:
        """Downloads the PDF receipt for a transaction."""
        try:
            with self._get_client() as client:
                resp = client.get(f"/api/transactions/{transaction_id}/export.pdf")
                resp.raise_for_status()
                return resp.content
        except Exception as e:
            raise BankConnectionError(f"Failed to download PDF for transaction {transaction_id}: {e}")

    def test_connection(self) -> Dict[str, Any]:
        """
        Runs non-destructive validation to verify ABC Bank is online and responsive.
        """
        try:
            health = self.health_check()
            account = self.get_account()
            return {
                "connected": True,
                "base_url": self.base_url,
                "bank_name": account.get("bank_name", "ABC Bank"),
                "account_id": account.get("account_id", ""),
                "account_name": account.get("account_name", ""),
                "account_number": account.get("account_number", ""),
                "currency": account.get("currency", "MYR"),
                "current_balance": account.get("current_balance", 0.0),
                "transaction_count": account.get("transaction_count", 0),
                "message": f"Successfully connected to ABC Bank Simulator ({self.base_url}).",
            }
        except Exception as e:
            return {
                "connected": False,
                "base_url": self.base_url,
                "message": f"Connection to ABC Bank failed: {str(e)}",
            }
