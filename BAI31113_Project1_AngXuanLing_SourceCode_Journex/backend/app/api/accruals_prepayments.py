from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import AccrualPrepaymentModel, AccrualAdjustmentRecordModel, CompanyModel
from app.services.accrual_prepayment_service import AccrualPrepaymentService
from app.schemas.accrual_prepayment import (
    AccrualPrepaymentCreate,
    AccrualPrepaymentResponse,
    AccrualAdjustmentRecordResponse,
    AccrualAdjustmentRequest,
    AccrualSettlementRequest,
    AccrualReversalRequest,
    AccrualCancellationRequest,
    AmortizationScheduleItem,
    AccrualSummaryResponse
)

router = APIRouter(prefix="/api/accruals-prepayments", tags=["Accruals and Prepayments"])


def _resolve_company_id(company_id: Optional[str], db: Session) -> str:
    if isinstance(company_id, str) and company_id.strip():
        return company_id.strip()
    active_comp = db.query(CompanyModel).filter(CompanyModel.is_active == True).order_by(CompanyModel.id.desc()).first()
    return active_comp.company_id if active_comp else "COMP-000001"


@router.get("/summary", response_model=AccrualSummaryResponse)
def get_accruals_summary(
    company_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    comp_id = _resolve_company_id(company_id, db)
    service = AccrualPrepaymentService(db)
    return service.get_summary(company_id=comp_id)


@router.get("/", response_model=List[AccrualPrepaymentResponse])
def list_accruals_prepayments(
    company_id: Optional[str] = Query(None),
    type: Optional[str] = Query(None, description="Filter by transaction type"),
    status: Optional[str] = Query(None, description="Filter by status: ACTIVE, FULLY_ADJUSTED, CANCELLED"),
    search: Optional[str] = Query(None, description="Search by title, vendor, or number"),
    from_date: Optional[str] = Query(None, description="Filter by start date"),
    to_date: Optional[str] = Query(None, description="Filter by end date"),
    db: Session = Depends(get_db)
):
    comp_id = _resolve_company_id(company_id, db)
    query = db.query(AccrualPrepaymentModel).filter(AccrualPrepaymentModel.company_id == comp_id)
    if type:
        query = query.filter(AccrualPrepaymentModel.transaction_type == type)
    if status:
        query = query.filter(AccrualPrepaymentModel.status == status)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            (AccrualPrepaymentModel.title.ilike(s)) |
            (AccrualPrepaymentModel.transaction_number.ilike(s)) |
            (AccrualPrepaymentModel.vendor_customer_name.ilike(s))
        )
    records = query.order_by(AccrualPrepaymentModel.id.desc()).all()

    # Load history
    responses = []
    for r in records:
        history = db.query(AccrualAdjustmentRecordModel).filter(
            AccrualAdjustmentRecordModel.parent_id == r.id
        ).order_by(AccrualAdjustmentRecordModel.id.asc()).all()
        
        resp = AccrualPrepaymentResponse.model_validate(r)
        resp.history = [AccrualAdjustmentRecordResponse.model_validate(h) for h in history]
        responses.append(resp)

    if from_date or to_date:
        from app.utils.date_utils import is_date_in_range
        responses = [r for r in responses if is_date_in_range(r.transaction_date, from_date, to_date) or (r.start_date and is_date_in_range(r.start_date, from_date, to_date))]
    return responses


@router.post("/", response_model=AccrualPrepaymentResponse)
def create_accrual_prepayment(
    req: AccrualPrepaymentCreate,
    db: Session = Depends(get_db)
):
    service = AccrualPrepaymentService(db)
    try:
        record = service.create_record(req)
        history = db.query(AccrualAdjustmentRecordModel).filter(
            AccrualAdjustmentRecordModel.parent_id == record.id
        ).order_by(AccrualAdjustmentRecordModel.id.asc()).all()
        resp = AccrualPrepaymentResponse.model_validate(record)
        resp.history = [AccrualAdjustmentRecordResponse.model_validate(h) for h in history]
        return resp
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{record_id}", response_model=AccrualPrepaymentResponse)
def get_accrual_prepayment_details(
    record_id: int,
    db: Session = Depends(get_db)
):
    record = db.query(AccrualPrepaymentModel).filter(AccrualPrepaymentModel.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"Record {record_id} not found.")

    history = db.query(AccrualAdjustmentRecordModel).filter(
        AccrualAdjustmentRecordModel.parent_id == record.id
    ).order_by(AccrualAdjustmentRecordModel.id.asc()).all()

    resp = AccrualPrepaymentResponse.model_validate(record)
    resp.history = [AccrualAdjustmentRecordResponse.model_validate(h) for h in history]
    return resp


@router.get("/{record_id}/schedule-preview", response_model=List[AmortizationScheduleItem])
def preview_schedule(
    record_id: int,
    db: Session = Depends(get_db)
):
    record = db.query(AccrualPrepaymentModel).filter(AccrualPrepaymentModel.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"Record {record_id} not found.")

    service = AccrualPrepaymentService(db)
    try:
        schedule = service.calculate_amortization_schedule(
            original_amount=record.original_amount,
            exchange_rate=record.exchange_rate,
            start_date_str=record.start_date,
            end_date_str=record.end_date
        )
        return schedule
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{record_id}/adjust", response_model=AccrualAdjustmentRecordResponse)
def post_amortization(
    record_id: int,
    req: AccrualAdjustmentRequest,
    db: Session = Depends(get_db)
):
    service = AccrualPrepaymentService(db)
    try:
        adj = service.post_amortization_adjustment(record_id, req)
        return AccrualAdjustmentRecordResponse.model_validate(adj)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{record_id}/settle", response_model=AccrualAdjustmentRecordResponse)
def post_settlement(
    record_id: int,
    req: AccrualSettlementRequest,
    db: Session = Depends(get_db)
):
    service = AccrualPrepaymentService(db)
    try:
        adj = service.post_settlement(record_id, req)
        return AccrualAdjustmentRecordResponse.model_validate(adj)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{record_id}/reverse", response_model=AccrualAdjustmentRecordResponse)
def post_reversal(
    record_id: int,
    req: AccrualReversalRequest,
    db: Session = Depends(get_db)
):
    service = AccrualPrepaymentService(db)
    try:
        adj = service.post_reversal(record_id, req)
        return AccrualAdjustmentRecordResponse.model_validate(adj)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{record_id}/cancel", response_model=AccrualAdjustmentRecordResponse)
def post_cancellation(
    record_id: int,
    req: AccrualCancellationRequest,
    db: Session = Depends(get_db)
):
    service = AccrualPrepaymentService(db)
    try:
        adj = service.post_cancellation_and_refund(record_id, req)
        return AccrualAdjustmentRecordResponse.model_validate(adj)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
