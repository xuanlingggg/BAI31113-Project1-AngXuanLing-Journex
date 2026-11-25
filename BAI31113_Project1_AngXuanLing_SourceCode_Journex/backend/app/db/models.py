import datetime
from zoneinfo import ZoneInfo
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, Boolean, UniqueConstraint, Index
from app.db.database import Base


def get_local_now() -> datetime.datetime:
    """Returns the current local date and time in Asia/Kuala_Lumpur (UTC+08:00)."""
    try:
        return datetime.datetime.now(ZoneInfo("Asia/Kuala_Lumpur"))
    except Exception:
        return datetime.datetime.now()


class UserModel(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, default="OWNER")  # OWNER, ACCOUNTANT, VIEWER
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=get_local_now)
    updated_at = Column(DateTime, default=get_local_now, onupdate=get_local_now)


class UserCompanyModel(Base):
    __tablename__ = "user_companies"
    __table_args__ = (
        UniqueConstraint('user_id', 'company_id', name='uix_user_company'),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    company_id = Column(String, index=True, nullable=False)
    role = Column(String, default="OWNER")  # OWNER, ACCOUNTANT, VIEWER
    is_default = Column(Boolean, default=True)
    created_at = Column(DateTime, default=get_local_now)


class CompanyModel(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, unique=True, index=True, nullable=False)
    company_name = Column(String, nullable=False)
    registration_number = Column(String, nullable=True)
    currency = Column(String, default="MYR")
    financial_year = Column(Integer, default=2026)
    financial_year_start = Column(String, nullable=True)  # YYYY-MM-DD
    financial_year_end = Column(String, nullable=True)    # YYYY-MM-DD
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    logo_path = Column(String, nullable=True)
    onboarding_status = Column(String, default="ACTIVE")  # NOT_STARTED, COMPANY_SETUP, DOCUMENT_UPLOAD, EXTRACTION_IN_PROGRESS, REVIEW_REQUIRED, READY_TO_POST, ACTIVE
    onboarding_step = Column(Integer, default=1)
    address = Column(Text, nullable=True)
    tax_number = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=get_local_now)
    updated_at = Column(DateTime, default=get_local_now, onupdate=get_local_now)


class ChartOfAccountModel(Base):
    __tablename__ = "chart_of_accounts"
    __table_args__ = (
        UniqueConstraint('company_id', 'account_code', name='uix_company_account_code'),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, default="COMP-000001", index=True, nullable=False)
    account_code = Column(String, index=True, nullable=False)
    account_name = Column(String, nullable=False)
    account_type = Column(String, nullable=False)  # Asset, Liability, Equity, Revenue, Expense, Cost of Sales, Taxation
    special_code = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    parent_id = Column(Integer, nullable=True)
    is_group = Column(Boolean, default=False)
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=get_local_now)
    updated_at = Column(DateTime, default=get_local_now, onupdate=get_local_now)


class DocumentModel(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, default="COMP-000001", index=True, nullable=False)
    document_id = Column(String, unique=True, index=True, nullable=False)
    original_filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    document_type = Column(String, default="Unknown")
    status = Column(String, default="UPLOADED")  # UPLOADED, PROCESSING, EXTRACTED, ERROR, COMPLETED
    vendor_name = Column(String, nullable=True)
    vendor_address = Column(String, nullable=True)
    currency = Column(String, default="MYR")
    subtotal = Column(Float, nullable=True)
    discount = Column(Float, nullable=True)
    shipping = Column(Float, nullable=True)
    tax_amount = Column(Float, nullable=True)
    grand_total = Column(Float, default=0.0)
    converted_amount_myr = Column(Float, nullable=True)
    subtotal_myr = Column(Float, nullable=True)
    discount_myr = Column(Float, nullable=True)
    shipping_myr = Column(Float, nullable=True)
    tax_amount_myr = Column(Float, nullable=True)
    exchange_rate = Column(Float, nullable=True)
    exchange_rate_date = Column(String, nullable=True)
    exchange_rate_provider = Column(String, nullable=True)
    exchange_rate_session = Column(String, nullable=True)
    conversion_status = Column(String, nullable=True)  # CONVERTED, FAILED, NOT_REQUIRED
    conversion_error = Column(Text, nullable=True)
    extracted_data_json = Column(Text, nullable=True)
    validation_errors_json = Column(Text, nullable=True)
    file_hash = Column(String, index=True, nullable=True)
    duplicate_key = Column(String, index=True, nullable=True)
    source_email_id = Column(Integer, nullable=True, index=True)
    source_type = Column(String, default="MANUAL_UPLOAD", index=True)  # MANUAL_UPLOAD, GMAIL, LOCAL_FOLDER
    original_source_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_local_now)
    updated_at = Column(DateTime, default=get_local_now, onupdate=get_local_now)

    @property
    def original_amount(self):
        return self.grand_total

    @property
    def original_currency(self):
        return self.currency

    @property
    def base_currency(self):
        return "MYR"

    @property
    def rate_source(self):
        return self.exchange_rate_provider

    @property
    def rate_publication_date(self):
        return self.exchange_rate_date


class AccountingTransactionModel(Base):
    __tablename__ = "accounting_transactions"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(String, unique=True, index=True, nullable=False)
    company_id = Column(String, default="COMP-000001", index=True, nullable=False)
    document_id = Column(String, index=True, nullable=False)
    source_document = Column(String, nullable=True)
    document_type = Column(String, nullable=True)
    transaction_date = Column(String, nullable=True)
    accounting_event = Column(String, nullable=True)
    book_of_prime_entry = Column(String, nullable=True)
    accounting_analysis_json = Column(Text, nullable=True)
    original_currency = Column(String, default="MYR")
    original_amount = Column(Float, nullable=True)
    exchange_rate = Column(Float, nullable=True)
    converted_amount_myr = Column(Float, nullable=True)
    confidence_score = Column(Float, default=1.0)
    needs_review = Column(Boolean, default=False)
    review_reason = Column(String, nullable=True)
    status = Column(String, default="Completed")  # Completed, Needs Review, Failed
    created_at = Column(DateTime, default=get_local_now)
    updated_at = Column(DateTime, default=get_local_now, onupdate=get_local_now)

    @property
    def base_currency(self):
        return "MYR"


class JournalEntryModel(Base):
    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True, index=True)
    journal_id = Column(String, unique=True, index=True, nullable=False)
    transaction_id = Column(String, index=True, nullable=False)
    company_id = Column(String, default="COMP-000001", index=True, nullable=False)
    document_id = Column(String, index=True, nullable=False)
    journal_date = Column(String, nullable=True)
    reference = Column(String, nullable=True)
    description = Column(String, nullable=True)
    total_debit = Column(Float, default=0.0)
    total_credit = Column(Float, default=0.0)
    is_balanced = Column(Boolean, default=False)
    lines_json = Column(Text, nullable=True)  # List of JournalEntryLineSchema
    status = Column(String, default="DRAFT")  # DRAFT, PENDING_AUDIT, POSTED, HUMAN_REVIEW, VOID
    audit_reasoning = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_local_now)
    updated_at = Column(DateTime, default=get_local_now, onupdate=get_local_now)


class SystemSettingModel(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    setting_key = Column(String, unique=True, index=True, nullable=False)
    setting_value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=get_local_now, onupdate=get_local_now)


class EmailSourceModel(Base):
    __tablename__ = "source_emails"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, default="COMP-000001", index=True, nullable=False)
    gmail_message_id = Column(String, unique=True, index=True, nullable=False)
    thread_id = Column(String, nullable=True)
    sender_email = Column(String, nullable=True)
    sender_name = Column(String, nullable=True)
    subject = Column(String, nullable=True)
    snippet = Column(Text, nullable=True)
    received_at = Column(String, nullable=True)
    classification = Column(String, default="UNCERTAIN")  # ACCOUNTING_RELATED, UNRELATED, UNCERTAIN
    classification_reasons = Column(Text, nullable=True)
    ingestion_status = Column(String, default="PENDING")  # PENDING, PROCESSED, SKIPPED_UNRELATED, DEFERRED_UNCERTAIN, PARTIAL, ERROR
    attachment_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    source_doc_id = Column(String, nullable=True)
    confirmation_status = Column(String, default="CONFIRMED")
    confirmed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=get_local_now)
    updated_at = Column(DateTime, default=get_local_now, onupdate=get_local_now)


class EmailAttachmentModel(Base):
    __tablename__ = "email_attachments"

    id = Column(Integer, primary_key=True, index=True)
    email_source_id = Column(Integer, index=True, nullable=False)
    gmail_message_id = Column(String, index=True, nullable=False)
    attachment_id = Column(String, nullable=True)
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    size_bytes = Column(Integer, default=0)
    file_hash = Column(String, index=True, nullable=False)  # SHA-256
    document_id = Column(String, index=True, nullable=True)
    status = Column(String, default="PENDING")  # PROCESSED, DUPLICATE_SKIPPED, UNSUPPORTED_SKIPPED, EMPTY_SKIPPED, ERROR
    error_message = Column(Text, nullable=True)
    source_doc_id = Column(String, nullable=True)
    document_id = Column(String, nullable=True)
    confirmation_status = Column(String, default="CONFIRMED")
    confirmed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=get_local_now)


class BankTransactionModel(Base):
    __tablename__ = "bank_transactions"
    __table_args__ = (
        UniqueConstraint('company_id', 'source', 'bank_transaction_id', name='uix_bank_source_txn_id'),
        UniqueConstraint('company_id', 'unique_source_id', name='uix_bank_company_unique_source_id'),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, default="COMP-000001", index=True, nullable=False)
    source = Column(String, default="abc_bank", index=True, nullable=False)
    unique_source_id = Column(String, index=True, nullable=False)  # e.g. "abc_bank:TXN-0001"
    bank_name = Column(String, default="ABC Bank")
    account_id = Column(String, default="ABC-BIZ-0001")
    account_number = Column(String, nullable=True)
    bank_transaction_id = Column(String, index=True, nullable=False)
    transaction_date = Column(String, nullable=False)  # YYYY-MM-DD
    description = Column(Text, nullable=False)
    reference = Column(String, nullable=True)
    money_in = Column(Float, default=0.0)
    money_out = Column(Float, default=0.0)
    currency = Column(String, default="MYR")
    running_balance = Column(Float, nullable=True)
    collection_status = Column(String, default="IMPORTED")  # IMPORTED, PROCESSED, ERROR
    raw_json = Column(Text, nullable=True)
    pdf_file_path = Column(String, nullable=True)  # Path to stored transaction PDF if ingested via PDF
    file_hash = Column(String, index=True, nullable=True)  # SHA-256 hash of PDF file

    # Accounting Classification (separate from original raw bank fields)
    suggested_category = Column(String, nullable=True)  # e.g. "Customer receipt / accounts receivable settlement"
    suggested_account_code = Column(String, nullable=True)  # e.g. "300-0000"
    suggested_account_name = Column(String, nullable=True)  # e.g. "TRADE DEBTORS"
    classification_confidence = Column(Float, default=0.0)
    classification_explanation = Column(Text, nullable=True)
    classification_status = Column(String, default="PENDING")  # PENDING, AUTO_CLASSIFIED, REVIEWED, CONFIRMED
    review_status = Column(String, default="NEEDS_REVIEW")  # NEEDS_REVIEW, APPROVED, REJECTED
    classification_timestamp = Column(DateTime, nullable=True)

    # Document Matching & Reconciliation
    matched_document_id = Column(String, nullable=True)  # e.g. "DOC-2026-000001"
    match_status = Column(String, default="UNMATCHED")  # UNMATCHED, SUGGESTED_MATCH, MATCHED, NEEDS_REVIEW
    match_confidence = Column(Float, default=0.0)
    match_explanation = Column(Text, nullable=True)
    match_timestamp = Column(DateTime, nullable=True)
    reconciliation_status = Column(String, default="UNRECONCILED")  # UNRECONCILED, REVIEW_READY, RECONCILED, POSTED
    reconciliation_notes = Column(Text, nullable=True)
    audit_trail_json = Column(Text, nullable=True)  # JSON list of historical decisions & changes

    created_at = Column(DateTime, default=get_local_now)
    updated_at = Column(DateTime, default=get_local_now, onupdate=get_local_now)



class FixedAssetModel(Base):
    __tablename__ = "fixed_assets"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, default="COMP-000001", index=True, nullable=False)
    asset_code = Column(String, unique=True, index=True, nullable=False)
    asset_name = Column(String, nullable=False)
    asset_category = Column(String, nullable=False)  # OFFICE_EQUIPMENT, FURNITURE_FITTINGS, MOTOR_VEHICLE
    cost_account_code = Column(String, nullable=False)  # e.g. 200-3000
    accum_depr_account_code = Column(String, nullable=False)  # e.g. 200-3005
    acquisition_date = Column(String, nullable=False)  # YYYY-MM-DD
    purchase_cost = Column(Float, nullable=False)
    salvage_value = Column(Float, default=0.0)
    useful_life_years = Column(Float, default=5.0)
    depreciation_method = Column(String, default="STRAIGHT_LINE")
    accumulated_depreciation = Column(Float, default=0.0)
    current_carrying_amount = Column(Float, default=0.0)  # purchase_cost - accumulated_depreciation
    status = Column(String, default="ACTIVE")  # ACTIVE, DISPOSED, WRITTEN_OFF

    # Disposal details
    disposal_date = Column(String, nullable=True)  # YYYY-MM-DD
    disposal_proceeds = Column(Float, nullable=True, default=0.0)
    disposal_expenses = Column(Float, nullable=True, default=0.0)
    expenses_paid = Column(Boolean, default=True)  # True if expenses paid immediately, False if unpaid/accrued
    expense_liability_account_code = Column(String, nullable=True)  # e.g. 405-0000 OTHER CREDITORS
    net_proceeds = Column(Float, nullable=True, default=0.0)
    proceeds_account_code = Column(String, nullable=True, default="310-1000")
    gain_loss_amount = Column(Float, nullable=True)
    gain_loss_type = Column(String, nullable=True)  # GAIN, LOSS, ZERO
    disposal_journal_id = Column(String, nullable=True)
    disposal_notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=get_local_now)
    updated_at = Column(DateTime, default=get_local_now, onupdate=get_local_now)


class AccrualPrepaymentModel(Base):
    __tablename__ = "accruals_prepayments"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, default="COMP-000001", index=True, nullable=False)
    transaction_number = Column(String, unique=True, index=True, nullable=False)
    transaction_type = Column(String, index=True, nullable=False)  # ACCRUED_EXPENSE, PREPAID_EXPENSE, ACCRUED_INCOME, DEFERRED_INCOME
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    vendor_customer_name = Column(String, nullable=True)

    # Financial amounts & Multicurrency
    original_amount = Column(Float, nullable=False)
    currency = Column(String, default="MYR")
    exchange_rate = Column(Float, default=1.0)
    amount_myr = Column(Float, nullable=False)

    # Dates & Coverage Period
    transaction_date = Column(String, nullable=False)  # YYYY-MM-DD
    start_date = Column(String, nullable=False)  # YYYY-MM-DD
    end_date = Column(String, nullable=False)  # YYYY-MM-DD
    accounting_period = Column(String, nullable=True)  # YYYY-MM

    # Balances
    total_recognized_amount = Column(Float, default=0.0)
    remaining_balance = Column(Float, nullable=False)

    # Linked Chart of Accounts
    target_account_code = Column(String, nullable=False)
    balance_sheet_account_code = Column(String, nullable=False)
    bank_account_code = Column(String, default="310-1000")

    # Status & Life-cycle
    status = Column(String, default="ACTIVE")  # DRAFT, ACTIVE, PARTIALLY_ADJUSTED, FULLY_ADJUSTED, CANCELLED
    is_reversed = Column(Boolean, default=False)
    reversal_date = Column(String, nullable=True)
    auto_reverse = Column(Boolean, default=False)
    auto_reverse_date = Column(String, nullable=True)

    # Audit & Document linking
    initial_journal_id = Column(String, nullable=True)
    reversal_journal_id = Column(String, nullable=True)
    supporting_document_id = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=get_local_now)
    updated_at = Column(DateTime, default=get_local_now, onupdate=get_local_now)


class AccrualAdjustmentRecordModel(Base):
    __tablename__ = "accrual_adjustment_records"

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, index=True, nullable=False)
    company_id = Column(String, default="COMP-000001", index=True, nullable=False)
    adjustment_type = Column(String, nullable=False)  # INITIAL_RECOGNITION, PERIODIC_AMORTIZATION, PARTIAL_SETTLEMENT, FULL_SETTLEMENT, REVERSAL, REFUND, ESTIMATE_CHANGE
    adjustment_date = Column(String, nullable=False)  # YYYY-MM-DD
    period_name = Column(String, nullable=True)
    amount = Column(Float, nullable=False)
    amount_myr = Column(Float, nullable=False)
    balance_after = Column(Float, default=0.0)
    journal_id = Column(String, nullable=True)
    description = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_local_now)



class OpeningBalanceDocumentModel(Base):
    __tablename__ = "opening_balance_documents"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    doc_category = Column(String, nullable=False)  # TRIAL_BALANCE, DEBTORS, CREDITORS, OTHER_CREDITORS, STOCK
    original_filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_size = Column(Integer, default=0)
    file_hash = Column(String, index=True, nullable=True)
    mime_type = Column(String, default="application/pdf")
    extraction_status = Column(String, default="PENDING")  # PENDING, PROCESSING, EXTRACTED, ERROR
    error_message = Column(Text, nullable=True)
    source_doc_id = Column(String, nullable=True)
    document_id = Column(String, nullable=True)
    confirmation_status = Column(String, default="CONFIRMED")
    confirmed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=get_local_now)


class OpeningBalanceBatchModel(Base):
    __tablename__ = "opening_balance_batches"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, unique=True, index=True, nullable=False)
    as_at_date = Column(String, nullable=False)  # e.g. "2025-12-31"
    status = Column(String, default="DRAFT")     # DRAFT, VALIDATED, POSTED, CANCELLED
    total_debit = Column(Float, default=0.0)
    total_credit = Column(Float, default=0.0)
    is_balanced = Column(Boolean, default=False)
    debtor_total = Column(Float, default=0.0)
    creditor_total = Column(Float, default=0.0)
    other_creditor_total = Column(Float, default=0.0)
    stock_total = Column(Float, default=0.0)
    validation_results_json = Column(Text, nullable=True)
    posted_journal_id = Column(String, nullable=True)
    confirmed_by = Column(String, nullable=True)
    confirmed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=get_local_now)
    updated_at = Column(DateTime, default=get_local_now, onupdate=get_local_now)


class OpeningBalanceDraftRecordModel(Base):
    __tablename__ = "opening_balance_draft_records"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, index=True, nullable=False)
    company_id = Column(String, index=True, nullable=False)
    category = Column(String, index=True, nullable=False)  # TRIAL_BALANCE, DEBTOR, CREDITOR, OTHER_CREDITOR, STOCK
    source_doc_id = Column(Integer, nullable=True)
    account_code = Column(String, nullable=True)
    account_name = Column(String, nullable=True)
    entity_name = Column(String, nullable=True)          # Customer Name / Supplier Name / Creditor Name / Item Name
    item_code = Column(String, nullable=True)            # Stock code
    invoice_no = Column(String, nullable=True)
    invoice_date = Column(String, nullable=True)
    credit_term = Column(String, nullable=True)
    debit = Column(Float, default=0.0)
    credit = Column(Float, default=0.0)
    quantity = Column(Float, default=0.0)
    unit_cost = Column(Float, default=0.0)
    amount = Column(Float, default=0.0)
    review_status = Column(String, default="PENDING")    # PENDING, VERIFIED, EDITED, REJECTED
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_local_now)
    updated_at = Column(DateTime, default=get_local_now, onupdate=get_local_now)


class CustomerModel(Base):
    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint('company_id', 'customer_code', name='uix_company_customer_code'),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, default="COMP-000001", index=True, nullable=False)
    customer_code = Column(String, index=True, nullable=False)
    customer_name = Column(String, nullable=False)
    contact_email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    credit_term = Column(String, default="30 Days")
    opening_balance = Column(Float, default=0.0)
    current_balance = Column(Float, default=0.0)
    invoice_no = Column(String, nullable=True)
    invoice_date = Column(String, nullable=True)
    due_date = Column(String, nullable=True)
    opening_balance_date = Column(String, nullable=True)
    source_doc_id = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=get_local_now)
    updated_at = Column(DateTime, default=get_local_now, onupdate=get_local_now)


class SupplierModel(Base):
    __tablename__ = "suppliers"
    __table_args__ = (
        UniqueConstraint('company_id', 'supplier_code', name='uix_company_supplier_code'),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, default="COMP-000001", index=True, nullable=False)
    supplier_code = Column(String, index=True, nullable=False)
    supplier_name = Column(String, nullable=False)
    supplier_type = Column(String, default="TRADE")  # TRADE, OTHER
    contact_email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    credit_term = Column(String, default="30 Days")
    opening_balance = Column(Float, default=0.0)
    current_balance = Column(Float, default=0.0)
    invoice_no = Column(String, nullable=True)
    invoice_date = Column(String, nullable=True)
    due_date = Column(String, nullable=True)
    opening_balance_date = Column(String, nullable=True)
    source_doc_id = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=get_local_now)
    updated_at = Column(DateTime, default=get_local_now, onupdate=get_local_now)


class InventoryItemModel(Base):
    __tablename__ = "inventory_items"
    __table_args__ = (
        UniqueConstraint('company_id', 'item_code', name='uix_company_item_code'),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, default="COMP-000001", index=True, nullable=False)
    item_code = Column(String, index=True, nullable=False)  # e.g. LHB, TTB
    item_name = Column(String, nullable=False)
    category = Column(String, default="GENERAL")
    unit_of_measure = Column(String, default="UNIT")
    unit_cost = Column(Float, default=0.0)
    selling_price = Column(Float, default=0.0)
    opening_quantity = Column(Float, default=0.0)
    current_quantity = Column(Float, default=0.0)
    opening_valuation = Column(Float, default=0.0)
    opening_balance_date = Column(String, nullable=True)
    source_doc_id = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=get_local_now)
    updated_at = Column(DateTime, default=get_local_now, onupdate=get_local_now)


class RegistrationSessionModel(Base):
    __tablename__ = "registration_sessions"

    session_id = Column(String, primary_key=True, index=True)
    email = Column(String, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    step = Column(Integer, default=1)
    company_data_json = Column(Text, nullable=True)
    uploaded_files_json = Column(Text, nullable=True)
    extracted_data_json = Column(Text, nullable=True)
    validation_results_json = Column(Text, nullable=True)
    status = Column(String, default="DRAFT")  # DRAFT, COMPLETED, CANCELLED, EXPIRED
    created_at = Column(DateTime, default=get_local_now)
    updated_at = Column(DateTime, default=get_local_now, onupdate=get_local_now)
    expires_at = Column(DateTime, nullable=False)



class ExchangeRateCacheModel(Base):
    __tablename__ = "exchange_rates_cache"
    __table_args__ = (
        Index('ix_exchange_rates_cache_key', 'currency', 'target_currency', 'rate_date', 'session'),
    )

    id = Column(Integer, primary_key=True, index=True)
    currency = Column(String, index=True, nullable=False)             # Source currency: USD, SGD, EUR, GBP, JPY, etc.
    target_currency = Column(String, default="MYR", nullable=False)   # Target currency: MYR
    rate_date = Column(String, index=True, nullable=False)            # Query/Transaction Date (YYYY-MM-DD)
    rate_publication_date = Column(String, nullable=False)            # Actual Publication Date from source (YYYY-MM-DD)
    rate = Column(Float, nullable=False)                              # Effective conversion rate per 1 unit of currency in MYR
    raw_rate = Column(Float, nullable=True)
    unit = Column(Integer, default=1)                                 # Currency unit (1, 100 for JPY, etc.)
    session = Column(String, default="1700")                          # 1700, N/A
    provider = Column(String, nullable=False)                         # Bank Negara Malaysia (BNM OpenAPI), Frankfurter, etc.
    is_fallback = Column(Boolean, default=False)
    created_at = Column(DateTime, default=get_local_now)
