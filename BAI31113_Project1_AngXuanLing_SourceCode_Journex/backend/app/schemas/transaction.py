from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from app.schemas.document import AccountingAnalysisSchema


class TransactionResponse(BaseModel):
    id: int
    transaction_id: str
    company_id: str
    document_id: str
    source_document: Optional[str] = None
    document_type: Optional[str] = None
    transaction_date: Optional[str] = None
    accounting_event: Optional[str] = None
    book_of_prime_entry: Optional[str] = None
    accounting_analysis: Optional[Dict[str, Any]] = None
    extracted_data: Optional[Dict[str, Any]] = None
    amount: float = 0.0
    currency: Optional[str] = "MYR"
    original_currency: Optional[str] = None
    original_amount: Optional[float] = None
    exchange_rate: Optional[float] = None
    exchange_rate_date: Optional[str] = None
    exchange_rate_provider: Optional[str] = None
    exchange_rate_session: Optional[str] = None
    converted_amount_myr: Optional[float] = None
    confidence_score: float = 1.0
    needs_review: bool = False
    review_reason: Optional[str] = None
    status: str = "Completed"
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class TransactionListResponse(BaseModel):
    total: int
    transactions: List[TransactionResponse]
