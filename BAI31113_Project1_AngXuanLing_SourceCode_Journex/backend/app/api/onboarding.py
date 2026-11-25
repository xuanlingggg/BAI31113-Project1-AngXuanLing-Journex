from fastapi.responses import FileResponse
import json
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Body, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import (
    CompanyModel,
    OpeningBalanceDocumentModel,
    OpeningBalanceDraftRecordModel,
    OpeningBalanceBatchModel
)
from app.schemas.onboarding import (
    CompanyCreateOnboarding,
    CompanyOnboardingStatusResponse,
    OpeningBalanceDocumentResponse,
    DraftRecordItem,
    DraftRecordCreate,
    DraftRecordUpdate,
    OpeningBalanceValidationResponse,
    OpeningBalancePostRequest,
    RegistrationStartRequest,
    CompanyProfileStepRequest,
    TemporaryUploadedFile,
    SessionDraftItem,
    RegistrationSessionStateResponse,
    RegistrationFinalConfirmRequest
)
from app.services.onboarding_service import OnboardingService
from app.services.auth_service import get_current_user_optional, get_current_user, check_company_membership

router = APIRouter(prefix="/api/onboarding", tags=["Company Onboarding & Opening Balances"])


@router.post("/company", response_model=CompanyOnboardingStatusResponse)
def create_company_onboarding(
    req: CompanyCreateOnboarding,
    user = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    service = OnboardingService(db)
    user_id = user.id if user else None
    comp = service.create_company_onboarding(req, user_id=user_id)
    return CompanyOnboardingStatusResponse(
        company_id=comp.company_id,
        company_name=comp.company_name,
        onboarding_status=comp.onboarding_status or "DOCUMENT_UPLOAD",
        onboarding_step=comp.onboarding_step or 2,
        financial_year_start=comp.financial_year_start,
        financial_year_end=comp.financial_year_end,
        is_active=bool(comp.is_active),
        is_onboarded=(comp.onboarding_status == "ACTIVE")
    )


@router.get("/status", response_model=CompanyOnboardingStatusResponse)
def get_onboarding_status(
    company_id: Optional[str] = Query(None),
    user = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    comp = None
    if company_id:
        try:
            check_company_membership(db, company_id, user)
        except HTTPException:
            c = db.query(CompanyModel).filter(CompanyModel.company_id == company_id).first()
            if c and c.onboarding_status != "ACTIVE":
                pass
            else:
                raise
        comp = db.query(CompanyModel).filter(CompanyModel.company_id == company_id).first()
    if not comp:
        comp = db.query(CompanyModel).filter(CompanyModel.is_active == True).first()
    if not comp:
        comp = db.query(CompanyModel).order_by(CompanyModel.id.desc()).first()

    if not comp:
        raise HTTPException(status_code=404, detail="No company found.")

    return CompanyOnboardingStatusResponse(
        company_id=comp.company_id,
        company_name=comp.company_name,
        onboarding_status=comp.onboarding_status or "ACTIVE",
        onboarding_step=comp.onboarding_step or 1,
        financial_year_start=comp.financial_year_start,
        financial_year_end=comp.financial_year_end,
        is_active=bool(comp.is_active),
        is_onboarded=(comp.onboarding_status == "ACTIVE")
    )


@router.post("/documents", response_model=OpeningBalanceDocumentResponse)
def upload_opening_document(
    company_id: str = Form(...),
    doc_category: str = Form(...),  # TRIAL_BALANCE, DEBTORS, CREDITORS, OTHER_CREDITORS, STOCK
    file: UploadFile = File(...),
    user = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    check_company_membership(db, company_id, user, required_roles=["OWNER", "ADMIN", "ACCOUNTANT"])
    service = OnboardingService(db)
    doc = service.upload_opening_document(company_id=company_id, doc_category=doc_category, file=file)
    return OpeningBalanceDocumentResponse(
        id=doc.id,
        company_id=doc.company_id,
        doc_category=doc.doc_category,
        original_filename=doc.original_filename,
        file_size=doc.file_size,
        mime_type=doc.mime_type,
        extraction_status=doc.extraction_status,
        error_message=doc.error_message,
        created_at=doc.created_at
    )


@router.get("/documents", response_model=List[OpeningBalanceDocumentResponse])
def list_opening_documents(
    company_id: str = Query(...),
    user = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    check_company_membership(db, company_id, user)
    docs = db.query(OpeningBalanceDocumentModel).filter(
        OpeningBalanceDocumentModel.company_id == company_id
    ).order_by(OpeningBalanceDocumentModel.id.asc()).all()

    return [
        OpeningBalanceDocumentResponse(
            id=d.id,
            company_id=d.company_id,
            doc_category=d.doc_category,
            original_filename=d.original_filename,
            file_size=d.file_size,
            mime_type=d.mime_type,
            extraction_status=d.extraction_status,
            error_message=d.error_message,
            created_at=d.created_at
        )
        for d in docs
    ]


@router.get("/documents/{doc_id}/file")
def get_opening_document_file(
    doc_id: str,
    db: Session = Depends(get_db)
):
    """
    Returns the original PDF file of an opening balance or onboarding document for inline preview.
    """
    from app.db.models import DocumentModel
    from app.api.documents import resolve_document_file_path

    doc = None
    if doc_id.isdigit():
        doc = db.query(OpeningBalanceDocumentModel).filter(OpeningBalanceDocumentModel.id == int(doc_id)).first()
    if not doc:
        doc = db.query(OpeningBalanceDocumentModel).filter(
            (OpeningBalanceDocumentModel.document_id == doc_id) |
            (OpeningBalanceDocumentModel.source_doc_id == doc_id)
        ).first()

    target_obj = doc
    if not target_obj:
        # Fallback to DocumentModel
        dm = db.query(DocumentModel).filter(
            (DocumentModel.document_id == doc_id) | (DocumentModel.original_filename == doc_id)
        ).first()
        if not dm and doc_id.isdigit():
            dm = db.query(DocumentModel).filter(DocumentModel.id == int(doc_id)).first()
        target_obj = dm

    if not target_obj:
        raise HTTPException(status_code=404, detail="Opening balance document not found.")

    f_path = resolve_document_file_path(target_obj, db)
    if not f_path or not f_path.exists():
        raise HTTPException(status_code=404, detail="Opening balance document file not found.")

    fname = getattr(target_obj, "original_filename", None) or f_path.name
    mtype = getattr(target_obj, "mime_type", None) or "application/pdf"

    return FileResponse(
        str(f_path),
        media_type=mtype,
        content_disposition_type="inline",
        filename=fname
    )


@router.post("/extract/{document_id}", response_model=List[DraftRecordItem])
def extract_opening_document(
    document_id: int,
    user = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    doc = db.query(OpeningBalanceDocumentModel).filter(OpeningBalanceDocumentModel.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    check_company_membership(db, doc.company_id, user, required_roles=["OWNER", "ADMIN", "ACCOUNTANT"])

    service = OnboardingService(db)
    records = service.extract_document(document_id)
    return [
        DraftRecordItem(
            id=r.id,
            batch_id=r.batch_id,
            company_id=r.company_id,
            category=r.category,
            source_doc_id=r.source_doc_id,
            account_code=r.account_code,
            account_name=r.account_name,
            entity_name=r.entity_name,
            item_code=r.item_code,
            invoice_no=r.invoice_no,
            invoice_date=r.invoice_date,
            credit_term=r.credit_term,
            debit=r.debit,
            credit=r.credit,
            quantity=r.quantity,
            unit_cost=r.unit_cost,
            amount=r.amount,
            review_status=r.review_status,
            notes=r.notes
        )
        for r in records
    ]


@router.post("/company-extract")
def extract_company_documents_endpoint(
    company_id: str = Query(...),
    file_id: Optional[int] = Query(None),
    user = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    check_company_membership(db, company_id, user, required_roles=["OWNER", "ADMIN", "ACCOUNTANT"])
    service = OnboardingService(db)
    return service.extract_company_documents(company_id=company_id, file_id=file_id)


@router.get("/company-state")
def get_company_onboarding_state_endpoint(
    company_id: str = Query(...),
    user = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    check_company_membership(db, company_id, user)
    service = OnboardingService(db)
    return service.get_company_onboarding_state(company_id=company_id)


@router.put("/company-drafts")
def update_company_drafts_endpoint(
    company_id: str = Query(...),
    drafts: List[Dict[str, Any]] = Body(...),
    user = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    check_company_membership(db, company_id, user, required_roles=["OWNER", "ADMIN", "ACCOUNTANT"])
    service = OnboardingService(db)
    return service.update_company_drafts(company_id=company_id, drafts=drafts)


@router.get("/drafts", response_model=List[DraftRecordItem])
def list_draft_records(
    company_id: str = Query(...),
    category: Optional[str] = Query(None),
    user = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    check_company_membership(db, company_id, user)
    query = db.query(OpeningBalanceDraftRecordModel).filter(
        OpeningBalanceDraftRecordModel.company_id == company_id
    )
    if category:
        query = query.filter(OpeningBalanceDraftRecordModel.category == category.upper().strip())
    
    records = query.order_by(OpeningBalanceDraftRecordModel.id.asc()).all()
    return [
        DraftRecordItem(
            id=r.id,
            batch_id=r.batch_id,
            company_id=r.company_id,
            category=r.category,
            source_doc_id=r.source_doc_id,
            account_code=r.account_code,
            account_name=r.account_name,
            entity_name=r.entity_name,
            item_code=r.item_code,
            invoice_no=r.invoice_no,
            invoice_date=r.invoice_date,
            credit_term=r.credit_term,
            debit=r.debit,
            credit=r.credit,
            quantity=r.quantity,
            unit_cost=r.unit_cost,
            amount=r.amount,
            review_status=r.review_status,
            notes=r.notes
        )
        for r in records
    ]


@router.post("/drafts", response_model=DraftRecordItem)
def create_draft_record(
    company_id: str = Query(...),
    req: DraftRecordCreate = ...,
    user = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    check_company_membership(db, company_id, user, required_roles=["OWNER", "ADMIN", "ACCOUNTANT"])
    service = OnboardingService(db)
    batch = service.get_or_create_batch(company_id)
    
    amount = req.amount or (req.quantity * req.unit_cost if req.quantity and req.unit_cost else (req.debit or req.credit or 0.0))
    rec = OpeningBalanceDraftRecordModel(
        batch_id=batch.id,
        company_id=company_id,
        category=req.category.upper().strip(),
        account_code=req.account_code,
        account_name=req.account_name,
        entity_name=req.entity_name,
        item_code=req.item_code,
        invoice_no=req.invoice_no,
        invoice_date=req.invoice_date,
        credit_term=req.credit_term,
        debit=req.debit or 0.0,
        credit=req.credit or 0.0,
        quantity=req.quantity or 0.0,
        unit_cost=req.unit_cost or 0.0,
        amount=amount,
        review_status="EDITED",
        notes=req.notes
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    return DraftRecordItem(
        id=rec.id,
        batch_id=rec.batch_id,
        company_id=rec.company_id,
        category=rec.category,
        account_code=rec.account_code,
        account_name=rec.account_name,
        entity_name=rec.entity_name,
        item_code=rec.item_code,
        invoice_no=rec.invoice_no,
        invoice_date=rec.invoice_date,
        credit_term=rec.credit_term,
        debit=rec.debit,
        credit=rec.credit,
        quantity=rec.quantity,
        unit_cost=rec.unit_cost,
        amount=rec.amount,
        review_status=rec.review_status,
        notes=rec.notes
    )


@router.put("/drafts/{draft_id}", response_model=DraftRecordItem)
def update_draft_record(
    draft_id: int,
    req: DraftRecordUpdate,
    user = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    rec = db.query(OpeningBalanceDraftRecordModel).filter(OpeningBalanceDraftRecordModel.id == draft_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Draft record not found.")

    check_company_membership(db, rec.company_id, user, required_roles=["OWNER", "ADMIN", "ACCOUNTANT"])

    if req.account_code is not None:
        rec.account_code = req.account_code
    if req.account_name is not None:
        rec.account_name = req.account_name
    if req.entity_name is not None:
        rec.entity_name = req.entity_name
    if req.item_code is not None:
        rec.item_code = req.item_code
    if req.invoice_no is not None:
        rec.invoice_no = req.invoice_no
    if req.invoice_date is not None:
        rec.invoice_date = req.invoice_date
    if req.credit_term is not None:
        rec.credit_term = req.credit_term
    if req.debit is not None:
        rec.debit = req.debit
    if req.credit is not None:
        rec.credit = req.credit
    if req.quantity is not None:
        rec.quantity = req.quantity
    if req.unit_cost is not None:
        rec.unit_cost = req.unit_cost
    if req.amount is not None:
        rec.amount = req.amount
    elif rec.category == "STOCK" and req.quantity is not None and req.unit_cost is not None:
        rec.amount = req.quantity * req.unit_cost
    if req.review_status is not None:
        rec.review_status = req.review_status
    else:
        rec.review_status = "EDITED"
    if req.notes is not None:
        rec.notes = req.notes

    db.commit()
    db.refresh(rec)

    return DraftRecordItem(
        id=rec.id,
        batch_id=rec.batch_id,
        company_id=rec.company_id,
        category=rec.category,
        account_code=rec.account_code,
        account_name=rec.account_name,
        entity_name=rec.entity_name,
        item_code=rec.item_code,
        invoice_no=rec.invoice_no,
        invoice_date=rec.invoice_date,
        credit_term=rec.credit_term,
        debit=rec.debit,
        credit=rec.credit,
        quantity=rec.quantity,
        unit_cost=rec.unit_cost,
        amount=rec.amount,
        review_status=rec.review_status,
        notes=rec.notes
    )


@router.delete("/drafts/{draft_id}")
def delete_draft_record(
    draft_id: int,
    user = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    rec = db.query(OpeningBalanceDraftRecordModel).filter(OpeningBalanceDraftRecordModel.id == draft_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Draft record not found.")

    check_company_membership(db, rec.company_id, user, required_roles=["OWNER", "ADMIN", "ACCOUNTANT"])
    db.delete(rec)
    db.commit()
    return {"success": True, "deleted_id": draft_id}


@router.get("/validate", response_model=OpeningBalanceValidationResponse)
def validate_opening_balances(
    company_id: str = Query(...),
    user = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    check_company_membership(db, company_id, user)
    service = OnboardingService(db)
    return service.validate_opening_balances(company_id)


@router.post("/post")
def post_opening_balances(
    company_id: str = Query(...),
    req: OpeningBalancePostRequest = ...,
    user = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    check_company_membership(db, company_id, user, required_roles=["OWNER", "ADMIN", "ACCOUNTANT"])
    service = OnboardingService(db)
    confirmed_by = user.full_name if user else "Admin"
    return service.post_opening_balances(company_id=company_id, req=req, confirmed_by=confirmed_by)


# ─── V7 Redesign: 3-Step Registration & AI Onboarding Session Endpoints ─────

def _format_session_response(session, service: OnboardingService) -> RegistrationSessionStateResponse:
    comp_data = json.loads(session.company_data_json) if session.company_data_json else {}
    files_raw = json.loads(session.uploaded_files_json) if session.uploaded_files_json else []
    drafts_raw = json.loads(session.extracted_data_json) if session.extracted_data_json else []
    val_raw = json.loads(session.validation_results_json) if session.validation_results_json else None

    uploaded_files = [
        TemporaryUploadedFile(
            file_id=f.get("file_id", ""),
            original_filename=f.get("original_filename", "document.pdf"),
            file_size=f.get("file_size", 0),
            mime_type=f.get("mime_type", "application/pdf"),
            detected_category=f.get("detected_category"),
            document_type=f.get("document_type"),
            status=f.get("status", "UPLOADED"),
            error_message=f.get("error_message")
        ) for f in files_raw
    ]

    extracted_data = [
        SessionDraftItem(
            id=str(d.get("id")),
            category=d.get("category", "TRIAL_BALANCE"),
            account_code=d.get("account_code"),
            account_name=d.get("account_name"),
            entity_name=d.get("entity_name"),
            item_code=d.get("item_code"),
            invoice_no=d.get("invoice_no"),
            invoice_date=d.get("invoice_date"),
            credit_term=d.get("credit_term"),
            debit=float(d.get("debit", 0.0)),
            credit=float(d.get("credit", 0.0)),
            quantity=float(d.get("quantity", 0.0)),
            unit_cost=float(d.get("unit_cost", 0.0)),
            amount=float(d.get("amount", 0.0)),
            review_status=d.get("review_status", "VERIFIED"),
            notes=d.get("notes"),
            source_filename=d.get("source_filename")
        ) for d in drafts_raw
    ]

    validation = OpeningBalanceValidationResponse(**val_raw) if val_raw else None

    return RegistrationSessionStateResponse(
        session_id=session.session_id,
        email=session.email,
        full_name=session.full_name,
        step=session.step,
        status=session.status,
        company_data=comp_data,
        uploaded_files=uploaded_files,
        extracted_data=extracted_data,
        validation=validation
    )


@router.post("/session/start", response_model=RegistrationSessionStateResponse)
def start_registration_session(req: RegistrationStartRequest, db: Session = Depends(get_db)):
    """
    Initializes a secure temporary registration session.
    No permanent user or company records are created at this stage.
    """
    service = OnboardingService(db)
    session = service.start_registration_session(req)
    return _format_session_response(session, service)


@router.get("/session/{session_id}", response_model=RegistrationSessionStateResponse)
def get_registration_session(session_id: str, db: Session = Depends(get_db)):
    """
    Returns the current state of the temporary registration session.
    """
    service = OnboardingService(db)
    session = service.get_registration_session(session_id)
    return _format_session_response(session, service)


@router.put("/session/{session_id}/company", response_model=RegistrationSessionStateResponse)
def save_company_profile_step(session_id: str, req: CompanyProfileStepRequest, db: Session = Depends(get_db)):
    """
    Step 1: Saves temporary company profile into the registration session.
    Does not save into permanent company tables.
    """
    service = OnboardingService(db)
    session = service.save_company_profile_step(session_id, req)
    return _format_session_response(session, service)


@router.post("/session/{session_id}/upload")
def upload_session_document(session_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Step 2: Uploads a company document into temporary isolated storage.
    No document category selection required.
    """
    service = OnboardingService(db)
    file_entry = service.upload_session_document(session_id, file)
    return file_entry


@router.delete("/session/{session_id}/files/{file_id}")
def delete_session_document(session_id: str, file_id: str, db: Session = Depends(get_db)):
    """
    Step 2: Removes an uploaded file from temporary storage.
    """
    service = OnboardingService(db)
    service.delete_session_document(session_id, file_id)
    return {"message": "File removed successfully"}


@router.post("/session/{session_id}/extract", response_model=RegistrationSessionStateResponse)
def extract_session_documents(
    session_id: str,
    file_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Step 3: AI processes uploaded documents using DocumentProcessingAgent,
    automatically identifies categories, extracts lines, and prepares structured editable review drafts.
    Accepts optional file_id to retry processing for a single failed document.
    """
    service = OnboardingService(db)
    service.extract_session_documents(session_id, file_id=file_id)
    session = service.get_registration_session(session_id)
    return _format_session_response(session, service)


@router.get("/session/{session_id}/files/{file_id}")
def get_session_document_file(session_id: str, file_id: str, db: Session = Depends(get_db)):
    """
    Returns the original uploaded PDF file for viewing/reviewing in the browser.
    """
    service = OnboardingService(db)
    file_path, filename = service.get_session_document_path(session_id, file_id)
    return FileResponse(file_path, filename=filename, media_type="application/pdf", content_disposition_type="inline")


@router.put("/session/{session_id}/drafts", response_model=RegistrationSessionStateResponse)
def update_session_drafts(session_id: str, drafts: List[Dict[str, Any]], db: Session = Depends(get_db)):
    """
    Step 3: Saves user edits, corrections, additions, or deletions on extracted drafts.
    """
    service = OnboardingService(db)
    service.update_session_drafts(session_id, drafts)
    session = service.get_registration_session(session_id)
    return _format_session_response(session, service)


@router.get("/session/{session_id}/validate", response_model=OpeningBalanceValidationResponse)
def validate_session_drafts(session_id: str, db: Session = Depends(get_db)):
    """
    Step 3: Runs deterministic accounting validation on the session draft items.
    """
    service = OnboardingService(db)
    return service.validate_session_drafts(session_id)


@router.post("/session/{session_id}/confirm")
def confirm_registration_session(session_id: str, req: RegistrationFinalConfirmRequest, db: Session = Depends(get_db)):
    """
    Step 3 Final Confirmation:
    Atomically creates the permanent user account, company record, OWNER membership,
    moves uploaded files to permanent storage, posts opening balance journals, and activates the company.
    """
    service = OnboardingService(db)
    return service.confirm_registration_session(session_id, req)


@router.post("/session/{session_id}/cancel")
def cancel_registration_session(session_id: str, db: Session = Depends(get_db)):
    """
    Discards the temporary registration session and removes all temporary uploaded files.
    Leaves no permanent database records.
    """
    service = OnboardingService(db)
    service.cancel_registration_session(session_id)
    return {"message": "Registration session cancelled and temporary files discarded."}

