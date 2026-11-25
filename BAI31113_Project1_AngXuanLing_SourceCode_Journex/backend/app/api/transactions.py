from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import AccountingTransactionModel, DocumentModel, CompanyModel
from app.schemas.transaction import TransactionResponse, TransactionListResponse
from app.services.transaction_service import sync_document_transaction, format_transaction_response
from app.services.calculation_agent import CalculationAgent
from app.services.pdf_report import generate_book_of_prime_entry_pdf
from app.utils.date_utils import is_date_in_range

router = APIRouter(prefix="/api/transactions", tags=["Transactions"])


@router.get("/book-summary")
def get_book_summary(
    book_name: str = Query(...),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    company_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    comp_id = company_id if isinstance(company_id, str) and company_id else None
    f_date = from_date if isinstance(from_date, str) and from_date else None
    t_date = to_date if isinstance(to_date, str) and to_date else None

    if f_date and t_date and f_date > t_date:
        raise HTTPException(status_code=400, detail="From Date cannot be later than To Date.")

    if not comp_id:
        active_comp = db.query(CompanyModel).filter(CompanyModel.is_active == True).order_by(CompanyModel.id.desc()).first()
        comp_id = active_comp.company_id if active_comp else "COMP-000001"

    active_company = db.query(CompanyModel).filter(CompanyModel.company_id == comp_id).first()
    comp_name = active_company.company_name if active_company else "NextTech Solutions Sdn Bhd"
    currency = active_company.currency if active_company else "MYR"

    docs = db.query(DocumentModel).filter(DocumentModel.company_id == comp_id).all()
    docs_map = {d.document_id: d for d in docs}

    for doc in docs:
        sync_document_transaction(db, doc)

    txns = db.query(AccountingTransactionModel).filter(
        AccountingTransactionModel.company_id == comp_id,
        AccountingTransactionModel.book_of_prime_entry == book_name
    ).order_by(AccountingTransactionModel.transaction_date.asc(), AccountingTransactionModel.id.asc()).all()

    formatted = [format_transaction_response(t, doc=docs_map.get(t.document_id)) for t in txns]

    # Run Calculation Agent for verified calculation total
    calc_agent = CalculationAgent()
    calc_result = calc_agent.calculate_book_total(
        company_id=comp_id,
        book_of_prime_entry=book_name,
        from_date=f_date,
        to_date=t_date,
        transactions=formatted,
        currency=currency
    )

    filtered_txns = [t for t in formatted if is_date_in_range(t.get("transaction_date"), f_date, t_date)]

    return {
        "book_name": book_name,
        "company_id": comp_id,
        "company_name": comp_name,
        "currency": currency,
        "from_date": f_date,
        "to_date": t_date,
        "transactions": filtered_txns,
        "calculation": calc_result
    }


@router.get("/export-pdf")
def export_book_pdf(
    book_name: str = Query(...),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    company_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    f_date = from_date if isinstance(from_date, str) and from_date else None
    t_date = to_date if isinstance(to_date, str) and to_date else None

    if f_date and t_date and f_date > t_date:
        raise HTTPException(status_code=400, detail="From Date cannot be later than To Date.")

    comp_id = company_id if isinstance(company_id, str) and company_id else None
    if not comp_id:
        active_comp = db.query(CompanyModel).filter(CompanyModel.is_active == True).order_by(CompanyModel.id.desc()).first()
        comp_id = active_comp.company_id if active_comp else "COMP-000001"

    active_company = db.query(CompanyModel).filter(CompanyModel.company_id == comp_id).first()
    comp_name = active_company.company_name if active_company else "NextTech Solutions Sdn Bhd"
    currency = active_company.currency if active_company else "MYR"

    docs = db.query(DocumentModel).filter(DocumentModel.company_id == comp_id).all()
    docs_map = {d.document_id: d for d in docs}
    for doc in docs:
        sync_document_transaction(db, doc)

    txns = db.query(AccountingTransactionModel).filter(
        AccountingTransactionModel.company_id == comp_id,
        AccountingTransactionModel.book_of_prime_entry == book_name
    ).order_by(AccountingTransactionModel.transaction_date.asc(), AccountingTransactionModel.id.asc()).all()

    formatted = [format_transaction_response(t, doc=docs_map.get(t.document_id)) for t in txns]

    filtered_txns = [t for t in formatted if is_date_in_range(t.get("transaction_date"), f_date, t_date)]

    # 1. Calculation Agent Single Source of Truth for Book Total
    calc_agent = CalculationAgent()
    calc_result = calc_agent.calculate_book_total(
        company_id=comp_id,
        book_of_prime_entry=book_name,
        from_date=f_date,
        to_date=t_date,
        transactions=formatted,
        currency=currency
    )

    if calc_result.get("calculation_status") != "VERIFIED":
        raise HTTPException(status_code=400, detail="Calculation verification failed. Cannot export unverified report.")

    subtitle_map = {
        "Sales Day Book": "Record of Credit Sales",
        "Sales Returns Day Book": "Record of Sales Returns",
        "Purchases Day Book": "Record of Credit Purchases",
        "Purchases Returns Day Book": "Record of Purchases Returns",
        "Cash Book": "Record of Cash and Bank Receipts and Payments",
        "General Journal": "Record of Unusual and Non-Routine Transactions"
    }
    subtitle = subtitle_map.get(book_name, "Record of Accounting Transactions")

    # 2. Generate PDF using verified calculation total
    pdf_bytes = generate_book_of_prime_entry_pdf(
        company_name=comp_name,
        book_name=book_name,
        subtitle=subtitle,
        from_date=f_date,
        to_date=t_date,
        currency=currency,
        transactions=filtered_txns,
        calculation_result=calc_result
    )

    filename_slug = book_name.lower().replace(" ", "_")
    period_slug = f"{from_date or 'start'}_to_{to_date or 'end'}"
    filename = f"{filename_slug}_{period_slug}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


@router.get("/", response_model=TransactionListResponse)
def list_transactions(
    company_id: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    target_company_id = company_id
    if not target_company_id:
        active_comp = db.query(CompanyModel).filter(CompanyModel.is_active == True).order_by(CompanyModel.id.desc()).first()
        target_company_id = active_comp.company_id if active_comp else "COMP-000001"

    docs = db.query(DocumentModel).filter(DocumentModel.company_id == target_company_id).all()
    docs_map = {d.document_id: d for d in docs}
    for doc in docs:
        sync_document_transaction(db, doc)

    txns = db.query(AccountingTransactionModel).filter(
        AccountingTransactionModel.company_id == target_company_id
    ).order_by(AccountingTransactionModel.id.desc()).all()

    formatted = [format_transaction_response(t, doc=docs_map.get(t.document_id)) for t in txns]
    if from_date or to_date:
        formatted = [t for t in formatted if is_date_in_range(t.get("transaction_date"), from_date, to_date)]
    return TransactionListResponse(total=len(formatted), transactions=formatted)


@router.get("/{transaction_id}", response_model=TransactionResponse)
def get_transaction_detail(transaction_id: str, db: Session = Depends(get_db)):
    txn = db.query(AccountingTransactionModel).filter(
        AccountingTransactionModel.transaction_id == transaction_id
    ).first()
    
    if not txn:
        # Check if transaction_id is actually a document_id
        txn = db.query(AccountingTransactionModel).filter(
            AccountingTransactionModel.document_id == transaction_id
        ).first()

    if not txn:
        # Check if doc exists and sync
        doc = db.query(DocumentModel).filter(DocumentModel.document_id == transaction_id).first()
        if doc:
            txn = sync_document_transaction(db, doc)

    if not txn:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found.")

    doc = db.query(DocumentModel).filter(DocumentModel.document_id == txn.document_id).first()
    return format_transaction_response(txn, doc=doc)
