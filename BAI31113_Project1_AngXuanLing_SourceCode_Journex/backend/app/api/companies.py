import datetime
import shutil
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.database import get_db, seed_default_chart_of_accounts
from app.db.models import (
    CompanyModel,
    ChartOfAccountModel,
    UserModel,
    UserCompanyModel,
    DocumentModel,
    AccountingTransactionModel,
    JournalEntryModel,
    EmailSourceModel,
    EmailAttachmentModel,
    BankTransactionModel,
    FixedAssetModel,
    AccrualPrepaymentModel,
    AccrualAdjustmentRecordModel,
    OpeningBalanceDocumentModel,
    OpeningBalanceBatchModel,
    OpeningBalanceDraftRecordModel,
    CustomerModel,
    SupplierModel,
    InventoryItemModel,
    get_local_now
)
from app.schemas.company import (
    CompanyResponse,
    CompanyCreate,
    CompanyUpdate,
    CompanyListResponse,
    CompanyDeleteRequest,
    CompanyDeleteResponse
)
from app.services.auth_service import get_current_user, verify_password, get_user_companies_info
from app.config import COMP_ID_PREFIX, DOCUMENTS_DIR

router = APIRouter(prefix="/api/company", tags=["Company Profile"])


def _generate_next_comp_id(db: Session) -> str:
    count = db.query(CompanyModel).count() + 1
    return f"{COMP_ID_PREFIX}{count:06d}"


@router.get("/", response_model=List[CompanyResponse])
def list_companies(db: Session = Depends(get_db)):
    """Returns list of companies."""
    comps = db.query(CompanyModel).all()
    if not comps:
        get_active_company_profile(db=db)
        comps = db.query(CompanyModel).all()
    return [_format_company_response(c) for c in comps]


@router.get("/accounts")
def list_accounts_alias(company_id: Optional[str] = None, db: Session = Depends(get_db)):
    """Convenience alias returning { accounts: [...] }."""
    res = get_chart_of_accounts(company_id=company_id, db=db)
    return {"accounts": res.get("chart_of_accounts", [])}


@router.get("/profile", response_model=CompanyResponse)
def get_active_company_profile(company_id: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Returns active user-configured Company Profile, or the profile of the requested company_id.
    If no active company profile exists, initializes default NextTech Solutions profile.
    """
    comp = None
    if company_id:
        comp = db.query(CompanyModel).filter(CompanyModel.company_id == company_id).first()
    
    if not comp:
        comp = db.query(CompanyModel).filter(CompanyModel.is_active == True).order_by(CompanyModel.id.desc()).first()
    if not comp:
        comp = db.query(CompanyModel).order_by(CompanyModel.id.desc()).first()
    
    if not comp:
        comp = CompanyModel(
            company_id="COMP-000001",
            company_name="NextTech Solutions Sdn Bhd",
            registration_number="202401987654 (1543210-X)",
            currency="MYR",
            financial_year=2026,
            financial_year_start="2026-01-01",
            financial_year_end="2026-12-31",
            onboarding_status="ACTIVE",
            is_active=True
        )
        db.add(comp)
        db.commit()
        db.refresh(comp)

    return _format_company_response(comp)


@router.post("/profile", response_model=CompanyResponse)
@router.put("/profile", response_model=CompanyResponse)
def save_active_company_profile(payload: CompanyUpdate, company_id: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Updates the active company profile or specific company_id if provided.
    Supports both POST and PUT on /api/company/profile.
    """
    comp = None
    if company_id:
        comp = db.query(CompanyModel).filter(CompanyModel.company_id == company_id).first()

    if not comp:
        comp = db.query(CompanyModel).filter(CompanyModel.is_active == True).order_by(CompanyModel.id.desc()).first()
    if not comp:
        comp = db.query(CompanyModel).order_by(CompanyModel.id.desc()).first()

    if not comp:
        comp = CompanyModel(
            company_id="COMP-000001",
            company_name=payload.company_name,
            registration_number=payload.registration_number,
            currency=payload.currency or "MYR",
            financial_year=payload.financial_year or 2026,
            financial_year_start=payload.financial_year_start or f"{payload.financial_year or 2026}-01-01",
            financial_year_end=payload.financial_year_end or f"{payload.financial_year or 2026}-12-31",
            email=payload.email,
            phone=payload.phone,
            logo_path=payload.logo_path,
            address=payload.address,
            tax_number=payload.tax_number,
            is_active=True
        )
        db.add(comp)
    else:
        comp.company_name = payload.company_name
        if payload.registration_number is not None:
            comp.registration_number = payload.registration_number
        comp.currency = payload.currency or "MYR"
        comp.financial_year = payload.financial_year or 2026
        if payload.address is not None:
            comp.address = payload.address
        if payload.tax_number is not None:
            comp.tax_number = payload.tax_number
        if payload.email is not None:
            comp.email = payload.email
        if payload.phone is not None:
            comp.phone = payload.phone
        if payload.logo_path is not None:
            comp.logo_path = payload.logo_path
        if payload.financial_year_start is not None:
            comp.financial_year_start = payload.financial_year_start
        if payload.financial_year_end is not None:
            comp.financial_year_end = payload.financial_year_end
        if payload.is_active is not None:
            comp.is_active = payload.is_active
        comp.updated_at = get_local_now()

    db.commit()
    db.refresh(comp)
    return _format_company_response(comp)


@router.get("/chart-of-accounts")
def get_chart_of_accounts(company_id: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Returns active Chart of Accounts for the company context, enriched with opening debit and credit balances.
    """
    import json
    comp_id = company_id
    if not comp_id:
        active_comp = db.query(CompanyModel).filter(CompanyModel.is_active == True).order_by(CompanyModel.id.desc()).first()
        comp_id = active_comp.company_id if active_comp else "COMP-000001"

    seed_default_chart_of_accounts(db, comp_id)
    accounts = db.query(ChartOfAccountModel).filter(
        ChartOfAccountModel.company_id == comp_id,
        ChartOfAccountModel.is_active == True
    ).order_by(ChartOfAccountModel.display_order.asc(), ChartOfAccountModel.account_code.asc()).all()

    # Get opening balances from Opening Balance Journal
    open_jrn = db.query(JournalEntryModel).filter(
        JournalEntryModel.company_id == comp_id,
        JournalEntryModel.reference == "OPENING-BALANCES",
        JournalEntryModel.status == "POSTED"
    ).first()
    opening_map = {}
    if open_jrn and open_jrn.lines_json:
        try:
            lines = json.loads(open_jrn.lines_json)
            for l in lines:
                code = l.get("account_code")
                if code:
                    opening_map[code] = {
                        "opening_debit": float(l.get("debit", 0.0)),
                        "opening_credit": float(l.get("credit", 0.0))
                    }
        except Exception:
            pass

    return {
        "company_id": comp_id,
        "total": len(accounts),
        "chart_of_accounts": [
            {
                "id": a.id,
                "account_code": a.account_code,
                "account_name": a.account_name,
                "account_type": a.account_type,
                "special_code": a.special_code,
                "special": a.special_code,
                "description": a.description,
                "parent_id": a.parent_id,
                "is_group": bool(a.is_group),
                "display_order": a.display_order or 0,
                "opening_debit": opening_map.get(a.account_code, {}).get("opening_debit", 0.0),
                "opening_credit": opening_map.get(a.account_code, {}).get("opening_credit", 0.0)
            }
            for a in accounts
        ]
    }


@router.get("/chart-of-accounts/account-transactions")
def get_account_transactions(
    account_code: str,
    company_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Returns transactions referencing a specific Chart of Accounts ledger account.
    Excludes Bank Statements (which are source summary documents for reconciliation).
    Sorts transactions by business transaction_date descending (newest first).
    """
    from app.db.models import AccountingTransactionModel, DocumentModel
    from app.services.transaction_service import sync_document_transaction, format_transaction_response
    import json
    import re

    comp_id = company_id
    if not comp_id:
        active_comp = db.query(CompanyModel).filter(CompanyModel.is_active == True).order_by(CompanyModel.id.desc()).first()
        comp_id = active_comp.company_id if active_comp else "COMP-000001"

    docs = db.query(DocumentModel).filter(DocumentModel.company_id == comp_id).all()
    docs_map = {d.document_id: d for d in docs}
    for doc in docs:
        sync_document_transaction(db, doc)

    raw_txns = db.query(AccountingTransactionModel).filter(
        AccountingTransactionModel.company_id == comp_id
    ).all()

    referencing_txns = []
    for t in raw_txns:
        if t.document_type in ["Bank Statement", "Bank Transaction Record statement"]:
            continue

        analysis = json.loads(t.accounting_analysis_json) if t.accounting_analysis_json else {}
        selected_accounts = analysis.get("selected_accounts", [])
        if any(a.get("account_code") == account_code for a in selected_accounts):
            formatted = format_transaction_response(t, doc=docs_map.get(t.document_id), db=db)
            referencing_txns.append(formatted)

    def parse_date_tuple(val: Optional[str]) -> tuple:
        if not val:
            return (0, 0, 0)
        s = str(val).strip()
        m = re.search(r'(\d{4})[-/](\d{1,2})[-/](\d{1,2})', s)
        if m:
            return (int(m.group(1)), int(m.group(2)), int(m.group(3)))
        
        months = {
            'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
            'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
        }
        for m_name, m_num in months.items():
            if m_name in s.lower():
                nums = [int(n) for n in re.findall(r'\b\d+\b', s)]
                if len(nums) >= 2:
                    year = next((n for n in nums if n > 1900), 2026)
                    day = next((n for n in nums if n <= 31 and n != year), 1)
                    return (year, m_num, day)
        return (0, 0, 0)

    if from_date or to_date:
        from app.utils.date_utils import is_date_in_range
        referencing_txns = [t for t in referencing_txns if is_date_in_range(t.get("transaction_date"), from_date, to_date)]

    referencing_txns.sort(
        key=lambda x: (parse_date_tuple(x.get("transaction_date")), x.get("document_id", "")),
        reverse=True
    )

    return {
        "account_code": account_code,
        "company_id": comp_id,
        "from_date": from_date,
        "to_date": to_date,
        "total": len(referencing_txns),
        "transactions": referencing_txns
    }


@router.get("/list", response_model=CompanyListResponse)
def list_companies(db: Session = Depends(get_db)):
    comps = db.query(CompanyModel).order_by(CompanyModel.id.asc()).all()
    if not comps:
        comp = CompanyModel(
            company_id="COMP-000001",
            company_name="NextTech Solutions Sdn Bhd",
            registration_number="202401987654 (1543210-X)",
            currency="MYR",
            financial_year=2026,
            financial_year_start="2026-01-01",
            financial_year_end="2026-12-31",
            onboarding_status="ACTIVE",
            is_active=True
        )
        db.add(comp)
        db.commit()
        db.refresh(comp)
        comps = [comp]

    active_comp = next((c for c in reversed(comps) if c.is_active), comps[-1])
    formatted = [_format_company_response(c) for c in comps]
    active_formatted = _format_company_response(active_comp)

    return CompanyListResponse(active_company=active_formatted, companies=formatted)


@router.post("/create", response_model=CompanyResponse)
def create_company_profile(payload: CompanyCreate, db: Session = Depends(get_db)):
    db.query(CompanyModel).update({CompanyModel.is_active: False})
    
    comp_id = _generate_next_comp_id(db)
    comp = CompanyModel(
        company_id=comp_id,
        company_name=payload.company_name,
        registration_number=payload.registration_number,
        currency=payload.currency or "MYR",
        financial_year=payload.financial_year or 2026,
        financial_year_start=payload.financial_year_start or f"{payload.financial_year or 2026}-01-01",
        financial_year_end=payload.financial_year_end or f"{payload.financial_year or 2026}-12-31",
        email=payload.email,
        phone=payload.phone,
        logo_path=payload.logo_path,
        address=payload.address,
        tax_number=payload.tax_number,
        is_active=True
    )
    db.add(comp)
    db.commit()
    db.refresh(comp)
    return _format_company_response(comp)


@router.post("/select/{company_id}", response_model=CompanyResponse)
def select_active_company(company_id: str, db: Session = Depends(get_db)):
    comp = db.query(CompanyModel).filter(CompanyModel.company_id == company_id).first()
    if not comp:
        raise HTTPException(status_code=404, detail=f"Company ID {company_id} not found.")

    db.query(CompanyModel).update({CompanyModel.is_active: False})
    comp.is_active = True
    comp.updated_at = get_local_now()
    db.commit()
    db.refresh(comp)
    return _format_company_response(comp)


@router.put("/{company_id}", response_model=CompanyResponse)
def update_company_profile(company_id: str, payload: CompanyUpdate, db: Session = Depends(get_db)):
    comp = db.query(CompanyModel).filter(CompanyModel.company_id == company_id).first()
    if not comp:
        raise HTTPException(status_code=404, detail=f"Company ID {company_id} not found.")

    comp.company_name = payload.company_name
    if payload.registration_number is not None:
        comp.registration_number = payload.registration_number
    comp.currency = payload.currency or "MYR"
    comp.financial_year = payload.financial_year or 2026
    if payload.address is not None:
        comp.address = payload.address
    if payload.tax_number is not None:
        comp.tax_number = payload.tax_number
    if payload.email is not None:
        comp.email = payload.email
    if payload.phone is not None:
        comp.phone = payload.phone
    if payload.logo_path is not None:
        comp.logo_path = payload.logo_path
    if payload.financial_year_start is not None:
        comp.financial_year_start = payload.financial_year_start
    if payload.financial_year_end is not None:
        comp.financial_year_end = payload.financial_year_end
    if payload.is_active is not None:
        if payload.is_active:
            db.query(CompanyModel).update({CompanyModel.is_active: False})
        comp.is_active = payload.is_active
    comp.updated_at = get_local_now()

    db.commit()
    db.refresh(comp)
    return _format_company_response(comp)


@router.post("/{company_id}/delete", response_model=CompanyDeleteResponse)
@router.delete("/{company_id}", response_model=CompanyDeleteResponse)
def delete_company(
    company_id: str,
    payload: CompanyDeleteRequest,
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Permanently deletes a company and all of its associated records (profile, documents,
    transactions, journals, opening balance drafts, GL, AR/AP, bank feeds, and physical files).
    Requires company OWNER role, user password confirmation, and confirmation_text == 'DELETE'.
    """
    # 1. Require typing DELETE
    if payload.confirmation_text.strip() != "DELETE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirmation failed. You must type 'DELETE' to confirm company deletion."
        )

    # 2. Re-verify user password
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password. Company deletion authorization failed."
        )

    # 3. Check company existence
    comp = db.query(CompanyModel).filter(CompanyModel.company_id == company_id).first()
    if not comp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company with ID '{company_id}' not found."
        )

    # 4. Protection for master default template company COMP-000001
    if company_id == "COMP-000001":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The master default company COMP-000001 is protected and cannot be deleted."
        )

    # 5. Verify company OWNER role
    membership = db.query(UserCompanyModel).filter(
        UserCompanyModel.user_id == user.id,
        UserCompanyModel.company_id == company_id
    ).first()
    if not membership or membership.role != "OWNER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the company OWNER can delete this company. Administrative, accountant, or viewer roles are not permitted."
        )

    # 6. Gather document IDs and file paths for post-commit disk cleanup
    docs = db.query(DocumentModel).filter(DocumentModel.company_id == company_id).all()
    doc_ids = [d.document_id for d in docs]

    bank_txs = db.query(BankTransactionModel).filter(BankTransactionModel.company_id == company_id).all()
    bank_pdf_paths = [t.pdf_file_path for t in bank_txs if t.pdf_file_path]

    company_name = comp.company_name
    was_active = bool(comp.is_active)

    # 7. Atomic database deletion across all company-specific tables
    try:
        # Opening balances
        db.query(OpeningBalanceDraftRecordModel).filter(OpeningBalanceDraftRecordModel.company_id == company_id).delete(synchronize_session=False)
        db.query(OpeningBalanceBatchModel).filter(OpeningBalanceBatchModel.company_id == company_id).delete(synchronize_session=False)
        db.query(OpeningBalanceDocumentModel).filter(OpeningBalanceDocumentModel.company_id == company_id).delete(synchronize_session=False)

        # Subledger entities: Customers, Suppliers, Inventory items
        db.query(CustomerModel).filter(CustomerModel.company_id == company_id).delete(synchronize_session=False)
        db.query(SupplierModel).filter(SupplierModel.company_id == company_id).delete(synchronize_session=False)
        db.query(InventoryItemModel).filter(InventoryItemModel.company_id == company_id).delete(synchronize_session=False)

        # Ingestion sources: Source emails & email attachments
        src_emails = db.query(EmailSourceModel).filter(EmailSourceModel.company_id == company_id).all()
        src_email_ids = [e.id for e in src_emails]
        if src_email_ids:
            db.query(EmailAttachmentModel).filter(EmailAttachmentModel.email_source_id.in_(src_email_ids)).delete(synchronize_session=False)
        db.query(EmailSourceModel).filter(EmailSourceModel.company_id == company_id).delete(synchronize_session=False)

        # Bank transactions
        db.query(BankTransactionModel).filter(BankTransactionModel.company_id == company_id).delete(synchronize_session=False)

        # Fixed assets
        db.query(FixedAssetModel).filter(FixedAssetModel.company_id == company_id).delete(synchronize_session=False)

        # Accruals & Prepayments
        db.query(AccrualAdjustmentRecordModel).filter(AccrualAdjustmentRecordModel.company_id == company_id).delete(synchronize_session=False)
        db.query(AccrualPrepaymentModel).filter(AccrualPrepaymentModel.company_id == company_id).delete(synchronize_session=False)

        # Accounting transactions & Journal entries
        db.query(JournalEntryModel).filter(JournalEntryModel.company_id == company_id).delete(synchronize_session=False)
        db.query(AccountingTransactionModel).filter(AccountingTransactionModel.company_id == company_id).delete(synchronize_session=False)

        # Documents
        db.query(DocumentModel).filter(DocumentModel.company_id == company_id).delete(synchronize_session=False)

        # Chart of accounts
        db.query(ChartOfAccountModel).filter(ChartOfAccountModel.company_id == company_id).delete(synchronize_session=False)

        # User company memberships
        db.query(UserCompanyModel).filter(UserCompanyModel.company_id == company_id).delete(synchronize_session=False)

        # Delete company profile record
        db.delete(comp)

        # If deleted company was active, ensure another company is marked active
        if was_active:
            other_comp = db.query(CompanyModel).first()
            if other_comp:
                other_comp.is_active = True

        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete company database records: {str(e)}"
        )

    # 8. Post-commit file storage cleanup
    # A. Onboarding folder: documents/onboarding/{company_id}
    try:
        onboarding_comp_dir = (Path("documents/onboarding") / company_id).resolve()
        if onboarding_comp_dir.exists() and onboarding_comp_dir.is_dir():
            shutil.rmtree(onboarding_comp_dir, ignore_errors=True)
    except Exception:
        pass

    # B. Document folders: DOCUMENTS_DIR / {doc_id}
    base_docs_dir = DOCUMENTS_DIR.resolve()
    for d_id in doc_ids:
        try:
            target_dir = (DOCUMENTS_DIR / d_id).resolve()
            if target_dir != base_docs_dir and str(target_dir).startswith(str(base_docs_dir)) and target_dir.exists():
                shutil.rmtree(target_dir, ignore_errors=True)
        except Exception:
            pass

    # C. Bank PDF files
    for p in bank_pdf_paths:
        try:
            p_path = Path(p).resolve()
            if str(p_path).startswith(str(base_docs_dir)) and p_path.is_file() and p_path.exists():
                p_path.unlink(missing_ok=True)
        except Exception:
            pass

    # 9. Return remaining company info for authenticated user
    remaining = get_user_companies_info(db, user.id)
    next_active = remaining[0].company_id if remaining else None

    return CompanyDeleteResponse(
        message=f"Company '{company_name}' ({company_id}) and all associated records have been permanently deleted.",
        deleted_company_id=company_id,
        remaining_companies=[m.model_dump() for m in remaining],
        next_active_company_id=next_active
    )


def _format_company_response(comp: CompanyModel) -> CompanyResponse:
    return CompanyResponse(
        id=comp.id,
        company_id=comp.company_id,
        company_name=comp.company_name,
        registration_number=comp.registration_number,
        currency=comp.currency or "MYR",
        financial_year=comp.financial_year or 2026,
        financial_year_start=comp.financial_year_start,
        financial_year_end=comp.financial_year_end,
        email=comp.email,
        phone=comp.phone,
        logo_path=comp.logo_path,
        address=comp.address,
        tax_number=comp.tax_number,
        is_active=bool(comp.is_active),
        onboarding_status=comp.onboarding_status or "ACTIVE",
        created_at=comp.created_at.strftime("%Y-%m-%d %H:%M:%S") if comp.created_at else "",
        updated_at=comp.updated_at.strftime("%Y-%m-%d %H:%M:%S") if comp.updated_at else ""
    )


@router.get("/receivables")
def get_company_receivables(
    company_id: Optional[str] = None,
    as_at_date: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Returns Accounts Receivable (Trade Debtors) schedule with invoice dates, credit terms,
    due dates, outstanding balances, and reconciliation tie-out with GL Trade Debtors control account.
    """
    import json
    comp_id = company_id
    if not comp_id:
        active_comp = db.query(CompanyModel).filter(CompanyModel.is_active == True).order_by(CompanyModel.id.desc()).first()
        comp_id = active_comp.company_id if active_comp else "COMP-000001"

    customers = db.query(CustomerModel).filter(
        CustomerModel.company_id == comp_id,
        CustomerModel.is_active == True
    ).order_by(CustomerModel.customer_name.asc()).all()

    # GL tie-out: get posted balance of 300-0000
    posted_journals = db.query(JournalEntryModel).filter(
        JournalEntryModel.company_id == comp_id,
        JournalEntryModel.status == "POSTED"
    ).all()
    gl_bal = 0.0
    for pj in posted_journals:
        if pj.lines_json:
            try:
                for l in json.loads(pj.lines_json):
                    if str(l.get("account_code", "")).startswith("300"):
                        gl_bal += float(l.get("debit", 0.0)) - float(l.get("credit", 0.0))
            except Exception:
                pass
    gl_bal = round(gl_bal, 2)

    from app.utils.date_utils import is_date_in_range, parse_date
    raw_customers = [
        {
            "id": c.id,
            "customer_code": c.customer_code,
            "customer_name": c.customer_name,
            "invoice_no": c.invoice_no or "-",
            "invoice_date": c.invoice_date or "-",
            "credit_term": c.credit_term or "30 Days",
            "due_date": c.due_date or "-",
            "opening_balance_date": c.opening_balance_date or "-",
            "outstanding_balance": float(c.opening_balance or c.current_balance or 0.0),
            "opening_balance": float(c.opening_balance or 0.0),
            "source_doc_id": c.source_doc_id or "",
            "email": c.contact_email or "",
            "phone": c.phone or ""
        }
        for c in customers
    ]

    filtered_customers = raw_customers
    if as_at_date:
        as_at_d = parse_date(as_at_date)
        if as_at_d:
            filtered_customers = [
                c for c in raw_customers
                if not parse_date(c["invoice_date"]) or parse_date(c["invoice_date"]) <= as_at_d or
                   (parse_date(c["opening_balance_date"]) and parse_date(c["opening_balance_date"]) <= as_at_d)
            ]
    elif from_date or to_date:
        filtered_customers = [
            c for c in raw_customers
            if is_date_in_range(c["invoice_date"], from_date, to_date) or
               is_date_in_range(c["opening_balance_date"], from_date, to_date)
        ]

    total_outstanding = round(sum(c["outstanding_balance"] for c in filtered_customers), 2)
    is_reconciled = abs(total_outstanding - gl_bal) < 0.01

    return {
        "company_id": comp_id,
        "control_account": "300-0000 TRADE DEBTORS",
        "gl_control_balance": gl_bal,
        "as_at_date": as_at_date,
        "from_date": from_date,
        "to_date": to_date,
        "total_outstanding": total_outstanding,
        "is_reconciled": is_reconciled,
        "discrepancy": round(total_outstanding - gl_bal, 2),
        "total_customers": len(filtered_customers),
        "customers": filtered_customers
    }


@router.get("/payables")
def get_company_payables(
    company_id: Optional[str] = None,
    as_at_date: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Returns Accounts Payable (Trade Creditors) schedule with invoice dates, credit terms,
    due dates, outstanding balances, and reconciliation tie-out with GL Trade Creditors control account.
    """
    import json
    comp_id = company_id
    if not comp_id:
        active_comp = db.query(CompanyModel).filter(CompanyModel.is_active == True).order_by(CompanyModel.id.desc()).first()
        comp_id = active_comp.company_id if active_comp else "COMP-000001"

    suppliers = db.query(SupplierModel).filter(
        SupplierModel.company_id == comp_id,
        SupplierModel.supplier_type == "TRADE",
        SupplierModel.is_active == True
    ).order_by(SupplierModel.supplier_name.asc()).all()

    # GL tie-out: 400-0000 is Liability, normal balance CREDIT (Credit - Debit)
    posted_journals = db.query(JournalEntryModel).filter(
        JournalEntryModel.company_id == comp_id,
        JournalEntryModel.status == "POSTED"
    ).all()
    gl_bal = 0.0
    for pj in posted_journals:
        if pj.lines_json:
            try:
                for l in json.loads(pj.lines_json):
                    if str(l.get("account_code", "")).startswith("400"):
                        gl_bal += float(l.get("credit", 0.0)) - float(l.get("debit", 0.0))
            except Exception:
                pass
    gl_bal = round(gl_bal, 2)

    from app.utils.date_utils import is_date_in_range, parse_date
    raw_suppliers = [
        {
            "id": s.id,
            "supplier_code": s.supplier_code,
            "supplier_name": s.supplier_name,
            "invoice_no": s.invoice_no or "-",
            "invoice_date": s.invoice_date or "-",
            "credit_term": s.credit_term or "30 Days",
            "due_date": s.due_date or "-",
            "opening_balance_date": s.opening_balance_date or "-",
            "outstanding_balance": float(s.opening_balance or s.current_balance or 0.0),
            "opening_balance": float(s.opening_balance or 0.0),
            "source_doc_id": s.source_doc_id or "",
            "email": s.contact_email or "",
            "phone": s.phone or ""
        }
        for s in suppliers
    ]

    filtered_suppliers = raw_suppliers
    if as_at_date:
        as_at_d = parse_date(as_at_date)
        if as_at_d:
            filtered_suppliers = [
                s for s in raw_suppliers
                if not parse_date(s["invoice_date"]) or parse_date(s["invoice_date"]) <= as_at_d or
                   (parse_date(s["opening_balance_date"]) and parse_date(s["opening_balance_date"]) <= as_at_d)
            ]
    elif from_date or to_date:
        filtered_suppliers = [
            s for s in raw_suppliers
            if is_date_in_range(s["invoice_date"], from_date, to_date) or
               is_date_in_range(s["opening_balance_date"], from_date, to_date)
        ]

    total_outstanding = round(sum(s["outstanding_balance"] for s in filtered_suppliers), 2)
    is_reconciled = abs(total_outstanding - gl_bal) < 0.01

    return {
        "company_id": comp_id,
        "control_account": "400-0000 TRADE CREDITORS",
        "gl_control_balance": gl_bal,
        "as_at_date": as_at_date,
        "from_date": from_date,
        "to_date": to_date,
        "total_outstanding": total_outstanding,
        "is_reconciled": is_reconciled,
        "discrepancy": round(total_outstanding - gl_bal, 2),
        "total_suppliers": len(filtered_suppliers),
        "suppliers": filtered_suppliers
    }


@router.get("/other-creditors")
def get_company_other_creditors(
    company_id: Optional[str] = None,
    as_at_date: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Returns Other Creditors schedule with invoice dates, credit terms, due dates,
    outstanding balances, and reconciliation tie-out with GL Other Creditors control account.
    """
    import json
    comp_id = company_id
    if not comp_id:
        active_comp = db.query(CompanyModel).filter(CompanyModel.is_active == True).order_by(CompanyModel.id.desc()).first()
        comp_id = active_comp.company_id if active_comp else "COMP-000001"

    creditors = db.query(SupplierModel).filter(
        SupplierModel.company_id == comp_id,
        SupplierModel.supplier_type == "OTHER",
        SupplierModel.is_active == True
    ).order_by(SupplierModel.supplier_name.asc()).all()

    # GL tie-out: 405-0000 is Liability, normal balance CREDIT (Credit - Debit)
    posted_journals = db.query(JournalEntryModel).filter(
        JournalEntryModel.company_id == comp_id,
        JournalEntryModel.status == "POSTED"
    ).all()
    gl_bal = 0.0
    for pj in posted_journals:
        if pj.lines_json:
            try:
                for l in json.loads(pj.lines_json):
                    if str(l.get("account_code", "")).startswith("405"):
                        gl_bal += float(l.get("credit", 0.0)) - float(l.get("debit", 0.0))
            except Exception:
                pass
    gl_bal = round(gl_bal, 2)

    from app.utils.date_utils import is_date_in_range, parse_date
    raw_creditors = [
        {
            "id": s.id,
            "creditor_code": s.supplier_code,
            "creditor_name": s.supplier_name,
            "invoice_no": s.invoice_no or "-",
            "invoice_date": s.invoice_date or "-",
            "credit_term": s.credit_term or "30 Days",
            "due_date": s.due_date or "-",
            "opening_balance_date": s.opening_balance_date or "-",
            "outstanding_balance": float(s.opening_balance or s.current_balance or 0.0),
            "opening_balance": float(s.opening_balance or 0.0),
            "source_doc_id": s.source_doc_id or "",
            "email": s.contact_email or "",
            "phone": s.phone or ""
        }
        for s in creditors
    ]

    filtered_creditors = raw_creditors
    if as_at_date:
        as_at_d = parse_date(as_at_date)
        if as_at_d:
            filtered_creditors = [
                c for c in raw_creditors
                if not parse_date(c["invoice_date"]) or parse_date(c["invoice_date"]) <= as_at_d or
                   (parse_date(c["opening_balance_date"]) and parse_date(c["opening_balance_date"]) <= as_at_d)
            ]
    elif from_date or to_date:
        filtered_creditors = [
            c for c in raw_creditors
            if is_date_in_range(c["invoice_date"], from_date, to_date) or
               is_date_in_range(c["opening_balance_date"], from_date, to_date)
        ]

    total_outstanding = round(sum(c["outstanding_balance"] for c in filtered_creditors), 2)
    is_reconciled = abs(total_outstanding - gl_bal) < 0.01

    return {
        "company_id": comp_id,
        "control_account": "405-0000 OTHER CREDITORS",
        "gl_control_balance": gl_bal,
        "as_at_date": as_at_date,
        "from_date": from_date,
        "to_date": to_date,
        "total_outstanding": total_outstanding,
        "is_reconciled": is_reconciled,
        "discrepancy": round(total_outstanding - gl_bal, 2),
        "total_creditors": len(filtered_creditors),
        "creditors": filtered_creditors
    }


@router.get("/inventory")
def get_company_inventory(
    company_id: Optional[str] = None,
    as_at_date: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Returns Inventory opening stock listing with opening quantities, unit costs,
    total valuations, and reconciliation tie-out with GL Stock control account.
    """
    import json
    comp_id = company_id
    if not comp_id:
        active_comp = db.query(CompanyModel).filter(CompanyModel.is_active == True).order_by(CompanyModel.id.desc()).first()
        comp_id = active_comp.company_id if active_comp else "COMP-000001"

    items = db.query(InventoryItemModel).filter(
        InventoryItemModel.company_id == comp_id,
        InventoryItemModel.is_active == True
    ).order_by(InventoryItemModel.item_code.asc()).all()

    # GL tie-out: 330-0000 is Asset, normal balance DEBIT (Debit - Credit)
    posted_journals = db.query(JournalEntryModel).filter(
        JournalEntryModel.company_id == comp_id,
        JournalEntryModel.status == "POSTED"
    ).all()
    gl_bal = 0.0
    for pj in posted_journals:
        if pj.lines_json:
            try:
                for l in json.loads(pj.lines_json):
                    if str(l.get("account_code", "")).startswith("330"):
                        gl_bal += float(l.get("debit", 0.0)) - float(l.get("credit", 0.0))
            except Exception:
                pass
    gl_bal = round(gl_bal, 2)

    from app.utils.date_utils import is_date_in_range, parse_date
    raw_items = [
        {
            "id": i.id,
            "item_code": i.item_code,
            "item_name": i.item_name,
            "opening_quantity": float(i.opening_quantity or 0.0),
            "unit_cost": float(i.unit_cost or 0.0),
            "total_value": float(i.opening_valuation or 0.0),
            "opening_valuation": float(i.opening_valuation or 0.0),
            "opening_balance_date": i.opening_balance_date or "-",
            "source_doc_id": i.source_doc_id or ""
        }
        for i in items
    ]

    filtered_items = raw_items
    if as_at_date:
        as_at_d = parse_date(as_at_date)
        if as_at_d:
            filtered_items = [
                i for i in raw_items
                if not parse_date(i["opening_balance_date"]) or parse_date(i["opening_balance_date"]) <= as_at_d
            ]
    elif from_date or to_date:
        filtered_items = [
            i for i in raw_items
            if is_date_in_range(i["opening_balance_date"], from_date, to_date)
        ]

    total_val = round(sum(i["total_value"] for i in filtered_items), 2)
    is_reconciled = abs(total_val - gl_bal) < 0.01

    return {
        "company_id": comp_id,
        "control_account": "330-0000 STOCK",
        "gl_control_balance": gl_bal,
        "as_at_date": as_at_date,
        "from_date": from_date,
        "to_date": to_date,
        "total_valuation": total_val,
        "is_reconciled": is_reconciled,
        "discrepancy": round(total_val - gl_bal, 2),
        "total_items": len(filtered_items),
        "items": filtered_items
    }


@router.get("/opening-balances")
def get_company_opening_balances(company_id: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Returns confirmed Opening Trial Balance, reconciliation tie-outs with subsidiary ledgers,
    reporting date vs posting date, and linked opening journal.
    """
    import json
    comp_id = company_id
    if not comp_id:
        active_comp = db.query(CompanyModel).filter(CompanyModel.is_active == True).order_by(CompanyModel.id.desc()).first()
        comp_id = active_comp.company_id if active_comp else "COMP-000001"

    comp_obj = db.query(CompanyModel).filter(CompanyModel.company_id == comp_id).first()

    batch = db.query(OpeningBalanceBatchModel).filter(
        OpeningBalanceBatchModel.company_id == comp_id
    ).order_by(OpeningBalanceBatchModel.id.desc()).first()

    open_jrn = db.query(JournalEntryModel).filter(
        JournalEntryModel.company_id == comp_id,
        JournalEntryModel.reference == "OPENING-BALANCES",
        JournalEntryModel.status == "POSTED"
    ).first()

    if not open_jrn:
        open_jrn = db.query(JournalEntryModel).filter(
            JournalEntryModel.company_id == comp_id,
            (JournalEntryModel.journal_id.like("JRN-OB-%")) | 
            (JournalEntryModel.description.like("%Opening Balance%")),
            JournalEntryModel.status == "POSTED"
        ).first()

    # Retrieve TB accounts
    lines = []
    if open_jrn and open_jrn.lines_json:
        try:
            raw_lines = json.loads(open_jrn.lines_json)
            for idx, l in enumerate(raw_lines):
                lines.append({
                    "line_number": l.get("line_number", idx + 1),
                    "account_code": l.get("account_code", ""),
                    "account_name": l.get("account_name", ""),
                    "description": l.get("description", ""),
                    "debit": round(float(l.get("debit", 0.0) or 0.0), 2),
                    "credit": round(float(l.get("credit", 0.0) or 0.0), 2)
                })
        except Exception:
            pass

    if not lines and batch:
        drafts = db.query(OpeningBalanceDraftRecordModel).filter(
            OpeningBalanceDraftRecordModel.company_id == comp_id,
            OpeningBalanceDraftRecordModel.category == "TRIAL_BALANCE"
        ).order_by(OpeningBalanceDraftRecordModel.id.asc()).all()
        for idx, d in enumerate(drafts):
            lines.append({
                "line_number": idx + 1,
                "account_code": d.account_code,
                "account_name": d.account_name,
                "description": f"Opening Balance - {d.account_name}",
                "debit": round(float(d.debit or 0.0), 2),
                "credit": round(float(d.credit or 0.0), 2),
                "category": d.category
            })

    total_dr = round(sum(float(l.get("debit", 0.0)) for l in lines), 2)
    total_cr = round(sum(float(l.get("credit", 0.0)) for l in lines), 2)

    if total_dr == 0.0 and total_cr == 0.0 and batch:
        total_dr = round(float(batch.total_debit or 0.0), 2)
        total_cr = round(float(batch.total_credit or 0.0), 2)

    diff = round(abs(total_dr - total_cr), 2)
    is_balanced = (diff < 0.01) and (total_dr > 0)

    # Opening balance date
    opening_date = "2025-12-31"
    if open_jrn and open_jrn.journal_date:
        opening_date = open_jrn.journal_date
    elif batch and batch.as_at_date:
        opening_date = batch.as_at_date

    # Financial year
    fy_str = None
    if comp_obj:
        if comp_obj.financial_year_start and comp_obj.financial_year_end:
            fy_str = f"{comp_obj.financial_year_start} to {comp_obj.financial_year_end}"
        else:
            fy_str = "1 January 2026 to 31 December 2026"

    # Journal details
    journal_id = open_jrn.journal_id if open_jrn else (batch.posted_journal_id if (batch and batch.posted_journal_id) else None)
    journal_status = open_jrn.status if open_jrn else ("POSTED" if (batch and batch.posted_journal_id) else "Not Yet Posted")
    posting_date = open_jrn.journal_date if open_jrn else (batch.as_at_date if batch else None)
    journal_description = open_jrn.description if open_jrn else ("Opening balance general journal entry" if batch else None)

    # Documents
    category_labels = {
        "TRIAL_BALANCE": "Opening Trial Balance",
        "DEBTOR": "Trade Receivables Listing",
        "DEBTORS": "Trade Receivables Listing",
        "CREDITOR": "Trade Payables Listing",
        "CREDITORS": "Trade Payables Listing",
        "OTHER_CREDITOR": "Other Creditors Listing",
        "OTHER_CREDITORS": "Other Creditors Listing",
        "STOCK": "Stock Balance Report"
    }

    ob_docs = db.query(OpeningBalanceDocumentModel).filter(
        OpeningBalanceDocumentModel.company_id == comp_id
    ).all()

    documents = []
    seen_doc_ids = set()
    for od in ob_docs:
        doc_id = od.source_doc_id or od.document_id
        doc_item = {
            "id": od.id,
            "document_id": doc_id,
            "source_doc_id": doc_id,
            "document_type": category_labels.get(od.doc_category, getattr(od, "doc_category", "Company Setup Document")),
            "filename": od.original_filename,
            "confirmation_status": getattr(od, "confirmation_status", "CONFIRMED") or "CONFIRMED",
            "reporting_date": opening_date
        }
        documents.append(doc_item)
        if doc_id:
            seen_doc_ids.add(doc_id)

    # Fallback/merge with DocumentModel if less than 5
    if len(documents) < 5:
        perm_docs = db.query(DocumentModel).filter(
            DocumentModel.company_id == comp_id,
            DocumentModel.document_type.in_([
                "Opening Trial Balance",
                "Trade Receivables / Debtors",
                "Trade Payables / Creditors",
                "Other Creditors",
                "Opening Stock List",
                "Company Setup Document"
            ])
        ).all()
        for pd in perm_docs:
            if pd.document_id not in seen_doc_ids:
                documents.append({
                    "id": pd.id,
                    "document_id": pd.document_id,
                    "source_doc_id": pd.document_id,
                    "document_type": pd.document_type,
                    "filename": pd.original_filename,
                    "confirmation_status": "CONFIRMED",
                    "reporting_date": opening_date
                })
                seen_doc_ids.add(pd.document_id)

    # Subsidiary details (Receivables, Payables, Other Creditors, Inventory)
    subsidiary_customers = []
    custs = db.query(CustomerModel).filter(CustomerModel.company_id == comp_id).all()
    for c in custs:
        subsidiary_customers.append({
            "customer_code": c.customer_code,
            "customer_name": c.customer_name,
            "invoice_no": c.invoice_no,
            "invoice_date": c.invoice_date,
            "credit_term": c.credit_term,
            "opening_balance": float(c.opening_balance or 0.0),
            "source_doc_id": c.source_doc_id or "DOC-2026-000005"
        })

    subsidiary_suppliers = []
    subsidiary_other_creditors = []
    supps = db.query(SupplierModel).filter(SupplierModel.company_id == comp_id).all()
    for s in supps:
        s_data = {
            "supplier_code": s.supplier_code,
            "supplier_name": s.supplier_name,
            "invoice_no": s.invoice_no,
            "invoice_date": s.invoice_date,
            "credit_term": s.credit_term,
            "opening_balance": float(s.opening_balance or 0.0),
            "source_doc_id": s.source_doc_id or ("DOC-2026-000002" if s.supplier_type == "OTHER" else "DOC-2026-000004")
        }
        if s.supplier_type == "OTHER" or "OTH-" in (s.supplier_code or ""):
            subsidiary_other_creditors.append(s_data)
        else:
            subsidiary_suppliers.append(s_data)

    subsidiary_inventory = []
    invs = db.query(InventoryItemModel).filter(InventoryItemModel.company_id == comp_id).all()
    for item in invs:
        subsidiary_inventory.append({
            "item_code": item.item_code,
            "item_name": item.item_name,
            "opening_quantity": float(item.opening_quantity or 0.0),
            "unit_cost": float(item.unit_cost or 0.0),
            "total_valuation": float(item.opening_valuation or 0.0),
            "source_doc_id": item.source_doc_id or "DOC-2026-000003"
        })

    sub_debtor_total = round(sum(c["opening_balance"] for c in subsidiary_customers), 2)
    sub_creditor_total = round(sum(s["opening_balance"] for s in subsidiary_suppliers), 2)
    sub_other_creditor_total = round(sum(o["opening_balance"] for o in subsidiary_other_creditors), 2)
    sub_stock_total = round(sum(i["total_valuation"] for i in subsidiary_inventory), 2)

    return {
        "company_id": comp_id,
        "company_name": comp_obj.company_name if comp_obj else None,
        "batch_id": batch.id if batch else None,
        "journal_id": journal_id,
        "journal_status": journal_status,
        "posting_date": posting_date,
        "book": "General Journal",
        "journal_description": journal_description,
        "financial_year": fy_str,
        "opening_date": opening_date,
        "status": "CONFIRMED" if (batch or open_jrn) else "PENDING",
        "total_debit": total_dr,
        "total_credit": total_cr,
        "difference": diff,
        "is_balanced": is_balanced,
        "account_count": len(lines),
        "lines": lines,
        "documents": documents,
        "subsidiary": {
            "debtor_total": sub_debtor_total,
            "creditor_total": sub_creditor_total,
            "other_creditor_total": sub_other_creditor_total,
            "stock_total": sub_stock_total,
            "customers": subsidiary_customers,
            "suppliers": subsidiary_suppliers,
            "other_creditors": subsidiary_other_creditors,
            "inventory": subsidiary_inventory
        }
    }


@router.post("/{company_id}/start-new-financial-year")
def start_new_financial_year_endpoint(
    company_id: str,
    payload: dict,
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Initiates financial year rollover for an existing company:
    - Rolls P&L net income into Retained Earnings (150-0000)
    - Generates balanced opening journal for the new financial year
    - Retains Chart of Accounts, Customers, Suppliers, and Inventory
    """
    from app.services.onboarding_service import OnboardingService
    target_fy = payload.get("target_financial_year")
    try:
        service = OnboardingService(db)
        res = service.start_new_financial_year(company_id, new_fy=target_fy)
        return res
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
