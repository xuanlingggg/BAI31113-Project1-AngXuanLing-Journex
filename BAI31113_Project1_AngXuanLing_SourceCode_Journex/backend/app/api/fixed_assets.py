from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import CompanyModel
from app.services.fixed_asset_service import FixedAssetService
from app.schemas.fixed_asset import (
    FixedAssetCreate,
    FixedAssetResponse,
    FixedAssetDisposalRequest,
    FixedAssetDisposalPreview
)

router = APIRouter(prefix="/api/fixed-assets", tags=["Fixed Assets"])


@router.get("/", response_model=List[FixedAssetResponse])
def list_fixed_assets(
    company_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None, description="Filter by ACTIVE or DISPOSED"),
    db: Session = Depends(get_db)
):
    comp_id = company_id if isinstance(company_id, str) and company_id.strip() else None
    if not comp_id:
        active_comp = db.query(CompanyModel).filter(CompanyModel.is_active == True).order_by(CompanyModel.id.desc()).first()
        comp_id = active_comp.company_id if active_comp else "COMP-000001"
    service = FixedAssetService(db)
    return service.get_all_assets(company_id=comp_id, status=status)


@router.post("/", response_model=FixedAssetResponse)
def create_fixed_asset(
    req: FixedAssetCreate,
    db: Session = Depends(get_db)
):
    service = FixedAssetService(db)
    try:
        asset = service.create_fixed_asset(req)
        return asset
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{asset_id}", response_model=FixedAssetResponse)
def get_fixed_asset(
    asset_id: int,
    db: Session = Depends(get_db)
):
    service = FixedAssetService(db)
    asset = service.get_asset_by_id(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset with ID {asset_id} not found.")
    return asset


@router.get("/{asset_id}/depreciation-calc")
def calculate_depreciation(
    asset_id: int,
    target_date: str = Query(..., description="Target calculation date in YYYY-MM-DD format"),
    db: Session = Depends(get_db)
):
    service = FixedAssetService(db)
    asset = service.get_asset_by_id(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset with ID {asset_id} not found.")
    try:
        calculated_depr = service.calculate_depreciation_to_date(asset, target_date)
        return {
            "asset_id": asset.id,
            "asset_code": asset.asset_code,
            "acquisition_date": asset.acquisition_date,
            "target_date": target_date,
            "purchase_cost": asset.purchase_cost,
            "salvage_value": asset.salvage_value,
            "useful_life_years": asset.useful_life_years,
            "calculated_depreciation": calculated_depr,
            "estimated_nbv": round(max(0.0, asset.purchase_cost - calculated_depr), 2)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{asset_id}/disposal-preview", response_model=FixedAssetDisposalPreview)
def preview_fixed_asset_disposal(
    asset_id: int,
    req: FixedAssetDisposalRequest,
    db: Session = Depends(get_db)
):
    service = FixedAssetService(db)
    try:
        return service.preview_disposal(asset_id, req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{asset_id}/dispose")
def dispose_fixed_asset(
    asset_id: int,
    req: FixedAssetDisposalRequest,
    db: Session = Depends(get_db)
):
    service = FixedAssetService(db)
    try:
        asset, journal = service.execute_disposal(asset_id, req)
        return {
            "message": f"Fixed asset '{asset.asset_code}' disposed successfully.",
            "asset": FixedAssetResponse.model_validate(asset),
            "journal_id": journal.journal_id,
            "total_debit": journal.total_debit,
            "total_credit": journal.total_credit,
            "is_balanced": journal.is_balanced,
            "status": journal.status
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
