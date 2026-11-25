"""
Local Folder Document Ingestion API Router.
Exposes endpoints for:
- Manual folder scan
- Starting/stopping background polling worker
- Querying folder monitoring status and metrics
"""

from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.database import get_db, SessionLocal
from app.services.folder_ingestion.background_worker import folder_worker_singleton

router = APIRouter(prefix="/api/folder-ingestion", tags=["Local Folder Document Ingestion"])


class StartFolderWorkerRequest(BaseModel):
    poll_interval_seconds: Optional[int] = Field(None, ge=1, le=86400, description="Polling interval in seconds")


class ScanFolderRequest(BaseModel):
    company_id: Optional[str] = Field(None, description="Optional target company ID")


@router.get("/status")
def get_folder_ingestion_status():
    """
    Returns current worker state, monitored folder path, polling interval,
    last scan time, and last result metrics.
    """
    return folder_worker_singleton.get_status()


@router.post("/scan")
async def trigger_manual_scan(
    req: Optional[ScanFolderRequest] = Body(default=None),
    company_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Triggers a one-time manual scan and ingestion of documents in the local folder.
    Operates independently from the background polling worker.
    """
    cid = (req.company_id if req else None) or company_id
    result = await folder_worker_singleton.run_scan_cycle(
        db_session_factory=SessionLocal,
        company_id=cid
    )

    if result.get("status") == "CONCURRENT_BUSY":
        raise HTTPException(
            status_code=409,
            detail="A folder scan or ingestion operation is already currently in progress. Please wait."
        )
    elif result.get("status") == "ERROR" and not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("message", "Error occurred during folder scan.")
        )

    return result


@router.post("/start")
async def start_folder_worker(req: Optional[StartFolderWorkerRequest] = Body(default=None)):
    """
    Starts the local folder background collection worker.
    Uses configurable interval (default 5s).
    """
    interval = req.poll_interval_seconds if req else None
    result = folder_worker_singleton.start(
        db_session_factory=SessionLocal,
        poll_interval=interval
    )
    return result


@router.post("/stop")
async def stop_folder_worker():
    """
    Stops the local folder background collection worker safely.
    Does not interrupt a document currently being processed.
    """
    return folder_worker_singleton.stop()
