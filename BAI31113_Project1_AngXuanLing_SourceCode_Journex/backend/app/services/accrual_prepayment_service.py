import calendar
import datetime
import json
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session

from app.db.models import (
    AccrualPrepaymentModel,
    AccrualAdjustmentRecordModel,
    ChartOfAccountModel,
    JournalEntryModel
)
from app.schemas.accrual_prepayment import (
    AccrualPrepaymentCreate,
    AccrualAdjustmentRequest,
    AccrualSettlementRequest,
    AccrualReversalRequest,
    AccrualCancellationRequest,
    AmortizationScheduleItem,
    AccrualSummaryResponse
)


import uuid


def _to_decimal(val: Any) -> Decimal:
    if val is None:
        return Decimal("0.00")
    return Decimal(str(val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _to_rate_decimal(val: Any) -> Decimal:
    if val is None:
        return Decimal("1.0000")
    return Decimal(str(val))


def _round_float(val: Decimal) -> float:
    return float(val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


class AccrualPrepaymentService:
    def __init__(self, db: Session):
        self.db = db

    def generate_transaction_number(self, company_id: str = "COMP-000001", txn_type: str = "ACCRUED_EXPENSE") -> str:
        prefix_map = {
            "ACCRUED_EXPENSE": "ACR-EXP",
            "PREPAID_EXPENSE": "PRP-EXP",
            "ACCRUED_INCOME": "ACR-INC",
            "DEFERRED_INCOME": "DEF-INC"
        }
        prefix = prefix_map.get(txn_type, "APR")
        year = datetime.datetime.now().year
        
        last_rec = self.db.query(AccrualPrepaymentModel).filter(
            AccrualPrepaymentModel.company_id == company_id,
            AccrualPrepaymentModel.transaction_number.like(f"{prefix}-{year}-%")
        ).order_by(AccrualPrepaymentModel.id.desc()).first()

        if last_rec and last_rec.transaction_number:
            try:
                seq = int(last_rec.transaction_number.split("-")[-1]) + 1
            except Exception:
                seq = 1
        else:
            seq = 1

        return f"{prefix}-{year}-{seq:04d}"

    def get_default_balance_sheet_account(self, txn_type: str, start_date_str: str, end_date_str: str) -> str:
        d1 = datetime.datetime.strptime(start_date_str, "%Y-%m-%d").date()
        d2 = datetime.datetime.strptime(end_date_str, "%Y-%m-%d").date()
        days = (d2 - d1).days + 1
        is_long_term = days > 366

        if txn_type == "ACCRUED_EXPENSE":
            return "410-0000"  # ACCRUALS (Current Liability)
        elif txn_type == "PREPAID_EXPENSE":
            return "220-0000" if is_long_term else "340-1000"  # NON-CURRENT PREPAYMENTS or PREPAID EXPENSES
        elif txn_type == "ACCRUED_INCOME":
            return "305-1000"  # ACCRUED INCOME (Current Asset)
        elif txn_type == "DEFERRED_INCOME":
            return "450-0000" if is_long_term else "440-1000"  # NON-CURRENT DEFERRED INCOME or DEFERRED INCOME
        return "410-0000"

    def calculate_amortization_schedule(
        self, original_amount: float, exchange_rate: float, start_date_str: str, end_date_str: str
    ) -> List[AmortizationScheduleItem]:
        d1 = datetime.datetime.strptime(start_date_str, "%Y-%m-%d").date()
        d2 = datetime.datetime.strptime(end_date_str, "%Y-%m-%d").date()
        if d2 < d1:
            raise ValueError(f"End date ({end_date_str}) cannot be before start date ({start_date_str}).")

        total_days = Decimal((d2 - d1).days + 1)
        rate_dec = _to_rate_decimal(exchange_rate)
        orig_dec = _to_decimal(original_amount)
        amount_myr_dec = _to_decimal(orig_dec * rate_dec)

        daily_rate_orig = orig_dec / total_days
        daily_rate_myr = amount_myr_dec / total_days

        schedule: List[AmortizationScheduleItem] = []
        cur_start = d1
        period_idx = 1
        remaining_orig = orig_dec

        while cur_start <= d2:
            # End of current calendar month or overall end date
            last_day_of_month = calendar.monthrange(cur_start.year, cur_start.month)[1]
            month_end = datetime.date(cur_start.year, cur_start.month, last_day_of_month)
            cur_end = min(month_end, d2)

            days_in_period = (cur_end - cur_start).days + 1
            month_name = cur_start.strftime("%B %Y")

            if cur_end == d2:
                # Last period takes the exact remaining balance to prevent penny drift
                period_amt_orig = remaining_orig
            else:
                period_amt_orig = _to_decimal(daily_rate_orig * Decimal(days_in_period))
                if period_amt_orig > remaining_orig:
                    period_amt_orig = remaining_orig

            period_amt_myr = _to_decimal(period_amt_orig * rate_dec)
            remaining_orig -= period_amt_orig

            schedule.append(AmortizationScheduleItem(
                period_index=period_idx,
                period_name=month_name,
                start_date=cur_start.strftime("%Y-%m-%d"),
                end_date=cur_end.strftime("%Y-%m-%d"),
                days_in_period=days_in_period,
                allocated_amount=_round_float(period_amt_orig),
                allocated_amount_myr=_round_float(period_amt_myr),
                remaining_balance_after=_round_float(max(Decimal("0.00"), remaining_orig)),
                is_adjusted=False
            ))

            # Move to first day of next month
            cur_start = cur_end + datetime.timedelta(days=1)
            period_idx += 1

        return schedule

    def create_record(self, req: AccrualPrepaymentCreate) -> AccrualPrepaymentModel:
        # 1. Validations
        if req.original_amount <= 0:
            raise ValueError("Transaction amount must be strictly greater than zero.")
        if req.exchange_rate <= 0:
            raise ValueError("Exchange rate must be strictly greater than zero.")

        d1 = datetime.datetime.strptime(req.start_date, "%Y-%m-%d").date()
        d2 = datetime.datetime.strptime(req.end_date, "%Y-%m-%d").date()
        if d2 < d1:
            raise ValueError(f"End date ({req.end_date}) cannot precede start date ({req.start_date}).")

        # 2. Check Target Account
        target_acc = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.account_code == req.target_account_code,
            ChartOfAccountModel.company_id == req.company_id,
            ChartOfAccountModel.is_active == True
        ).first()
        if not target_acc:
            raise ValueError(f"Target account '{req.target_account_code}' does not exist or is inactive.")

        if req.transaction_type in ["ACCRUED_EXPENSE", "PREPAID_EXPENSE"]:
            if target_acc.account_type != "Expense":
                raise ValueError(
                    f"Account '{req.target_account_code}' ({target_acc.account_name}) is type '{target_acc.account_type}', "
                    f"but {req.transaction_type} requires an Expense account."
                )
        elif req.transaction_type in ["ACCRUED_INCOME", "DEFERRED_INCOME"]:
            if target_acc.account_type not in ["Revenue", "Sales Adjustment"]:
                raise ValueError(
                    f"Account '{req.target_account_code}' ({target_acc.account_name}) is type '{target_acc.account_type}', "
                    f"but {req.transaction_type} requires a Revenue account."
                )

        # 3. Determine and check Balance Sheet Account
        bs_code = req.balance_sheet_account_code
        if not bs_code:
            bs_code = self.get_default_balance_sheet_account(req.transaction_type, req.start_date, req.end_date)

        bs_acc = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.account_code == bs_code,
            ChartOfAccountModel.company_id == req.company_id,
            ChartOfAccountModel.is_active == True
        ).first()
        if not bs_acc:
            raise ValueError(f"Balance sheet account '{bs_code}' does not exist or is inactive.")

        # Validate BS account direction
        if req.transaction_type in ["ACCRUED_EXPENSE", "DEFERRED_INCOME"]:
            if bs_acc.account_type != "Liability":
                raise ValueError(f"Balance sheet account '{bs_code}' must be a Liability account for {req.transaction_type}.")
        elif req.transaction_type in ["PREPAID_EXPENSE", "ACCRUED_INCOME"]:
            if bs_acc.account_type != "Asset":
                raise ValueError(f"Balance sheet account '{bs_code}' must be an Asset account for {req.transaction_type}.")

        # 4. Check Bank Account if needed
        bank_acc = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.account_code == req.bank_account_code,
            ChartOfAccountModel.company_id == req.company_id,
            ChartOfAccountModel.is_active == True
        ).first()
        if not bank_acc:
            raise ValueError(f"Bank account '{req.bank_account_code}' does not exist or is inactive.")

        # 5. Amounts calculation
        orig_dec = _to_decimal(req.original_amount)
        rate_dec = _to_rate_decimal(req.exchange_rate)
        amount_myr_dec = _to_decimal(orig_dec * rate_dec)

        txn_num = self.generate_transaction_number(req.company_id, req.transaction_type)
        period_str = req.transaction_date[:7]  # YYYY-MM

        record = AccrualPrepaymentModel(
            company_id=req.company_id,
            transaction_number=txn_num,
            transaction_type=req.transaction_type,
            title=req.title.strip(),
            description=req.description.strip() if req.description else None,
            vendor_customer_name=req.vendor_customer_name.strip() if req.vendor_customer_name else None,
            original_amount=_round_float(orig_dec),
            currency=req.currency.upper(),
            exchange_rate=float(rate_dec),
            amount_myr=_round_float(amount_myr_dec),
            transaction_date=req.transaction_date,
            start_date=req.start_date,
            end_date=req.end_date,
            accounting_period=period_str,
            total_recognized_amount=0.0,
            remaining_balance=_round_float(orig_dec),
            target_account_code=target_acc.account_code,
            balance_sheet_account_code=bs_acc.account_code,
            bank_account_code=bank_acc.account_code,
            status="ACTIVE",
            is_reversed=False,
            auto_reverse=req.auto_reverse,
            auto_reverse_date=req.auto_reverse_date,
            supporting_document_id=req.supporting_document_id,
            notes=req.notes
        )
        self.db.add(record)
        self.db.flush()

        # 6. Post Initial Recognition Journal if requested
        if req.post_initial_journal:
            self._post_initial_recognition_journal(record, target_acc, bs_acc, bank_acc)

        self.db.commit()
        self.db.refresh(record)
        return record

    def _post_initial_recognition_journal(
        self, record: AccrualPrepaymentModel, target_acc: ChartOfAccountModel, bs_acc: ChartOfAccountModel, bank_acc: ChartOfAccountModel
    ):
        timestamp_str = f"{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"
        journal_id = f"JRN-INIT-{record.transaction_number}-{timestamp_str}"
        txn_id = f"TXN-INIT-{record.transaction_number}"
        doc_id = record.supporting_document_id or f"DOC-APR-{record.transaction_number}"

        amount = record.amount_myr
        lines = []

        if record.transaction_type == "ACCRUED_EXPENSE":
            # Incurred expense: Dr Expense, Cr Accruals
            lines = [
                {
                    "line_id": 1,
                    "account_code": target_acc.account_code,
                    "account_name": target_acc.account_name,
                    "account_type": target_acc.account_type,
                    "debit": amount,
                    "credit": 0.0,
                    "description": f"Accrued expense recognized: {record.title}"
                },
                {
                    "line_id": 2,
                    "account_code": bs_acc.account_code,
                    "account_name": bs_acc.account_name,
                    "account_type": bs_acc.account_type,
                    "debit": 0.0,
                    "credit": amount,
                    "description": f"Accrual liability recognized: {record.title}"
                }
            ]
            reason = f"Initial recognition of accrued expense '{record.title}' per MFRS accrual accounting."

        elif record.transaction_type == "PREPAID_EXPENSE":
            # Paid in advance: Dr Prepaid Asset, Cr Cash/Bank
            lines = [
                {
                    "line_id": 1,
                    "account_code": bs_acc.account_code,
                    "account_name": bs_acc.account_name,
                    "account_type": bs_acc.account_type,
                    "debit": amount,
                    "credit": 0.0,
                    "description": f"Prepayment asset recognized: {record.title}"
                },
                {
                    "line_id": 2,
                    "account_code": bank_acc.account_code,
                    "account_name": bank_acc.account_name,
                    "account_type": bank_acc.account_type,
                    "debit": 0.0,
                    "credit": amount,
                    "description": f"Advance disbursement for: {record.title}"
                }
            ]
            reason = f"Initial advance payment recognized as prepaid asset '{record.title}'."

        elif record.transaction_type == "ACCRUED_INCOME":
            # Earned revenue: Dr Accrued Income Asset, Cr Revenue
            lines = [
                {
                    "line_id": 1,
                    "account_code": bs_acc.account_code,
                    "account_name": bs_acc.account_name,
                    "account_type": bs_acc.account_type,
                    "debit": amount,
                    "credit": 0.0,
                    "description": f"Accrued income asset recognized: {record.title}"
                },
                {
                    "line_id": 2,
                    "account_code": target_acc.account_code,
                    "account_name": target_acc.account_name,
                    "account_type": target_acc.account_type,
                    "debit": 0.0,
                    "credit": amount,
                    "description": f"Earned revenue recognized: {record.title}"
                }
            ]
            reason = f"Initial recognition of earned unbilled revenue '{record.title}' per MFRS 15."

        elif record.transaction_type == "DEFERRED_INCOME":
            # Collected in advance: Dr Cash/Bank, Cr Deferred Income Liability
            lines = [
                {
                    "line_id": 1,
                    "account_code": bank_acc.account_code,
                    "account_name": bank_acc.account_name,
                    "account_type": bank_acc.account_type,
                    "debit": amount,
                    "credit": 0.0,
                    "description": f"Advance receipt from customer: {record.title}"
                },
                {
                    "line_id": 2,
                    "account_code": bs_acc.account_code,
                    "account_name": bs_acc.account_name,
                    "account_type": bs_acc.account_type,
                    "debit": 0.0,
                    "credit": amount,
                    "description": f"Deferred income liability recognized: {record.title}"
                }
            ]
            reason = f"Initial customer advance payment recognized as deferred income liability '{record.title}'."

        journal_entry = JournalEntryModel(
            journal_id=journal_id,
            transaction_id=txn_id,
            company_id=record.company_id,
            document_id=doc_id,
            journal_date=record.transaction_date,
            reference=f"Initial: {record.transaction_number}",
            description=f"Initial recognition of {record.transaction_type.replace('_', ' ')}: {record.title}",
            total_debit=amount,
            total_credit=amount,
            is_balanced=True,
            lines_json=json.dumps(lines),
            status="POSTED",
            audit_reasoning=reason
        )
        self.db.add(journal_entry)
        record.initial_journal_id = journal_id

        # Record adjustment event
        adj_rec = AccrualAdjustmentRecordModel(
            parent_id=record.id,
            company_id=record.company_id,
            adjustment_type="INITIAL_RECOGNITION",
            adjustment_date=record.transaction_date,
            period_name=record.accounting_period,
            amount=record.original_amount,
            amount_myr=record.amount_myr,
            balance_after=record.remaining_balance,
            journal_id=journal_id,
            description="Initial recognition journal entry posted."
        )
        self.db.add(adj_rec)

    def post_amortization_adjustment(self, record_id: int, req: AccrualAdjustmentRequest) -> AccrualAdjustmentRecordModel:
        record = self.db.query(AccrualPrepaymentModel).filter(AccrualPrepaymentModel.id == record_id).first()
        if not record:
            raise ValueError(f"Accrual/Prepayment record with ID {record_id} not found.")

        if record.status in ["FULLY_ADJUSTED", "CANCELLED"]:
            raise ValueError(f"Record '{record.transaction_number}' is {record.status} and cannot be further amortized.")

        if record.transaction_type not in ["PREPAID_EXPENSE", "DEFERRED_INCOME"]:
            raise ValueError(f"Transaction type {record.transaction_type} is settled via payment/collection, not periodic amortization.")

        adj_amt_dec = _to_decimal(req.amount)
        if adj_amt_dec <= Decimal("0.00"):
            raise ValueError("Adjustment amount must be strictly greater than zero.")

        rem_dec = _to_decimal(record.remaining_balance)
        if adj_amt_dec > rem_dec:
            raise ValueError(f"Adjustment amount (RM {adj_amt_dec:,.2f}) cannot exceed remaining balance (RM {rem_dec:,.2f}).")

        rate_dec = _to_rate_decimal(record.exchange_rate)
        adj_myr_dec = _to_decimal(adj_amt_dec * rate_dec)

        # Lookup accounts
        target_acc = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.account_code == record.target_account_code,
            ChartOfAccountModel.company_id == record.company_id
        ).first()

        bs_acc = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.account_code == record.balance_sheet_account_code,
            ChartOfAccountModel.company_id == record.company_id
        ).first()

        timestamp_str = f"{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"
        journal_id = f"JRN-AMORT-{record.transaction_number}-{timestamp_str}"
        txn_id = f"TXN-AMORT-{record.transaction_number}"
        doc_id = f"DOC-AMORT-{record.transaction_number}"

        amt_myr = _round_float(adj_myr_dec)
        period_label = req.period_name or req.adjustment_date[:7]

        if record.transaction_type == "PREPAID_EXPENSE":
            # Amortize prepaid: Dr Expense, Cr Prepaid Asset
            lines = [
                {
                    "line_id": 1,
                    "account_code": target_acc.account_code,
                    "account_name": target_acc.account_name,
                    "account_type": target_acc.account_type,
                    "debit": amt_myr,
                    "credit": 0.0,
                    "description": f"Prepayment amortized to expense: {record.title} ({period_label})"
                },
                {
                    "line_id": 2,
                    "account_code": bs_acc.account_code,
                    "account_name": bs_acc.account_name,
                    "account_type": bs_acc.account_type,
                    "debit": 0.0,
                    "credit": amt_myr,
                    "description": f"Prepaid asset reduction: {record.title} ({period_label})"
                }
            ]
            reason = f"Periodic amortization of prepaid expense '{record.title}' for {period_label}."
        else:
            # Recognize deferred income: Dr Deferred Income Liability, Cr Revenue
            lines = [
                {
                    "line_id": 1,
                    "account_code": bs_acc.account_code,
                    "account_name": bs_acc.account_name,
                    "account_type": bs_acc.account_type,
                    "debit": amt_myr,
                    "credit": 0.0,
                    "description": f"Deferred income recognized to revenue: {record.title} ({period_label})"
                },
                {
                    "line_id": 2,
                    "account_code": target_acc.account_code,
                    "account_name": target_acc.account_name,
                    "account_type": target_acc.account_type,
                    "debit": 0.0,
                    "credit": amt_myr,
                    "description": f"Revenue earned from advance: {record.title} ({period_label})"
                }
            ]
            reason = f"Periodic recognition of deferred income into earned revenue for {period_label}."

        journal_entry = JournalEntryModel(
            journal_id=journal_id,
            transaction_id=txn_id,
            company_id=record.company_id,
            document_id=doc_id,
            journal_date=req.adjustment_date,
            reference=f"Amortization: {record.transaction_number}",
            description=f"Periodic amortization for {record.title} ({period_label})",
            total_debit=amt_myr,
            total_credit=amt_myr,
            is_balanced=True,
            lines_json=json.dumps(lines),
            status="POSTED",
            audit_reasoning=reason
        )
        self.db.add(journal_entry)

        # Update record
        new_rem_dec = rem_dec - adj_amt_dec
        new_recognized_dec = _to_decimal(record.total_recognized_amount) + adj_amt_dec
        record.remaining_balance = _round_float(new_rem_dec)
        record.total_recognized_amount = _round_float(new_recognized_dec)

        if new_rem_dec <= Decimal("0.00"):
            record.status = "FULLY_ADJUSTED"
        else:
            record.status = "PARTIALLY_ADJUSTED"

        adj_rec = AccrualAdjustmentRecordModel(
            parent_id=record.id,
            company_id=record.company_id,
            adjustment_type="PERIODIC_AMORTIZATION",
            adjustment_date=req.adjustment_date,
            period_name=period_label,
            amount=_round_float(adj_amt_dec),
            amount_myr=amt_myr,
            balance_after=record.remaining_balance,
            journal_id=journal_id,
            description=f"Periodic amortization of RM {amt_myr:,.2f} for {period_label}",
            notes=req.notes
        )
        self.db.add(adj_rec)
        self.db.commit()
        self.db.refresh(record)
        self.db.refresh(adj_rec)
        return adj_rec

    def post_settlement(self, record_id: int, req: AccrualSettlementRequest) -> AccrualAdjustmentRecordModel:
        record = self.db.query(AccrualPrepaymentModel).filter(AccrualPrepaymentModel.id == record_id).first()
        if not record:
            raise ValueError(f"Accrual/Prepayment record with ID {record_id} not found.")

        if record.status in ["FULLY_ADJUSTED", "CANCELLED"]:
            raise ValueError(f"Record '{record.transaction_number}' is {record.status} and cannot be settled.")

        if record.is_reversed:
            raise ValueError(f"Record '{record.transaction_number}' has already been reversed.")

        if record.transaction_type not in ["ACCRUED_EXPENSE", "ACCRUED_INCOME"]:
            raise ValueError(f"Transaction type {record.transaction_type} is adjusted via periodic amortization, not cash settlement.")

        settle_amt_dec = _to_decimal(req.amount)
        if settle_amt_dec <= Decimal("0.00"):
            raise ValueError("Settlement amount must be strictly greater than zero.")

        rem_dec = _to_decimal(record.remaining_balance)
        if settle_amt_dec > rem_dec:
            raise ValueError(f"Settlement amount (RM {settle_amt_dec:,.2f}) cannot exceed outstanding balance (RM {rem_dec:,.2f}).")

        rate_dec = _to_rate_decimal(record.exchange_rate)
        settle_myr_dec = _to_decimal(settle_amt_dec * rate_dec)
        amt_myr = _round_float(settle_myr_dec)

        # Lookup BS Account & Bank Account
        bs_acc = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.account_code == record.balance_sheet_account_code,
            ChartOfAccountModel.company_id == record.company_id
        ).first()

        bank_acc_code = req.bank_account_code or record.bank_account_code or "310-1000"
        bank_acc = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.account_code == bank_acc_code,
            ChartOfAccountModel.company_id == record.company_id
        ).first()
        if not bank_acc:
            raise ValueError(f"Bank account '{bank_acc_code}' does not exist or is inactive.")

        timestamp_str = f"{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"
        journal_id = f"JRN-SETTLE-{record.transaction_number}-{timestamp_str}"
        txn_id = f"TXN-SETTLE-{record.transaction_number}"
        doc_id = f"DOC-SETTLE-{record.transaction_number}"

        if record.transaction_type == "ACCRUED_EXPENSE":
            # Paying off accrual liability: Dr Accruals, Cr Cash/Bank
            lines = [
                {
                    "line_id": 1,
                    "account_code": bs_acc.account_code,
                    "account_name": bs_acc.account_name,
                    "account_type": bs_acc.account_type,
                    "debit": amt_myr,
                    "credit": 0.0,
                    "description": f"Settlement of accrual liability: {record.title}"
                },
                {
                    "line_id": 2,
                    "account_code": bank_acc.account_code,
                    "account_name": bank_acc.account_name,
                    "account_type": bank_acc.account_type,
                    "debit": 0.0,
                    "credit": amt_myr,
                    "description": f"Cash disbursement settling: {record.title}"
                }
            ]
            reason = f"Cash settlement of accrued expense liability '{record.title}'. Expense is NOT duplicated."
        else:
            # Collecting accrued income: Dr Cash/Bank, Cr Accrued Income Asset
            lines = [
                {
                    "line_id": 1,
                    "account_code": bank_acc.account_code,
                    "account_name": bank_acc.account_name,
                    "account_type": bank_acc.account_type,
                    "debit": amt_myr,
                    "credit": 0.0,
                    "description": f"Collection of accrued income receipt: {record.title}"
                },
                {
                    "line_id": 2,
                    "account_code": bs_acc.account_code,
                    "account_name": bs_acc.account_name,
                    "account_type": bs_acc.account_type,
                    "debit": 0.0,
                    "credit": amt_myr,
                    "description": f"Settlement of accrued income asset: {record.title}"
                }
            ]
            reason = f"Customer receipt collecting accrued income asset '{record.title}'. Income is NOT duplicated."

        journal_entry = JournalEntryModel(
            journal_id=journal_id,
            transaction_id=txn_id,
            company_id=record.company_id,
            document_id=doc_id,
            journal_date=req.settlement_date,
            reference=f"Settlement: {record.transaction_number}",
            description=f"Settlement payment for {record.title}",
            total_debit=amt_myr,
            total_credit=amt_myr,
            is_balanced=True,
            lines_json=json.dumps(lines),
            status="POSTED",
            audit_reasoning=reason
        )
        self.db.add(journal_entry)

        # Update record balances
        new_rem_dec = rem_dec - settle_amt_dec
        new_recognized_dec = _to_decimal(record.total_recognized_amount) + settle_amt_dec
        record.remaining_balance = _round_float(new_rem_dec)
        record.total_recognized_amount = _round_float(new_recognized_dec)

        adj_type = "FULL_SETTLEMENT" if new_rem_dec <= Decimal("0.00") else "PARTIAL_SETTLEMENT"
        if new_rem_dec <= Decimal("0.00"):
            record.status = "FULLY_ADJUSTED"
        else:
            record.status = "PARTIALLY_ADJUSTED"

        adj_rec = AccrualAdjustmentRecordModel(
            parent_id=record.id,
            company_id=record.company_id,
            adjustment_type=adj_type,
            adjustment_date=req.settlement_date,
            period_name=req.settlement_date[:7],
            amount=_round_float(settle_amt_dec),
            amount_myr=amt_myr,
            balance_after=record.remaining_balance,
            journal_id=journal_id,
            description=f"Cash settlement payment of RM {amt_myr:,.2f}",
            notes=req.notes
        )
        self.db.add(adj_rec)
        self.db.commit()
        self.db.refresh(record)
        self.db.refresh(adj_rec)
        return adj_rec

    def post_reversal(self, record_id: int, req: AccrualReversalRequest) -> AccrualAdjustmentRecordModel:
        record = self.db.query(AccrualPrepaymentModel).filter(AccrualPrepaymentModel.id == record_id).first()
        if not record:
            raise ValueError(f"Accrual/Prepayment record with ID {record_id} not found.")

        if record.is_reversed:
            raise ValueError(f"Record '{record.transaction_number}' has already been reversed on {record.reversal_date} (Journal: {record.reversal_journal_id}). Duplicate reversals are prohibited.")

        if record.status == "CANCELLED":
            raise ValueError(f"Cancelled record '{record.transaction_number}' cannot be reversed.")

        if record.transaction_type not in ["ACCRUED_EXPENSE", "ACCRUED_INCOME"]:
            raise ValueError(f"Transaction type '{record.transaction_type}' uses periodic amortization; automatic reversals apply to Accruals only.")

        rem_dec = _to_decimal(record.remaining_balance)
        if rem_dec <= Decimal("0.00"):
            raise ValueError(f"Record '{record.transaction_number}' has already been fully settled/adjusted.")

        rate_dec = _to_rate_decimal(record.exchange_rate)
        rev_myr_dec = _to_decimal(rem_dec * rate_dec)
        amt_myr = _round_float(rev_myr_dec)

        target_acc = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.account_code == record.target_account_code,
            ChartOfAccountModel.company_id == record.company_id
        ).first()

        bs_acc = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.account_code == record.balance_sheet_account_code,
            ChartOfAccountModel.company_id == record.company_id
        ).first()

        timestamp_str = f"{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"
        journal_id = f"JRN-REV-{record.transaction_number}-{timestamp_str}"
        txn_id = f"TXN-REV-{record.transaction_number}"
        doc_id = f"DOC-REV-{record.transaction_number}"

        if record.transaction_type == "ACCRUED_EXPENSE":
            # Reversal: Dr Accruals, Cr Expense
            lines = [
                {
                    "line_id": 1,
                    "account_code": bs_acc.account_code,
                    "account_name": bs_acc.account_name,
                    "account_type": bs_acc.account_type,
                    "debit": amt_myr,
                    "credit": 0.0,
                    "description": f"Reversal of accrual liability: {record.title}"
                },
                {
                    "line_id": 2,
                    "account_code": target_acc.account_code,
                    "account_name": target_acc.account_name,
                    "account_type": target_acc.account_type,
                    "debit": 0.0,
                    "credit": amt_myr,
                    "description": f"Reversal credit offsetting future invoice: {record.title}"
                }
            ]
            reason = (
                f"Standard accounting reversal of accrued expense '{record.title}' on {req.reversal_date}. "
                f"Offsets subsequent vendor bill to prevent expense duplication (Original: {record.initial_journal_id})."
            )
        else:
            # Reversal: Dr Revenue, Cr Accrued Income Asset
            lines = [
                {
                    "line_id": 1,
                    "account_code": target_acc.account_code,
                    "account_name": target_acc.account_name,
                    "account_type": target_acc.account_type,
                    "debit": amt_myr,
                    "credit": 0.0,
                    "description": f"Reversal debit offsetting future invoice: {record.title}"
                },
                {
                    "line_id": 2,
                    "account_code": bs_acc.account_code,
                    "account_name": bs_acc.account_name,
                    "account_type": bs_acc.account_type,
                    "debit": 0.0,
                    "credit": amt_myr,
                    "description": f"Reversal of accrued income asset: {record.title}"
                }
            ]
            reason = (
                f"Standard accounting reversal of accrued income '{record.title}' on {req.reversal_date}. "
                f"Offsets subsequent sales invoice to prevent revenue duplication (Original: {record.initial_journal_id})."
            )

        journal_entry = JournalEntryModel(
            journal_id=journal_id,
            transaction_id=txn_id,
            company_id=record.company_id,
            document_id=doc_id,
            journal_date=req.reversal_date,
            reference=f"Reversal: {record.transaction_number}",
            description=f"Reversal entry for {record.title} (Orig: {record.initial_journal_id})",
            total_debit=amt_myr,
            total_credit=amt_myr,
            is_balanced=True,
            lines_json=json.dumps(lines),
            status="POSTED",
            audit_reasoning=reason
        )
        self.db.add(journal_entry)

        record.is_reversed = True
        record.reversal_date = req.reversal_date
        record.reversal_journal_id = journal_id
        record.remaining_balance = 0.0
        record.status = "FULLY_ADJUSTED"

        adj_rec = AccrualAdjustmentRecordModel(
            parent_id=record.id,
            company_id=record.company_id,
            adjustment_type="REVERSAL",
            adjustment_date=req.reversal_date,
            period_name=req.reversal_date[:7],
            amount=_round_float(rem_dec),
            amount_myr=amt_myr,
            balance_after=0.0,
            journal_id=journal_id,
            description=f"Accrual reversal journal posted: RM {amt_myr:,.2f}",
            notes=req.notes
        )
        self.db.add(adj_rec)
        self.db.commit()
        self.db.refresh(record)
        self.db.refresh(adj_rec)
        return adj_rec

    def post_cancellation_and_refund(self, record_id: int, req: AccrualCancellationRequest) -> AccrualAdjustmentRecordModel:
        record = self.db.query(AccrualPrepaymentModel).filter(AccrualPrepaymentModel.id == record_id).first()
        if not record:
            raise ValueError(f"Accrual/Prepayment record with ID {record_id} not found.")

        if record.status in ["CANCELLED", "FULLY_ADJUSTED"]:
            raise ValueError(f"Record '{record.transaction_number}' is already {record.status}.")

        rem_dec = _to_decimal(record.remaining_balance)
        refund_dec = _to_decimal(req.refund_amount) if req.refund_amount is not None else rem_dec
        if refund_dec > rem_dec:
            raise ValueError(f"Refund amount (RM {refund_dec:,.2f}) cannot exceed unamortized balance (RM {rem_dec:,.2f}).")

        rate_dec = _to_rate_decimal(record.exchange_rate)
        refund_myr_dec = _to_decimal(refund_dec * rate_dec)
        amt_myr = _round_float(refund_myr_dec)

        # Lookup Accounts
        bs_acc = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.account_code == record.balance_sheet_account_code,
            ChartOfAccountModel.company_id == record.company_id
        ).first()

        bank_acc_code = req.bank_account_code or record.bank_account_code or "310-1000"
        bank_acc = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.account_code == bank_acc_code,
            ChartOfAccountModel.company_id == record.company_id
        ).first()
        if not bank_acc:
            raise ValueError(f"Bank account '{bank_acc_code}' does not exist or is inactive.")

        timestamp_str = f"{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"
        journal_id = f"JRN-CNCL-{record.transaction_number}-{timestamp_str}"
        txn_id = f"TXN-CNCL-{record.transaction_number}"
        doc_id = f"DOC-CNCL-{record.transaction_number}"

        lines = []
        if record.transaction_type == "PREPAID_EXPENSE":
            # Refund of unused prepaid expense: Dr Bank, Cr Prepaid Asset
            lines = [
                {
                    "line_id": 1,
                    "account_code": bank_acc.account_code,
                    "account_name": bank_acc.account_name,
                    "account_type": bank_acc.account_type,
                    "debit": amt_myr,
                    "credit": 0.0,
                    "description": f"Cash refund received for cancelled prepayment: {record.title}"
                },
                {
                    "line_id": 2,
                    "account_code": bs_acc.account_code,
                    "account_name": bs_acc.account_name,
                    "account_type": bs_acc.account_type,
                    "debit": 0.0,
                    "credit": amt_myr,
                    "description": f"Derecognition of unused prepaid asset: {record.title}"
                }
            ]
            reason = f"Cancellation and refund of unamortized prepaid expense '{record.title}'."
        elif record.transaction_type == "DEFERRED_INCOME":
            # Refund of unearned customer advance: Dr Deferred Income Liability, Cr Bank
            lines = [
                {
                    "line_id": 1,
                    "account_code": bs_acc.account_code,
                    "account_name": bs_acc.account_name,
                    "account_type": bs_acc.account_type,
                    "debit": amt_myr,
                    "credit": 0.0,
                    "description": f"Derecognition of unearned advance deposit: {record.title}"
                },
                {
                    "line_id": 2,
                    "account_code": bank_acc.account_code,
                    "account_name": bank_acc.account_name,
                    "account_type": bank_acc.account_type,
                    "debit": 0.0,
                    "credit": amt_myr,
                    "description": f"Refund payment to customer: {record.title}"
                }
            ]
            reason = f"Cancellation and refund of unearned deferred customer advance '{record.title}'."
        else:
            # Accruals cancellation without cash
            record.status = "CANCELLED"
            record.remaining_balance = 0.0
            self.db.commit()
            adj_rec = AccrualAdjustmentRecordModel(
                parent_id=record.id,
                company_id=record.company_id,
                adjustment_type="CANCELLATION",
                adjustment_date=req.cancellation_date,
                period_name=req.cancellation_date[:7],
                amount=_round_float(rem_dec),
                amount_myr=amt_myr,
                balance_after=0.0,
                journal_id=None,
                description=f"Record cancelled without cash payment.",
                notes=req.notes
            )
            self.db.add(adj_rec)
            self.db.commit()
            return adj_rec

        journal_entry = JournalEntryModel(
            journal_id=journal_id,
            transaction_id=txn_id,
            company_id=record.company_id,
            document_id=doc_id,
            journal_date=req.cancellation_date,
            reference=f"Cancellation: {record.transaction_number}",
            description=f"Early cancellation & refund for {record.title}",
            total_debit=amt_myr,
            total_credit=amt_myr,
            is_balanced=True,
            lines_json=json.dumps(lines),
            status="POSTED",
            audit_reasoning=reason
        )
        self.db.add(journal_entry)

        record.status = "CANCELLED"
        record.remaining_balance = 0.0

        adj_rec = AccrualAdjustmentRecordModel(
            parent_id=record.id,
            company_id=record.company_id,
            adjustment_type="REFUND",
            adjustment_date=req.cancellation_date,
            period_name=req.cancellation_date[:7],
            amount=_round_float(refund_dec),
            amount_myr=amt_myr,
            balance_after=0.0,
            journal_id=journal_id,
            description=f"Refund journal posted: RM {amt_myr:,.2f}",
            notes=req.notes
        )
        self.db.add(adj_rec)
        self.db.commit()
        self.db.refresh(record)
        self.db.refresh(adj_rec)
        return adj_rec

    def get_summary(self, company_id: str = "COMP-000001") -> AccrualSummaryResponse:
        records = self.db.query(AccrualPrepaymentModel).filter(
            AccrualPrepaymentModel.company_id == company_id
        ).all()

        tot_acc_exp = 0.0
        tot_prp_exp = 0.0
        tot_acc_inc = 0.0
        tot_def_inc = 0.0
        active_cnt = 0
        fully_cnt = 0

        for r in records:
            if r.status in ["ACTIVE", "PARTIALLY_ADJUSTED"]:
                active_cnt += 1
                if r.transaction_type == "ACCRUED_EXPENSE":
                    tot_acc_exp += r.remaining_balance * r.exchange_rate
                elif r.transaction_type == "PREPAID_EXPENSE":
                    tot_prp_exp += r.remaining_balance * r.exchange_rate
                elif r.transaction_type == "ACCRUED_INCOME":
                    tot_acc_inc += r.remaining_balance * r.exchange_rate
                elif r.transaction_type == "DEFERRED_INCOME":
                    tot_def_inc += r.remaining_balance * r.exchange_rate
            elif r.status == "FULLY_ADJUSTED":
                fully_cnt += 1

        return AccrualSummaryResponse(
            total_accrued_expenses=round(tot_acc_exp, 2),
            total_prepaid_expenses=round(tot_prp_exp, 2),
            total_accrued_income=round(tot_acc_inc, 2),
            total_deferred_income=round(tot_def_inc, 2),
            active_count=active_cnt,
            fully_adjusted_count=fully_cnt,
            total_count=len(records)
        )
