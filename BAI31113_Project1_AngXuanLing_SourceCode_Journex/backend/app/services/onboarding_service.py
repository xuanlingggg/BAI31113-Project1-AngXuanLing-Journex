import os
import re
import json
import uuid
import shutil
import hashlib
import datetime
from datetime import timedelta
import time
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Any, List, Optional, Tuple, Set
from pathlib import Path
from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import HTTPException, status, UploadFile

from app.db.models import (
    UserModel,
    RegistrationSessionModel,
    CompanyModel,
    UserCompanyModel,
    DocumentModel,
    OpeningBalanceDocumentModel,
    OpeningBalanceBatchModel,
    OpeningBalanceDraftRecordModel,
    CustomerModel,
    SupplierModel,
    InventoryItemModel,
    JournalEntryModel,
    AccountingTransactionModel,
    ChartOfAccountModel,
    get_local_now
)
from app.db.database import seed_default_chart_of_accounts
from app.schemas.onboarding import (
    CompanyCreateOnboarding,
    DraftRecordCreate,
    DraftRecordUpdate,
    OpeningBalanceValidationResponse,
    SubledgerTieOutCheck,
    OpeningBalancePostRequest,
    RegistrationStartRequest,
    CompanyProfileStepRequest,
    TemporaryUploadedFile,
    SessionDraftItem,
    RegistrationSessionStateResponse,
    RegistrationFinalConfirmRequest
)
from app.services.auth_service import hash_password, create_access_token, get_user_companies_info
from app.services.pdf_ocr import extract_text_from_document
from app.services.document_agent import DocumentProcessingAgent
from app.config import COMP_ID_PREFIX, DOCUMENTS_DIR, DOC_ID_PREFIX

UPLOAD_BASE_DIR = Path("documents/onboarding")
TEMP_ONBOARDING_DIR = Path("documents/temp_onboarding")
TEMP_ONBOARDING_DIR.mkdir(parents=True, exist_ok=True)


def _to_decimal(val: Any) -> Decimal:
    if val is None or val == "":
        return Decimal("0.00")
    if isinstance(val, (int, float)):
        return Decimal(str(val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    try:
        clean = str(val).replace(",", "").replace("RM", "").replace("MYR", "").replace("$", "").strip()
        # Handle parentheses as negative
        if clean.startswith("(") and clean.endswith(")"):
            clean = "-" + clean[1:-1].strip()
        return Decimal(clean).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        return Decimal("0.00")


ACCOUNT_NAME_MAPPINGS = {
    # Equity
    "CAPITAL": ("100-0000", "CAPITAL"),
    "OWNER CAPITAL": ("100-0000", "CAPITAL"),
    "SHARE CAPITAL": ("100-0000", "CAPITAL"),
    "RETAINED EARNINGS": ("150-0000", "RETAINED EARNING"),
    "RETAINED EARNING": ("150-0000", "RETAINED EARNING"),
    
    # Liabilities
    "BANK LOAN": ("425-0000", "BANK LOAN"),
    "TERM LOAN": ("425-0000", "BANK LOAN"),
    "LOAN": ("425-0000", "BANK LOAN"),
    "OTHER CREDITORS": ("405-0000", "OTHER CREDITORS"),
    "TRADE PAYABLES": ("400-0000", "TRADE CREDITORS"),
    "TRADE CREDITORS": ("400-0000", "TRADE CREDITORS"),
    "ACCRUALS": ("410-0000", "ACCRUALS"),
    
    # Assets - Fixed
    "OFFICE EQUIPMENT": ("200-3000", "OFFICE EQUIPMENT"),
    "MOTOR VEHICLES": ("200-4000", "MOTOR VEHICLES"),
    "FURNITURES & FITTINGS": ("200-2000", "FURNITURES & FITTINGS"),
    "ACCUMULATED DEPRECIATION - MOTOR VEHICLES": ("200-4005", "ACCUM. DEPRN. - MOTOR VEHICLES"),
    "ACCUMULATED DEPRECIATION – MOTOR VEHICLES": ("200-4005", "ACCUM. DEPRN. - MOTOR VEHICLES"),
    "ACCUM. DEPRN. - MOTOR VEHICLES": ("200-4005", "ACCUM. DEPRN. - MOTOR VEHICLES"),
    "ACCUMULATED DEPRECIATION - OFFICE EQUIPMENT": ("200-3005", "ACCUM. DEPRN. - OFFICE EQUIPMENT"),
    "ACCUMULATED DEPRECIATION – OFFICE EQUIPMENT": ("200-3005", "ACCUM. DEPRN. - OFFICE EQUIPMENT"),
    "ACCUM. DEPRN. - OFFICE EQUIPMENT": ("200-3005", "ACCUM. DEPRN. - OFFICE EQUIPMENT"),
    "ACCUMULATED DEPRECIATION": ("120-1000", "ACCUMULATED DEPRECIATION"),

    # Assets - Current
    "INVENTORY": ("330-0000", "STOCK"),
    "STOCK": ("330-0000", "STOCK"),
    "TRADE RECEIVABLES": ("300-0000", "TRADE DEBTORS"),
    "TRADE DEBTORS": ("300-0000", "TRADE DEBTORS"),
    "CASH AT BANK": ("310-1000", "CASH AT BANK"),
    "CASH IN HAND": ("320-0000", "CASH IN HAND"),
    "PREPAID RENT": ("340-2000", "PREPAID RENT"),
    "PREPAID EXPENSES": ("340-1000", "PREPAID EXPENSES"),
    "DEPOSIT & PREPAYMENT": ("340-0000", "DEPOSIT & PREPAYMENT"),
}


def calculate_due_date(invoice_date_str: Optional[str], credit_term_str: Optional[str]) -> Optional[str]:
    if not invoice_date_str:
        return None
    date_str = str(invoice_date_str).strip()
    dt = None
    formats = [
        "%d %B %Y",
        "%d %b %Y",
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
    ]
    for fmt in formats:
        try:
            dt = datetime.datetime.strptime(date_str, fmt)
            break
        except ValueError:
            continue
    if not dt:
        m = re.search(r'(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})', date_str)
        if m:
            day, month_str, year = int(m.group(1)), m.group(2)[:3].capitalize(), int(m.group(3))
            try:
                dt = datetime.datetime.strptime(f"{day} {month_str} {year}", "%d %b %Y")
            except Exception:
                pass
    if not dt:
        return None
    term_days = 30
    if credit_term_str:
        tm = re.search(r'(\d+)', str(credit_term_str))
        if tm:
            term_days = int(tm.group(1))
    due_dt = dt + timedelta(days=term_days)
    return due_dt.strftime("%Y-%m-%d")


class OnboardingService:
    def __init__(self, db: Session):
        self.db = db

    def generate_company_id(self) -> str:
        comps = self.db.query(CompanyModel.company_id).all()
        max_seq = 0
        for (cid,) in comps:
            if cid and str(cid).startswith(COMP_ID_PREFIX):
                try:
                    seq = int(str(cid)[len(COMP_ID_PREFIX):])
                    if seq > max_seq:
                        max_seq = seq
                except ValueError:
                    pass
        return f"{COMP_ID_PREFIX}{max_seq + 1:06d}"

    def determine_opening_balance_date(self, comp: CompanyModel, session_as_at: Optional[str] = None) -> str:
        """
        Determines the approved opening balance date (e.g. '2025-12-31').
        For a financial year starting '2026-01-01', the opening balance date is the closing
        day of the preceding period: '2025-12-31'.
        Opening journal and subsidiary opening balances MUST use the same approved opening balance date.
        """
        if session_as_at and session_as_at != (comp.financial_year_start or "2026-01-01"):
            return session_as_at

        fy_start = comp.financial_year_start or f"{comp.financial_year or 2026}-01-01"
        try:
            start_dt = datetime.datetime.strptime(fy_start, "%Y-%m-%d").date()
            prev_day = start_dt - datetime.timedelta(days=1)
            return prev_day.strftime("%Y-%m-%d")
        except Exception:
            return "2025-12-31"

    def generate_next_customer_code(self, company_id: str, existing_codes: Optional[Set[str]] = None) -> str:
        """
        Calculates the next available unique customer code for the given company by finding
        the highest numeric sequence. Format: CUST-001, CUST-002, etc.
        Does not restart from CUST-001, does not rely solely on record count, and prevents collisions.
        """
        if existing_codes is None:
            existing_codes = set()
        db_codes = {c[0] for c in self.db.query(CustomerModel.customer_code).filter(CustomerModel.company_id == company_id).all() if c[0]}
        all_codes = {str(c).upper().strip() for c in (db_codes | existing_codes)}
        max_num = 0
        for code in all_codes:
            m = re.search(r'CUST[-_]?(\d+)', code, re.IGNORECASE)
            if m:
                try:
                    num = int(m.group(1))
                    if num > max_num:
                        max_num = num
                except ValueError:
                    pass
        next_num = max_num + 1
        candidate = f"CUST-{next_num:03d}"
        while candidate in all_codes:
            next_num += 1
            candidate = f"CUST-{next_num:03d}"
        return candidate

    def generate_next_supplier_code(self, company_id: str, supplier_type: str = "TRADE", existing_codes: Optional[Set[str]] = None) -> str:
        """
        Calculates the next available unique supplier code for the given company.
        Format: SUPP-001 for TRADE, OTH-001 for OTHER.
        """
        prefix = "OTH" if supplier_type == "OTHER" else "SUPP"
        if existing_codes is None:
            existing_codes = set()
        db_codes = {s[0] for s in self.db.query(SupplierModel.supplier_code).filter(
            SupplierModel.company_id == company_id,
            SupplierModel.supplier_type == supplier_type
        ).all() if s[0]}
        all_codes = {str(c).upper().strip() for c in (db_codes | existing_codes)}
        max_num = 0
        for code in all_codes:
            m = re.search(rf'{prefix}[-_]?(\d+)', code, re.IGNORECASE)
            if m:
                try:
                    num = int(m.group(1))
                    if num > max_num:
                        max_num = num
                except ValueError:
                    pass
        next_num = max_num + 1
        candidate = f"{prefix}-{next_num:03d}"
        while candidate in all_codes:
            next_num += 1
            candidate = f"{prefix}-{next_num:03d}"
        return candidate

    def generate_next_item_code(self, company_id: str, suggested_code: Optional[str] = None, existing_codes: Optional[Set[str]] = None) -> str:
        """
        Returns suggested_code if not yet used in this company; otherwise generates STK-001, STK-002, etc.
        """
        if existing_codes is None:
            existing_codes = set()
        db_codes = {it[0] for it in self.db.query(InventoryItemModel.item_code).filter(InventoryItemModel.company_id == company_id).all() if it[0]}
        all_codes = {str(c).upper().strip() for c in (db_codes | existing_codes)}
        if suggested_code and suggested_code.strip() and suggested_code.strip().upper() not in all_codes:
            return suggested_code.strip()

        max_num = 0
        for code in all_codes:
            m = re.search(r'STK[-_]?(\d+)', code, re.IGNORECASE)
            if m:
                try:
                    num = int(m.group(1))
                    if num > max_num:
                        max_num = num
                except ValueError:
                    pass
        next_num = max_num + 1
        candidate = f"STK-{next_num:03d}"
        while candidate in all_codes:
            next_num += 1
            candidate = f"STK-{next_num:03d}"
        return candidate

    def get_or_create_batch(self, company_id: str, as_at_date: str = "2025-12-31") -> OpeningBalanceBatchModel:
        batch = self.db.query(OpeningBalanceBatchModel).filter(
            OpeningBalanceBatchModel.company_id == company_id
        ).first()
        if not batch:
            batch = OpeningBalanceBatchModel(
                company_id=company_id,
                as_at_date=as_at_date,
                status="DRAFT"
            )
            self.db.add(batch)
            self.db.commit()
            self.db.refresh(batch)
        return batch

    def create_company_onboarding(self, req: CompanyCreateOnboarding, user_id: Optional[int] = None) -> CompanyModel:
        # Check if updating an existing company passed by ID
        target_cid = getattr(req, "company_id", None)
        if target_cid:
            existing = self.db.query(CompanyModel).filter(CompanyModel.company_id == target_cid).first()
            if existing:
                existing.company_name = req.company_name.strip()
                existing.registration_number = req.registration_number.strip() if req.registration_number else None
                existing.address = req.address.strip() if req.address else None
                existing.email = req.email.strip() if req.email else None
                existing.phone = req.phone.strip() if req.phone else None
                existing.currency = req.currency or existing.currency or "MYR"
                existing.financial_year = req.financial_year or existing.financial_year or 2026
                if req.financial_year_start:
                    existing.financial_year_start = req.financial_year_start
                if req.financial_year_end:
                    existing.financial_year_end = req.financial_year_end
                self.db.commit()
                self.db.refresh(existing)
                return existing

        # Check if user already has an incomplete company in onboarding
        if user_id:
            user_comps = self.db.query(UserCompanyModel).filter(UserCompanyModel.user_id == user_id).all()
            for uc in user_comps:
                existing = self.db.query(CompanyModel).filter(
                    CompanyModel.company_id == uc.company_id,
                    CompanyModel.onboarding_status != "ACTIVE"
                ).first()
                if existing:
                    existing.company_name = req.company_name.strip()
                    existing.registration_number = req.registration_number.strip() if req.registration_number else None
                    existing.address = req.address.strip() if req.address else None
                    existing.email = req.email.strip() if req.email else None
                    existing.phone = req.phone.strip() if req.phone else None
                    existing.currency = req.currency or existing.currency or "MYR"
                    existing.financial_year = req.financial_year or existing.financial_year or 2026
                    if req.financial_year_start:
                        existing.financial_year_start = req.financial_year_start
                    if req.financial_year_end:
                        existing.financial_year_end = req.financial_year_end
                    self.db.commit()
                    self.db.refresh(existing)
                    return existing

        comp_id = self.generate_company_id()
        comp = CompanyModel(
            company_id=comp_id,
            company_name=req.company_name.strip(),
            registration_number=req.registration_number.strip() if req.registration_number else None,
            address=req.address.strip() if req.address else None,
            email=req.email.strip() if req.email else None,
            phone=req.phone.strip() if req.phone else None,
            currency=req.currency or "MYR",
            financial_year=req.financial_year or 2026,
            financial_year_start=req.financial_year_start or f"{req.financial_year or 2026}-01-01",
            financial_year_end=req.financial_year_end or f"{req.financial_year or 2026}-12-31",
            onboarding_status="COMPANY_SETUP",
            onboarding_step=1,
            is_active=False
        )
        self.db.add(comp)
        self.db.commit()
        self.db.refresh(comp)

        # Link user if user_id supplied
        if user_id:
            user_comp = UserCompanyModel(
                user_id=user_id,
                company_id=comp_id,
                role="OWNER",
                is_default=True
            )
            self.db.add(user_comp)
            self.db.commit()

        # Seed COA for the new company
        seed_default_chart_of_accounts(self.db, comp_id)

        # Create draft opening balance batch
        as_at = req.financial_year_start or "2025-12-31"
        self.get_or_create_batch(comp_id, as_at_date=as_at)

        return comp

    def upload_opening_document(
        self,
        company_id: str,
        doc_category: str,
        file: UploadFile
    ) -> OpeningBalanceDocumentModel:
        comp_dir = UPLOAD_BASE_DIR / company_id
        comp_dir.mkdir(parents=True, exist_ok=True)
        file_path = comp_dir / file.filename

        content = file.file.read()
        file_hash = hashlib.sha256(content).hexdigest()
        file_size = len(content)

        with open(file_path, "wb") as f:
            f.write(content)

        doc = OpeningBalanceDocumentModel(
            company_id=company_id,
            doc_category=doc_category.upper().strip(),
            original_filename=file.filename,
            file_path=str(file_path),
            file_size=file_size,
            file_hash=file_hash,
            mime_type=file.content_type or "application/pdf",
            extraction_status="PENDING"
        )
        self.db.add(doc)
        self.db.commit()
        self.db.refresh(doc)
        return doc

    def extract_document(self, doc_id: int) -> List[OpeningBalanceDraftRecordModel]:
        doc = self.db.query(OpeningBalanceDocumentModel).filter(OpeningBalanceDocumentModel.id == doc_id).first()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found.")

        doc.extraction_status = "PROCESSING"
        self.db.commit()

        target_path = Path(doc.file_path)
        if not target_path.exists():
            backend_base = Path(__file__).resolve().parent.parent.parent
            if (backend_base / doc.file_path).exists():
                target_path = backend_base / doc.file_path
            elif (backend_base.parent / doc.file_path).exists():
                target_path = backend_base.parent / doc.file_path

        resolved_path_str = str(target_path)
        raw_text = extract_text_from_document(resolved_path_str)
        batch = self.get_or_create_batch(doc.company_id)

        try:
            company = self.db.query(CompanyModel).filter(CompanyModel.company_id == doc.company_id).first()
            comp_context = {
                "company_id": doc.company_id,
                "company_name": company.company_name if company else doc.company_id
            }
            doc_agent = DocumentProcessingAgent(company_context=comp_context)
            res = doc_agent.process_onboarding_document(str(doc.id), raw_text, doc.original_filename, file_path=resolved_path_str)

            detected_cat = res.get("category") or doc.doc_category or "TRIAL_BALANCE"
            doc.doc_category = detected_cat
            doc.extraction_status = "EXTRACTED"
            doc.error_message = None

            # Remove previous draft records for this source_doc_id
            self.db.query(OpeningBalanceDraftRecordModel).filter(
                OpeningBalanceDraftRecordModel.source_doc_id == doc.id
            ).delete()

            extracted_items = []
            line_items = res.get("line_items", [])
            for it in line_items:
                deb = float(it.get("debit", 0.0) or 0.0)
                crd = float(it.get("credit", 0.0) or 0.0)
                qty = float(it.get("quantity", 0.0) or 0.0)
                cost = float(it.get("unit_cost", 0.0) or 0.0)
                amt = float(it.get("amount", 0.0) or (deb if deb > 0 else (crd if crd > 0 else (qty * cost if qty and cost else 0.0))))

                rec = OpeningBalanceDraftRecordModel(
                    batch_id=batch.id,
                    company_id=doc.company_id,
                    category=it.get("category") or detected_cat,
                    source_doc_id=doc.id,
                    account_code=it.get("account_code"),
                    account_name=it.get("account_name"),
                    entity_name=it.get("entity_name"),
                    item_code=it.get("item_code"),
                    invoice_no=it.get("invoice_no"),
                    invoice_date=it.get("invoice_date"),
                    credit_term=it.get("credit_term"),
                    debit=deb,
                    credit=crd,
                    quantity=qty,
                    unit_cost=cost,
                    amount=amt,
                    review_status=it.get("review_status") or "VERIFIED",
                    notes=it.get("notes") or f"Extracted from {doc.original_filename}"
                )
                self.db.add(rec)
                extracted_items.append(rec)

            self.db.commit()
            return extracted_items

        except Exception as e:
            doc.extraction_status = "ERROR"
            doc.error_message = str(e)
            self.db.commit()
            raise HTTPException(status_code=500, detail=f"Extraction failed: {e}")

    def extract_company_documents(self, company_id: str, file_id: Optional[int] = None) -> Dict[str, Any]:
        company = self.db.query(CompanyModel).filter(CompanyModel.company_id == company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail=f"Company with ID '{company_id}' not found.")

        query = self.db.query(OpeningBalanceDocumentModel).filter(OpeningBalanceDocumentModel.company_id == company_id)
        if file_id:
            docs_to_extract = query.filter(OpeningBalanceDocumentModel.id == file_id).all()
        else:
            all_c_docs = query.order_by(OpeningBalanceDocumentModel.id.asc()).all()
            docs_by_fn = {}
            for d in all_c_docs:
                docs_by_fn[d.original_filename] = d
            docs_to_extract = sorted(docs_by_fn.values(), key=lambda x: x.id)

        for doc in docs_to_extract:
            try:
                self.extract_document(doc.id)
            except Exception as e:
                doc.extraction_status = "ERROR"
                doc.error_message = str(e)
                self.db.commit()

        return self.get_company_onboarding_state(company_id)

    def get_company_onboarding_state(self, company_id: str) -> Dict[str, Any]:
        company = self.db.query(CompanyModel).filter(CompanyModel.company_id == company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail=f"Company with ID '{company_id}' not found.")

        all_docs = self.db.query(OpeningBalanceDocumentModel).filter(
            OpeningBalanceDocumentModel.company_id == company_id
        ).order_by(OpeningBalanceDocumentModel.id.asc()).all()

        # De-duplicate by original_filename (keep latest)
        docs_by_fn = {}
        for d in all_docs:
            docs_by_fn[d.original_filename] = d
        docs = sorted(docs_by_fn.values(), key=lambda x: x.id)

        doc_map = {d.id: d.original_filename for d in docs}

        uploaded_files = []
        for d in docs:
            st = "Extracted" if d.extraction_status == "EXTRACTED" else ("Failed" if d.extraction_status == "ERROR" else "Uploaded")
            uploaded_files.append({
                "file_id": str(d.id),
                "original_filename": d.original_filename,
                "file_size": d.file_size,
                "mime_type": d.mime_type,
                "status": st,
                "detected_category": d.doc_category,
                "document_type": d.doc_category,
                "error_message": d.error_message
            })

        draft_records = self.db.query(OpeningBalanceDraftRecordModel).filter(
            OpeningBalanceDraftRecordModel.company_id == company_id
        ).order_by(OpeningBalanceDraftRecordModel.id.asc()).all()

        extracted_data = []
        for r in draft_records:
            extracted_data.append({
                "id": r.id,
                "batch_id": r.batch_id,
                "company_id": r.company_id,
                "category": r.category,
                "source_doc_id": r.source_doc_id,
                "account_code": r.account_code,
                "account_name": r.account_name,
                "entity_name": r.entity_name,
                "item_code": r.item_code,
                "invoice_no": r.invoice_no,
                "invoice_date": r.invoice_date,
                "credit_term": r.credit_term,
                "debit": float(r.debit or 0.0),
                "credit": float(r.credit or 0.0),
                "quantity": float(r.quantity or 0.0),
                "unit_cost": float(r.unit_cost or 0.0),
                "amount": float(r.amount or 0.0),
                "review_status": r.review_status,
                "notes": r.notes,
                "source_filename": doc_map.get(r.source_doc_id, "")
            })

        val_response = self.validate_opening_balances(company_id)

        company_data = {
            "company_name": company.company_name,
            "registration_number": company.registration_number,
            "currency": company.currency or "MYR",
            "financial_year": company.financial_year or 2026,
            "address": company.address,
            "email": company.email,
            "phone": company.phone
        }

        step = 3 if len(extracted_data) > 0 else (2 if len(uploaded_files) > 0 else 1)

        return {
            "company_data": company_data,
            "uploaded_files": uploaded_files,
            "extracted_data": extracted_data,
            "validation": val_response.model_dump(),
            "step": step
        }

    def update_company_drafts(self, company_id: str, drafts: List[Dict[str, Any]]) -> Dict[str, Any]:
        batch = self.get_or_create_batch(company_id)
        existing_recs = {
            r.id: r for r in self.db.query(OpeningBalanceDraftRecordModel).filter(
                OpeningBalanceDraftRecordModel.company_id == company_id
            ).all()
        }

        submitted_ids = set()
        for d in drafts:
            did = d.get("id")
            rec = None
            if isinstance(did, int) and did in existing_recs:
                rec = existing_recs[did]
                submitted_ids.add(did)
            elif isinstance(did, str) and did.isdigit() and int(did) in existing_recs:
                rec = existing_recs[int(did)]
                submitted_ids.add(int(did))

            deb = float(d.get("debit", 0.0) or 0.0)
            crd = float(d.get("credit", 0.0) or 0.0)
            qty = float(d.get("quantity", 0.0) or 0.0)
            cost = float(d.get("unit_cost", 0.0) or 0.0)
            amt = float(d.get("amount", 0.0) or (deb if deb > 0 else (crd if crd > 0 else qty * cost)))

            if rec:
                rec.category = d.get("category", rec.category)
                rec.account_code = d.get("account_code", rec.account_code)
                rec.account_name = d.get("account_name", rec.account_name)
                rec.entity_name = d.get("entity_name", rec.entity_name)
                rec.item_code = d.get("item_code", rec.item_code)
                rec.invoice_no = d.get("invoice_no", rec.invoice_no)
                rec.invoice_date = d.get("invoice_date", rec.invoice_date)
                rec.credit_term = d.get("credit_term", rec.credit_term)
                rec.debit = deb
                rec.credit = crd
                rec.quantity = qty
                rec.unit_cost = cost
                rec.amount = amt
                rec.review_status = d.get("review_status", "EDITED")
                rec.notes = d.get("notes", rec.notes)
            else:
                rec = OpeningBalanceDraftRecordModel(
                    batch_id=batch.id,
                    company_id=company_id,
                    category=d.get("category", "TRIAL_BALANCE"),
                    account_code=d.get("account_code"),
                    account_name=d.get("account_name"),
                    entity_name=d.get("entity_name"),
                    item_code=d.get("item_code"),
                    invoice_no=d.get("invoice_no"),
                    invoice_date=d.get("invoice_date"),
                    credit_term=d.get("credit_term"),
                    debit=deb,
                    credit=crd,
                    quantity=qty,
                    unit_cost=cost,
                    amount=amt,
                    review_status="EDITED",
                    notes=d.get("notes", "Manually added")
                )
                self.db.add(rec)

        for eid, erec in existing_recs.items():
            if eid not in submitted_ids:
                self.db.delete(erec)

        self.db.commit()
        val_response = self.validate_opening_balances(company_id)
        return {
            "validation": val_response.model_dump()
        }

    # --- Parsers ---

    def _parse_trial_balance(self, text: str, doc, batch) -> List[OpeningBalanceDraftRecordModel]:
        records = []
        lines = [line.strip() for line in text.split("\n") if line.strip()]

        # Pattern: Account Name followed by 1 or 2 numbers (Debit, Credit)
        # e.g.: "Office Equipment 120,500" or "Capital 145,000" or "Motor Vehicles 165,000 0.00"
        for line in lines:
            line_clean = line.replace("RM", "").strip()
            if any(h in line_clean.lower() for h in ["total", "debit (rm)", "credit (rm)", "trial balance as at", "account name"]):
                if "total" in line_clean.lower():
                    # Check for as_at date in headers
                    continue
                continue

            # Look for numbers at the end of line
            nums = re.findall(r'[\d,]+\.?\d*', line_clean)
            if not nums:
                continue

            # Extract account name
            # Remove the numbers from the end
            name_part = re.sub(r'[\d,]+\.?\d*', '', line_clean).strip()
            name_part = re.sub(r'[-–—\s]+$', '', name_part).strip()
            if len(name_part) < 2:
                continue

            # Clean and normalize account name
            norm_name = name_part.upper()
            code, std_name = self._resolve_account(norm_name, doc.company_id)

            val1 = _to_decimal(nums[-1])
            val2 = _to_decimal(nums[-2]) if len(nums) >= 2 else Decimal("0.00")

            # Determine whether val1 is debit or credit based on account classification if single number
            debit = Decimal("0.00")
            credit = Decimal("0.00")

            if len(nums) >= 2 and val2 > 0:
                debit = val2
                credit = val1
            else:
                # Single number - assign by account type normal balance
                amount = val1
                if self._is_credit_account(norm_name, code):
                    credit = amount
                else:
                    debit = amount

            rec = OpeningBalanceDraftRecordModel(
                batch_id=batch.id,
                company_id=doc.company_id,
                category="TRIAL_BALANCE",
                source_doc_id=doc.id,
                account_code=code,
                account_name=std_name or name_part,
                debit=float(debit),
                credit=float(credit),
                amount=float(debit if debit > 0 else credit),
                review_status="VERIFIED" if code else "PENDING"
            )
            self.db.add(rec)
            records.append(rec)

        self.db.commit()
        return records

    def _parse_debtors(self, text: str, doc, batch) -> List[OpeningBalanceDraftRecordModel]:
        records = []
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        controls = self.get_company_control_accounts(doc.company_id)
        ctrl_code = controls["DEBTORS"]["code"]
        ctrl_name = controls["DEBTORS"]["name"]

        for line in lines:
            if any(h in line.lower() for h in ["debtor", "customer name", "total", "receivable list"]):
                continue

            # Pattern: "Urban Style Sdn. Bhd. – RM9,000" or "Urban Style Sdn. Bhd. 9,000.00"
            amount_match = re.search(r'(?:RM|MYR)?\s*([\d,]+\.?\d*)', line)
            if not amount_match:
                continue

            nums = re.findall(r'[\d,]+\.?\d*', line)
            if not nums:
                continue

            amt = _to_decimal(nums[-1])
            name = re.sub(r'(?:RM|MYR)?\s*[\d,]+\.?\d*', '', line).strip()
            name = re.sub(r'[-–—\s:]+$', '', name).strip()
            name = re.sub(r'^[-–—\s\d\.]+', '', name).strip()

            if not name or amt <= 0:
                continue

            rec = OpeningBalanceDraftRecordModel(
                batch_id=batch.id,
                company_id=doc.company_id,
                category="DEBTOR",
                source_doc_id=doc.id,
                entity_name=name,
                account_code=ctrl_code,
                account_name=ctrl_name,
                credit_term="30 Days",
                amount=float(amt),
                debit=float(amt),
                credit=0.0,
                review_status="VERIFIED"
            )
            self.db.add(rec)
            records.append(rec)

        self.db.commit()
        return records

    def _parse_creditors(self, text: str, doc, batch) -> List[OpeningBalanceDraftRecordModel]:
        records = []
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        controls = self.get_company_control_accounts(doc.company_id)
        ctrl_code = controls["CREDITORS"]["code"]
        ctrl_name = controls["CREDITORS"]["name"]

        for line in lines:
            if any(h in line.lower() for h in ["trade payables", "supplier name", "total", "creditors list"]):
                continue

            nums = re.findall(r'[\d,]+\.?\d*', line)
            if not nums:
                continue

            amt = _to_decimal(nums[-1])
            name = re.sub(r'(?:RM|MYR)?\s*[\d,]+\.?\d*', '', line).strip()
            name = re.sub(r'[-–—\s:]+$', '', name).strip()
            name = re.sub(r'^[-–—\s\d\.]+', '', name).strip()

            if not name or amt <= 0:
                continue

            rec = OpeningBalanceDraftRecordModel(
                batch_id=batch.id,
                company_id=doc.company_id,
                category="CREDITOR",
                source_doc_id=doc.id,
                entity_name=name,
                account_code=ctrl_code,
                account_name=ctrl_name,
                credit_term="30 Days",
                amount=float(amt),
                debit=0.0,
                credit=float(amt),
                review_status="VERIFIED"
            )
            self.db.add(rec)
            records.append(rec)

        self.db.commit()
        return records

    def _parse_other_creditors(self, text: str, doc, batch) -> List[OpeningBalanceDraftRecordModel]:
        records = []
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        controls = self.get_company_control_accounts(doc.company_id)
        ctrl_code = controls["OTHER_CREDITORS"]["code"]
        ctrl_name = controls["OTHER_CREDITORS"]["name"]

        for line in lines:
            if any(h in line.lower() for h in ["other creditors", "creditor name", "total"]):
                continue

            nums = re.findall(r'[\d,]+\.?\d*', line)
            if not nums:
                continue

            amt = _to_decimal(nums[-1])
            name = re.sub(r'(?:RM|MYR)?\s*[\d,]+\.?\d*', '', line).strip()
            name = re.sub(r'[-–—\s:]+$', '', name).strip()
            name = re.sub(r'^[-–—\s\d\.]+', '', name).strip()

            if not name or amt <= 0:
                continue

            rec = OpeningBalanceDraftRecordModel(
                batch_id=batch.id,
                company_id=doc.company_id,
                category="OTHER_CREDITOR",
                source_doc_id=doc.id,
                entity_name=name,
                account_code=ctrl_code,
                account_name=ctrl_name,
                credit_term="30 Days",
                amount=float(amt),
                debit=0.0,
                credit=float(amt),
                review_status="VERIFIED"
            )
            self.db.add(rec)
            records.append(rec)

        self.db.commit()
        return records

    def _parse_stock(self, text: str, doc, batch) -> List[OpeningBalanceDraftRecordModel]:
        records = []
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        controls = self.get_company_control_accounts(doc.company_id)
        ctrl_code = controls["STOCK"]["code"]
        ctrl_name = controls["STOCK"]["name"]

        for line in lines:
            if any(h in line.lower() for h in ["opening stock", "item name", "total stock", "total opening"]):
                continue

            # Pattern: "Leather Handbag (LHB): 10 units × RM3,500 = RM35,000"
            # Or tabular: "LHB Leather Handbag 10 3500 35000"
            code_match = re.search(r'\(([A-Za-z0-9_-]+)\)', line)
            item_code = code_match.group(1).upper() if code_match else None

            # Extract numbers: quantity, unit cost, total
            nums = re.findall(r'[\d,]+\.?\d*', line)
            if len(nums) < 2:
                continue

            # Parse quantity and cost
            qty = Decimal("0")
            unit_cost = Decimal("0")
            total_val = Decimal("0")

            if len(nums) >= 3:
                qty = _to_decimal(nums[-3])
                unit_cost = _to_decimal(nums[-2])
                total_val = _to_decimal(nums[-1])
            elif len(nums) == 2:
                qty = _to_decimal(nums[0])
                unit_cost = _to_decimal(nums[1])
                total_val = qty * unit_cost

            # Clean name
            name_part = re.sub(r'\(.*?\)', '', line)
            name_part = re.sub(r'[:=×xX].*$', '', name_part)
            name_part = re.sub(r'[\d,]+\.?\d*', '', name_part).strip()
            name_part = re.sub(r'[-–—\s:]+$', '', name_part).strip()

            if not item_code and name_part:
                # Generate simple SKU from name
                words = name_part.split()
                item_code = "".join(w[0] for w in words)[:4].upper()

            if total_val <= 0 and qty > 0 and unit_cost > 0:
                total_val = qty * unit_cost

            rec = OpeningBalanceDraftRecordModel(
                batch_id=batch.id,
                company_id=doc.company_id,
                category="STOCK",
                source_doc_id=doc.id,
                item_code=item_code,
                entity_name=name_part,
                account_code=ctrl_code,
                account_name=ctrl_name,
                quantity=float(qty),
                unit_cost=float(unit_cost),
                amount=float(total_val),
                debit=float(total_val),
                credit=0.0,
                review_status="VERIFIED" if (qty > 0 and unit_cost > 0) else "PENDING"
            )
            self.db.add(rec)
            records.append(rec)

        self.db.commit()
        return records

    def _generic_parse(self, text: str, doc, batch) -> List[OpeningBalanceDraftRecordModel]:
        return []

    def get_company_control_accounts(self, company_id: str) -> Dict[str, Dict[str, str]]:
        """
        Dynamically resolves the company's specific control accounts from its active Chart of Accounts.
        Allows companies with custom account numbers (e.g. 11300, 21000, 13000) or standard MFRS codes to tie out seamlessly.
        """
        accounts = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.company_id == company_id,
            ChartOfAccountModel.is_active == True
        ).all()

        controls = {
            "DEBTORS": {"code": "300-0000", "name": "TRADE DEBTORS"},
            "CREDITORS": {"code": "400-0000", "name": "TRADE CREDITORS"},
            "OTHER_CREDITORS": {"code": "405-0000", "name": "OTHER CREDITORS"},
            "STOCK": {"code": "330-0000", "name": "STOCK"}
        }

        for acc in accounts:
            name_u = acc.account_name.upper().strip()
            code = acc.account_code.strip()
            # Trade Debtors / Receivables
            if any(term in name_u for term in ["TRADE DEBTOR", "TRADE RECEIVABLE", "ACCOUNTS RECEIVABLE"]):
                controls["DEBTORS"] = {"code": code, "name": acc.account_name}
            # Trade Creditors / Payables
            elif any(term in name_u for term in ["TRADE CREDITOR", "TRADE PAYABLE", "ACCOUNTS PAYABLE"]):
                controls["CREDITORS"] = {"code": code, "name": acc.account_name}
            # Other Creditors
            elif any(term in name_u for term in ["OTHER CREDITOR", "OTHER PAYABLE", "SUNDRY CREDITOR"]):
                controls["OTHER_CREDITORS"] = {"code": code, "name": acc.account_name}
            # Inventory / Stock
            elif any(term in name_u for term in ["INVENTORY", "STOCK"]) and acc.account_type in ["Asset", "Current Asset"]:
                controls["STOCK"] = {"code": code, "name": acc.account_name}

        return controls

    def _resolve_account(self, name_upper: str, company_id: str) -> Tuple[Optional[str], Optional[str]]:
        clean_key = re.sub(r'[^A-Z0-9\s]', '', name_upper).strip()

        # 1. Query the company's own Chart of Accounts first
        accounts = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.company_id == company_id,
            ChartOfAccountModel.is_active == True
        ).all()
        for a in accounts:
            a_clean = re.sub(r'[^A-Z0-9\s]', '', a.account_name.upper()).strip()
            if a_clean == clean_key or a_clean in clean_key or clean_key in a_clean:
                return a.account_code, a.account_name

        # 2. Fall back to standard account mappings
        for k, (code, std_name) in ACCOUNT_NAME_MAPPINGS.items():
            k_clean = re.sub(r'[^A-Z0-9\s]', '', k)
            if k_clean == clean_key or k_clean in clean_key or clean_key in k_clean:
                return code, std_name

        return None, None

    def _is_credit_account(self, name_upper: str, code: Optional[str]) -> bool:
        if code:
            if code.startswith(("1", "4", "5")):
                return True
            if "200-3005" in code or "200-4005" in code or "200-2005" in code or "120-1000" in code:
                return True  # Accumulated depreciation contra-asset
        credit_keywords = ["CAPITAL", "LOAN", "CREDITOR", "PAYABLE", "EARNING", "ACCUMULATED DEPRECIATION", "ACCUM. DEPRN"]
        return any(k in name_upper for k in credit_keywords)

    # --- Validation ---

    def validate_opening_balances(self, company_id: str) -> OpeningBalanceValidationResponse:
        batch = self.get_or_create_batch(company_id)
        drafts = self.db.query(OpeningBalanceDraftRecordModel).filter(
            OpeningBalanceDraftRecordModel.company_id == company_id
        ).all()

        errors: List[str] = []
        warnings: List[str] = []

        # 1. Trial Balance Equilibrium
        tb_items = [d for d in drafts if d.category == "TRIAL_BALANCE"]
        total_debit = Decimal("0.00")
        total_credit = Decimal("0.00")

        # Map by account code
        tb_account_map: Dict[str, Decimal] = {}

        for item in tb_items:
            dr = _to_decimal(item.debit)
            cr = _to_decimal(item.credit)
            total_debit += dr
            total_credit += cr

            code = item.account_code or "UNKNOWN"
            # Net balance
            net = dr - cr
            tb_account_map[code] = tb_account_map.get(code, Decimal("0.00")) + net

        tb_diff = abs(total_debit - total_credit)
        tb_balanced = tb_diff < Decimal("0.01")
        if not tb_balanced:
            errors.append(f"Trial Balance is not balanced. Total Debits (RM {total_debit:,.2f}) != Total Credits (RM {total_credit:,.2f}). Difference: RM {tb_diff:,.2f}")

        # 2. Subsidiary Tie-Out Checks
        subledger_checks: List[SubledgerTieOutCheck] = []
        controls = self.get_company_control_accounts(company_id)

        # A. Debtors vs Trade Receivables Control Account
        debtor_items = [d for d in drafts if d.category == "DEBTOR"]
        debtor_total = sum((_to_decimal(d.amount) for d in debtor_items), Decimal("0.00"))
        
        # Determine control account: check draft account_code or company control account
        debtor_codes = {d.account_code for d in debtor_items if d.account_code}
        debtor_ctrl_code = list(debtor_codes)[0] if len(debtor_codes) == 1 else controls["DEBTORS"]["code"]
        debtor_ctrl_name = controls["DEBTORS"]["name"]
        
        gl_debtors = tb_account_map.get(debtor_ctrl_code, Decimal("0.00"))
        if gl_debtors == Decimal("0.00") and debtor_ctrl_code != controls["DEBTORS"]["code"]:
            gl_debtors = tb_account_map.get(controls["DEBTORS"]["code"], Decimal("0.00"))
            debtor_ctrl_code = controls["DEBTORS"]["code"]

        debtor_diff = abs(debtor_total - gl_debtors)
        debtor_reconciled = debtor_diff < Decimal("0.01")
        subledger_checks.append(SubledgerTieOutCheck(
            category="Trade Receivables / Debtors",
            subledger_total=float(debtor_total),
            gl_control_account=debtor_ctrl_code,
            gl_control_name=debtor_ctrl_name,
            gl_control_amount=float(gl_debtors),
            difference=float(debtor_diff),
            is_reconciled=debtor_reconciled
        ))
        if debtor_items and not debtor_reconciled:
            errors.append(f"Debtor subledger total (RM {debtor_total:,.2f}) does not match Trade Receivables control account {debtor_ctrl_code} (RM {gl_debtors:,.2f}). Difference: RM {debtor_diff:,.2f}")

        # B. Trade Creditors vs Trade Payables Control Account
        creditor_items = [d for d in drafts if d.category == "CREDITOR"]
        creditor_total = sum((_to_decimal(d.amount) for d in creditor_items), Decimal("0.00"))
        
        creditor_codes = {d.account_code for d in creditor_items if d.account_code}
        creditor_ctrl_code = list(creditor_codes)[0] if len(creditor_codes) == 1 else controls["CREDITORS"]["code"]
        creditor_ctrl_name = controls["CREDITORS"]["name"]

        gl_creditors = abs(tb_account_map.get(creditor_ctrl_code, Decimal("0.00")))
        if gl_creditors == Decimal("0.00") and creditor_ctrl_code != controls["CREDITORS"]["code"]:
            gl_creditors = abs(tb_account_map.get(controls["CREDITORS"]["code"], Decimal("0.00")))
            creditor_ctrl_code = controls["CREDITORS"]["code"]

        creditor_diff = abs(creditor_total - gl_creditors)
        creditor_reconciled = creditor_diff < Decimal("0.01")
        subledger_checks.append(SubledgerTieOutCheck(
            category="Trade Payables / Creditors",
            subledger_total=float(creditor_total),
            gl_control_account=creditor_ctrl_code,
            gl_control_name=creditor_ctrl_name,
            gl_control_amount=float(gl_creditors),
            difference=float(creditor_diff),
            is_reconciled=creditor_reconciled
        ))
        if creditor_items and not creditor_reconciled:
            errors.append(f"Creditor subledger total (RM {creditor_total:,.2f}) does not match Trade Payables control account {creditor_ctrl_code} (RM {gl_creditors:,.2f}). Difference: RM {creditor_diff:,.2f}")

        # C. Other Creditors vs Other Creditors Control Account
        other_creditor_items = [d for d in drafts if d.category == "OTHER_CREDITOR"]
        other_creditor_total = sum((_to_decimal(d.amount) for d in other_creditor_items), Decimal("0.00"))
        
        other_codes = {d.account_code for d in other_creditor_items if d.account_code}
        other_ctrl_code = list(other_codes)[0] if len(other_codes) == 1 else controls["OTHER_CREDITORS"]["code"]
        other_ctrl_name = controls["OTHER_CREDITORS"]["name"]

        gl_other_creditors = abs(tb_account_map.get(other_ctrl_code, Decimal("0.00")))
        if gl_other_creditors == Decimal("0.00") and other_ctrl_code != controls["OTHER_CREDITORS"]["code"]:
            gl_other_creditors = abs(tb_account_map.get(controls["OTHER_CREDITORS"]["code"], Decimal("0.00")))
            other_ctrl_code = controls["OTHER_CREDITORS"]["code"]

        other_creditor_diff = abs(other_creditor_total - gl_other_creditors)
        other_creditor_reconciled = other_creditor_diff < Decimal("0.01")
        subledger_checks.append(SubledgerTieOutCheck(
            category="Other Creditors",
            subledger_total=float(other_creditor_total),
            gl_control_account=other_ctrl_code,
            gl_control_name=other_ctrl_name,
            gl_control_amount=float(gl_other_creditors),
            difference=float(other_creditor_diff),
            is_reconciled=other_creditor_reconciled
        ))
        if other_creditor_items and not other_creditor_reconciled:
            errors.append(f"Other Creditors subledger total (RM {other_creditor_total:,.2f}) does not match Other Creditors control account {other_ctrl_code} (RM {gl_other_creditors:,.2f}). Difference: RM {other_creditor_diff:,.2f}")

        # D. Stock vs Inventory Control Account
        stock_items = [d for d in drafts if d.category == "STOCK"]
        stock_total = sum((_to_decimal(d.amount) for d in stock_items), Decimal("0.00"))
        
        stock_codes = {d.account_code for d in stock_items if d.account_code}
        stock_ctrl_code = list(stock_codes)[0] if len(stock_codes) == 1 else controls["STOCK"]["code"]
        stock_ctrl_name = controls["STOCK"]["name"]

        gl_stock = tb_account_map.get(stock_ctrl_code, Decimal("0.00"))
        if gl_stock == Decimal("0.00") and stock_ctrl_code != controls["STOCK"]["code"]:
            gl_stock = tb_account_map.get(controls["STOCK"]["code"], Decimal("0.00"))
            stock_ctrl_code = controls["STOCK"]["code"]

        stock_diff = abs(stock_total - gl_stock)
        stock_reconciled = stock_diff < Decimal("0.01")
        subledger_checks.append(SubledgerTieOutCheck(
            category="Opening Inventory / Stock",
            subledger_total=float(stock_total),
            gl_control_account=stock_ctrl_code,
            gl_control_name=stock_ctrl_name,
            gl_control_amount=float(gl_stock),
            difference=float(stock_diff),
            is_reconciled=stock_reconciled
        ))
        if stock_items and not stock_reconciled:
            errors.append(f"Stock valuation total (RM {stock_total:,.2f}) does not match Stock control account {stock_ctrl_code} (RM {gl_stock:,.2f}). Difference: RM {stock_diff:,.2f}")
        if stock_items and not stock_reconciled:
            errors.append(f"Stock valuation total (RM {stock_total:,.2f}) does not match Stock control account 330-0000 (RM {gl_stock:,.2f}). Difference: RM {stock_diff:,.2f}")

        # Negative checks
        for s in stock_items:
            if s.quantity < 0:
                errors.append(f"Inventory item '{s.entity_name}' cannot have a negative quantity ({s.quantity}).")
            if s.unit_cost < 0:
                errors.append(f"Inventory item '{s.entity_name}' cannot have a negative unit cost ({s.unit_cost}).")

        is_valid = len(errors) == 0 and tb_balanced

        # Update batch summary
        batch.total_debit = float(total_debit)
        batch.total_credit = float(total_credit)
        batch.is_balanced = tb_balanced
        batch.debtor_total = float(debtor_total)
        batch.creditor_total = float(creditor_total)
        batch.other_creditor_total = float(other_creditor_total)
        batch.stock_total = float(stock_total)
        batch.validation_results_json = json.dumps({
            "is_valid": is_valid,
            "errors": errors,
            "warnings": warnings
        })
        self.db.commit()

        return OpeningBalanceValidationResponse(
            is_valid=is_valid,
            as_at_date=batch.as_at_date,
            total_debit=float(total_debit),
            total_credit=float(total_credit),
            tb_diff=float(tb_diff),
            tb_balanced=tb_balanced,
            subledger_checks=subledger_checks,
            errors=errors,
            warnings=warnings
        )

    # --- Posting ---

    def post_opening_balances(
        self,
        company_id: str,
        req: OpeningBalancePostRequest,
        confirmed_by: Optional[str] = "Admin"
    ) -> Dict[str, Any]:
        validation = self.validate_opening_balances(company_id)
        if not validation.is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot post opening balances while validation errors exist: {', '.join(validation.errors)}"
            )

        batch = self.get_or_create_batch(company_id)
        if batch.status == "POSTED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Opening balances for this company have already been posted."
            )

        comp = self.db.query(CompanyModel).filter(CompanyModel.company_id == company_id).first()
        if not comp:
            raise HTTPException(status_code=404, detail="Company not found.")

        as_at = self.determine_opening_balance_date(comp, req.as_at_date or batch.as_at_date)
        batch.as_at_date = as_at

        drafts = self.db.query(OpeningBalanceDraftRecordModel).filter(
            OpeningBalanceDraftRecordModel.company_id == company_id
        ).all()

        try:
            # 1. Draft the Opening Balance General Journal Entry (Idempotent)
            tb_items = [d for d in drafts if d.category == "TRIAL_BALANCE"]
            journal_lines = []
            line_num = 1
            for item in tb_items:
                dr = _to_decimal(item.debit)
                cr = _to_decimal(item.credit)
                code = item.account_code or "999-0000"
                name = item.account_name or "Unknown Account"

                journal_lines.append({
                    "line_number": line_num,
                    "account_code": code,
                    "account_name": name,
                    "debit": float(dr),
                    "credit": float(cr),
                    "description": f"Opening Balance as at {as_at}"
                })
                line_num += 1

            journal_id = f"JV-OPENING-{company_id.replace('-', '')}"
            txn_id = f"TXN-OPENING-{company_id.replace('-', '')}"

            existing_j = self.db.query(JournalEntryModel).filter(
                JournalEntryModel.company_id == company_id,
                (JournalEntryModel.journal_id == journal_id) | (JournalEntryModel.reference == "OPENING-BALANCES")
            ).first()

            if existing_j:
                existing_j.journal_date = as_at
                existing_j.total_debit = float(validation.total_debit)
                existing_j.total_credit = float(validation.total_credit)
                existing_j.is_balanced = True
                existing_j.lines_json = json.dumps(journal_lines)
                existing_j.status = "POSTED"
                existing_j.audit_reasoning = f"Approved opening balance posting for {comp.company_name} confirmed by {confirmed_by}."
                journal = existing_j
            else:
                journal = JournalEntryModel(
                    journal_id=journal_id,
                    transaction_id=txn_id,
                    company_id=company_id,
                    document_id="DOC-OPENING-BALANCE",
                    journal_date=as_at,
                    reference="OPENING-BALANCES",
                    description=f"Opening balances as at {as_at}",
                    total_debit=float(validation.total_debit),
                    total_credit=float(validation.total_credit),
                    is_balanced=True,
                    lines_json=json.dumps(journal_lines),
                    status="POSTED",
                    audit_reasoning=f"Approved opening balance posting for {comp.company_name} confirmed by {confirmed_by}."
                )
                self.db.add(journal)

            # Also create or update AccountingTransactionModel
            existing_txn = self.db.query(AccountingTransactionModel).filter(
                AccountingTransactionModel.company_id == company_id,
                (AccountingTransactionModel.transaction_id == txn_id) |
                (AccountingTransactionModel.accounting_event == "Opening Balance Ledger Initialization")
            ).first()

            if existing_txn:
                existing_txn.transaction_date = as_at
                existing_txn.original_amount = float(validation.total_debit)
                existing_txn.converted_amount_myr = float(validation.total_debit)
                existing_txn.status = "Completed"
            else:
                txn = AccountingTransactionModel(
                    transaction_id=txn_id,
                    company_id=company_id,
                    document_id="DOC-OPENING-BALANCE",
                    source_document="Opening Trial Balance",
                    document_type="Opening Balance",
                    transaction_date=as_at,
                    accounting_event="Opening Balance Ledger Initialization",
                    book_of_prime_entry="General Journal",
                    original_currency=comp.currency or "MYR",
                    original_amount=float(validation.total_debit),
                    converted_amount_myr=float(validation.total_debit),
                    status="Completed"
                )
                self.db.add(txn)

            # 2. Populate Subsidiary Customers (Idempotent reuse & collision-free codes)
            debtor_items = [d for d in drafts if d.category == "DEBTOR"]
            existing_cust_records = self.db.query(CustomerModel).filter(
                CustomerModel.company_id == company_id
            ).all()
            cust_by_name = {c.customer_name.lower().strip(): c for c in existing_cust_records if c.customer_name}
            cust_by_code = {c.customer_code.upper().strip(): c for c in existing_cust_records if c.customer_code}
            used_cust_codes = set(cust_by_code.keys())

            for d in debtor_items:
                amt = float(_to_decimal(d.amount))
                raw_name = (d.entity_name or "").strip()
                norm_name = raw_name.lower()
                existing_cust = cust_by_name.get(norm_name)
                if not existing_cust and d.account_code:
                    existing_cust = cust_by_code.get(d.account_code.upper().strip())

                inv_d = d.invoice_date
                c_term = d.credit_term or "30 Days"
                due_d = calculate_due_date(inv_d, c_term)

                if existing_cust:
                    existing_cust.opening_balance = amt
                    existing_cust.current_balance = amt
                    if inv_d: existing_cust.invoice_date = inv_d
                    if c_term: existing_cust.credit_term = c_term
                    if due_d: existing_cust.due_date = due_d
                    if d.invoice_no: existing_cust.invoice_no = d.invoice_no
                    existing_cust.opening_balance_date = as_at
                    existing_cust.is_active = True
                else:
                    cust_code = self.generate_next_customer_code(company_id, existing_codes=used_cust_codes)
                    used_cust_codes.add(cust_code.upper())
                    cust = CustomerModel(
                        company_id=company_id,
                        customer_code=cust_code,
                        customer_name=raw_name,
                        credit_term=c_term,
                        opening_balance=amt,
                        current_balance=amt,
                        invoice_no=d.invoice_no or f"INV-OB-{cust_code.replace('CUST-', '')}",
                        invoice_date=inv_d,
                        due_date=due_d,
                        opening_balance_date=as_at,
                        is_active=True
                    )
                    self.db.add(cust)
                    cust_by_name[norm_name] = cust
                    cust_by_code[cust_code.upper()] = cust

            # 3. Populate Subsidiary Suppliers (Trade & Other, Idempotent reuse)
            creditor_items = [d for d in drafts if d.category in ["CREDITOR", "OTHER_CREDITOR"]]
            existing_supp_records = self.db.query(SupplierModel).filter(
                SupplierModel.company_id == company_id
            ).all()
            supp_trade_by_name = {s.supplier_name.lower().strip(): s for s in existing_supp_records if s.supplier_name and s.supplier_type == "TRADE"}
            supp_other_by_name = {s.supplier_name.lower().strip(): s for s in existing_supp_records if s.supplier_name and s.supplier_type == "OTHER"}
            used_supp_codes = {s.supplier_code.upper().strip() for s in existing_supp_records if s.supplier_code}

            for c in creditor_items:
                amt = float(_to_decimal(c.amount))
                raw_name = (c.entity_name or "").strip()
                norm_name = raw_name.lower()
                stype = "OTHER" if c.category == "OTHER_CREDITOR" else "TRADE"

                inv_d = c.invoice_date
                c_term = c.credit_term or "30 Days"
                due_d = calculate_due_date(inv_d, c_term)

                existing_supp = supp_other_by_name.get(norm_name) if stype == "OTHER" else supp_trade_by_name.get(norm_name)

                if existing_supp:
                    existing_supp.opening_balance = amt
                    existing_supp.current_balance = amt
                    if inv_d: existing_supp.invoice_date = inv_d
                    if c_term: existing_supp.credit_term = c_term
                    if due_d: existing_supp.due_date = due_d
                    if c.invoice_no: existing_supp.invoice_no = c.invoice_no
                    existing_supp.opening_balance_date = as_at
                    existing_supp.is_active = True
                else:
                    supp_code = self.generate_next_supplier_code(company_id, supplier_type=stype, existing_codes=used_supp_codes)
                    used_supp_codes.add(supp_code.upper())
                    supp = SupplierModel(
                        company_id=company_id,
                        supplier_code=supp_code,
                        supplier_name=raw_name,
                        supplier_type=stype,
                        credit_term=c_term,
                        opening_balance=amt,
                        current_balance=amt,
                        invoice_no=c.invoice_no or f"BILL-OB-{supp_code}",
                        invoice_date=inv_d,
                        due_date=due_d,
                        opening_balance_date=as_at,
                        is_active=True
                    )
                    self.db.add(supp)
                    if stype == "OTHER":
                        supp_other_by_name[norm_name] = supp
                    else:
                        supp_trade_by_name[norm_name] = supp

            # 4. Populate Subsidiary Stock Items (Idempotent reuse)
            stock_items = [d for d in drafts if d.category == "STOCK"]
            existing_stock_records = self.db.query(InventoryItemModel).filter(
                InventoryItemModel.company_id == company_id
            ).all()
            stock_by_code = {it.item_code.upper().strip(): it for it in existing_stock_records if it.item_code}
            stock_by_name = {it.item_name.lower().strip(): it for it in existing_stock_records if it.item_name}
            used_stock_codes = set(stock_by_code.keys())

            for s in stock_items:
                raw_code = (s.item_code or "").strip()
                raw_name = (s.entity_name or f"Item {raw_code}").strip()
                norm_name = raw_name.lower()

                existing_item = None
                if raw_code and raw_code.upper() in stock_by_code:
                    existing_item = stock_by_code[raw_code.upper()]
                elif norm_name and norm_name in stock_by_name:
                    existing_item = stock_by_name[norm_name]

                if existing_item:
                    existing_item.unit_cost = s.unit_cost or existing_item.unit_cost
                    existing_item.opening_quantity = s.quantity or existing_item.opening_quantity
                    existing_item.current_quantity = s.quantity or existing_item.current_quantity
                    existing_item.opening_valuation = s.amount or existing_item.opening_valuation
                    existing_item.opening_balance_date = as_at
                    existing_item.is_active = True
                else:
                    item_code = self.generate_next_item_code(company_id, suggested_code=raw_code, existing_codes=used_stock_codes)
                    used_stock_codes.add(item_code.upper())
                    item = InventoryItemModel(
                        company_id=company_id,
                        item_code=item_code,
                        item_name=raw_name,
                        unit_cost=s.unit_cost,
                        opening_quantity=s.quantity,
                        current_quantity=s.quantity,
                        opening_valuation=s.amount,
                        opening_balance_date=as_at,
                        is_active=True
                    )
                    self.db.add(item)
                    stock_by_code[item_code.upper()] = item
                    if raw_name: stock_by_name[norm_name] = item

            # 5. Update Batch Status
            batch.status = "POSTED"
            batch.posted_journal_id = journal.journal_id
            batch.confirmed_by = confirmed_by
            batch.confirmed_at = get_local_now()

            # 6. Activate Company (and deactivate previous active companies)
            self.db.query(CompanyModel).filter(CompanyModel.company_id != company_id).update({CompanyModel.is_active: False})
            comp.onboarding_status = "ACTIVE"
            comp.onboarding_step = 6
            comp.is_active = True

            self.db.commit()

        except Exception as e:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Opening balance posting failed due to transactional error: {str(e)}"
            )

        # Transfer opening balance documents to permanent DocumentModel
        try:
            self.transfer_opening_documents_to_documents(company_id, as_at)
        except Exception as e:
            print(f"Notice: transfer_opening_documents_to_documents during post_opening_balances: {e}")

        return {
            "success": True,
            "company_id": company_id,
            "company_name": comp.company_name,
            "onboarding_status": "ACTIVE",
            "posted_journal_id": journal.journal_id,
            "total_opening_debit": float(validation.total_debit),
            "total_opening_credit": float(validation.total_credit),
            "customers_created": len(debtor_items),
            "suppliers_created": len(creditor_items),
            "stock_items_created": len(stock_items)
        }

    # ─── V7 Redesign: 3-Step Registration & AI Onboarding Session Methods ────

    def cleanup_expired_sessions(self) -> int:
        now = get_local_now()
        expired = self.db.query(RegistrationSessionModel).filter(
            (RegistrationSessionModel.expires_at < now) | (RegistrationSessionModel.status.in_(["CANCELLED", "EXPIRED"]))
        ).all()
        count = len(expired)
        for s in expired:
            temp_dir = TEMP_ONBOARDING_DIR / s.session_id
            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)
            self.db.delete(s)
        if count > 0:
            self.db.commit()
        return count

    def start_registration_session(self, req: RegistrationStartRequest) -> RegistrationSessionModel:
        raw_email = req.email.lower().strip()
        if "@" not in raw_email:
            raw_email = f"{raw_email}@company.com"
        req.email = raw_email

        raw_name = (req.full_name or "").strip()
        if not raw_name or len(raw_name) < 2:
            req.full_name = raw_email.split("@")[0].capitalize()

        # Check if email is already permanently registered
        existing_user = self.db.query(UserModel).filter(UserModel.email == req.email.lower().strip()).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email address already exists. Please sign in."
            )

        # Cleanup abandoned/expired sessions or previous sessions for the same email
        try:
            self.cleanup_expired_sessions()
            prior_sessions = self.db.query(RegistrationSessionModel).filter(
                RegistrationSessionModel.email == req.email.lower().strip()
            ).all()
            for ps in prior_sessions:
                temp_dir = TEMP_ONBOARDING_DIR / ps.session_id
                if temp_dir.exists():
                    shutil.rmtree(temp_dir, ignore_errors=True)
                self.db.delete(ps)
            if prior_sessions:
                self.db.commit()
        except Exception:
            pass

        session_id = uuid.uuid4().hex
        now = get_local_now()
        expires = now + timedelta(hours=24)
        pwd_hash = hash_password(req.password)

        session = RegistrationSessionModel(
            session_id=session_id,
            email=req.email.lower().strip(),
            full_name=req.full_name.strip(),
            password_hash=pwd_hash,
            step=1,
            company_data_json=json.dumps({
                "company_name": "",
                "registration_number": "",
                "address": "",
                "email": req.email.lower().strip(),
                "phone": "",
                "currency": "MYR",
                "financial_year": 2026,
                "financial_year_start": "2026-01-01",
                "financial_year_end": "2026-12-31",
                "tax_number": ""
            }),
            uploaded_files_json=json.dumps([]),
            extracted_data_json=json.dumps([]),
            validation_results_json=json.dumps(None),
            status="DRAFT",
            created_at=now,
            updated_at=now,
            expires_at=expires
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)

        # Ensure temp session directory exists
        (TEMP_ONBOARDING_DIR / session_id).mkdir(parents=True, exist_ok=True)
        return session

    def get_registration_session(self, session_id: str) -> RegistrationSessionModel:
        session = self.db.query(RegistrationSessionModel).filter(
            RegistrationSessionModel.session_id == session_id
        ).first()
        if not session or session.status in ["CANCELLED", "EXPIRED"]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Registration session not found or has expired. Please restart registration."
            )
        return session

    def save_company_profile_step(self, session_id: str, req: CompanyProfileStepRequest) -> RegistrationSessionModel:
        session = self.get_registration_session(session_id)

        comp_dict = {
            "company_name": req.company_name.strip(),
            "registration_number": req.registration_number.strip() if req.registration_number else "",
            "address": req.address.strip() if req.address else "",
            "email": req.email.strip() if req.email else session.email,
            "phone": req.phone.strip() if req.phone else "",
            "currency": req.currency or "MYR",
            "financial_year": req.financial_year or 2026,
            "financial_year_start": req.financial_year_start or f"{req.financial_year or 2026}-01-01",
            "financial_year_end": req.financial_year_end or f"{req.financial_year or 2026}-12-31",
            "tax_number": req.tax_number.strip() if req.tax_number else ""
        }

        session.company_data_json = json.dumps(comp_dict)
        if session.step < 2:
            session.step = 2
        session.updated_at = get_local_now()

        self.db.commit()
        self.db.refresh(session)
        return session

    def upload_session_document(self, session_id: str, file: UploadFile) -> Dict[str, Any]:
        session = self.get_registration_session(session_id)
        session_dir = TEMP_ONBOARDING_DIR / session_id
        session_dir.mkdir(parents=True, exist_ok=True)

        content = file.file.read()
        file_hash = hashlib.sha256(content).hexdigest()
        file_size = len(content)

        file_id = f"FILE-{uuid.uuid4().hex[:8].upper()}"
        safe_filename = re.sub(r'[^A-Za-z0-9_.-]', '_', file.filename)
        dest_path = session_dir / safe_filename

        with open(dest_path, "wb") as f:
            f.write(content)

        files = json.loads(session.uploaded_files_json) if session.uploaded_files_json else []
        file_entry = {
            "file_id": file_id,
            "original_filename": file.filename,
            "file_size": file_size,
            "mime_type": file.content_type or "application/pdf",
            "temp_path": str(dest_path),
            "file_hash": file_hash,
            "detected_category": None,
            "status": "UPLOADED",
            "error_message": None
        }
        files.append(file_entry)
        session.uploaded_files_json = json.dumps(files)
        session.updated_at = get_local_now()

        self.db.commit()
        return file_entry

    def delete_session_document(self, session_id: str, file_id: str) -> None:
        session = self.get_registration_session(session_id)
        files = json.loads(session.uploaded_files_json) if session.uploaded_files_json else []
        remaining = []
        for f in files:
            if f.get("file_id") == file_id:
                p = Path(f.get("temp_path", ""))
                if p.exists():
                    try:
                        p.unlink()
                    except Exception:
                        pass
            else:
                remaining.append(f)

        session.uploaded_files_json = json.dumps(remaining)
        session.updated_at = get_local_now()
        self.db.commit()

    def cancel_registration_session(self, session_id: str) -> None:
        session = self.db.query(RegistrationSessionModel).filter(
            RegistrationSessionModel.session_id == session_id
        ).first()
        if session:
            temp_dir = TEMP_ONBOARDING_DIR / session_id
            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)
            self.db.delete(session)
            self.db.commit()

    def classify_document_text(self, text: str, filename: str = "") -> str:
        text_lower = text.lower()
        fn_lower = filename.lower()
        scores = {
            "TRIAL_BALANCE": 0,
            "DEBTOR": 0,
            "CREDITOR": 0,
            "OTHER_CREDITOR": 0,
            "STOCK": 0,
            "COMPANY_PROFILE": 0
        }

        # Filename scoring
        if any(k in fn_lower for k in ["trial", "tb", "balance"]):
            scores["TRIAL_BALANCE"] += 6
        if any(k in fn_lower for k in ["debtor", "receivable", "ar", "customer"]):
            scores["DEBTOR"] += 6
        if any(k in fn_lower for k in ["other_creditor", "sundry_creditor", "other creditor"]):
            scores["OTHER_CREDITOR"] += 7
        elif any(k in fn_lower for k in ["creditor", "payable", "ap", "supplier", "vendor"]):
            scores["CREDITOR"] += 6
        if any(k in fn_lower for k in ["stock", "inventory", "item"]):
            scores["STOCK"] += 6
        if any(k in fn_lower for k in ["ssm", "profile", "incorporation", "form9", "company"]):
            scores["COMPANY_PROFILE"] += 6

        # Content keyword scoring
        tb_kws = ["trial balance", "debit (rm)", "credit (rm)", "opening trial balance", "ledger balance", "trial balance as at"]
        for kw in tb_kws:
            if kw in text_lower:
                scores["TRIAL_BALANCE"] += 2
        if "total debit" in text_lower or "total credit" in text_lower:
            scores["TRIAL_BALANCE"] += 4

        debtor_kws = ["aged receivables", "trade debtors", "customer name", "debtor aging", "outstanding debtors", "receivables aging"]
        for kw in debtor_kws:
            if kw in text_lower:
                scores["DEBTOR"] += 3

        creditor_kws = ["aged payables", "trade creditors", "supplier name", "creditor aging", "outstanding creditors", "payables aging"]
        for kw in creditor_kws:
            if kw in text_lower:
                scores["CREDITOR"] += 3

        other_cred_kws = ["other creditors", "non-trade creditors", "sundry creditors", "accrued liabilities", "accrued expenses", "other payables"]
        for kw in other_cred_kws:
            if kw in text_lower:
                scores["OTHER_CREDITOR"] += 4

        stock_kws = ["stock list", "inventory list", "stock valuation", "unit cost", "quantity on hand", "closing stock", "item code"]
        for kw in stock_kws:
            if kw in text_lower:
                scores["STOCK"] += 3

        ssm_kws = ["suruhanjaya syarikat", "ssm", "certificate of incorporation", "companies act", "registration no."]
        for kw in ssm_kws:
            if kw in text_lower:
                scores["COMPANY_PROFILE"] += 4

        best_cat = max(scores, key=scores.get)
        if scores[best_cat] > 0:
            return best_cat
        return "TRIAL_BALANCE"

    def _parse_text_to_session_drafts(self, text: str, category: str, filename: str) -> List[Dict[str, Any]]:
        items = []
        lines = [line.strip() for line in text.split("\n") if line.strip()]

        if category == "TRIAL_BALANCE":
            for line in lines:
                line_clean = line.replace("RM", "").strip()
                if any(h in line_clean.lower() for h in ["total", "debit (rm)", "credit (rm)", "trial balance as at", "account name"]):
                    continue
                nums = re.findall(r'[\d,]+\.?\d*', line_clean)
                if not nums:
                    continue
                name_part = re.sub(r'[\d,]+\.?\d*', '', line_clean).strip()
                name_part = re.sub(r'[-–—\s]+$', '', name_part).strip()
                if len(name_part) < 2:
                    continue

                code, std_name = self._resolve_account(name_part.upper(), "COMP-000001")
                val1 = _to_decimal(nums[-1])
                val2 = _to_decimal(nums[-2]) if len(nums) >= 2 else Decimal("0.00")

                debit = Decimal("0.00")
                credit = Decimal("0.00")
                if len(nums) >= 2 and val2 > 0:
                    debit = val2
                    credit = val1
                else:
                    amount = val1
                    if self._is_credit_account(name_part.upper(), code):
                        credit = amount
                    else:
                        debit = amount

                items.append({
                    "id": uuid.uuid4().hex,
                    "category": "TRIAL_BALANCE",
                    "account_code": code,
                    "account_name": std_name or name_part,
                    "entity_name": None,
                    "item_code": None,
                    "invoice_no": None,
                    "invoice_date": None,
                    "credit_term": None,
                    "debit": float(debit),
                    "credit": float(credit),
                    "quantity": 0.0,
                    "unit_cost": 0.0,
                    "amount": float(debit if debit > 0 else credit),
                    "review_status": "VERIFIED" if code else "NEEDS_REVIEW",
                    "notes": f"Extracted from {filename}",
                    "source_filename": filename
                })

        elif category in ["DEBTOR", "RECEIVABLES"]:
            for line in lines:
                line_clean = line.replace("RM", "").strip()
                if any(h in line_clean.lower() for h in ["total", "customer name", "aging", "invoice no", "balance", "credit term"]):
                    continue
                nums = re.findall(r'[\d,]+\.?\d*', line_clean)
                if not nums:
                    continue

                inv_match = re.search(r'\b(INV[-/\dA-Za-z]+)\b', line)
                inv_no = inv_match.group(1) if inv_match else None

                date_match = re.search(r'\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|[A-Za-z]{3})\s+\d{4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b', line, re.IGNORECASE)
                inv_date = date_match.group(1).strip() if date_match else None

                term_match = re.search(r'\b(\d+\s*(?:days?|mths?|months?|d)|net\s*\d+|cod|cash)\b', line, re.IGNORECASE)
                credit_term = term_match.group(1).strip() if term_match else None

                name_part = re.sub(r'[\d,]+\.?\d*', '', line_clean)
                if inv_no:
                    name_part = name_part.replace(inv_no, '')
                if inv_date:
                    name_part = name_part.replace(inv_date, '')
                name_part = re.sub(r'[-–—\s]+$', '', name_part).strip()

                amount = _to_decimal(nums[-1])
                if len(name_part) < 2 and amount == Decimal("0.00"):
                    continue

                items.append({
                    "id": uuid.uuid4().hex,
                    "category": "DEBTOR",
                    "account_code": "300-0000",
                    "account_name": "TRADE DEBTORS",
                    "entity_name": name_part or "Customer",
                    "item_code": None,
                    "invoice_no": inv_no,
                    "invoice_date": inv_date,
                    "credit_term": credit_term,
                    "debit": float(amount),
                    "credit": 0.0,
                    "quantity": 0.0,
                    "unit_cost": 0.0,
                    "amount": float(amount),
                    "review_status": "VERIFIED" if amount > 0 else "NEEDS_REVIEW",
                    "notes": f"Extracted from {filename}",
                    "source_filename": filename
                })

        elif category in ["CREDITOR", "PAYABLES"]:
            for line in lines:
                line_clean = line.replace("RM", "").strip()
                if any(h in line_clean.lower() for h in ["total", "supplier name", "vendor", "aging", "invoice no", "balance"]):
                    continue
                nums = re.findall(r'[\d,]+\.?\d*', line_clean)
                if not nums:
                    continue

                inv_match = re.search(r'\b(INV[-/\dA-Za-z]+|BILL[-/\dA-Za-z]+)\b', line)
                inv_no = inv_match.group(1) if inv_match else None

                date_match = re.search(r'\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|[A-Za-z]{3})\s+\d{4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b', line, re.IGNORECASE)
                inv_date = date_match.group(1).strip() if date_match else None

                term_match = re.search(r'\b(\d+\s*(?:days?|mths?|months?|d)|net\s*\d+|cod|cash)\b', line, re.IGNORECASE)
                credit_term = term_match.group(1).strip() if term_match else None

                name_part = re.sub(r'[\d,]+\.?\d*', '', line_clean)
                if inv_no:
                    name_part = name_part.replace(inv_no, '')
                if inv_date:
                    name_part = name_part.replace(inv_date, '')
                name_part = re.sub(r'[-–—\s]+$', '', name_part).strip()

                amount = _to_decimal(nums[-1])
                if len(name_part) < 2 and amount == Decimal("0.00"):
                    continue

                items.append({
                    "id": uuid.uuid4().hex,
                    "category": "CREDITOR",
                    "account_code": "400-0000",
                    "account_name": "TRADE CREDITORS",
                    "entity_name": name_part or "Supplier",
                    "item_code": None,
                    "invoice_no": inv_no,
                    "invoice_date": inv_date,
                    "credit_term": credit_term,
                    "debit": 0.0,
                    "credit": float(amount),
                    "quantity": 0.0,
                    "unit_cost": 0.0,
                    "amount": float(amount),
                    "review_status": "VERIFIED" if amount > 0 else "NEEDS_REVIEW",
                    "notes": f"Extracted from {filename}",
                    "source_filename": filename
                })

        elif category in ["OTHER_CREDITOR", "OTHER_PAYABLES"]:
            for line in lines:
                line_clean = line.replace("RM", "").strip()
                if any(h in line_clean.lower() for h in ["total", "other creditor", "creditor name", "amount", "balance"]):
                    continue
                nums = re.findall(r'[\d,]+\.?\d*', line_clean)
                if not nums:
                    continue

                name_part = re.sub(r'[\d,]+\.?\d*', '', line_clean).strip()
                name_part = re.sub(r'[-–—\s]+$', '', name_part).strip()
                amount = _to_decimal(nums[-1])
                if len(name_part) < 2 and amount == Decimal("0.00"):
                    continue

                items.append({
                    "id": uuid.uuid4().hex,
                    "category": "OTHER_CREDITOR",
                    "account_code": "405-0000",
                    "account_name": "OTHER CREDITORS",
                    "entity_name": name_part or "Other Creditor",
                    "item_code": None,
                    "invoice_no": None,
                    "invoice_date": None,
                    "credit_term": "30 Days",
                    "debit": 0.0,
                    "credit": float(amount),
                    "quantity": 0.0,
                    "unit_cost": 0.0,
                    "amount": float(amount),
                    "review_status": "VERIFIED" if amount > 0 else "NEEDS_REVIEW",
                    "notes": f"Extracted from {filename}",
                    "source_filename": filename
                })

        elif category in ["STOCK", "INVENTORY"]:
            for line in lines:
                line_clean = line.replace("RM", "").strip()
                if any(h in line_clean.lower() for h in ["total", "stock list", "item code", "unit cost", "qty", "valuation"]):
                    continue
                nums = re.findall(r'[\d,]+\.?\d*', line_clean)
                if not nums:
                    continue

                code_match = re.search(r'\b([A-Z0-9]{2,8}[-–—][A-Z0-9]{2,8}|[A-Z]{2,6}[0-9]{2,6})\b', line)
                item_code = code_match.group(1) if code_match else f"STK-{uuid.uuid4().hex[:4].upper()}"

                qty = Decimal("1.0")
                unit_cost = Decimal("0.00")
                total_val = _to_decimal(nums[-1])

                if len(nums) >= 3:
                    qty = _to_decimal(nums[-3])
                    unit_cost = _to_decimal(nums[-2])
                elif len(nums) == 2:
                    qty = _to_decimal(nums[-2])
                    if qty > 0:
                        unit_cost = (total_val / qty).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

                name_part = re.sub(r'[\d,]+\.?\d*', '', line_clean)
                if item_code and item_code in name_part:
                    name_part = name_part.replace(item_code, '')
                name_part = re.sub(r'[-–—\s]+$', '', name_part).strip()

                items.append({
                    "id": uuid.uuid4().hex,
                    "category": "STOCK",
                    "account_code": "330-0000",
                    "account_name": "STOCK",
                    "entity_name": name_part or f"Stock Item {item_code}",
                    "item_code": item_code,
                    "invoice_no": None,
                    "invoice_date": None,
                    "credit_term": None,
                    "debit": float(total_val),
                    "credit": 0.0,
                    "quantity": float(qty),
                    "unit_cost": float(unit_cost),
                    "amount": float(total_val),
                    "review_status": "VERIFIED" if total_val > 0 else "NEEDS_REVIEW",
                    "notes": f"Extracted from {filename}",
                    "source_filename": filename
                })

        return items

    def get_session_document_path(self, session_id: str, file_id: str) -> Tuple[str, str]:
        session = self.get_registration_session(session_id)
        files = json.loads(session.uploaded_files_json) if session.uploaded_files_json else []
        for f in files:
            if f.get("file_id") == file_id or f.get("original_filename") == file_id:
                temp_path = f.get("temp_path")
                if temp_path and Path(temp_path).exists():
                    return temp_path, f.get("original_filename", "document.pdf")
                fname = f.get("original_filename", "document.pdf")
                for comp_sub in DOCUMENTS_DIR.iterdir():
                    if comp_sub.is_dir() and (comp_sub / fname).exists():
                        return str(comp_sub / fname), fname
        # Also check DocumentModel by document_id or filename
        doc = self.db.query(DocumentModel).filter(
            (DocumentModel.document_id == file_id) | (DocumentModel.original_filename == file_id)
        ).first()
        if doc and doc.file_path and Path(doc.file_path).exists():
            return doc.file_path, doc.original_filename
        raise HTTPException(status_code=404, detail="File not found on temporary disk.")

    def extract_session_documents(self, session_id: str, file_id: Optional[str] = None) -> List[Dict[str, Any]]:
        session = self.get_registration_session(session_id)
        files = json.loads(session.uploaded_files_json) if session.uploaded_files_json else []
        comp_dict = json.loads(session.company_data_json) if session.company_data_json else {}

        comp_context = {
            "company_id": "TEMP_ONBOARDING",
            "company_name": comp_dict.get("company_name", "New Company")
        }
        # Reusing existing DocumentProcessingAgent
        doc_agent = DocumentProcessingAgent(company_context=comp_context)

        existing_drafts = json.loads(session.extracted_data_json) if session.extracted_data_json else []
        new_drafts = []
        updated_files = []

        target_found_filename = None

        for f_entry in files:
            fid = f_entry.get("file_id")
            temp_path = f_entry.get("temp_path")
            filename = f_entry.get("original_filename", "document.pdf")

            # If retrying a specific file, skip other files
            if file_id and fid != file_id:
                updated_files.append(f_entry)
                continue

            if file_id and fid == file_id:
                target_found_filename = filename

            if not temp_path or not Path(temp_path).exists():
                f_entry["status"] = "Failed"
                f_entry["error_message"] = "File not found on temporary disk."
                updated_files.append(f_entry)
                continue

            try:
                # 1. Reuse existing PDF text extraction with OCR fallback
                raw_text = extract_text_from_document(temp_path)

                # 2. Reuse existing DocumentProcessingAgent for classification & extraction
                res = doc_agent.process_onboarding_document(fid, raw_text, filename, file_path=temp_path)

                f_entry["status"] = "Extracted"
                f_entry["detected_category"] = res.get("category")
                f_entry["document_type"] = res.get("document_type")
                f_entry["error_message"] = None

                # Update company profile fields if metadata detected
                meta = res.get("company_metadata", {})
                if meta.get("company_name") and not comp_dict.get("company_name"):
                    comp_dict["company_name"] = meta["company_name"]
                if meta.get("registration_number") and not comp_dict.get("registration_number"):
                    comp_dict["registration_number"] = meta["registration_number"]

                items = res.get("line_items", [])
                new_drafts.extend(items)

            except Exception as e:
                # Individual file failure must not crash onboarding
                f_entry["status"] = "Failed"
                f_entry["error_message"] = f"Extraction failed: {str(e)}"

            updated_files.append(f_entry)

        session.uploaded_files_json = json.dumps(updated_files)
        session.company_data_json = json.dumps(comp_dict)

        if file_id and target_found_filename:
            # Retrying single file: replace only drafts originating from this file
            kept_drafts = [d for d in existing_drafts if d.get("source_filename") != target_found_filename]
            final_drafts = kept_drafts + new_drafts
        else:
            final_drafts = new_drafts if new_drafts else existing_drafts

        session.extracted_data_json = json.dumps(final_drafts)
        session.step = 3
        session.updated_at = get_local_now()

        # Run deterministic validation
        validation = self.validate_session_drafts(session_id)
        session.validation_results_json = json.dumps(validation.model_dump())

        self.db.commit()
        return final_drafts

    def update_session_drafts(self, session_id: str, drafts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        session = self.get_registration_session(session_id)

        # Ensure every item has a unique ID and normalized floats
        sanitized = []
        for d in drafts:
            sanitized.append({
                "id": str(d.get("id") or uuid.uuid4().hex),
                "category": d.get("category", "TRIAL_BALANCE"),
                "account_code": d.get("account_code"),
                "account_name": d.get("account_name"),
                "entity_name": d.get("entity_name"),
                "item_code": d.get("item_code"),
                "invoice_no": d.get("invoice_no"),
                "invoice_date": d.get("invoice_date"),
                "credit_term": d.get("credit_term"),
                "debit": float(d.get("debit", 0.0)),
                "credit": float(d.get("credit", 0.0)),
                "quantity": float(d.get("quantity", 0.0)),
                "unit_cost": float(d.get("unit_cost", 0.0)),
                "amount": float(d.get("amount", 0.0)),
                "review_status": d.get("review_status", "VERIFIED"),
                "notes": d.get("notes"),
                "source_filename": d.get("source_filename")
            })

        session.extracted_data_json = json.dumps(sanitized)
        session.updated_at = get_local_now()

        # Re-compute validation
        val = self._compute_session_validation(sanitized)
        session.validation_results_json = json.dumps(val.model_dump())

        self.db.commit()
        return sanitized

    def _compute_session_validation(self, drafts: List[Dict[str, Any]]) -> OpeningBalanceValidationResponse:
        total_debit = Decimal("0.00")
        total_credit = Decimal("0.00")

        tb_debtors_ctrl = Decimal("0.00")
        tb_creditors_ctrl = Decimal("0.00")
        tb_other_creditors_ctrl = Decimal("0.00")
        tb_stock_ctrl = Decimal("0.00")

        debtor_sub_total = Decimal("0.00")
        creditor_sub_total = Decimal("0.00")
        other_creditor_sub_total = Decimal("0.00")
        stock_sub_total = Decimal("0.00")

        has_tb = False

        for d in drafts:
            cat = d.get("category")
            code = d.get("account_code") or ""
            name_u = (d.get("account_name") or "").upper()
            deb = _to_decimal(d.get("debit", 0.0))
            crd = _to_decimal(d.get("credit", 0.0))
            amt = _to_decimal(d.get("amount", 0.0))

            if cat == "TRIAL_BALANCE":
                has_tb = True
                total_debit += deb
                total_credit += crd

                # Identify control accounts
                if code == "300-0000" or ("DEBTOR" in name_u and "TRADE" in name_u):
                    tb_debtors_ctrl += deb
                elif code == "400-0000" or ("CREDITOR" in name_u and "TRADE" in name_u):
                    tb_creditors_ctrl += crd
                elif code == "405-0000" or "OTHER CREDITOR" in name_u:
                    tb_other_creditors_ctrl += crd
                elif code == "330-0000" or "STOCK" in name_u or "INVENTORY" in name_u:
                    tb_stock_ctrl += deb

            elif cat in ["DEBTOR", "RECEIVABLES"]:
                debtor_sub_total += amt if amt > 0 else deb
            elif cat in ["CREDITOR", "PAYABLES"]:
                creditor_sub_total += amt if amt > 0 else crd
            elif cat in ["OTHER_CREDITOR", "OTHER_PAYABLES"]:
                other_creditor_sub_total += amt if amt > 0 else crd
            elif cat in ["STOCK", "INVENTORY"]:
                stock_sub_total += amt if amt > 0 else deb

        tb_diff = abs(total_debit - total_credit)
        tb_balanced = (tb_diff == Decimal("0.00"))

        subledger_checks = [
            SubledgerTieOutCheck(
                category="Trade Debtors",
                subledger_total=float(debtor_sub_total),
                gl_control_account="300-0000",
                gl_control_name="TRADE DEBTORS",
                gl_control_amount=float(tb_debtors_ctrl),
                difference=float(abs(debtor_sub_total - tb_debtors_ctrl)),
                is_reconciled=(abs(debtor_sub_total - tb_debtors_ctrl) <= Decimal("0.01"))
            ),
            SubledgerTieOutCheck(
                category="Trade Creditors",
                subledger_total=float(creditor_sub_total),
                gl_control_account="400-0000",
                gl_control_name="TRADE CREDITORS",
                gl_control_amount=float(tb_creditors_ctrl),
                difference=float(abs(creditor_sub_total - tb_creditors_ctrl)),
                is_reconciled=(abs(creditor_sub_total - tb_creditors_ctrl) <= Decimal("0.01"))
            ),
            SubledgerTieOutCheck(
                category="Other Creditors",
                subledger_total=float(other_creditor_sub_total),
                gl_control_account="405-0000",
                gl_control_name="OTHER CREDITORS",
                gl_control_amount=float(tb_other_creditors_ctrl),
                difference=float(abs(other_creditor_sub_total - tb_other_creditors_ctrl)),
                is_reconciled=(abs(other_creditor_sub_total - tb_other_creditors_ctrl) <= Decimal("0.01"))
            ),
            SubledgerTieOutCheck(
                category="Stock",
                subledger_total=float(stock_sub_total),
                gl_control_account="330-0000",
                gl_control_name="STOCK",
                gl_control_amount=float(tb_stock_ctrl),
                difference=float(abs(stock_sub_total - tb_stock_ctrl)),
                is_reconciled=(abs(stock_sub_total - tb_stock_ctrl) <= Decimal("0.01"))
            )
        ]

        errors = []
        warnings = []

        if has_tb and not tb_balanced:
            errors.append(f"Opening Trial Balance is out of balance by RM {tb_diff:,.2f}. Total Debits: RM {total_debit:,.2f}, Total Credits: RM {total_credit:,.2f}.")

        for chk in subledger_checks:
            if not chk.is_reconciled and (chk.subledger_total > 0 or chk.gl_control_amount > 0):
                warnings.append(f"{chk.category} subsidiary ledger (RM {chk.subledger_total:,.2f}) does not match GL control account {chk.gl_control_account} (RM {chk.gl_control_amount:,.2f}). Difference: RM {chk.difference:,.2f}.")

        for d in drafts:
            cat = d.get("category")
            if cat in ["DEBTOR", "RECEIVABLES", "CREDITOR", "PAYABLES", "OTHER_CREDITOR", "OTHER_PAYABLES"]:
                ent = d.get("entity_name") or d.get("account_name") or "Party"
                if not d.get("invoice_date"):
                    warnings.append(f"{cat}: '{ent}' is missing an invoice date (requires review).")
                if not d.get("credit_term"):
                    warnings.append(f"{cat}: '{ent}' is missing a credit term (requires review).")

        return OpeningBalanceValidationResponse(
            is_valid=tb_balanced,
            as_at_date="2025-12-31",
            total_debit=float(total_debit),
            total_credit=float(total_credit),
            tb_diff=float(tb_diff),
            tb_balanced=tb_balanced,
            subledger_checks=subledger_checks,
            errors=errors,
            warnings=warnings
        )

    def validate_session_drafts(self, session_id: str) -> OpeningBalanceValidationResponse:
        session = self.get_registration_session(session_id)
        drafts = json.loads(session.extracted_data_json) if session.extracted_data_json else []
        val = self._compute_session_validation(drafts)
        session.validation_results_json = json.dumps(val.model_dump())
        self.db.commit()
        return val

    def _generate_permanent_doc_id(self) -> str:
        docs = self.db.query(DocumentModel.document_id).all()
        ob_docs = self.db.query(OpeningBalanceDocumentModel.document_id).all()
        prefix = "DOC-2026-"
        max_seq = 0
        for (d_id,) in (docs + ob_docs):
            if d_id and str(d_id).startswith(prefix):
                try:
                    seq = int(str(d_id)[len(prefix):])
                    if seq > max_seq:
                        max_seq = seq
                except ValueError:
                    pass
            elif d_id:
                m = re.search(r'(\d+)$', str(d_id))
                if m:
                    try:
                        seq = int(m.group(1))
                        if seq > max_seq:
                            max_seq = seq
                    except ValueError:
                        pass
        for obj in list(self.db.new):
            if isinstance(obj, (DocumentModel, OpeningBalanceDocumentModel)) and getattr(obj, "document_id", None):
                d_id = str(obj.document_id)
                if d_id.startswith(prefix):
                    try:
                        seq = int(d_id[len(prefix):])
                        if seq > max_seq:
                            max_seq = seq
                    except ValueError:
                        pass
        return f"{prefix}{max_seq + 1:06d}"

    def confirm_registration_session(self, session_id: str, req: RegistrationFinalConfirmRequest) -> Dict[str, Any]:
        session = self.get_registration_session(session_id)
        draft_items = json.loads(session.extracted_data_json) if session.extracted_data_json else []
        validation = self._compute_session_validation(draft_items)

        # Enforce deterministic accounting rule: Opening Trial Balance MUST be balanced
        if not validation.tb_balanced and validation.total_debit > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot confirm registration: Opening Trial Balance is out of balance by RM {validation.tb_diff:,.2f}. Total Debits: RM {validation.total_debit:,.2f}, Total Credits: RM {validation.total_credit:,.2f}."
            )

        comp_data = json.loads(session.company_data_json) if session.company_data_json else {}
        comp_name = comp_data.get("company_name", "").strip()
        if not comp_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Company name is required to complete registration."
            )

        try:
            # 1. Create permanent user in users table
            user = self.db.query(UserModel).filter(UserModel.email == session.email.lower().strip()).first()
            if not user:
                user = UserModel(
                    email=session.email.lower().strip(),
                    password_hash=session.password_hash,
                    full_name=session.full_name.strip(),
                    role="USER",
                    is_active=True
                )
                self.db.add(user)
                self.db.flush()

            # 2. Check if company already exists (idempotent retry safe)
            comp = None
            target_cid = comp_data.get("company_id")
            if target_cid:
                comp = self.db.query(CompanyModel).filter(CompanyModel.company_id == target_cid).first()

            if not comp and user:
                user_comps = self.db.query(CompanyModel).join(
                    UserCompanyModel, CompanyModel.company_id == UserCompanyModel.company_id
                ).filter(
                    UserCompanyModel.user_id == user.id,
                    func.lower(CompanyModel.company_name) == func.lower(comp_name)
                ).first()
                if user_comps:
                    comp = user_comps

            if not comp:
                company_id = self.generate_company_id()
                comp = CompanyModel(
                    company_id=company_id,
                    company_name=comp_name,
                    registration_number=comp_data.get("registration_number", "").strip() or None,
                    address=comp_data.get("address", "").strip() or None,
                    email=comp_data.get("email", "").strip() or None,
                    phone=comp_data.get("phone", "").strip() or None,
                    currency=comp_data.get("currency", "MYR"),
                    financial_year=int(comp_data.get("financial_year", 2026)),
                    financial_year_start=comp_data.get("financial_year_start") or f"{comp_data.get('financial_year', 2026)}-01-01",
                    financial_year_end=comp_data.get("financial_year_end") or f"{comp_data.get('financial_year', 2026)}-12-31",
                    tax_number=comp_data.get("tax_number", "").strip() or None,
                    onboarding_status="ACTIVE",
                    onboarding_step=3,
                    is_active=True
                )
                self.db.add(comp)
                self.db.flush()
            else:
                company_id = comp.company_id
                comp.company_name = comp_name
                if comp_data.get("registration_number"): comp.registration_number = comp_data.get("registration_number").strip()
                if comp_data.get("address"): comp.address = comp_data.get("address").strip()
                if comp_data.get("email"): comp.email = comp_data.get("email").strip()
                if comp_data.get("phone"): comp.phone = comp_data.get("phone").strip()
                comp.onboarding_status = "ACTIVE"
                comp.onboarding_step = 3
                comp.is_active = True

            # Deactivate other companies so the new/confirmed one is active
            self.db.query(CompanyModel).filter(CompanyModel.company_id != company_id).update({CompanyModel.is_active: False})

            # 3. Create user-company OWNER membership if not exists
            user_comp = self.db.query(UserCompanyModel).filter(
                UserCompanyModel.user_id == user.id,
                UserCompanyModel.company_id == company_id
            ).first()
            if not user_comp:
                user_comp = UserCompanyModel(
                    user_id=user.id,
                    company_id=company_id,
                    role="OWNER",
                    is_default=True
                )
                self.db.add(user_comp)

            # 4. Seed and ensure Chart of Accounts for the new company
            seed_default_chart_of_accounts(self.db, company_id)
            existing_accs = {a.account_code: a for a in self.db.query(ChartOfAccountModel).filter(ChartOfAccountModel.company_id == company_id).all()}

            tb_lines = [d for d in draft_items if d.get("category") == "TRIAL_BALANCE" and (float(d.get("debit", 0)) > 0 or float(d.get("credit", 0)) > 0)]
            for item in tb_lines:
                code = item.get("account_code")
                name = item.get("account_name")
                if code and code not in existing_accs:
                    pfx = code.split("-")[0]
                    acct_type = "Asset"
                    if pfx.startswith("1"): acct_type = "Equity"
                    elif pfx.startswith(("2", "3")): acct_type = "Asset"
                    elif pfx.startswith("4"): acct_type = "Liability"
                    elif pfx.startswith("5"): acct_type = "Liability" if pfx.startswith("500") else "Revenue"
                    elif pfx.startswith("6"): acct_type = "Cost of Sales"
                    elif pfx.startswith(("7", "8", "9")): acct_type = "Expense"

                    new_acc = ChartOfAccountModel(
                        company_id=company_id,
                        account_code=code,
                        account_name=name,
                        account_type=acct_type,
                        is_group=False,
                        is_active=True
                    )
                    self.db.add(new_acc)
                    existing_accs[code] = new_acc

            # 5. Move uploaded PDF files to permanent company storage and register in DocumentModel (Idempotent)
            perm_comp_dir = DOCUMENTS_DIR / company_id
            perm_comp_dir.mkdir(parents=True, exist_ok=True)
            uploaded_files = json.loads(session.uploaded_files_json) if session.uploaded_files_json else []

            category_to_type = {
                "TRIAL_BALANCE": "Opening Trial Balance",
                "DEBTOR": "Trade Receivables / Debtors",
                "RECEIVABLES": "Trade Receivables / Debtors",
                "CREDITOR": "Trade Payables / Creditors",
                "PAYABLES": "Trade Payables / Creditors",
                "OTHER_CREDITOR": "Other Creditors",
                "OTHER_PAYABLES": "Other Creditors",
                "STOCK": "Opening Stock List",
                "COMPANY_PROFILE": "Company Profile Document"
            }

            approved_ob_date = self.determine_opening_balance_date(comp, validation.as_at_date)
            file_id_to_doc_id = {}
            tb_doc_id = None
            tb_doc_filename = None

            prefix = f"DOC-{comp.financial_year or 2026}-"
            docs_existing = self.db.query(DocumentModel.document_id).all()
            curr_seq = 0
            for (d_id,) in docs_existing:
                if d_id and str(d_id).startswith(prefix):
                    try:
                        seq = int(str(d_id)[len(prefix):])
                        if seq > curr_seq:
                            curr_seq = seq
                    except ValueError:
                        pass
                elif d_id:
                    m = re.search(r'(\d+)$', str(d_id))
                    if m:
                        try:
                            seq = int(m.group(1))
                            if seq > curr_seq:
                                curr_seq = seq
                        except ValueError:
                            pass

            # Existing setup docs for company to ensure idempotent reuse
            existing_setup_docs = self.db.query(DocumentModel).filter(
                DocumentModel.company_id == company_id,
                DocumentModel.source_type.in_(["COMPANY_SETUP", "ONBOARDING"])
            ).all()
            doc_by_hash = {d.file_hash: d for d in existing_setup_docs if d.file_hash}
            doc_by_name = {d.original_filename.lower().strip(): d for d in existing_setup_docs if d.original_filename}
            doc_by_type = {d.document_type.lower().strip(): d for d in existing_setup_docs if d.document_type}

            existing_ob_docs = self.db.query(OpeningBalanceDocumentModel).filter(
                OpeningBalanceDocumentModel.company_id == company_id
            ).all()
            ob_by_cat = {o.doc_category: o for o in existing_ob_docs if o.doc_category}
            ob_by_hash = {o.file_hash: o for o in existing_ob_docs if o.file_hash}

            for f_info in uploaded_files:
                src_p = Path(f_info.get("temp_path", ""))
                fname = f_info.get("original_filename", "document.pdf")
                dest_p = perm_comp_dir / fname
                if src_p.exists():
                    shutil.copy2(src_p, dest_p)

                f_hash = None
                try:
                    if dest_p.exists():
                        f_hash = hashlib.sha256(dest_p.read_bytes()).hexdigest()
                except Exception:
                    pass

                det_cat = f_info.get("detected_category", "TRIAL_BALANCE")
                doc_type_label = category_to_type.get(det_cat, f_info.get("document_type") or "Opening Balance Document")

                related_drafts = [d for d in draft_items if d.get("source_filename") == fname]
                if not related_drafts:
                    related_drafts = [d for d in draft_items if d.get("category") == det_cat]

                if det_cat == "TRIAL_BALANCE":
                    tb_dr = sum(Decimal(str(d.get("debit") or 0.0)) for d in related_drafts)
                    tb_cr = sum(Decimal(str(d.get("credit") or 0.0)) for d in related_drafts)
                    if tb_dr == 0 and tb_cr == 0:
                        tb_dr = validation.total_debit
                        tb_cr = validation.total_credit
                    disp_total = f"RM {float(tb_dr):,.2f}"
                    doc_grand_total = float(tb_dr)
                else:
                    tot_amt = sum(Decimal(str(d.get("amount") or 0.0)) for d in related_drafts)
                    disp_total = f"{float(tot_amt):,.2f}"
                    doc_grand_total = float(tot_amt)

                # Check if document already exists for this company
                existing_db_doc = None
                if f_hash and f_hash in doc_by_hash:
                    existing_db_doc = doc_by_hash[f_hash]
                elif fname.lower().strip() in doc_by_name:
                    existing_db_doc = doc_by_name[fname.lower().strip()]
                elif doc_type_label.lower().strip() in doc_by_type:
                    existing_db_doc = doc_by_type[doc_type_label.lower().strip()]

                if existing_db_doc:
                    doc_seq_id = existing_db_doc.document_id
                else:
                    curr_seq += 1
                    doc_seq_id = f"{prefix}{curr_seq:06d}"

                file_id_to_doc_id[f_info.get("file_id")] = doc_seq_id
                file_id_to_doc_id[fname] = doc_seq_id

                if det_cat == "TRIAL_BALANCE":
                    tb_doc_id = doc_seq_id
                    tb_doc_filename = fname

                ext_metadata = {
                    "document_id": doc_seq_id,
                    "company_id": company_id,
                    "original_filename": fname,
                    "file_storage_path": str(dest_p),
                    "document_type": doc_type_label,
                    "as_at_date": approved_ob_date,
                    "transaction_date": approved_ob_date,
                    "upload_date": get_local_now().strftime("%Y-%m-%d %H:%M:%S"),
                    "processing_status": "COMPLETED",
                    "extraction_status": "EXTRACTED",
                    "confirmation_status": "CONFIRMED",
                    "confirmed_at": get_local_now().strftime("%Y-%m-%d %H:%M:%S"),
                    "confirmed_by": req.confirmation_notes or session.full_name,
                    "is_company_setup": True,
                    "display_total": disp_total,
                    "extracted_total": disp_total,
                    "total_debit": float(tb_dr) if det_cat == "TRIAL_BALANCE" else None,
                    "total_credit": float(tb_cr) if det_cat == "TRIAL_BALANCE" else None,
                    "line_items": related_drafts,
                    "total_items": len(related_drafts),
                    "total_amount": doc_grand_total
                }

                if existing_db_doc:
                    existing_db_doc.original_filename = fname
                    existing_db_doc.file_path = str(dest_p)
                    existing_db_doc.document_type = doc_type_label
                    existing_db_doc.status = "Extracted"
                    existing_db_doc.vendor_name = comp_name
                    existing_db_doc.currency = comp.currency or "MYR"
                    existing_db_doc.grand_total = doc_grand_total
                    existing_db_doc.extracted_data_json = json.dumps(ext_metadata)
                    existing_db_doc.file_hash = f_hash
                    existing_db_doc.source_type = "COMPANY_SETUP"
                    existing_db_doc.updated_at = get_local_now()
                else:
                    db_doc = DocumentModel(
                        company_id=company_id,
                        document_id=doc_seq_id,
                        original_filename=fname,
                        file_path=str(dest_p),
                        file_type="pdf",
                        mime_type=f_info.get("mime_type", "application/pdf"),
                        document_type=doc_type_label,
                        status="Extracted",
                        vendor_name=comp_name,
                        currency=comp.currency or "MYR",
                        grand_total=doc_grand_total,
                        extracted_data_json=json.dumps(ext_metadata),
                        file_hash=f_hash,
                        source_type="COMPANY_SETUP",
                        created_at=get_local_now(),
                        updated_at=get_local_now()
                    )
                    self.db.add(db_doc)
                    if f_hash: doc_by_hash[f_hash] = db_doc
                    doc_by_name[fname.lower().strip()] = db_doc
                    doc_by_type[doc_type_label.lower().strip()] = db_doc

                # Register / update OpeningBalanceDocumentModel
                existing_ob = ob_by_cat.get(det_cat) or (ob_by_hash.get(f_hash) if f_hash else None)
                if existing_ob:
                    existing_ob.original_filename = fname
                    existing_ob.file_path = str(dest_p)
                    existing_ob.document_id = doc_seq_id
                    existing_ob.source_doc_id = doc_seq_id
                    existing_ob.file_hash = f_hash
                    existing_ob.confirmation_status = "CONFIRMED"
                    existing_ob.confirmed_at = get_local_now()
                else:
                    ob_doc = OpeningBalanceDocumentModel(
                        company_id=company_id,
                        doc_category=det_cat,
                        original_filename=fname,
                        file_path=str(dest_p),
                        file_size=f_info.get("file_size", 0),
                        file_hash=f_hash,
                        mime_type=f_info.get("mime_type", "application/pdf"),
                        extraction_status="EXTRACTED",
                        source_doc_id=doc_seq_id,
                        document_id=doc_seq_id,
                        confirmation_status="CONFIRMED",
                        confirmed_at=get_local_now()
                    )
                    self.db.add(ob_doc)
                    ob_by_cat[det_cat] = ob_doc

            # 6. Approved Opening Balance Date & Idempotent Batch Model
            approved_ob_date = self.determine_opening_balance_date(comp, validation.as_at_date)
            batch = self.db.query(OpeningBalanceBatchModel).filter(
                OpeningBalanceBatchModel.company_id == company_id
            ).first()

            if not batch:
                batch = OpeningBalanceBatchModel(
                    company_id=company_id,
                    as_at_date=approved_ob_date,
                    status="POSTED",
                    total_debit=float(validation.total_debit),
                    total_credit=float(validation.total_credit),
                    is_balanced=bool(validation.tb_balanced),
                    debtor_total=float(sum(Decimal(str(d.get("amount", 0))) for d in draft_items if d.get("category") == "DEBTOR")),
                    creditor_total=float(sum(Decimal(str(d.get("amount", 0))) for d in draft_items if d.get("category") == "CREDITOR")),
                    other_creditor_total=float(sum(Decimal(str(d.get("amount", 0))) for d in draft_items if d.get("category") == "OTHER_CREDITOR")),
                    stock_total=float(sum(Decimal(str(d.get("amount", 0))) for d in draft_items if d.get("category") == "STOCK")),
                    validation_results_json=session.validation_results_json,
                    confirmed_by=req.confirmation_notes or session.full_name,
                    confirmed_at=get_local_now()
                )
                self.db.add(batch)
                self.db.flush()
            else:
                batch.as_at_date = approved_ob_date
                batch.status = "POSTED"
                batch.total_debit = float(validation.total_debit)
                batch.total_credit = float(validation.total_credit)
                batch.is_balanced = bool(validation.tb_balanced)
                batch.debtor_total = float(sum(Decimal(str(d.get("amount", 0))) for d in draft_items if d.get("category") == "DEBTOR"))
                batch.creditor_total = float(sum(Decimal(str(d.get("amount", 0))) for d in draft_items if d.get("category") == "CREDITOR"))
                batch.other_creditor_total = float(sum(Decimal(str(d.get("amount", 0))) for d in draft_items if d.get("category") == "OTHER_CREDITOR"))
                batch.stock_total = float(sum(Decimal(str(d.get("amount", 0))) for d in draft_items if d.get("category") == "STOCK"))
                batch.confirmed_by = req.confirmation_notes or session.full_name
                batch.confirmed_at = get_local_now()
                self.db.flush()

            # 7. Save draft records into OpeningBalanceDraftRecordModel (Idempotent replace)
            self.db.query(OpeningBalanceDraftRecordModel).filter(
                OpeningBalanceDraftRecordModel.company_id == company_id
            ).delete()

            for item in draft_items:
                src_fn = item.get("source_filename")
                s_doc_id = file_id_to_doc_id.get(src_fn)
                self.db.add(OpeningBalanceDraftRecordModel(
                    batch_id=batch.id,
                    company_id=company_id,
                    category=item.get("category", "TRIAL_BALANCE"),
                    source_doc_id=s_doc_id,
                    account_code=item.get("account_code"),
                    account_name=item.get("account_name"),
                    entity_name=item.get("entity_name"),
                    item_code=item.get("item_code"),
                    invoice_no=item.get("invoice_no"),
                    invoice_date=item.get("invoice_date"),
                    credit_term=item.get("credit_term"),
                    debit=float(item.get("debit", 0.0)),
                    credit=float(item.get("credit", 0.0)),
                    quantity=float(item.get("quantity", 0.0)),
                    unit_cost=float(item.get("unit_cost", 0.0)),
                    amount=float(item.get("amount", 0.0)),
                    review_status=item.get("review_status", "VERIFIED"),
                    notes=item.get("notes")
                ))

            # 8. Create Customer, Supplier, Inventory records with full metadata & calculated due dates (Idempotent)
            existing_custs = self.db.query(CustomerModel).filter(CustomerModel.company_id == company_id).all()
            cust_by_name = {c.customer_name.lower().strip(): c for c in existing_custs if c.customer_name}
            cust_by_code = {c.customer_code.upper().strip(): c for c in existing_custs if c.customer_code}
            used_cust_codes = set(cust_by_code.keys())

            existing_supps = self.db.query(SupplierModel).filter(SupplierModel.company_id == company_id).all()
            supp_trade_by_name = {s.supplier_name.lower().strip(): s for s in existing_supps if s.supplier_name and s.supplier_type == "TRADE"}
            supp_other_by_name = {s.supplier_name.lower().strip(): s for s in existing_supps if s.supplier_name and s.supplier_type == "OTHER"}
            used_supp_codes = {s.supplier_code.upper().strip() for s in existing_supps if s.supplier_code}

            existing_items = self.db.query(InventoryItemModel).filter(InventoryItemModel.company_id == company_id).all()
            item_by_code = {it.item_code.upper().strip(): it for it in existing_items if it.item_code}
            item_by_name = {it.item_name.lower().strip(): it for it in existing_items if it.item_name}
            used_item_codes = set(item_by_code.keys())

            for d in draft_items:
                cat = d.get("category")
                src_fname = d.get("source_filename")
                src_doc = file_id_to_doc_id.get(src_fname)

                inv_d = d.get("invoice_date")
                c_term = d.get("credit_term")
                due_d = calculate_due_date(inv_d, c_term)
                amt = float(d.get("amount", 0.0))

                if cat == "DEBTOR" and d.get("entity_name"):
                    raw_name = d.get("entity_name").strip()
                    norm_name = raw_name.lower()
                    existing_c = cust_by_name.get(norm_name)
                    if not existing_c and d.get("customer_code"):
                        existing_c = cust_by_code.get(d.get("customer_code").upper().strip())

                    if existing_c:
                        existing_c.opening_balance = amt
                        existing_c.current_balance = amt
                        if inv_d: existing_c.invoice_date = inv_d
                        if c_term: existing_c.credit_term = c_term
                        if due_d: existing_c.due_date = due_d
                        if d.get("invoice_no"): existing_c.invoice_no = d.get("invoice_no")
                        existing_c.opening_balance_date = approved_ob_date
                        if src_doc: existing_c.source_doc_id = src_doc
                        existing_c.is_active = True
                    else:
                        cust_code = self.generate_next_customer_code(company_id, existing_codes=used_cust_codes)
                        used_cust_codes.add(cust_code.upper())
                        new_c = CustomerModel(
                            company_id=company_id,
                            customer_code=cust_code,
                            customer_name=raw_name,
                            opening_balance=amt,
                            current_balance=amt,
                            credit_term=c_term or "30 Days",
                            invoice_no=d.get("invoice_no") or f"INV-OB-{cust_code.replace('CUST-', '')}",
                            invoice_date=inv_d,
                            due_date=due_d,
                            opening_balance_date=approved_ob_date,
                            source_doc_id=src_doc,
                            is_active=True
                        )
                        self.db.add(new_c)
                        cust_by_name[norm_name] = new_c
                        cust_by_code[cust_code.upper()] = new_c

                elif cat == "CREDITOR" and d.get("entity_name"):
                    raw_name = d.get("entity_name").strip()
                    norm_name = raw_name.lower()
                    existing_s = supp_trade_by_name.get(norm_name)
                    if not existing_s and d.get("supplier_code"):
                        existing_s = next((s for s in existing_supps if s.supplier_code.upper() == d.get("supplier_code").upper().strip()), None)

                    if existing_s:
                        existing_s.opening_balance = amt
                        existing_s.current_balance = amt
                        if inv_d: existing_s.invoice_date = inv_d
                        if c_term: existing_s.credit_term = c_term
                        if due_d: existing_s.due_date = due_d
                        if d.get("invoice_no"): existing_s.invoice_no = d.get("invoice_no")
                        existing_s.opening_balance_date = approved_ob_date
                        if src_doc: existing_s.source_doc_id = src_doc
                        existing_s.is_active = True
                    else:
                        supp_code = self.generate_next_supplier_code(company_id, supplier_type="TRADE", existing_codes=used_supp_codes)
                        used_supp_codes.add(supp_code.upper())
                        new_s = SupplierModel(
                            company_id=company_id,
                            supplier_code=supp_code,
                            supplier_name=raw_name,
                            supplier_type="TRADE",
                            opening_balance=amt,
                            current_balance=amt,
                            credit_term=c_term or "30 Days",
                            invoice_no=d.get("invoice_no") or f"BILL-OB-{supp_code.replace('SUPP-', '')}",
                            invoice_date=inv_d,
                            due_date=due_d,
                            opening_balance_date=approved_ob_date,
                            source_doc_id=src_doc,
                            is_active=True
                        )
                        self.db.add(new_s)
                        supp_trade_by_name[norm_name] = new_s

                elif cat in ["OTHER_CREDITOR", "OTHER_PAYABLES"] and d.get("entity_name"):
                    raw_name = d.get("entity_name").strip()
                    norm_name = raw_name.lower()
                    existing_oth = supp_other_by_name.get(norm_name)
                    if not existing_oth and d.get("supplier_code"):
                        existing_oth = next((s for s in existing_supps if s.supplier_code.upper() == d.get("supplier_code").upper().strip()), None)

                    if existing_oth:
                        existing_oth.opening_balance = amt
                        existing_oth.current_balance = amt
                        if inv_d: existing_oth.invoice_date = inv_d
                        if c_term: existing_oth.credit_term = c_term
                        if due_d: existing_oth.due_date = due_d
                        if d.get("invoice_no"): existing_oth.invoice_no = d.get("invoice_no")
                        existing_oth.opening_balance_date = approved_ob_date
                        if src_doc: existing_oth.source_doc_id = src_doc
                        existing_oth.is_active = True
                    else:
                        oth_code = self.generate_next_supplier_code(company_id, supplier_type="OTHER", existing_codes=used_supp_codes)
                        used_supp_codes.add(oth_code.upper())
                        new_oth = SupplierModel(
                            company_id=company_id,
                            supplier_code=oth_code,
                            supplier_name=raw_name,
                            supplier_type="OTHER",
                            opening_balance=amt,
                            current_balance=amt,
                            credit_term=c_term or "30 Days",
                            invoice_no=d.get("invoice_no") or f"OTH-OB-{oth_code.replace('OTH-', '')}",
                            invoice_date=inv_d,
                            due_date=due_d,
                            opening_balance_date=approved_ob_date,
                            source_doc_id=src_doc,
                            is_active=True
                        )
                        self.db.add(new_oth)
                        supp_other_by_name[norm_name] = new_oth

                elif cat in ["STOCK", "INVENTORY"]:
                    raw_code = (d.get("item_code") or "").strip()
                    raw_name = (d.get("account_name") or d.get("entity_name") or "").strip()
                    norm_name = raw_name.lower()

                    existing_it = None
                    if raw_code and raw_code.upper() in item_by_code:
                        existing_it = item_by_code[raw_code.upper()]
                    elif norm_name and norm_name in item_by_name:
                        existing_it = item_by_name[norm_name]

                    if existing_it:
                        existing_it.opening_valuation = amt
                        existing_it.unit_cost = float(d.get("unit_cost", 0.0)) or existing_it.unit_cost
                        existing_it.opening_quantity = float(d.get("quantity", 0.0)) or existing_it.opening_quantity
                        existing_it.current_quantity = float(d.get("quantity", 0.0)) or existing_it.current_quantity
                        existing_it.opening_balance_date = approved_ob_date
                        if src_doc: existing_it.source_doc_id = src_doc
                        existing_it.is_active = True
                    else:
                        item_code = self.generate_next_item_code(company_id, suggested_code=raw_code, existing_codes=used_item_codes)
                        used_item_codes.add(item_code.upper())
                        new_it = InventoryItemModel(
                            company_id=company_id,
                            item_code=item_code,
                            item_name=raw_name or f"Stock Item {item_code}",
                            category="Opening Stock",
                            unit_cost=float(d.get("unit_cost", 0.0)),
                            opening_quantity=float(d.get("quantity", 0.0)),
                            current_quantity=float(d.get("quantity", 0.0)),
                            opening_valuation=amt,
                            opening_balance_date=approved_ob_date,
                            source_doc_id=src_doc,
                            is_active=True
                        )
                        self.db.add(new_it)
                        item_by_code[item_code.upper()] = new_it
                        if raw_name: item_by_name[norm_name] = new_it

            # 9. Post Opening Journal Entry (Idempotent reuse)
            if tb_lines:
                journal_id = f"JRN-OB-{company_id}"
                txn_id = f"TXN-OB-{company_id}"
                tb_doc_ref = tb_doc_id or f"OB-{company_id}"

                lines_json = []
                for idx, line in enumerate(tb_lines, 1):
                    debit = float(line.get("debit", 0.0))
                    credit = float(line.get("credit", 0.0))
                    lines_json.append({
                        "line_number": idx,
                        "account_code": line.get("account_code") or "999-0000",
                        "account_name": line.get("account_name") or "UNMAPPED OPENING BALANCE",
                        "description": f"Opening Balance - {line.get('account_name') or 'Account'}",
                        "debit": debit,
                        "credit": credit
                    })

                existing_ob_jrn = self.db.query(JournalEntryModel).filter(
                    JournalEntryModel.company_id == company_id,
                    (JournalEntryModel.reference == "OPENING-BALANCES") | (JournalEntryModel.journal_id == journal_id)
                ).first()

                if existing_ob_jrn:
                    existing_ob_jrn.journal_date = approved_ob_date
                    existing_ob_jrn.total_debit = float(validation.total_debit)
                    existing_ob_jrn.total_credit = float(validation.total_credit)
                    existing_ob_jrn.is_balanced = bool(validation.tb_balanced)
                    existing_ob_jrn.lines_json = json.dumps(lines_json)
                    existing_ob_jrn.status = "POSTED"
                    existing_ob_jrn.audit_reasoning = f"Approved opening balance initialization for {comp_name} confirmed by {req.confirmation_notes or session.full_name}."
                else:
                    journal = JournalEntryModel(
                        journal_id=journal_id,
                        transaction_id=txn_id,
                        company_id=company_id,
                        document_id=tb_doc_ref,
                        journal_date=approved_ob_date,
                        reference="OPENING-BALANCES",
                        description=f"Opening Balance Journal Entry for {comp_name} (FY {comp.financial_year})",
                        total_debit=float(validation.total_debit),
                        total_credit=float(validation.total_credit),
                        is_balanced=bool(validation.tb_balanced),
                        lines_json=json.dumps(lines_json),
                        status="POSTED",
                        audit_reasoning=f"System-generated opening balance journal entry via AI Onboarding wizard for FY {comp.financial_year} as at {approved_ob_date}."
                    )
                    self.db.add(journal)

                existing_ob_txn = self.db.query(AccountingTransactionModel).filter(
                    AccountingTransactionModel.company_id == company_id,
                    (AccountingTransactionModel.transaction_id == txn_id) |
                    (AccountingTransactionModel.accounting_event == "Opening Balance Journal Entry") |
                    (AccountingTransactionModel.accounting_event == "Opening Balance Ledger Initialization")
                ).first()

                if existing_ob_txn:
                    existing_ob_txn.transaction_date = approved_ob_date
                    existing_ob_txn.original_amount = float(validation.total_debit)
                    existing_ob_txn.converted_amount_myr = float(validation.total_debit)
                    existing_ob_txn.status = "Completed"
                else:
                    txn = AccountingTransactionModel(
                        transaction_id=txn_id,
                        company_id=company_id,
                        document_id=tb_doc_ref,
                        source_document=tb_doc_filename or "Opening Trial Balance.pdf",
                        document_type="Opening Balance",
                        transaction_date=approved_ob_date,
                        accounting_event="Opening Balance Journal Entry",
                        book_of_prime_entry="General Journal",
                        original_currency=comp.currency or "MYR",
                        original_amount=float(validation.total_debit),
                        converted_amount_myr=float(validation.total_debit),
                        confidence_score=1.0,
                        needs_review=False,
                        status="Completed"
                    )
                    self.db.add(txn)

                if batch:
                    batch.posted_journal_id = journal_id

            # 10. Mark session completed and remove temporary directory
            session.status = "COMPLETED"
            temp_dir = TEMP_ONBOARDING_DIR / session_id
            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)

            self.db.commit()

            # 11. Issue access token for the newly created user
            access_token = create_access_token(data={"sub": str(user.id), "email": user.email})
            comps_info = get_user_companies_info(self.db, user.id)

            return {
                "company_id": comp.company_id,
                "company_name": comp.company_name,
                "access_token": access_token,
                "token_type": "bearer",
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "full_name": user.full_name,
                    "role": user.role,
                    "is_active": user.is_active,
                    "companies": [c.model_dump() for c in comps_info]
                },
                "company": {
                    "company_id": comp.company_id,
                    "company_name": comp.company_name,
                    "currency": comp.currency,
                    "financial_year": comp.financial_year,
                    "onboarding_status": "ACTIVE"
                },
                "redirect_url": "/dashboard"
            }

        except Exception as e:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Registration and opening balance activation failed: {str(e)}"
            )

    def start_new_financial_year(self, company_id: str, new_fy: Optional[int] = None) -> Dict[str, Any]:
        comp = self.db.query(CompanyModel).filter(CompanyModel.company_id == company_id).first()
        if not comp:
            raise HTTPException(status_code=404, detail="Company not found.")

        current_fy = comp.financial_year or 2026
        target_fy = new_fy if new_fy else (current_fy + 1)
        if target_fy <= current_fy:
            raise HTTPException(status_code=400, detail=f"New financial year must be greater than current financial year {current_fy}.")

        existing_jrn = self.db.query(JournalEntryModel).filter(
            JournalEntryModel.company_id == company_id,
            JournalEntryModel.reference == f"FY{target_fy}-OPENING"
        ).first()
        if existing_jrn:
            raise HTTPException(status_code=400, detail=f"Financial year {target_fy} has already been initialized for this company.")

        journals = self.db.query(JournalEntryModel).filter(
            JournalEntryModel.company_id == company_id,
            JournalEntryModel.status == "POSTED"
        ).all()

        account_balances = {}
        for j in journals:
            if not j.lines_json:
                continue
            lines = json.loads(j.lines_json)
            for l in lines:
                code = l.get("account_code")
                if not code:
                    continue
                deb = float(l.get("debit", 0.0))
                crd = float(l.get("credit", 0.0))
                if code not in account_balances:
                    account_balances[code] = {"debit": 0.0, "credit": 0.0, "name": l.get("account_name", code)}
                account_balances[code]["debit"] += deb
                account_balances[code]["credit"] += crd

        pnl_net = 0.0
        bs_lines = []
        total_dr = 0.0
        total_cr = 0.0

        for code, b in account_balances.items():
            net_dr = round(b["debit"] - b["credit"], 2)
            prefix = code.split("-")[0]
            if prefix.startswith(("5", "6", "7", "8", "9")) and code not in ["500-0000"]:
                if prefix.startswith("5"):
                    pnl_net += (b["credit"] - b["debit"])
                else:
                    pnl_net -= (b["debit"] - b["credit"])
            else:
                if net_dr > 0:
                    bs_lines.append({"code": code, "name": b["name"], "debit": net_dr, "credit": 0.0})
                    total_dr += net_dr
                elif net_dr < 0:
                    bs_lines.append({"code": code, "name": b["name"], "debit": 0.0, "credit": abs(net_dr)})
                    total_cr += abs(net_dr)

        if pnl_net > 0:
            found = False
            for line in bs_lines:
                if line["code"] == "150-0000":
                    line["credit"] += pnl_net
                    total_cr += pnl_net
                    found = True
                    break
            if not found:
                bs_lines.append({"code": "150-0000", "name": "RETAINED EARNINGS", "debit": 0.0, "credit": pnl_net})
                total_cr += pnl_net
        elif pnl_net < 0:
            loss = abs(pnl_net)
            found = False
            for line in bs_lines:
                if line["code"] == "150-0000":
                    line["debit"] += loss
                    total_dr += loss
                    found = True
                    break
            if not found:
                bs_lines.append({"code": "150-0000", "name": "RETAINED EARNINGS", "debit": loss, "credit": 0.0})
                total_dr += loss

        new_start = f"{target_fy}-01-01"
        new_end = f"{target_fy}-12-31"

        jrn_id = f"JRN-OB-{company_id}-FY{target_fy}"
        txn_id = f"TXN-OB-{company_id}-FY{target_fy}"

        jrn_lines = []
        for idx, l in enumerate(bs_lines, 1):
            jrn_lines.append({
                "line_number": idx,
                "account_code": l["code"],
                "account_name": l["name"],
                "description": f"Balance carried forward from FY {current_fy}",
                "debit": l["debit"],
                "credit": l["credit"]
            })

        new_jrn = JournalEntryModel(
            journal_id=jrn_id,
            transaction_id=txn_id,
            company_id=company_id,
            document_id=f"FY{target_fy}-ROLLOVER",
            journal_date=new_start,
            reference=f"FY{target_fy}-OPENING",
            description=f"Opening Balance Journal Entry for Financial Year {target_fy} (Carried Forward from FY {current_fy})",
            total_debit=round(total_dr, 2),
            total_credit=round(total_cr, 2),
            is_balanced=abs(total_dr - total_cr) < 0.01,
            lines_json=json.dumps(jrn_lines),
            status="POSTED",
            audit_reasoning=f"Year-end closing and balance carry-forward from FY {current_fy} to FY {target_fy}."
        )
        self.db.add(new_jrn)

        comp.financial_year = target_fy
        comp.financial_year_start = new_start
        comp.financial_year_end = new_end
        comp.updated_at = get_local_now()

        self.db.commit()

        return {
            "company_id": company_id,
            "previous_financial_year": current_fy,
            "new_financial_year": target_fy,
            "financial_year_start": new_start,
            "financial_year_end": new_end,
            "opening_journal_id": jrn_id,
            "total_debit": round(total_dr, 2),
            "total_credit": round(total_cr, 2),
            "retained_earnings_rolled": round(pnl_net, 2),
            "message": f"Successfully started Financial Year {target_fy}. Opening balances carried forward and posted."
        }


    def transfer_opening_documents_to_documents(self, company_id: str, as_at_date: Optional[str] = None) -> List[DocumentModel]:
        """
        Idempotently synchronizes canonical OpeningBalanceDocumentModel records for a company
        into DocumentModel records with source_type='COMPANY_SETUP' and status='Extracted'.
        Ensures the Documents page displays exactly one active canonical record per company setup category.
        """
        comp = self.db.query(CompanyModel).filter(CompanyModel.company_id == company_id).first()
        if not comp:
            return []

        all_opening_docs = self.db.query(OpeningBalanceDocumentModel).filter(
            OpeningBalanceDocumentModel.company_id == company_id
        ).order_by(OpeningBalanceDocumentModel.id.asc()).all()
        if not all_opening_docs:
            return []

        # Deduplicate opening_docs by category to ensure only ONE canonical copy per category
        canonical_ob_by_cat = {}
        for ob in all_opening_docs:
            cat = ob.doc_category or "TRIAL_BALANCE"
            if cat not in canonical_ob_by_cat:
                canonical_ob_by_cat[cat] = ob

        perm_comp_dir = DOCUMENTS_DIR / company_id
        perm_comp_dir.mkdir(parents=True, exist_ok=True)

        batch = self.db.query(OpeningBalanceBatchModel).filter(
            OpeningBalanceBatchModel.company_id == company_id
        ).order_by(OpeningBalanceBatchModel.id.desc()).first()
        approved_ob_date = self.determine_opening_balance_date(comp, as_at_date or (batch.as_at_date if batch else None))

        existing_docs = self.db.query(DocumentModel).filter(
            DocumentModel.company_id == company_id
        ).all()

        category_to_type = {
            "TRIAL_BALANCE": "Opening Trial Balance",
            "DEBTOR": "Trade Receivables / Debtors",
            "RECEIVABLES": "Trade Receivables / Debtors",
            "CREDITOR": "Trade Payables / Creditors",
            "PAYABLES": "Trade Payables / Creditors",
            "OTHER_CREDITOR": "Other Creditors",
            "OTHER_PAYABLES": "Other Creditors",
            "STOCK": "Opening Stock List",
            "COMPANY_PROFILE": "Company Profile Document"
        }

        drafts = self.db.query(OpeningBalanceDraftRecordModel).filter(
            OpeningBalanceDraftRecordModel.company_id == company_id
        ).all()

        synced_docs = []
        handled_doc_ids = set()

        for det_cat, ob in canonical_ob_by_cat.items():
            fname = ob.original_filename or f"opening_{det_cat.lower()}.pdf"
            dest_p = perm_comp_dir / fname

            if ob.file_path and Path(ob.file_path).exists() and not dest_p.exists():
                try:
                    shutil.copy2(ob.file_path, dest_p)
                except Exception:
                    pass

            doc_type_label = category_to_type.get(det_cat, det_cat.replace("_", " ").title())

            # Find canonical setup document in DocumentModel
            target_doc = None
            if ob.document_id:
                target_doc = next((d for d in existing_docs if d.document_id == ob.document_id and d.source_type in ["COMPANY_SETUP", "ONBOARDING"]), None)
            if not target_doc:
                target_doc = next((d for d in existing_docs if d.document_type == doc_type_label and d.source_type in ["COMPANY_SETUP", "ONBOARDING"]), None)
            if not target_doc and ob.file_hash:
                target_doc = next((d for d in existing_docs if d.file_hash == ob.file_hash and d.source_type in ["COMPANY_SETUP", "ONBOARDING"]), None)
            if not target_doc:
                target_doc = next((d for d in existing_docs if d.original_filename and d.original_filename.lower() == fname.lower() and d.source_type in ["COMPANY_SETUP", "ONBOARDING"]), None)

            # Never overwrite a real operational accounting document
            if target_doc and target_doc.document_type in [
                "Credit Note", "Supplier Credit Note", "Debit Note",
                "Sales Invoice", "Purchase Invoice", "Supplier Invoice",
                "Payment Receipt", "Purchase Receipt", "Expense Receipt"
            ]:
                target_doc = None

            rel_drafts = [d for d in drafts if d.source_doc_id in [ob.document_id, ob.source_doc_id] or d.category == det_cat]
            if not rel_drafts and det_cat == "TRIAL_BALANCE":
                rel_drafts = [d for d in drafts if d.category == "TRIAL_BALANCE"]

            if det_cat == "TRIAL_BALANCE":
                dr_val = sum(Decimal(str(d.debit or 0.0)) for d in rel_drafts)
                cr_val = sum(Decimal(str(d.credit or 0.0)) for d in rel_drafts)
                if dr_val == 0 and batch:
                    dr_val = Decimal(str(batch.total_debit or 0.0))
                    cr_val = Decimal(str(batch.total_credit or 0.0))
                disp_total = f"RM {float(dr_val):,.2f}"
                eff_grand = float(dr_val)
            else:
                amt_val = sum(Decimal(str(d.amount or 0.0)) for d in rel_drafts)
                disp_total = f"{float(amt_val):,.2f}"
                eff_grand = float(amt_val)

            line_items_data = [
                {
                    "account_code": d.account_code,
                    "account_name": d.account_name,
                    "debit": float(d.debit or 0.0),
                    "credit": float(d.credit or 0.0),
                    "entity_name": d.entity_name,
                    "invoice_date": d.invoice_date,
                    "credit_term": d.credit_term,
                    "amount": float(d.amount or 0.0),
                    "item_code": d.item_code,
                    "item_name": getattr(d, 'item_name', None) or (d.account_name if d.category == "STOCK" else d.entity_name),
                    "quantity": float(d.quantity or 0.0),
                    "unit_price": float(getattr(d, 'unit_price', None) or getattr(d, 'unit_cost', 0.0) or 0.0),
                    "category": d.category
                } for d in rel_drafts
            ]

            if target_doc:
                target_doc.source_type = "COMPANY_SETUP"
                target_doc.document_type = doc_type_label
                target_doc.status = "Extracted"
                target_doc.vendor_name = comp.company_name
                target_doc.grand_total = eff_grand
                try:
                    ext = json.loads(target_doc.extracted_data_json) if target_doc.extracted_data_json else {}
                except Exception:
                    ext = {}
                ext["is_company_setup"] = True
                ext["as_at_date"] = approved_ob_date
                ext["transaction_date"] = approved_ob_date
                ext["display_total"] = disp_total
                ext["extracted_total"] = disp_total
                ext["document_type"] = doc_type_label
                if line_items_data:
                    ext["line_items"] = line_items_data
                    ext["total_items"] = len(line_items_data)
                ext["status"] = "Extracted"
                ext["extraction_status"] = "Extracted"
                ext["validation_status"] = "Passed"
                ext["review_status"] = "Verified"
                ext["needs_review"] = False
                ext["validation_passed"] = True
                ext["validation_messages"] = []
                ext["math_verified"] = True
                target_doc.status = "Extracted"
                target_doc.validation_errors_json = "[]"
                target_doc.extracted_data_json = json.dumps(ext)
                if not Path(target_doc.file_path).exists() and dest_p.exists():
                    target_doc.file_path = str(dest_p)
                ob.document_id = target_doc.document_id
                ob.source_doc_id = target_doc.document_id
                handled_doc_ids.add(target_doc.document_id)
                synced_docs.append(target_doc)
            else:
                doc_seq_id = ob.document_id
                existing_doc_ids = {d.document_id for d in existing_docs if d.document_id}
                new_session_doc_ids = {obj.document_id for obj in self.db.new if isinstance(obj, DocumentModel) and obj.document_id}
                if not doc_seq_id or doc_seq_id in existing_doc_ids or doc_seq_id in new_session_doc_ids:
                    doc_seq_id = self._generate_permanent_doc_id()
                ext_meta = {
                    "document_id": doc_seq_id,
                    "company_id": company_id,
                    "original_filename": fname,
                    "file_storage_path": str(dest_p) if dest_p.exists() else str(ob.file_path),
                    "document_type": doc_type_label,
                    "as_at_date": approved_ob_date,
                    "transaction_date": approved_ob_date,
                    "upload_date": (ob.created_at or get_local_now()).strftime("%Y-%m-%d %H:%M:%S"),
                    "processing_status": "COMPLETED",
                    "extraction_status": "EXTRACTED",
                    "confirmation_status": "CONFIRMED",
                    "confirmed_at": (ob.confirmed_at or get_local_now()).strftime("%Y-%m-%d %H:%M:%S"),
                    "confirmed_by": "System Onboarding",
                    "is_company_setup": True,
                    "display_total": disp_total,
                    "extracted_total": disp_total,
                    "total_debit": float(dr_val) if det_cat == "TRIAL_BALANCE" else None,
                    "total_credit": float(cr_val) if det_cat == "TRIAL_BALANCE" else None,
                    "line_items": line_items_data,
                    "total_items": len(line_items_data),
                    "total_amount": eff_grand
                }
                new_doc = DocumentModel(
                    company_id=company_id,
                    document_id=doc_seq_id,
                    original_filename=fname,
                    file_path=str(dest_p) if dest_p.exists() else str(ob.file_path),
                    file_type="pdf",
                    mime_type=ob.mime_type or "application/pdf",
                    document_type=doc_type_label,
                    status="Extracted",
                    vendor_name=comp.company_name,
                    currency=comp.currency or "MYR",
                    grand_total=eff_grand,
                    extracted_data_json=json.dumps(ext_meta),
                    file_hash=ob.file_hash,
                    source_type="COMPANY_SETUP",
                    created_at=ob.created_at or get_local_now(),
                    updated_at=get_local_now()
                )
                self.db.add(new_doc)
                ob.document_id = doc_seq_id
                ob.source_doc_id = doc_seq_id
                handled_doc_ids.add(doc_seq_id)
                synced_docs.append(new_doc)

        # Mark any other duplicate setup DocumentModel records as SUPERSEDED so they don't pollute the view
        for d in existing_docs:
            if d.source_type in ["COMPANY_SETUP", "ONBOARDING"] and d.document_id not in handled_doc_ids:
                d.status = "SUPERSEDED"

        self.db.commit()
        return synced_docs
