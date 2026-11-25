"""
ABC Bank Transaction Ingestion API Router.
Exposes endpoints for:
- Connection testing
- Manual transaction collection
- Starting/stopping background polling worker
- Querying collection status and imported transaction history
"""

import os
import json
from fastapi.responses import FileResponse
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Body, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.database import get_db, SessionLocal
from app.db.models import BankTransactionModel
from app.services.bank_ingestion.background_worker import bank_worker_singleton

router = APIRouter(prefix="/api/bank-ingestion", tags=["ABC Bank Ingestion"])


class StartBankWorkerRequest(BaseModel):
    poll_interval_seconds: Optional[int] = Field(None, ge=5, le=86400, description="Polling interval in seconds")
    company_id: Optional[str] = Field(None, description="Optional target company ID")


class FetchBankRequest(BaseModel):
    company_id: Optional[str] = Field(None, description="Optional target company ID")


@router.get("/status")
def get_bank_ingestion_status(
    company_id: Optional[str] = Query(None, description="Active company ID context"),
    db: Session = Depends(get_db)
):
    """
    Returns current worker state, ABC Bank connection status,
    last collection time, and metrics for the specified company.
    """
    if not isinstance(company_id, str):
        company_id = None
    return bank_worker_singleton.get_status(db=db, company_id=company_id)


@router.post("/test-connection")
def test_bank_connection():
    """
    Verifies that the ABC Bank Simulator is reachable and returns
    account summary without importing transactions.
    """
    return bank_worker_singleton.test_connection()


@router.post("/fetch")
async def trigger_manual_fetch(
    req: Optional[FetchBankRequest] = Body(default=None),
    db: Session = Depends(get_db)
):
    """
    Triggers an immediate collection cycle from ABC Bank.
    Independent from the background polling worker.
    """
    company_id = req.company_id if req else None
    result = await bank_worker_singleton.run_fetch_cycle(
        db_session_factory=SessionLocal,
        company_id=company_id
    )

    if result.get("status") == "CONCURRENT_BUSY":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A bank transaction collection operation is already currently in progress. Please wait."
        )
    elif result.get("status") == "ERROR" and not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("message", "Error occurred during bank collection.")
        )

    return result


@router.post("/start")
async def start_bank_worker(req: Optional[StartBankWorkerRequest] = Body(default=None)):
    """
    Starts the ABC Bank background collection worker.
    Uses configurable interval (default 30s).
    """
    interval = req.poll_interval_seconds if req else None
    company_id = req.company_id if req else None
    result = bank_worker_singleton.start(
        db_session_factory=SessionLocal,
        poll_interval=interval,
        company_id=company_id
    )
    if not result.get("started") and "unable to connect" in result.get("message", "").lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("message")
        )
    return result


@router.post("/stop")
async def stop_bank_worker():
    """
    Stops the ABC Bank background collection worker safely.
    Does not delete imported records.
    """
    return bank_worker_singleton.stop()



def format_bank_transaction_dict(t: BankTransactionModel) -> Dict[str, Any]:
    trail = []
    if t.audit_trail_json:
        try:
            trail = json.loads(t.audit_trail_json)
        except Exception:
            trail = []

    return {
        "id": t.id,
        "company_id": t.company_id,
        "source": t.source,
        "unique_source_id": t.unique_source_id,
        "bank_name": t.bank_name,
        "account_id": t.account_id,
        "account_number": t.account_number,
        "bank_transaction_id": t.bank_transaction_id,
        "transaction_date": t.transaction_date,
        "description": t.description,
        "reference": t.reference,
        "money_in": t.money_in,
        "money_out": t.money_out,
        "currency": t.currency,
        "running_balance": t.running_balance,
        "collection_status": t.collection_status,
        "created_at": t.created_at.strftime("%Y-%m-%d %H:%M:%S") if t.created_at else "",
        "updated_at": t.updated_at.strftime("%Y-%m-%d %H:%M:%S") if t.updated_at else "",
        # Classification
        "suggested_category": t.suggested_category,
        "suggested_account_code": t.suggested_account_code,
        "suggested_account_name": t.suggested_account_name,
        "classification_confidence": t.classification_confidence,
        "classification_explanation": t.classification_explanation,
        "classification_status": t.classification_status or "PENDING",
        "review_status": t.review_status or "NEEDS_REVIEW",
        "classification_timestamp": t.classification_timestamp.strftime("%Y-%m-%d %H:%M:%S") if t.classification_timestamp else None,
        # Matching & Reconciliation
        "matched_document_id": t.matched_document_id,
        "match_status": t.match_status or "UNMATCHED",
        "match_confidence": t.match_confidence or 0.0,
        "match_explanation": t.match_explanation,
        "match_timestamp": t.match_timestamp.strftime("%Y-%m-%d %H:%M:%S") if t.match_timestamp else None,
        "reconciliation_status": t.reconciliation_status or "UNRECONCILED",
        "reconciliation_notes": t.reconciliation_notes,
        "audit_trail": trail,
        "pdf_file_path": t.pdf_file_path,
        "has_pdf": bool(t.pdf_file_path and os.path.exists(t.pdf_file_path)),
    }


class UpdateClassificationRequest(BaseModel):
    category: str
    account_code: Optional[str] = None
    account_name: Optional[str] = None
    notes: Optional[str] = None


class UpdateMatchRequest(BaseModel):
    document_id: Optional[str] = None
    match_status: Optional[str] = "MATCHED"  # MATCHED, SUGGESTED_MATCH, UNMATCHED, NEEDS_REVIEW
    notes: Optional[str] = None


class UpdateReconciliationRequest(BaseModel):
    reconciliation_status: str  # REVIEW_READY, RECONCILED, UNRECONCILED, POSTED
    notes: Optional[str] = None


@router.get("/categories")
def get_accounting_categories():
    """Returns the list of supported accounting categories and their default Chart of Accounts mappings."""
    from app.services.bank_ingestion.bank_classifier import CATEGORY_ACCOUNTS
    items = []
    for cat_name, info in CATEGORY_ACCOUNTS.items():
        items.append({
            "category": cat_name,
            "account_code": info["code"],
            "account_name": info["name"],
            "account_type": info["type"],
            "direction": info["direction"],
        })
    return {"categories": items}


@router.get("/transactions")
def list_imported_bank_transactions(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=200, description="Page limit"),
    direction: Optional[str] = Query("all", description="Filter direction: 'in', 'out', or 'all'"),
    search: Optional[str] = Query(None, description="Search transaction ID, description, or reference"),
    company_id: Optional[str] = Query(None, description="Active company ID context"),
    db: Session = Depends(get_db)
):
    """
    Returns imported bank transaction records from the database.
    Supports pagination, direction filtering, company filtering, and text search.
    """
    if not isinstance(page, int):
        page = 1
    if not isinstance(limit, int):
        limit = 50
    if not isinstance(direction, str):
        direction = "all"
    if not isinstance(search, str):
        search = None
    if not isinstance(company_id, str):
        company_id = None

    query = db.query(BankTransactionModel)
    if company_id:
        query = query.filter(BankTransactionModel.company_id == company_id)

    if direction == "in":
        query = query.filter(BankTransactionModel.money_in > 0)
    elif direction == "out":
        query = query.filter(BankTransactionModel.money_out > 0)

    if search:
        search_pattern = f"%{search.strip()}%"
        query = query.filter(
            (BankTransactionModel.bank_transaction_id.ilike(search_pattern)) |
            (BankTransactionModel.description.ilike(search_pattern)) |
            (BankTransactionModel.reference.ilike(search_pattern)) |
            (BankTransactionModel.suggested_category.ilike(search_pattern)) |
            (BankTransactionModel.suggested_account_name.ilike(search_pattern))
        )

    total = query.count()
    txs = query.order_by(BankTransactionModel.id.desc()).offset((page - 1) * limit).limit(limit).all()
    items = [format_bank_transaction_dict(t) for t in txs]

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "transactions": items,
    }


@router.get("/transactions/{transaction_id}")
def get_bank_transaction_details(
    transaction_id: str,
    db: Session = Depends(get_db)
):
    """
    Returns detailed bank transaction information, including structured bank fields,
    suggested accounting classification, matched document information, candidate matches,
    and processing audit trail.
    """
    tx = db.query(BankTransactionModel).filter(
        (BankTransactionModel.bank_transaction_id == transaction_id) |
        (BankTransactionModel.id == (int(transaction_id) if transaction_id.isdigit() else -1))
    ).first()

    if not tx:
        raise HTTPException(status_code=404, detail=f"Bank transaction '{transaction_id}' not found.")

    from app.services.bank_ingestion.bank_classifier import match_bank_transaction_to_documents
    match_info = match_bank_transaction_to_documents(tx, db, company_id=tx.company_id)

    formatted = format_bank_transaction_dict(tx)
    formatted["candidate_documents"] = match_info.get("candidates", [])

    return formatted


@router.post("/transactions/{transaction_id}/classify")
def update_transaction_classification(
    transaction_id: str,
    req: UpdateClassificationRequest,
    db: Session = Depends(get_db)
):
    """
    Allows user to approve or update accounting classification for a bank transaction.
    Records the decision in the transaction audit trail without altering bank source data.
    """
    tx = db.query(BankTransactionModel).filter(
        (BankTransactionModel.bank_transaction_id == transaction_id) |
        (BankTransactionModel.id == (int(transaction_id) if transaction_id.isdigit() else -1))
    ).first()

    if not tx:
        raise HTTPException(status_code=404, detail=f"Bank transaction '{transaction_id}' not found.")

    from app.services.bank_ingestion.bank_classifier import append_audit_entry, CATEGORY_ACCOUNTS
    from app.db.models import ChartOfAccountModel, get_local_now

    cat_name = req.category.strip()
    acc_code = req.account_code
    acc_name = req.account_name

    # Auto-resolve account code if not explicitly given
    if not acc_code and cat_name in CATEGORY_ACCOUNTS:
        acc_code = CATEGORY_ACCOUNTS[cat_name]["code"]
        acc_name = CATEGORY_ACCOUNTS[cat_name]["name"]

    if acc_code and not acc_name:
        coa = db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.company_id == tx.company_id,
            ChartOfAccountModel.account_code == acc_code
        ).first()
        if coa:
            acc_name = coa.account_name

    tx.suggested_category = cat_name
    tx.suggested_account_code = acc_code
    tx.suggested_account_name = acc_name
    tx.classification_status = "CONFIRMED"
    tx.review_status = "APPROVED"
    tx.classification_timestamp = get_local_now()

    detail_msg = f"Classification confirmed as '{cat_name}' ({acc_code} {acc_name})."
    if req.notes:
        detail_msg += f" Note: {req.notes}"

    tx.audit_trail_json = append_audit_entry(
        tx.audit_trail_json,
        action="CLASSIFICATION_CONFIRMED",
        details=detail_msg,
        actor="User"
    )

    db.commit()
    db.refresh(tx)
    return {
        "success": True,
        "message": f"Transaction {tx.bank_transaction_id} classification updated successfully.",
        "transaction": format_bank_transaction_dict(tx)
    }


@router.post("/transactions/{transaction_id}/match")
def update_transaction_match(
    transaction_id: str,
    req: UpdateMatchRequest,
    db: Session = Depends(get_db)
):
    """
    Links or unlinks an accounting document (invoice, receipt) to this bank transaction.
    Records the match decision in the audit trail.
    """
    tx = db.query(BankTransactionModel).filter(
        (BankTransactionModel.bank_transaction_id == transaction_id) |
        (BankTransactionModel.id == (int(transaction_id) if transaction_id.isdigit() else -1))
    ).first()

    if not tx:
        raise HTTPException(status_code=404, detail=f"Bank transaction '{transaction_id}' not found.")

    from app.services.bank_ingestion.bank_classifier import append_audit_entry
    from app.db.models import DocumentModel, get_local_now

    doc_id = (req.document_id or "").strip() or None
    m_status = req.match_status or "MATCHED"

    if doc_id:
        doc = db.query(DocumentModel).filter(
            DocumentModel.company_id == tx.company_id,
            DocumentModel.document_id == doc_id
        ).first()
        if not doc:
            raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found.")

        tx.matched_document_id = doc_id
        tx.match_status = m_status
        tx.match_confidence = 1.0
        tx.match_timestamp = get_local_now()
        tx.match_explanation = f"Manually linked to {doc.document_type} ({doc.document_id}) by user."
        tx.reconciliation_status = "REVIEW_READY"

        audit_msg = f"Linked to document {doc_id} ({doc.document_type}, RM {doc.grand_total:.2f})."
        if req.notes:
            audit_msg += f" Note: {req.notes}"

        tx.audit_trail_json = append_audit_entry(
            tx.audit_trail_json,
            action="DOCUMENT_MATCHED",
            details=audit_msg,
            actor="User"
        )
    else:
        old_doc = tx.matched_document_id
        tx.matched_document_id = None
        tx.match_status = "UNMATCHED"
        tx.match_confidence = 0.0
        tx.match_timestamp = get_local_now()
        tx.match_explanation = "Unlinked by user. Supporting document required."
        tx.reconciliation_status = "UNRECONCILED"

        tx.audit_trail_json = append_audit_entry(
            tx.audit_trail_json,
            action="DOCUMENT_UNLINKED",
            details=f"Unlinked from document {old_doc}." if old_doc else "Marked unmatched.",
            actor="User"
        )

    db.commit()
    db.refresh(tx)
    return {
        "success": True,
        "message": f"Transaction {tx.bank_transaction_id} matching updated.",
        "transaction": format_bank_transaction_dict(tx)
    }


@router.post("/transactions/{transaction_id}/reconcile")
def update_transaction_reconciliation(
    transaction_id: str,
    req: UpdateReconciliationRequest,
    db: Session = Depends(get_db)
):
    """
    Updates reconciliation status (e.g., mark as REVIEW_READY, RECONCILED) with audit logging.
    Preserves audit distinction from journal posting.
    """
    tx = db.query(BankTransactionModel).filter(
        (BankTransactionModel.bank_transaction_id == transaction_id) |
        (BankTransactionModel.id == (int(transaction_id) if transaction_id.isdigit() else -1))
    ).first()

    if not tx:
        raise HTTPException(status_code=404, detail=f"Bank transaction '{transaction_id}' not found.")

    from app.services.bank_ingestion.bank_classifier import append_audit_entry
    from app.db.models import get_local_now

    tx.reconciliation_status = req.reconciliation_status
    if req.notes:
        tx.reconciliation_notes = req.notes
    tx.updated_at = get_local_now()

    tx.audit_trail_json = append_audit_entry(
        tx.audit_trail_json,
        action="RECONCILIATION_STATUS_UPDATED",
        details=f"Status changed to {req.reconciliation_status}. {req.notes or ''}".strip(),
        actor="User"
    )

    db.commit()
    db.refresh(tx)
    return {
        "success": True,
        "message": f"Transaction {tx.bank_transaction_id} reconciliation status updated to {req.reconciliation_status}.",
        "transaction": format_bank_transaction_dict(tx)
    }


@router.get("/transactions/{transaction_id}/pdf")
def get_transaction_pdf(transaction_id: str, db: Session = Depends(get_db)):
    tx = db.query(BankTransactionModel).filter(
        (BankTransactionModel.bank_transaction_id == transaction_id) |
        (BankTransactionModel.id == (int(transaction_id) if transaction_id.isdigit() else -1))
    ).first()

    if tx and tx.pdf_file_path and os.path.exists(tx.pdf_file_path):
        return FileResponse(
            tx.pdf_file_path,
            media_type="application/pdf",
            content_disposition_type="inline",
            filename=f"{tx.bank_transaction_id}.pdf"
        )
    """
    Optional helper to retrieve and forward a transaction PDF receipt from ABC Bank.
    """
    client = bank_worker_singleton.get_client()
    try:
        pdf_bytes = client.get_transaction_pdf(transaction_id)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{transaction_id}.pdf"'},
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"PDF for {transaction_id} not available: {e}")



@router.delete("/transactions/{transaction_id}")
def delete_bank_transaction_endpoint(
    transaction_id: str,
    allow_posted_reset: bool = Query(True),
    environment_override: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Deletes a single bank transaction from the accounting system
    and recalculates the ingestion cursor to allow re-testing.
    Supports testing reset for full workflow cleanup.
    """
    from app.api.documents import execute_unified_financial_records_deletion
    res = execute_unified_financial_records_deletion(
        db,
        bank_transaction_ids=[transaction_id],
        allow_posted_reset=allow_posted_reset,
        environment_override=environment_override
    )
    return {
        "success": True,
        "mode": res.get("mode"),
        "message": f"Bank transaction '{transaction_id}' deleted successfully.",
        "transaction_id": transaction_id,
        "new_bank_cursor": res.get("new_bank_cursor"),
        "details": res
    }



@router.post("/reclassify")
def trigger_reclassify_bank_transactions(
    company_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Re-evaluates classification suggestions for unreconciled bank transactions
    belonging to the company against the latest accounting rules.
    """
    from app.services.bank_ingestion.bank_classifier import reclassify_company_bank_transactions
    from app.db.models import CompanyModel

    target_comp_id = company_id
    if not target_comp_id:
        active_comp = db.query(CompanyModel).filter(CompanyModel.is_active == True).first()
        target_comp_id = active_comp.company_id if active_comp else "COMP-000002"

    count = reclassify_company_bank_transactions(db, target_comp_id)
    return {
        "success": True,
        "company_id": target_comp_id,
        "reclassified_count": count,
        "message": f"Successfully reclassified {count} bank transactions for company {target_comp_id}."
    }
