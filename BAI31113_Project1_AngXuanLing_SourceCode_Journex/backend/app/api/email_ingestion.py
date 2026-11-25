"""
Gmail Email Ingestion API Router.
Exposes endpoints for:
- Manual email fetch
- Starting/stopping background polling
- Querying ingestion worker and OAuth status
"""

from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.database import get_db, SessionLocal
from app.services.email_ingestion.background_worker import worker_singleton

router = APIRouter(prefix="/api/email-ingestion", tags=["Gmail Email Ingestion"])


class StartWorkerRequest(BaseModel):
    poll_interval_seconds: Optional[int] = Field(None, ge=10, le=86400, description="Polling interval in seconds")


class FetchEmailRequest(BaseModel):
    company_id: Optional[str] = Field(None, description="Optional target company ID")


class AuthorizeRequest(BaseModel):
    open_browser: Optional[bool] = Field(default=True, description="Open local browser automatically for authorization")
    timeout_seconds: Optional[int] = Field(default=120, ge=10, le=600, description="OAuth flow timeout in seconds")


@router.post("/authorize")
async def authorize_gmail(req: Optional[AuthorizeRequest] = Body(default=None)):
    """
    Triggers Google OAuth 2.0 re-authorization flow.
    Launches InstalledAppFlow with offline access and prompt=consent to obtain
    a fresh refresh token, saving token.json automatically upon completion.
    """
    open_browser = req.open_browser if req and req.open_browser is not None else True
    timeout_seconds = req.timeout_seconds if req and req.timeout_seconds is not None else 120

    result = await worker_singleton.reauthorize(
        open_browser=open_browser,
        timeout_seconds=timeout_seconds
    )

    if not result.get("success"):
        raise HTTPException(
            status_code=400,
            detail=result.get("message", "Gmail authorization failed.")
        )
    return result


@router.get("/status")
def get_ingestion_status():
    """
    Returns current worker state, polling interval, last check time, last result,
    and OAuth authorization status without exposing any secrets.
    """
    return worker_singleton.get_status()


@router.post("/fetch")
async def trigger_manual_fetch(
    req: Optional[FetchEmailRequest] = Body(default=None),
    db: Session = Depends(get_db)
):
    """
    Triggers a one-time manual email check from the company inbox.
    Independent from the background polling worker.
    """
    company_id = req.company_id if req else None
    result = await worker_singleton.run_fetch_cycle(
        db_session_factory=SessionLocal,
        company_id=company_id
    )

    if result.get("status") == "UNAUTHORIZED":
        raise HTTPException(
            status_code=401,
            detail=result.get("message", "Gmail is not authorized.")
        )
    elif result.get("status") == "CONCURRENT_BUSY":
        raise HTTPException(
            status_code=409,
            detail="A fetch or polling operation is already currently in progress. Please wait."
        )
    elif result.get("status") == "ERROR":
        raise HTTPException(
            status_code=500,
            detail=result.get("message", "Internal error during email fetch.")
        )

    return result


@router.post("/start")
async def start_ingestion_worker(req: Optional[StartWorkerRequest] = Body(default=None)):
    """
    Starts the Gmail background collection worker.
    Uses configurable interval (default 300s).
    """
    interval = req.poll_interval_seconds if req else None
    result = worker_singleton.start(
        db_session_factory=SessionLocal,
        poll_interval=interval
    )
    if not result.get("started") and "not authorized" in result.get("message", "").lower():
        raise HTTPException(
            status_code=400,
            detail=result.get("message")
        )
    return result


@router.post("/stop")
async def stop_ingestion_worker():
    """
    Stops the background Gmail polling worker safely.
    Does not interrupt an attachment currently being processed.
    """
    return worker_singleton.stop()
