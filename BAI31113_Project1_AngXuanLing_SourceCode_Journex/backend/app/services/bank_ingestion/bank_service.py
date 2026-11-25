"""
ABC Bank Ingestion Service.
Orchestrates:
1. Connecting to the ABC Bank Simulator REST API.
2. Validating and normalizing transaction records.
3. Preventing duplicate imports using unique composite identifiers (abc_bank:TXN-xxxx).
4. Managing incremental cursor-based collection with natural ID ordering.
5. Persisting records into BankTransactionModel.
"""

from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
import json
import re
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session

from app.db.models import (
    BankTransactionModel,
    CompanyModel,
    SystemSettingModel,
    get_local_now,
)
from app.services.bank_ingestion.bank_client import (
    ABCBankClient,
    BankConnectionError,
    BankCursorNotFoundError,
)

LAST_CURSOR_SETTING_KEY = "abc_bank_last_cursor"


def parse_txn_number(txn_id: str) -> int:
    """
    Extracts numerical sequence from transaction IDs like TXN-0001 or TXN-0010.
    Ensures natural ordering (TXN-0010 > TXN-0009).
    """
    if not txn_id:
        return 0
    match = re.search(r"(\d+)", txn_id)
    return int(match.group(1)) if match else 0


def to_decimal(val: Any) -> Decimal:
    """Converts a value to a 2-decimal place Decimal."""
    try:
        return Decimal(str(val if val is not None else 0.0)).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0.00")


class ABCBankIngestionService:
    """
    Ingestion service for collecting, validating, and persisting ABC Bank transactions.
    """

    def __init__(
        self,
        db: Session,
        company_id: Optional[str] = None,
        bank_client: Optional[ABCBankClient] = None,
    ):
        self.db = db
        self.client = bank_client or ABCBankClient()

        # Resolve active company context
        comp = None
        if company_id:
            comp = self.db.query(CompanyModel).filter(CompanyModel.company_id == company_id).first()
        if not comp:
            comp = self.db.query(CompanyModel).filter(CompanyModel.is_active == True).first()
        if not comp:
            comp = self.db.query(CompanyModel).filter(CompanyModel.company_name.ilike("%0126%")).first()
        if not comp:
            comp = self.db.query(CompanyModel).order_by(CompanyModel.id.asc()).first()

        self.company_context = {
            "company_id": comp.company_id if comp else "COMP-000002",
            "company_name": comp.company_name if comp else "0126 Handbag Solutions Sdn. Bhd.",
        }

    def get_last_cursor(self) -> Optional[str]:
        """
        Retrieves the last collected transaction cursor for the active company.
        Queries newest transaction in BankTransactionModel for this company.
        If no transactions exist in the database for this company, returns None.
        """
        cid = self.company_context.get("company_id")
        company_setting_key = f"{LAST_CURSOR_SETTING_KEY}_{cid}" if cid else LAST_CURSOR_SETTING_KEY

        # 1. Query newest transaction in BankTransactionModel for this company
        txs = self.db.query(BankTransactionModel).filter(
            BankTransactionModel.company_id == cid,
            BankTransactionModel.source.in_(["abc_bank", "abc_bank_pdf"])
        ).all()
        if not txs:
            # If no transactions exist in DB for this company, cursor must be None.
            # Clear any stale setting in SystemSettingModel
            setting = self.db.query(SystemSettingModel).filter(
                SystemSettingModel.setting_key == company_setting_key
            ).first()
            if setting and setting.setting_value:
                setting.setting_value = ""
                try:
                    self.db.commit()
                except Exception:
                    pass
            return None

        # Sort by natural numeric sequence
        newest_tx = max(txs, key=lambda t: parse_txn_number(t.bank_transaction_id))
        return newest_tx.bank_transaction_id

    def set_last_cursor(self, cursor: Optional[str]) -> None:
        """Persists the last collected transaction cursor for this company."""
        val = (cursor or "").strip()
        cid = self.company_context.get("company_id")
        company_setting_key = f"{LAST_CURSOR_SETTING_KEY}_{cid}" if cid else LAST_CURSOR_SETTING_KEY

        setting = self.db.query(SystemSettingModel).filter(
            SystemSettingModel.setting_key == company_setting_key
        ).first()
        if setting:
            setting.setting_value = val
            setting.updated_at = get_local_now()
        else:
            setting = SystemSettingModel(
                setting_key=company_setting_key,
                setting_value=val,
                updated_at=get_local_now()
            )
            self.db.add(setting)

        # Update legacy global setting as well
        global_setting = self.db.query(SystemSettingModel).filter(
            SystemSettingModel.setting_key == LAST_CURSOR_SETTING_KEY
        ).first()
        if global_setting:
            global_setting.setting_value = val
            global_setting.updated_at = get_local_now()
        else:
            self.db.add(SystemSettingModel(
                setting_key=LAST_CURSOR_SETTING_KEY,
                setting_value=val,
                updated_at=get_local_now()
            ))
        self.db.commit()

    def validate_transaction(self, tx: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
        """
        Validates raw transaction data according to accounting standards:
        - Transaction ID present (supports transaction_id or bank_transaction_id)
        - Valid date (supports date or transaction_date)
        - Non-negative amounts
        - Not both money_in and money_out positive
        - Valid non-zero amount
        """
        tx_id = str(tx.get("transaction_id") or tx.get("bank_transaction_id") or "").strip()
        if not tx_id:
            return False, "Missing transaction ID."

        date_str = str(tx.get("date") or tx.get("transaction_date") or "").strip()
        if not date_str:
            return False, "Missing transaction date."

        try:
            m_in = to_decimal(tx.get("money_in", 0.0))
            m_out = to_decimal(tx.get("money_out", 0.0))
        except Exception:
            return False, "Monetary amounts are not valid numbers."

        if m_in < Decimal("0.00") or m_out < Decimal("0.00"):
            return False, "Monetary amounts cannot be negative."

        if m_in > Decimal("0.00") and m_out > Decimal("0.00"):
            return False, "Transaction cannot have both positive money_in and money_out."

        if m_in == Decimal("0.00") and m_out == Decimal("0.00"):
            return False, "Transaction amount cannot be zero for both money_in and money_out."

        return True, None

    def collect_transactions(self, use_cursor: bool = True) -> Dict[str, Any]:
        """
        Executes one collection cycle:
        1. Retrieves account metadata.
        2. Determines starting cursor.
        3. Fetches batch from ABC Bank.
        4. Validates each transaction.
        5. Performs atomic deduplication using unique_source_id.
        6. Persists records and updates cursor.
        """
        # 1. Fetch account info
        try:
            account_info = self.client.get_account()
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to connect to ABC Bank account: {str(e)}",
                "transactions_checked": 0,
                "transactions_imported": 0,
                "duplicates_skipped": 0,
                "invalid_rejected": 0,
                "errors_encountered": 1,
                "transactions": [],
            }

        account_id = account_info.get("account_id", "ABC-BIZ-0001")
        account_number = account_info.get("account_number", "")
        currency = account_info.get("currency", "MYR")

        # 2. Determine cursor
        cursor = self.get_last_cursor() if use_cursor else None

        # 3. Retrieve transactions
        raw_txs: List[Dict[str, Any]] = []
        is_reset_fallback = False
        try:
            res = self.client.get_transactions(after_id=cursor)
            raw_txs = res.get("transactions", [])
        except BankCursorNotFoundError:
            # Cursor was not recognized by bank simulator (e.g. data reset); fall back to full collection
            is_reset_fallback = True
            try:
                res = self.client.get_transactions(after_id=None)
                raw_txs = res.get("transactions", [])
            except Exception as e:
                return {
                    "success": False,
                    "error": f"Failed to retrieve transactions from ABC Bank: {str(e)}",
                    "transactions_checked": 0,
                    "transactions_imported": 0,
                    "duplicates_skipped": 0,
                    "invalid_rejected": 0,
                    "errors_encountered": 1,
                    "transactions": [],
                }
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to retrieve transactions from ABC Bank: {str(e)}",
                "transactions_checked": 0,
                "transactions_imported": 0,
                "duplicates_skipped": 0,
                "invalid_rejected": 0,
                "errors_encountered": 1,
                "transactions": [],
            }

        transactions_checked = len(raw_txs)
        transactions_imported = 0
        duplicates_skipped = 0
        invalid_rejected = 0
        errors_encountered = 0
        imported_list: List[Dict[str, Any]] = []
        # If fallback from reset, cursor is stale on the server, so initialize highest_txn_id to None
        highest_txn_id = None if is_reset_fallback else cursor

        # 4. Process each transaction
        for tx in raw_txs:
            # Validate
            is_valid, reason = self.validate_transaction(tx)
            if not is_valid:
                invalid_rejected += 1
                continue

            bank_tx_id = str(tx.get("transaction_id") or tx.get("bank_transaction_id") or "").strip()
            unique_source_id = f"abc_bank:{bank_tx_id}"

            # Check duplicate in database across both API and PDF ingestion
            existing = self.db.query(BankTransactionModel).filter(
                BankTransactionModel.company_id == self.company_context["company_id"],
                (
                    (BankTransactionModel.unique_source_id == unique_source_id) |
                    (BankTransactionModel.bank_transaction_id == bank_tx_id)
                )
            ).first()

            if existing:
                duplicates_skipped += 1
                # If record was imported via PDF, supplement raw_json if missing or partial
                if not existing.raw_json or existing.source == "abc_bank_pdf":
                    try:
                        existing.raw_json = json.dumps(tx)
                        self.db.commit()
                    except Exception:
                        pass
                # Track cursor progression even for duplicates
                if highest_txn_id is None or parse_txn_number(bank_tx_id) > parse_txn_number(highest_txn_id):
                    highest_txn_id = bank_tx_id
                continue

            # Persist record
            try:
                db_now = get_local_now()
                m_in = float(to_decimal(tx.get("money_in", 0.0)))
                m_out = float(to_decimal(tx.get("money_out", 0.0)))
                raw_bal = tx.get("running_balance") if "running_balance" in tx and tx["running_balance"] is not None else tx.get("balance")
                r_bal = float(to_decimal(raw_bal)) if raw_bal is not None else None
                txn_date = str(tx.get("date") or tx.get("transaction_date") or "").strip()

                record = BankTransactionModel(
                    company_id=self.company_context["company_id"],
                    source="abc_bank",
                    unique_source_id=unique_source_id,
                    bank_name="ABC Bank",
                    account_id=account_id,
                    account_number=account_number,
                    bank_transaction_id=bank_tx_id,
                    transaction_date=txn_date,
                    description=str(tx.get("description", "")).strip(),
                    reference=str(tx.get("reference", "")).strip() if tx.get("reference") else None,
                    money_in=m_in,
                    money_out=m_out,
                    currency=currency,
                    running_balance=r_bal,
                    collection_status="IMPORTED",
                    raw_json=json.dumps(tx),
                    created_at=db_now,
                    updated_at=db_now,
                )
                self.db.add(record)
                self.db.commit()
                self.db.refresh(record)

                # Automatically classify, evaluate document matching, and initialize audit trail
                try:
                    from app.services.bank_ingestion.bank_classifier import process_bank_transaction_intelligence
                    process_bank_transaction_intelligence(
                        record,
                        self.db,
                        company_id=self.company_context["company_id"],
                        commit=True
                    )
                except Exception as ex:
                    print(f"Notice: Bank classification during ingestion encountered error: {ex}")

                transactions_imported += 1
                imported_list.append({
                    "id": record.id,
                    "bank_transaction_id": record.bank_transaction_id,
                    "transaction_date": record.transaction_date,
                    "description": record.description,
                    "reference": record.reference,
                    "money_in": record.money_in,
                    "money_out": record.money_out,
                    "currency": record.currency,
                    "running_balance": record.running_balance,
                })

                if highest_txn_id is None or parse_txn_number(bank_tx_id) > parse_txn_number(highest_txn_id):
                    highest_txn_id = bank_tx_id

            except Exception as e:
                self.db.rollback()
                errors_encountered += 1

        # 5. Persist cursor update if new transactions arrived or server was reset
        if highest_txn_id and (highest_txn_id != cursor or is_reset_fallback):
            self.set_last_cursor(highest_txn_id)

        # 6. Total count of imported transactions in database for this company
        total_imported = self.db.query(BankTransactionModel).filter(
            BankTransactionModel.company_id == self.company_context["company_id"],
            BankTransactionModel.source == "abc_bank"
        ).count()

        msg = f"Bank collection complete: {transactions_imported} imported, {duplicates_skipped} duplicates skipped, {invalid_rejected} invalid rejected."
        return {
            "success": errors_encountered == 0,
            "message": msg,
            "transactions_checked": transactions_checked,
            "transactions_imported": transactions_imported,
            "duplicates_skipped": duplicates_skipped,
            "invalid_rejected": invalid_rejected,
            "errors_encountered": errors_encountered,
            "last_cursor": highest_txn_id,
            "total_imported_transactions": total_imported,
            "account_summary": {
                "account_id": account_id,
                "account_number": account_number,
                "currency": currency,
                "current_balance": account_info.get("current_balance", 0.0),
            },
            "transactions": imported_list,
        }
