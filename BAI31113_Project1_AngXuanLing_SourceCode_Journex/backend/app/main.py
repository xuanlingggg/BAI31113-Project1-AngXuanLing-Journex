import sys
import os
import logging

# Suppress verbose font descriptor warnings from pdfminer
logging.getLogger('pdfminer').setLevel(logging.ERROR)

# Ensure backend folder is in Python module search path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db.database import engine, Base, ensure_db_schema
from app.api.documents import router as documents_router
from app.api.companies import router as companies_router
from app.api.transactions import router as transactions_router
from app.api.journals import router as journals_router
from app.api.settings import router as settings_router
from app.api.ledger import router as ledger_router
from app.api.agents import router as agents_router
from app.api.email_ingestion import router as email_ingestion_router
from app.api.folder_ingestion import router as folder_ingestion_router
from app.api.bank_ingestion import router as bank_ingestion_router
from app.api.fixed_assets import router as fixed_assets_router
from app.api.accruals_prepayments import router as accruals_prepayments_router
from app.api.auth import router as auth_router
from app.api.onboarding import router as onboarding_router

# Auto-migrate SQLite schema
ensure_db_schema()

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Agentic Accounting System - Document Processing & Verification API",
    description="Step 1 & Step 2: Document Processing Agent & Accounting Agent",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents_router)
app.include_router(companies_router)
app.include_router(transactions_router)
app.include_router(journals_router)
app.include_router(settings_router)
app.include_router(ledger_router)
app.include_router(agents_router)
app.include_router(email_ingestion_router)
app.include_router(folder_ingestion_router)
app.include_router(bank_ingestion_router)
app.include_router(fixed_assets_router)
app.include_router(accruals_prepayments_router)
app.include_router(auth_router)
app.include_router(onboarding_router)


@app.on_event("shutdown")
def shutdown_event():
    from app.services.email_ingestion.background_worker import worker_singleton
    from app.services.folder_ingestion.background_worker import folder_worker_singleton
    from app.services.bank_ingestion.background_worker import bank_worker_singleton
    worker_singleton.stop()
    folder_worker_singleton.stop()
    bank_worker_singleton.stop()


@app.get("/")
def root():
    return {
        "system": "Agentic AI Accounting System",
        "module": "Document Processing & Extraction Module",
        "status": "Online",
        "version": "1.2.0"
    }


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
