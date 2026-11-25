"""
Local Folder Ingestion Service.
Monitors a local Windows directory (e.g. D:\\CompanyInvoice) for incoming accounting documents
and ABC Bank transaction PDFs.
- For ABC Bank transaction PDFs: extracts transaction data, creates BankTransactionModel,
  triggers AI accounting classification & document matching, and links the PDF without
  misclassifying as an invoice or creating duplicate records.
- For normal accounting documents (invoices, receipts, etc.): validates file readiness,
  prevents duplicates (via SHA-256 and semantic duplicate key), and reuses the existing
  DocumentProcessingAgent and transaction pipeline.
Original source files in the local monitored folder are never moved or deleted.
"""

import os
import re
import json
import shutil
import hashlib
import tempfile
from pathlib import Path
from typing import Dict, Any, List, Optional, Union

import pdfplumber
from sqlalchemy.orm import Session

from app.config import DOCUMENTS_DIR, LOCAL_FOLDER_PATH, MS_WANI_UPLOAD_FOLDER
from app.api.documents import _generate_next_doc_id
from app.db.models import (
    DocumentModel,
    CompanyModel,
    BankTransactionModel,
    get_local_now,
)
from app.services.pdf_ocr import extract_text_from_document
from app.services.document_agent import (
    DocumentProcessingAgent,
    generate_duplicate_key,
)
from app.agents.accounting_agent import AccountingAgent
from app.services.transaction_service import sync_document_transaction
from app.services.bank_ingestion.bank_classifier import (
    process_bank_transaction_intelligence,
    append_audit_entry,
)

# Supported file extensions for document processing
SUPPORTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"]

# MIME types mapping
MIME_MAP = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}


def is_valid_file_signature(data: bytes, ext: str) -> bool:
    """Validates file magic bytes against extension."""
    if not data or len(data) == 0:
        return False
    if ext == ".pdf":
        return data.startswith(b"%PDF")
    elif ext in [".jpg", ".jpeg"]:
        return data.startswith(b"\xff\xd8\xff")
    elif ext == ".png":
        return data.startswith(b"\x89PNG")
    return False


def compute_file_hash(data: bytes) -> str:
    """Computes SHA-256 hash of byte content."""
    return hashlib.sha256(data).hexdigest()


def is_abc_bank_transaction_pdf(raw_text: str, filename: str = "") -> bool:
    """
    Deterministically identifies whether a document is an ABC Bank transaction advice/receipt PDF.
    Inspects document text and structure without relying purely on filename.
    """
    if not raw_text:
        return False
    u = raw_text.upper()

    # Must contain ABC Bank identifier
    has_bank = "ABC BANK" in u

    # Must contain transaction advice / payment receipt / simulation verification marker
    has_receipt_type = any(k in u for k in [
        "TRANSACTION ADVICE",
        "PAYMENT RECEIPT",
        "AUTHENTICATION & PERSISTENCE VERIFICATION",
        "LEDGER SEQUENCE ID",
    ])

    # Must contain transaction identifier pattern or structure
    has_txn_marker = bool(re.search(r"TXN-\d+", raw_text, re.IGNORECASE)) or (
        "TRANSACTION ID" in u and "RUNNING BALANCE" in u
    )

    return bool(has_bank and has_receipt_type and has_txn_marker)


def parse_abc_bank_transaction_pdf(file_path: Union[str, Path], raw_text: str) -> Dict[str, Any]:
    """
    Extracts structured bank transaction fields from an ABC Bank transaction PDF.
    Extracts key-value pairs from tables with regex fallback across raw text.
    """
    table_data: Dict[str, str] = {}
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                for t in tables:
                    for row in t:
                        if not row:
                            continue
                        if len(row) >= 4:
                            if row[0]:
                                table_data[row[0].strip().lower()] = (row[1] or "").strip()
                            if row[2]:
                                table_data[row[2].strip().lower()] = (row[3] or "").strip()
                        elif len(row) >= 2:
                            if row[0]:
                                table_data[row[0].strip().lower()] = (row[1] or "").strip()
    except Exception:
        pass

    # 1. Transaction ID
    txn_id = table_data.get("transaction id")
    if not txn_id:
        m = re.search(r"Transaction ID\s*[:|]?\s*(TXN-\d+)", raw_text, re.IGNORECASE)
        if not m:
            m = re.search(r"Ledger Sequence ID\s*[:|]?\s*(TXN-\d+)", raw_text, re.IGNORECASE)
        if not m:
            m = re.search(r"\b(TXN-\d+)\b", raw_text)
        txn_id = m.group(1).upper() if m else None
    else:
        m = re.search(r"\b(TXN-\d+)\b", txn_id, re.IGNORECASE)
        if m:
            txn_id = m.group(1).upper()

    # 2. Transaction Date (YYYY-MM-DD)
    tx_date = table_data.get("transaction date")
    if not tx_date or not re.match(r"^\d{4}-\d{2}-\d{2}$", tx_date):
        m = re.search(r"Transaction Date\s*[:|]?\s*(\d{4}-\d{2}-\d{2})", raw_text, re.IGNORECASE)
        if not m:
            m = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", raw_text)
        tx_date = m.group(1) if m else get_local_now().strftime("%Y-%m-%d")

    # 3. Account ID & Account Number
    account_id = table_data.get("account id") or "ABC-BIZ-0001"
    account_id = re.sub(r"[^A-Za-z0-9\-]", "", account_id).strip() or "ABC-BIZ-0001"

    account_number = table_data.get("account number")
    if not account_number:
        m = re.search(r"Account Number\s*[:|]?\s*([0-9\-]+)", raw_text, re.IGNORECASE)
        account_number = m.group(1).strip() if m else "4320-6210-4821"

    # 4. Reference Number
    reference = table_data.get("reference number")
    if not reference or reference.strip() in ["-", "N/A", "None"]:
        m = re.search(r"Reference Number\s*[:|]?\s*([^\n|]+)", raw_text, re.IGNORECASE)
        reference = m.group(1).strip() if m else None
    if reference:
        reference = reference.strip()
        if reference.startswith("# "):
            reference = reference[2:].strip()
        elif reference.startswith("#"):
            reference = reference[1:].strip()
        if reference in ["-", "N/A", "None", ""]:
            reference = None

    # 5. Currency
    currency = table_data.get("account currency") or "MYR"
    if "MYR" in currency.upper() or "RM" in currency.upper():
        currency = "MYR"

    # 6. Transaction Amount, Type & Money Flow
    raw_type = table_data.get("transaction type", "")
    raw_amt = table_data.get("transaction amount", "")
    if not raw_amt:
        m = re.search(r"Transaction Amount\s*[:|]?\s*([^\n|]+)", raw_text, re.IGNORECASE)
        raw_amt = m.group(1).strip() if m else ""

    amt_match = re.search(r"[\d,]+\.\d{2}", raw_amt)
    amount_val = float(amt_match.group(0).replace(",", "")) if amt_match else 0.0

    # Direction check: incoming (+) vs outgoing (-)
    is_incoming = ("+" in raw_amt) or ("Incoming" in raw_type) or ("Credit" in raw_type) or ("Deposit" in raw_type)
    if is_incoming:
        money_in = amount_val
        money_out = 0.0
    else:
        money_in = 0.0
        money_out = amount_val

    # 7. Running Balance
    raw_bal = table_data.get("running balance", "")
    if not raw_bal:
        m = re.search(r"Running Balance\s*[:|]?\s*([^\n|]+)", raw_text, re.IGNORECASE)
        raw_bal = m.group(1).strip() if m else ""
    bal_match = re.search(r"[\d,]+\.\d{2}", raw_bal)
    running_balance = float(bal_match.group(0).replace(",", "")) if bal_match else None

    # 8. Description
    desc = table_data.get("description", "")
    if not desc:
        m = re.search(r"Description\s*\|\s*([\s\S]*?)\|\s*Running Balance", raw_text, re.IGNORECASE)
        if m:
            desc = m.group(1).strip()
        else:
            m2 = re.search(r"Description\s+([^\n]+)", raw_text, re.IGNORECASE)
            desc = m2.group(1).strip() if m2 else f"ABC Bank Transaction {txn_id}"

    # Normalize weird characters (replacement chars, dashes) and whitespace
    desc = re.sub(r"[\x00-\x1f\x7f-\x9f\ufffd]", "-", desc)
    desc = " ".join(desc.split()).strip()
    if desc.startswith("- "):
        desc = desc[2:].strip()

    return {
        "bank_name": "ABC Bank",
        "bank_transaction_id": txn_id,
        "transaction_date": tx_date,
        "account_id": account_id,
        "account_number": account_number,
        "reference": reference,
        "currency": currency,
        "money_in": money_in,
        "money_out": money_out,
        "running_balance": running_balance,
        "description": desc,
    }


class LocalFolderIngestionService:
    """
    Scans a local directory for accounting documents and ABC Bank transaction PDFs,
    processes new eligible files through their respective specialized pipelines,
    and synchronizes accounting records.
    """

    def __init__(
        self,
        db: Session,
        folder_path: Optional[Union[str, Path]] = None,
        company_id: Optional[str] = None,
    ):
        self.db = db
        target = folder_path or LOCAL_FOLDER_PATH or MS_WANI_UPLOAD_FOLDER
        self.folder_path = Path(target).resolve()

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
            "company_name": comp.company_name if comp else "0126 HANDBAG SOLUTIONS SDN. BHD.",
        }

    def _ingest_bank_transaction_pdf(
        self,
        temp_file_path: str,
        raw_text: str,
        filename: str,
        file_hash: str,
    ) -> Dict[str, Any]:
        """
        Specialized ingestion pipeline for ABC Bank transaction PDFs.
        Never creates a DocumentModel or AccountingTransactionModel record.
        Creates or links to BankTransactionModel, executes intelligent COA classification
        and invoice matching, and stores the PDF in managed storage.
        """
        data = parse_abc_bank_transaction_pdf(temp_file_path, raw_text)
        bank_tx_id = data.get("bank_transaction_id")
        if not bank_tx_id:
            raise ValueError(f"Could not identify valid bank transaction ID in {filename}")

        # Check existing bank transaction across both API and PDF imports
        existing_tx = self.db.query(BankTransactionModel).filter(
            BankTransactionModel.company_id == self.company_context["company_id"],
            (
                (BankTransactionModel.bank_transaction_id == bank_tx_id) |
                (BankTransactionModel.unique_source_id == f"abc_bank_pdf:{bank_tx_id}") |
                (BankTransactionModel.unique_source_id == f"abc_bank:{bank_tx_id}") |
                (BankTransactionModel.file_hash == file_hash)
            )
        ).first()

        bank_folder = DOCUMENTS_DIR / "bank_transactions" / bank_tx_id
        bank_folder.mkdir(parents=True, exist_ok=True)
        saved_file_path = bank_folder / filename

        if existing_tx:
            # Record already exists: check if PDF needs to be linked
            needs_pdf_copy = (not existing_tx.pdf_file_path or not os.path.exists(existing_tx.pdf_file_path))
            if needs_pdf_copy:
                shutil.copyfile(temp_file_path, saved_file_path)
                existing_tx.pdf_file_path = str(saved_file_path)
                existing_tx.file_hash = file_hash
                existing_tx.updated_at = get_local_now()
                existing_tx.audit_trail_json = append_audit_entry(
                    existing_tx.audit_trail_json,
                    action="PDF_LINKED",
                    details=f"Linked transaction PDF '{filename}' from local folder scan.",
                    actor="LocalFolderAgent"
                )
                self.db.commit()
                self.db.refresh(existing_tx)
                return {
                    "action": "LINKED",
                    "bank_transaction_id": bank_tx_id,
                    "id": existing_tx.id,
                    "filename": filename,
                }
            else:
                return {
                    "action": "DUPLICATE",
                    "bank_transaction_id": bank_tx_id,
                    "id": existing_tx.id,
                    "filename": filename,
                }

        # New bank transaction from PDF
        shutil.copyfile(temp_file_path, saved_file_path)
        db_now = get_local_now()

        initial_audit = [{
            "action": "PDF_IMPORTED",
            "details": f"Transaction record created from local folder PDF '{filename}' via LocalFolderAgent.",
            "timestamp": db_now.strftime("%Y-%m-%d %H:%M:%S"),
            "actor": "LocalFolderAgent",
        }]

        new_tx = BankTransactionModel(
            company_id=self.company_context["company_id"],
            source="abc_bank_pdf",
            unique_source_id=f"abc_bank_pdf:{bank_tx_id}",
            bank_name="ABC Bank",
            account_id=data["account_id"],
            account_number=data["account_number"],
            bank_transaction_id=bank_tx_id,
            transaction_date=data["transaction_date"],
            description=data["description"],
            reference=data["reference"],
            money_in=data["money_in"],
            money_out=data["money_out"],
            currency=data["currency"],
            running_balance=data["running_balance"],
            collection_status="IMPORTED",
            raw_json=json.dumps(data),
            pdf_file_path=str(saved_file_path),
            file_hash=file_hash,
            audit_trail_json=json.dumps(initial_audit),
            created_at=db_now,
            updated_at=db_now,
        )

        self.db.add(new_tx)
        self.db.commit()
        self.db.refresh(new_tx)

        # Trigger AI accounting classification and document matching
        try:
            process_bank_transaction_intelligence(
                new_tx,
                self.db,
                company_id=self.company_context["company_id"],
                commit=True
            )
        except Exception as ex:
            print(f"Notice: intelligence processing on imported bank PDF {bank_tx_id} encountered: {ex}")

        return {
            "action": "IMPORTED",
            "bank_transaction_id": bank_tx_id,
            "id": new_tx.id,
            "filename": filename,
            "transaction_date": new_tx.transaction_date,
            "amount": new_tx.money_in or new_tx.money_out,
            "classification_status": new_tx.classification_status,
            "match_status": new_tx.match_status,
        }

    def scan_and_ingest(self) -> Dict[str, Any]:
        """
        Scans self.folder_path, identifies ABC Bank transaction PDFs vs normal accounting documents,
        processes eligible new files, and returns execution metrics.
        Never moves or deletes the files from the folder.
        """
        folder = self.folder_path
        if not folder.exists():
            return {
                "success": False,
                "folder_path": str(folder),
                "message": f"Target folder '{folder}' does not exist.",
                "files_scanned": 0,
                "files_detected": 0,
                "documents_imported": 0,
                "bank_transactions_imported": 0,
                "existing_bank_transactions_matched": 0,
                "duplicates_skipped": 0,
                "unsupported_skipped": 0,
                "errors_encountered": 1,
                "failed_files": 1,
                "documents": [],
                "bank_transactions": [],
            }

        if not folder.is_dir():
            return {
                "success": False,
                "folder_path": str(folder),
                "message": f"Target path '{folder}' is not a directory.",
                "files_scanned": 0,
                "files_detected": 0,
                "documents_imported": 0,
                "bank_transactions_imported": 0,
                "existing_bank_transactions_matched": 0,
                "duplicates_skipped": 0,
                "unsupported_skipped": 0,
                "errors_encountered": 1,
                "failed_files": 1,
                "documents": [],
                "bank_transactions": [],
            }

        files_scanned = 0
        documents_imported = 0
        bank_transactions_imported = 0
        existing_bank_transactions_matched = 0
        duplicates_skipped = 0
        unsupported_skipped = 0
        errors_encountered = 0
        imported_documents: List[Dict[str, Any]] = []
        imported_bank_transactions: List[Dict[str, Any]] = []

        try:
            # Sort for deterministic processing order
            entries = sorted(list(folder.iterdir()), key=lambda p: p.name.lower())
            valid_files = [p for p in entries if p.is_file() and not p.name.startswith((".", "~$")) and not p.name.endswith(".tmp")]
            files_detected = len(valid_files)
        except Exception as e:
            return {
                "success": False,
                "folder_path": str(folder),
                "message": f"Failed to list directory '{folder}': {str(e)}",
                "files_scanned": 0,
                "files_detected": 0,
                "documents_imported": 0,
                "bank_transactions_imported": 0,
                "existing_bank_transactions_matched": 0,
                "duplicates_skipped": 0,
                "unsupported_skipped": 0,
                "errors_encountered": 1,
                "failed_files": 1,
                "documents": [],
                "bank_transactions": [],
            }

        for item in entries:
            # Skip directories
            if not item.is_file():
                continue

            filename = item.name
            # Skip hidden, temporary, or lock files
            if filename.startswith(".") or filename.startswith("~$") or filename.endswith(".tmp"):
                continue

            files_scanned += 1
            ext = item.suffix.lower()

            # 1. Check supported extension
            if ext not in SUPPORTED_EXTENSIONS:
                unsupported_skipped += 1
                continue

            # 2. Check file readiness and access
            try:
                # Attempt to open and read in binary mode
                with open(item, "rb") as f:
                    file_bytes = f.read()
            except (PermissionError, OSError):
                # File is currently locked or being copied by user/OS; skip cleanly this tick
                continue

            # 3. Check file size
            if len(file_bytes) == 0:
                # Incomplete or 0-byte file; skip cleanly
                continue

            # 4. Check magic byte signature
            if not is_valid_file_signature(file_bytes, ext):
                errors_encountered += 1
                continue

            file_hash = compute_file_hash(file_bytes)
            temp_file_path = None

            try:
                temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
                temp_file_path = temp_file.name
                temp_file.write(file_bytes)
                temp_file.close()

                # Extract text using existing OCR / text extractor
                raw_text = extract_text_from_document(temp_file_path)

                # =========================================================================
                # BRANCH A: ABC Bank Transaction PDF Recognition & Dedicated Pipeline
                # =========================================================================
                if ext == ".pdf" and is_abc_bank_transaction_pdf(raw_text, filename):
                    bank_res = self._ingest_bank_transaction_pdf(
                        temp_file_path=temp_file_path,
                        raw_text=raw_text,
                        filename=filename,
                        file_hash=file_hash,
                    )

                    if bank_res.get("action") == "IMPORTED":
                        bank_transactions_imported += 1
                        imported_bank_transactions.append(bank_res)
                    elif bank_res.get("action") == "LINKED":
                        existing_bank_transactions_matched += 1
                        duplicates_skipped += 1
                    else:  # DUPLICATE
                        duplicates_skipped += 1

                    # Bank PDF processing finished - continue to next file (do not create DocumentModel)
                    continue

                # =========================================================================
                # BRANCH B: Normal Accounting Document Pipeline (Invoices, Receipts, etc.)
                # =========================================================================
                # Process text with existing DocumentProcessingAgent
                doc_agent = DocumentProcessingAgent(company_context=self.company_context)
                structured_data, passed, val_messages = doc_agent.process_document(
                    "TEMP_DOC", raw_text, filename
                )

                # 5. SHA-256 duplicate detection with self-healing for updated extractions
                existing_by_hash = self.db.query(DocumentModel).filter(
                    DocumentModel.company_id == self.company_context["company_id"],
                    DocumentModel.file_hash == file_hash,
                ).first()

                if existing_by_hash:
                    needs_update = (
                        (existing_by_hash.document_type != structured_data.document_type) or
                        (existing_by_hash.document_type in ["Unknown", "Purchase Receipt"] and structured_data.document_type != existing_by_hash.document_type) or
                        (existing_by_hash.document_type == "Stock Take" and (existing_by_hash.grand_total > 0 or existing_by_hash.vendor_name is not None))
                    )
                    if needs_update:
                        existing_by_hash.document_type = structured_data.document_type
                        existing_by_hash.vendor_name = structured_data.vendor_name
                        existing_by_hash.grand_total = structured_data.grand_total
                        existing_by_hash.extracted_data_json = json.dumps(structured_data.dict())
                        existing_by_hash.validation_errors_json = json.dumps(val_messages)
                        existing_by_hash.status = "COMPLETED" if passed else "NEEDS_REVIEW"
                        existing_by_hash.updated_at = get_local_now()
                        self.db.commit()
                        try:
                            sync_document_transaction(self.db, existing_by_hash)
                        except Exception:
                            pass
                    duplicates_skipped += 1
                    continue

                # 6. Semantic duplicate key check
                dup_key, dup_label, dup_val = generate_duplicate_key(
                    self.company_context["company_id"],
                    structured_data.document_type,
                    structured_data.dict(),
                )

                if dup_key:
                    existing_by_key = self.db.query(DocumentModel).filter(
                        DocumentModel.company_id == self.company_context["company_id"],
                        DocumentModel.duplicate_key == dup_key,
                    ).first()

                    if existing_by_key:
                        duplicates_skipped += 1
                        continue

                # 7. Generate next document ID and persist into managed storage
                doc_id = _generate_next_doc_id(self.db)
                doc_folder = DOCUMENTS_DIR / doc_id
                doc_folder.mkdir(parents=True, exist_ok=True)
                saved_file_path = doc_folder / filename

                # Copy original file into managed storage (never move/delete from original folder)
                shutil.copyfile(temp_file_path, saved_file_path)

                structured_data.document_id = doc_id

                # Trigger Accounting Agent analysis
                acct_agent = AccountingAgent(db=self.db, company_id=self.company_context["company_id"])
                analysis_result = acct_agent.analyze(structured_data)
                structured_data.accounting_analysis = analysis_result

                # Save extracted JSON to disk
                json_path = doc_folder / f"{doc_id}_extracted.json"
                with open(json_path, "w", encoding="utf-8") as f_json:
                    json.dump(structured_data.dict(), f_json, indent=2)

                # 8. Create and commit DocumentModel
                db_now = get_local_now()
                mime_type = MIME_MAP.get(ext, "application/octet-stream")

                db_doc = DocumentModel(
                    company_id=self.company_context["company_id"],
                    document_id=doc_id,
                    original_filename=filename,
                    file_path=str(saved_file_path),
                    file_type=ext.replace(".", ""),
                    mime_type=mime_type,
                    status="EXTRACTED" if passed else "COMPLETED",
                    document_type=structured_data.document_type,
                    vendor_name=structured_data.vendor_name,
                    vendor_address=getattr(structured_data, "vendor_address", None),
                    currency=structured_data.currency or "MYR",
                    subtotal=getattr(structured_data, "subtotal", None),
                    discount=getattr(structured_data, "discount", None),
                    shipping=getattr(structured_data, "shipping", None),
                    tax_amount=getattr(structured_data, "tax_amount", None),
                    grand_total=structured_data.grand_total,
                    converted_amount_myr=getattr(structured_data, "converted_amount_myr", None),
                    subtotal_myr=getattr(structured_data, "subtotal_myr", None),
                    discount_myr=getattr(structured_data, "discount_myr", None),
                    shipping_myr=getattr(structured_data, "shipping_myr", None),
                    tax_amount_myr=getattr(structured_data, "tax_amount_myr", None),
                    exchange_rate=getattr(structured_data, "exchange_rate", None),
                    exchange_rate_date=getattr(structured_data, "exchange_rate_date", None),
                    exchange_rate_provider=getattr(structured_data, "exchange_rate_provider", None),
                    exchange_rate_session=getattr(structured_data, "exchange_rate_session", None),
                    conversion_status=getattr(structured_data, "conversion_status", None),
                    conversion_error=getattr(structured_data, "conversion_error", None),
                    extracted_data_json=json.dumps(structured_data.dict()),
                    validation_errors_json=json.dumps(val_messages),
                    file_hash=file_hash,
                    duplicate_key=dup_key,
                    source_type="LOCAL_FOLDER",
                    original_source_path=str(item.resolve()),
                    created_at=db_now,
                    updated_at=db_now,
                )
                self.db.add(db_doc)
                self.db.commit()
                self.db.refresh(db_doc)

                # 9. Synchronize accounting transaction
                sync_document_transaction(self.db, db_doc)

                imported_documents.append({
                    "document_id": doc_id,
                    "filename": filename,
                    "document_type": structured_data.document_type,
                    "grand_total": structured_data.grand_total,
                    "file_hash": file_hash,
                })
                documents_imported += 1

            except Exception as e:
                self.db.rollback()
                errors_encountered += 1
            finally:
                if temp_file_path and os.path.exists(temp_file_path):
                    try:
                        os.unlink(temp_file_path)
                    except OSError:
                        pass

        summary_parts = []
        if documents_imported > 0:
            summary_parts.append(f"{documents_imported} document(s) imported")
        if bank_transactions_imported > 0:
            summary_parts.append(f"{bank_transactions_imported} bank transaction(s) imported")
        if existing_bank_transactions_matched > 0:
            summary_parts.append(f"{existing_bank_transactions_matched} existing bank transaction(s) linked")
        if duplicates_skipped > 0:
            summary_parts.append(f"{duplicates_skipped} duplicate(s) skipped")

        summary_msg = f"Scan completed: {', '.join(summary_parts) if summary_parts else 'no new files found'}."

        return {
            "success": True,
            "folder_path": str(folder),
            "message": summary_msg,
            "files_scanned": files_scanned,
            "files_detected": files_detected,
            "documents_imported": documents_imported,
            "bank_transactions_imported": bank_transactions_imported,
            "existing_bank_transactions_matched": existing_bank_transactions_matched,
            "duplicates_skipped": duplicates_skipped,
            "unsupported_skipped": unsupported_skipped,
            "errors_encountered": errors_encountered,
            "failed_files": errors_encountered,
            "documents": imported_documents,
            "bank_transactions": imported_bank_transactions,
        }
