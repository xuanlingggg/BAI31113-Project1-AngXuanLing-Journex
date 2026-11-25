from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class AccrualPrepaymentBase(BaseModel):
    transaction_type: str  # ACCRUED_EXPENSE, PREPAID_EXPENSE, ACCRUED_INCOME, DEFERRED_INCOME
    title: str
    description: Optional[str] = None
    vendor_customer_name: Optional[str] = None
    original_amount: float
    currency: str = "MYR"
    exchange_rate: float = 1.0
    transaction_date: str  # YYYY-MM-DD
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    target_account_code: str  # P&L Account: Expense (Accrued/Prepaid) or Revenue (Accrued/Deferred Inc)
    balance_sheet_account_code: Optional[str] = None  # Auto-defaulted if omitted
    bank_account_code: str = "310-1000"
    auto_reverse: bool = False
    auto_reverse_date: Optional[str] = None
    supporting_document_id: Optional[str] = None
    notes: Optional[str] = None


class AccrualPrepaymentCreate(AccrualPrepaymentBase):
    company_id: Optional[str] = "COMP-000001"
    post_initial_journal: bool = True


class AmortizationScheduleItem(BaseModel):
    period_index: int
    period_name: str
    start_date: str
    end_date: str
    days_in_period: int
    allocated_amount: float
    allocated_amount_myr: float
    remaining_balance_after: float
    is_adjusted: bool = False


class AccrualAdjustmentRequest(BaseModel):
    adjustment_date: str  # YYYY-MM-DD
    amount: float
    period_name: Optional[str] = None
    notes: Optional[str] = None


class AccrualSettlementRequest(BaseModel):
    settlement_date: str  # YYYY-MM-DD
    amount: float
    bank_account_code: str = "310-1000"
    notes: Optional[str] = None


class AccrualReversalRequest(BaseModel):
    reversal_date: str  # YYYY-MM-DD
    notes: Optional[str] = None


class AccrualCancellationRequest(BaseModel):
    cancellation_date: str  # YYYY-MM-DD
    refund_amount: Optional[float] = None
    bank_account_code: str = "310-1000"
    notes: Optional[str] = None


class AccrualAdjustmentRecordResponse(BaseModel):
    id: int
    parent_id: int
    company_id: str
    adjustment_type: str
    adjustment_date: str
    period_name: Optional[str] = None
    amount: float
    amount_myr: float
    balance_after: float
    journal_id: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AccrualPrepaymentResponse(AccrualPrepaymentBase):
    id: int
    company_id: str
    transaction_number: str
    amount_myr: float
    accounting_period: Optional[str] = None
    total_recognized_amount: float
    remaining_balance: float
    status: str
    is_reversed: bool
    reversal_date: Optional[str] = None
    initial_journal_id: Optional[str] = None
    reversal_journal_id: Optional[str] = None
    history: List[AccrualAdjustmentRecordResponse] = []

    model_config = ConfigDict(from_attributes=True)


class AccrualSummaryResponse(BaseModel):
    total_accrued_expenses: float
    total_prepaid_expenses: float
    total_accrued_income: float
    total_deferred_income: float
    active_count: int
    fully_adjusted_count: int
    total_count: int
