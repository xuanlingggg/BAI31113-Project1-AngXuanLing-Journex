from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class FixedAssetBase(BaseModel):
    asset_code: str
    asset_name: str
    asset_category: str  # OFFICE_EQUIPMENT, FURNITURE_FITTINGS, MOTOR_VEHICLE
    cost_account_code: str
    accum_depr_account_code: str
    acquisition_date: str  # YYYY-MM-DD
    purchase_cost: float
    salvage_value: float = 0.0
    useful_life_years: float = 5.0
    depreciation_method: str = "STRAIGHT_LINE"
    accumulated_depreciation: float = 0.0


class FixedAssetCreate(FixedAssetBase):
    company_id: Optional[str] = "COMP-000001"


class FixedAssetDisposalRequest(BaseModel):
    disposal_date: str  # YYYY-MM-DD
    disposal_proceeds: float = 0.0  # Gross proceeds received
    disposal_expenses: float = 0.0  # Incidental disposal expenses incurred
    expenses_paid: bool = True  # True if expenses paid immediately (cash/bank), False if unpaid (recorded as liability)
    proceeds_account_code: str = "310-1000"  # Cash at Bank / Cash in Hand
    expense_liability_account_code: str = "405-0000"  # Creditor / Accrual account if expenses unpaid
    additional_depreciation: float = 0.0  # Depreciation from last balance date to disposal date
    disposal_notes: Optional[str] = None


class DisposalJournalLine(BaseModel):
    line_id: int
    account_code: str
    account_name: str
    account_type: str
    debit: float = 0.0
    credit: float = 0.0
    description: str


class FixedAssetDisposalPreview(BaseModel):
    asset_code: str
    asset_name: str
    disposal_date: str
    purchase_cost: float
    prior_accumulated_depreciation: float
    additional_depreciation: float
    total_accumulated_depreciation: float
    carrying_amount_nbv: float
    disposal_proceeds: float
    disposal_expenses: float
    expenses_paid: bool = True
    net_cash_received: float  # Gross Proceeds - Disposal Expenses (if paid) or Gross Proceeds (if unpaid)
    net_proceeds: float  # Gross Proceeds - Disposal Expenses
    gain_loss_amount: float
    gain_loss_type: str  # GAIN, LOSS, ZERO
    gain_loss_account_code: Optional[str] = None
    gain_loss_account_name: Optional[str] = None
    is_balanced: bool
    total_debit: float
    total_credit: float
    journal_lines: List[DisposalJournalLine]


class FixedAssetResponse(FixedAssetBase):
    id: int
    company_id: str
    current_carrying_amount: float
    status: str
    disposal_date: Optional[str] = None
    disposal_proceeds: Optional[float] = None
    disposal_expenses: Optional[float] = None
    expenses_paid: Optional[bool] = True
    expense_liability_account_code: Optional[str] = None
    net_proceeds: Optional[float] = None
    proceeds_account_code: Optional[str] = None
    gain_loss_amount: Optional[float] = None
    gain_loss_type: Optional[str] = None
    disposal_journal_id: Optional[str] = None
    disposal_notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
