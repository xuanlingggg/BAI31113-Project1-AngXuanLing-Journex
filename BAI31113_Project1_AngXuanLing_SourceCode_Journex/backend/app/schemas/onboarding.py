from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class CompanyCreateOnboarding(BaseModel):
    company_id: Optional[str] = None
    company_name: str = Field(..., min_length=2)
    registration_number: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    currency: Optional[str] = "MYR"
    financial_year: Optional[int] = 2026
    financial_year_start: Optional[str] = None  # YYYY-MM-DD e.g. "2026-01-01"
    financial_year_end: Optional[str] = None    # YYYY-MM-DD e.g. "2026-12-31"


class CompanyOnboardingStatusResponse(BaseModel):
    company_id: str
    company_name: str
    onboarding_status: str
    onboarding_step: int
    financial_year_start: Optional[str] = None
    financial_year_end: Optional[str] = None
    is_active: bool
    is_onboarded: bool


class OpeningBalanceDocumentResponse(BaseModel):
    id: int
    company_id: str
    doc_category: str
    original_filename: str
    file_size: int
    mime_type: str
    extraction_status: str
    error_message: Optional[str] = None
    created_at: Any


class DraftRecordItem(BaseModel):
    id: int
    batch_id: int
    company_id: str
    category: str
    source_doc_id: Optional[int] = None
    account_code: Optional[str] = None
    account_name: Optional[str] = None
    entity_name: Optional[str] = None
    item_code: Optional[str] = None
    invoice_no: Optional[str] = None
    invoice_date: Optional[str] = None
    credit_term: Optional[str] = None
    debit: float = 0.0
    credit: float = 0.0
    quantity: float = 0.0
    unit_cost: float = 0.0
    amount: float = 0.0
    review_status: str = "PENDING"
    notes: Optional[str] = None


class DraftRecordCreate(BaseModel):
    category: str
    account_code: Optional[str] = None
    account_name: Optional[str] = None
    entity_name: Optional[str] = None
    item_code: Optional[str] = None
    invoice_no: Optional[str] = None
    invoice_date: Optional[str] = None
    credit_term: Optional[str] = None
    debit: Optional[float] = 0.0
    credit: Optional[float] = 0.0
    quantity: Optional[float] = 0.0
    unit_cost: Optional[float] = 0.0
    amount: Optional[float] = 0.0
    notes: Optional[str] = None


class DraftRecordUpdate(BaseModel):
    account_code: Optional[str] = None
    account_name: Optional[str] = None
    entity_name: Optional[str] = None
    item_code: Optional[str] = None
    invoice_no: Optional[str] = None
    invoice_date: Optional[str] = None
    credit_term: Optional[str] = None
    debit: Optional[float] = None
    credit: Optional[float] = None
    quantity: Optional[float] = None
    unit_cost: Optional[float] = None
    amount: Optional[float] = None
    review_status: Optional[str] = None
    notes: Optional[str] = None


class SubledgerTieOutCheck(BaseModel):
    category: str
    subledger_total: float
    gl_control_account: str
    gl_control_name: str
    gl_control_amount: float
    difference: float
    is_reconciled: bool


class OpeningBalanceValidationResponse(BaseModel):
    is_valid: bool
    as_at_date: str
    total_debit: float
    total_credit: float
    tb_diff: float
    tb_balanced: bool
    subledger_checks: List[SubledgerTieOutCheck] = []
    errors: List[str] = []
    warnings: List[str] = []


class OpeningBalancePostRequest(BaseModel):
    as_at_date: Optional[str] = None  # e.g. "2025-12-31"
    confirmation_notes: Optional[str] = "Opening balances reviewed and confirmed."


# ─── 3-Step Registration & Onboarding Schemas ───────────────────────────────

class RegistrationStartRequest(BaseModel):
    full_name: Optional[str] = "User"
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=3)


class CompanyProfileStepRequest(BaseModel):
    company_name: str = Field(..., min_length=2)
    registration_number: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    currency: Optional[str] = "MYR"
    financial_year: Optional[int] = 2026
    financial_year_start: Optional[str] = None
    financial_year_end: Optional[str] = None
    tax_number: Optional[str] = None


class TemporaryUploadedFile(BaseModel):
    file_id: str
    original_filename: str
    file_size: int
    mime_type: str = "application/pdf"
    detected_category: Optional[str] = None
    document_type: Optional[str] = None
    status: str = "UPLOADED"
    error_message: Optional[str] = None


class SessionDraftItem(BaseModel):
    id: str
    category: str  # TRIAL_BALANCE, DEBTOR, CREDITOR, OTHER_CREDITOR, STOCK
    account_code: Optional[str] = None
    account_name: Optional[str] = None
    entity_name: Optional[str] = None
    item_code: Optional[str] = None
    invoice_no: Optional[str] = None
    invoice_date: Optional[str] = None
    credit_term: Optional[str] = None
    debit: float = 0.0
    credit: float = 0.0
    quantity: float = 0.0
    unit_cost: float = 0.0
    amount: float = 0.0
    review_status: str = "VERIFIED"  # VERIFIED, NEEDS_REVIEW, UNEXTRACTED
    notes: Optional[str] = None
    source_filename: Optional[str] = None


class RegistrationSessionStateResponse(BaseModel):
    session_id: str
    email: str
    full_name: str
    step: int
    status: str
    company_data: Optional[Dict[str, Any]] = None
    uploaded_files: List[TemporaryUploadedFile] = []
    extracted_data: List[SessionDraftItem] = []
    validation: Optional[OpeningBalanceValidationResponse] = None


class RegistrationFinalConfirmRequest(BaseModel):
    confirmation_notes: Optional[str] = "Confirmed and approved for permanent registration."
