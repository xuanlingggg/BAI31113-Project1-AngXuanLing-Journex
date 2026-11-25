"""
Standalone ABC Bank Simulator Server.
Provides mock REST API endpoints on port 8010 for testing bank ingestion:
- GET /api/health
- GET /api/account
- GET /api/transactions
- GET /api/transactions/{txn_id}/pdf
"""

import os
from pathlib import Path
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="ABC Bank Berhad Simulator", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DOCS_DIR = Path(r"C:\Users\User\Downloads\AccountingDocument-Ms.Wani (1)\AccountingDocument-Ms.Wani\BankTransaction-Ms.Wani")

DEMO_TRANSACTIONS = [
    {"bank_transaction_id": "TXN-0001", "transaction_date": "2026-09-15", "description": "Payment from TechCore Solutions - INV-2026-0001", "reference": "INV-2026-0001", "money_in": 1060.00, "money_out": 0.00, "balance": 11060.00},
    {"bank_transaction_id": "TXN-0002", "transaction_date": "2026-09-16", "description": "Business lunch - City Business Cafe RC-2026-0012", "reference": "RC-2026-0012", "money_in": 0.00, "money_out": 80.56, "balance": 10979.44},
    {"bank_transaction_id": "TXN-0003", "transaction_date": "2026-09-17", "description": "Supplier payment - Mega Office Supplies INV-2026-0002", "reference": "INV-2026-0002", "money_in": 0.00, "money_out": 689.00, "balance": 10290.44},
    {"bank_transaction_id": "TXN-0004", "transaction_date": "2026-09-18", "description": "Office rental payment - Conway Properties", "reference": "RENT-SEP", "money_in": 0.00, "money_out": 2500.00, "balance": 7790.44},
    {"bank_transaction_id": "TXN-0005", "transaction_date": "2026-09-19", "description": "Customer settlement - Alpha Dynamics Sdn Bhd", "reference": "INV-2026-0005", "money_in": 4500.00, "money_out": 0.00, "balance": 12290.44},
    {"bank_transaction_id": "TXN-0006", "transaction_date": "2026-09-20", "description": "Shop display shelves capital expenditure", "reference": "SHELVES-01", "money_in": 0.00, "money_out": 3200.00, "balance": 9090.44},
    {"bank_transaction_id": "TXN-0007", "transaction_date": "2026-09-21", "description": "Interbank fund transfer fee", "reference": "FEE-001", "money_in": 0.00, "money_out": 5.00, "balance": 9085.44},
    {"bank_transaction_id": "TXN-0008", "transaction_date": "2026-09-22", "description": "IT equipment purchase - Dell Workstations", "reference": "EQUIP-02", "money_in": 0.00, "money_out": 2226.00, "balance": 6859.44},
]

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "ABC Bank Simulator", "version": "1.0.0"}

@app.get("/api/account")
def get_account():
    return {
        "bank_name": "ABC Bank Berhad",
        "account_number": "8880-1234-5678",
        "account_name": "NextTech Solutions Sdn Bhd",
        "currency": "MYR",
        "current_balance": 11741.00,
        "available_balance": 11741.00,
        "status": "ACTIVE"
    }

@app.get("/api/transactions")
def get_transactions(
    after_id: str = Query(None),
    start_date: str = Query(None),
    limit: int = Query(50)
):
    txns = DEMO_TRANSACTIONS
    if after_id:
        idx = next((i for i, t in enumerate(txns) if t["bank_transaction_id"] == after_id), None)
        if idx is not None:
            txns = txns[idx + 1:]
    return {
        "account_number": "8880-1234-5678",
        "transactions": txns[:limit],
        "has_more": len(txns) > limit
    }

@app.get("/api/transactions/{txn_id}/pdf")
def get_transaction_pdf(txn_id: str):
    pdf_path = DOCS_DIR / f"{txn_id}.pdf"
    if not pdf_path.exists():
        # Fallback to any existing PDF
        sample = next(DOCS_DIR.glob("*.pdf"), None)
        if sample:
            pdf_path = sample
        else:
            raise HTTPException(status_code=404, detail=f"Slip PDF for {txn_id} not found.")

    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    return Response(content=pdf_bytes, media_type="application/pdf")

if __name__ == "__main__":
    print("Starting ABC Bank Simulator on http://127.0.0.1:8010 ...")
    uvicorn.run(app, host="127.0.0.1", port=8010)
