from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class InvoiceLineItem(BaseModel):
    item_number: Optional[str] = None
    description: Optional[str] = None
    item_description: Optional[str] = None
    quantity: float = 1.0
    uom: Optional[str] = None
    unit_price: float = 0.0
    discount: Optional[float] = None
    line_total: float = 0.0
    total_amount: float = 0.0

    # Stock Take specific fields
    balance_quantity: Optional[float] = None
    physical_quantity: Optional[float] = None
    difference_quantity: Optional[float] = None
    unit_cost: Optional[float] = None
    amount: Optional[float] = None

    # Accounting / Allocation fields
    account_code: Optional[str] = None
    account_name: Optional[str] = None
    notes: Optional[str] = None
    missing_physical: bool = False

    # Multi-currency conversion fields
    original_unit_price: Optional[float] = None
    converted_unit_price_myr: Optional[float] = None
    original_total_amount: Optional[float] = None
    converted_total_amount_myr: Optional[float] = None

    def __init__(self, **data: Any):
        # Sync description and item_description for bidirectional compatibility
        desc = data.get("description") or data.get("item_description") or ""
        data["description"] = desc
        data["item_description"] = desc

        # Sync line_total and total_amount / amount for bidirectional compatibility
        tot = data.get("line_total")
        if tot is None:
            tot = data.get("total_amount")
        if tot is None:
            tot = data.get("amount", 0.0)
        data["line_total"] = float(tot or 0.0)
        data["total_amount"] = float(tot or 0.0)
        if "amount" not in data or data.get("amount") is None:
            data["amount"] = data["line_total"]

        # Sync unit_price and unit_cost
        if (data.get("unit_price") is None or data.get("unit_price") == 0.0) and data.get("unit_cost") is not None:
            data["unit_price"] = float(data["unit_cost"])
        elif data.get("unit_cost") is None and data.get("unit_price") is not None:
            data["unit_cost"] = float(data["unit_price"])

        super().__init__(**data)


class BankTransactionItem(BaseModel):
    date: Optional[str] = None
    transaction_date: Optional[str] = None
    description: str
    reference_no: Optional[str] = None
    reference: Optional[str] = None
    debit: Optional[float] = None
    debit_amount: float = 0.0
    credit: Optional[float] = None
    credit_amount: float = 0.0
    amount: Optional[float] = None
    balance: Optional[float] = 0.0


class BusinessRolesSchema(BaseModel):
    our_company: Optional[str] = None
    customer: Optional[str] = None
    vendor: Optional[str] = None
    supplier: Optional[str] = None
    merchant: Optional[str] = None
    bank: Optional[str] = None
    from_account: Optional[str] = None
    beneficiary: Optional[str] = None
    other: Optional[str] = None


class CalculationVerificationSchema(BaseModel):
    calculation_required: bool = True
    tool_used: Optional[str] = None  # calculate_invoice_total, calculate_bank_balance, etc.
    math_verified: bool = True
    line_items_check: bool = True
    subtotal_check: bool = True
    tax_check: bool = True
    grand_total_check: bool = True
    running_balance_check: bool = True
    
    # Bank Statement verification fields
    opening_balance: Optional[float] = None
    total_debit: Optional[float] = None
    total_credit: Optional[float] = None
    calculated_closing_balance: Optional[float] = None
    document_closing_balance: Optional[float] = None
    running_balance_checks: List[Dict[str, Any]] = []
    
    document_total: float = 0.0
    calculated_total: float = 0.0
    difference: float = 0.0
    overall_status: str = "PASSED"  # PASSED, FAILED, INCOMPLETE_EXTRACTION, NOT_REQUIRED
    details: List[str] = []


class SemanticThoughtProcessSchema(BaseModel):
    step_1_date_check: str = ""
    step_2_entity_role_check: str = ""
    step_3_document_type_check: str = ""
    decision_rationale: str = ""


class SemanticVerificationSchema(BaseModel):
    extraction_verdict: str = "CORRECT"  # CORRECT | INCORRECT
    thought_process: SemanticThoughtProcessSchema = Field(default_factory=SemanticThoughtProcessSchema)
    flagged_fields: List[str] = []


class SelectedAccountSchema(BaseModel):
    account_code: str
    account_name: str
    account_type: str  # Asset, Liability, Equity, Revenue, Expense


class JournalEntryLineSchema(BaseModel):
    account_code: str
    account_name: str
    debit: float = 0.0
    credit: float = 0.0
    description: Optional[str] = None


class JournalEntrySchema(BaseModel):
    journal_date: Optional[str] = None
    reference: Optional[str] = None
    description: str = ""
    lines: List[JournalEntryLineSchema] = []
    total_debit: float = 0.0
    total_credit: float = 0.0
    is_balanced: bool = False


class AccountingAnalysisSchema(BaseModel):
    accounting_event: str
    book_of_prime_entry: str
    selected_accounts: List[SelectedAccountSchema] = []
    journal_entry: Optional[JournalEntrySchema] = None
    confidence_score: float = 1.0
    reasoning: Optional[str] = None
    needs_review: bool = False
    review_reason: Optional[str] = None


class CompanyMatchContextSchema(BaseModel):
    active_company: str = "NextTech Solutions Sdn Bhd"
    document_account_holder: Optional[str] = None
    company_match: bool = True
    mismatch_reason: Optional[str] = None


class DisplaySummarySchema(BaseModel):
    party_label: str = "Party"
    party: str = "N/A"
    amount_label: str = "Amount"
    amount: Optional[float] = 0.0


class ExtractedDocumentData(BaseModel):
    company_id: str = "COMP-000001"
    active_company_name: str = "NextTech Solutions Sdn Bhd"
    company_match_status: str = "MATCHED"  # MATCHED, MISMATCH, NOT_SPECIFIED
    company_context: Optional[CompanyMatchContextSchema] = None
    document_id: str
    
    # Document Type
    # Supported: Sales Invoice, Purchase Invoice, Supplier Invoice, Purchase Receipt, Expense Receipt, Payment Receipt, Bank Transfer Receipt, Bank Transaction Record, Bank Statement, Credit Note, Debit Note
    document_type: str
    
    # Display Summary for UI tables & cards
    display_summary: Optional[DisplaySummarySchema] = None
    
    # Optional Document Identifiers & References (Must strictly match document type!)
    invoice_number: Optional[str] = None
    receipt_number: Optional[str] = None
    credit_note_number: Optional[str] = None
    related_invoice_number: Optional[str] = None
    debit_note_number: Optional[str] = None
    reference_number: Optional[str] = None  # E.g. TRX-2026-99042 for Bank Transfer Receipt
    payment_reference: Optional[str] = None  # E.g. INV-2026-0001 for Bank Transfer Receipt
    payment_description: Optional[str] = None  # E.g. Payment for Invoice INV-2026-8801
    transfer_type: Optional[str] = None      # E.g. DuitNow / IBG Transfer
    transaction_id: Optional[str] = None
    statement_period: Optional[str] = None
    statement_date: Optional[str] = None
    document_number: Optional[str] = None
    delivery_order_number: Optional[str] = None
    purchase_order_number: Optional[str] = None
    sales_order_number: Optional[str] = None
    voucher_number: Optional[str] = None
    return_number: Optional[str] = None
    stock_take_number: Optional[str] = None
    cheque_number: Optional[str] = None
    account_code: Optional[str] = None
    amount_received: Optional[float] = None
    amount_paid: Optional[float] = None
    net_adjustment: Optional[float] = None
    
    # Entity Names (When applicable)
    vendor_name: Optional[str] = None
    vendor_address: Optional[str] = None
    buyer_name: Optional[str] = None
    buyer_address: Optional[str] = None
    merchant_name: Optional[str] = None
    
    # Bank Transfer Receipt specific entities
    from_account_name: Optional[str] = None
    from_account_number: Optional[str] = None
    beneficiary_name: Optional[str] = None
    beneficiary_bank: Optional[str] = None
    
    # Dates and Status
    transaction_date: Optional[str] = None
    invoice_date: Optional[str] = None
    payment_terms: Optional[str] = None
    customer_name: Optional[str] = None
    transaction_datetime: Optional[str] = None
    transaction_date_time: Optional[str] = None
    transaction_status: Optional[str] = None  # E.g. SUCCESSFUL
    currency: str = "MYR"
    
    # Party Business Roles relative to Active Company
    business_roles: BusinessRolesSchema = Field(default_factory=BusinessRolesSchema)
    
    # Financial Amounts Extracted (Invoices / Receipts)
    subtotal: Optional[float] = None
    discount: Optional[float] = None
    shipping: Optional[float] = None
    tax_amount: Optional[float] = None
    grand_total: Optional[float] = None

    # Multi-Currency & Foreign Exchange Fields
    exchange_rate: Optional[float] = None
    exchange_rate_date: Optional[str] = None
    exchange_rate_provider: Optional[str] = None
    exchange_rate_session: Optional[str] = None
    converted_amount_myr: Optional[float] = None
    subtotal_myr: Optional[float] = None
    discount_myr: Optional[float] = None
    shipping_myr: Optional[float] = None
    tax_amount_myr: Optional[float] = None
    conversion_status: Optional[str] = None  # CONVERTED, FAILED, NOT_REQUIRED
    conversion_error: Optional[str] = None
    original_currency: Optional[str] = None
    original_amount: Optional[float] = None
    base_currency: Optional[str] = "MYR"
    rate_source: Optional[str] = None
    rate_publication_date: Optional[str] = None
    transaction_amount: Optional[float] = None  # For Bank Transfer Receipt
    payment_method: Optional[str] = None
    
    # Line Items for Invoices & Receipts
    line_items: List[InvoiceLineItem] = []
    
    # Bank Document specific fields (Statement / Transaction Record)
    bank_name: Optional[str] = None
    account_name: Optional[str] = None
    account_number: Optional[str] = None
    account_type: Optional[str] = None
    opening_balance: Optional[float] = None
    closing_balance: Optional[float] = None
    bank_transactions: List[BankTransactionItem] = []
    
    # Deterministic Calculation Agent Result & Verification
    math_verified: bool = True
    calculation_verification: CalculationVerificationSchema = Field(default_factory=CalculationVerificationSchema)
    
    # LLM Semantic Extraction Verification (No Math)
    semantic_verification: Optional[SemanticVerificationSchema] = None
    
    # Accounting Agent Result (Stage 1 Accounting Event, Stage 2 Book of Prime Entry, Stage 3 Account Selection)
    accounting_analysis: Optional[AccountingAnalysisSchema] = None
    
    # Status Separation (Extraction, Company Match, Validation, Review)
    extraction_status: str = "Extraction Completed"  # Uploaded, Processing, Extraction Completed, Extraction Failed
    company_match_status: str = "Matched"  # Matched, Mismatch, Unable to Determine
    validation_status: str = "Passed"  # Passed, Warning, Failed, Review Required
    review_status: str = "Pending Review"  # Pending Review, Verified, Rejected

    # Completeness & Validation Status
    extraction_completeness: str = "COMPLETE"  # COMPLETE, INCOMPLETE
    validation_passed: bool = True
    validation_messages: List[str] = []
    needs_review: bool = False
    processing_metadata: Dict[str, Any] = {}
    field_confidence: Dict[str, Any] = {}
    source_context: Dict[str, Any] = {}
    raw_text: Optional[str] = None


class DocumentResponse(BaseModel):
    id: int
    company_id: str
    document_id: str
    original_filename: str
    file_path: str
    file_type: str
    mime_type: str
    document_type: str
    status: str  # UPLOADED, PROCESSING, EXTRACTED, ERROR, COMPLETED
    extraction_status: Optional[str] = "Extraction Completed"
    company_match_status: Optional[str] = "Matched"
    validation_status: Optional[str] = "Passed"
    review_status: Optional[str] = "Pending Review" 
    vendor_name: Optional[str] = None
    vendor_address: Optional[str] = None
    currency: Optional[str] = 'MYR'
    discount: Optional[float] = None
    shipping: Optional[float] = None
    grand_total: Optional[float] = 0.0
    converted_amount_myr: Optional[float] = None
    subtotal_myr: Optional[float] = None
    discount_myr: Optional[float] = None
    shipping_myr: Optional[float] = None
    tax_amount_myr: Optional[float] = None
    exchange_rate: Optional[float] = None
    exchange_rate_date: Optional[str] = None
    exchange_rate_provider: Optional[str] = None
    exchange_rate_session: Optional[str] = None
    conversion_status: Optional[str] = None
    conversion_error: Optional[str] = None
    original_currency: Optional[str] = None
    original_amount: Optional[float] = None
    base_currency: Optional[str] = "MYR"
    rate_source: Optional[str] = None
    rate_publication_date: Optional[str] = None
    display_summary: Optional[Dict[str, Any]] = None
    source_type: Optional[str] = 'MANUAL_UPLOAD'
    original_source_path: Optional[str] = None
    extracted_data: Optional[dict] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    payment_terms: Optional[str] = None
    customer_name: Optional[str] = None
    validation_errors: Optional[List[str]] = None
    created_at: Optional[str] = ""
    updated_at: Optional[str] = ""

    class Config:
        from_attributes = True


class DocumentListResponse(BaseModel):
    total: int
    documents: List[DocumentResponse]
