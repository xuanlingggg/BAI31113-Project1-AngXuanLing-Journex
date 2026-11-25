"""
ABC Bank Ingestion Package.
Provides automated scanning and ingestion of bank transactions from ABC Bank Simulator.
"""

from app.services.bank_ingestion.bank_client import (
    ABCBankClient,
    BankConnectionError,
    BankCursorNotFoundError,
)
from app.services.bank_ingestion.bank_service import (
    ABCBankIngestionService,
    parse_txn_number,
    to_decimal,
)
from app.services.bank_ingestion.background_worker import (
    ABCBankBackgroundWorker,
    bank_worker_singleton,
)

__all__ = [
    "ABCBankClient",
    "BankConnectionError",
    "BankCursorNotFoundError",
    "ABCBankIngestionService",
    "ABCBankBackgroundWorker",
    "bank_worker_singleton",
    "parse_txn_number",
    "to_decimal",
]
