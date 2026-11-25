import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session

from app.db.models import FixedAssetModel, ChartOfAccountModel, JournalEntryModel
from app.schemas.fixed_asset import (
    FixedAssetCreate,
    FixedAssetDisposalRequest,
    FixedAssetDisposalPreview,
    DisposalJournalLine,
    FixedAssetResponse
)


def _to_decimal(val: Any) -> Decimal:
    if val is None:
        return Decimal("0.00")
    return Decimal(str(val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _round_float(val: Decimal) -> float:
    return float(val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


class FixedAssetService:
    def __init__(self, db: Session):
        self.db = db

    def get_all_assets(self, company_id: str = "COMP-000001", status: Optional[str] = None) -> List[FixedAssetModel]:
        query = self.db.query(FixedAssetModel).filter(FixedAssetModel.company_id == company_id)
        if status:
            query = query.filter(FixedAssetModel.status == status)
        return query.order_by(FixedAssetModel.id.desc()).all()

    def get_asset_by_id(self, asset_id: int) -> Optional[FixedAssetModel]:
        return self.db.query(FixedAssetModel).filter(FixedAssetModel.id == asset_id).first()

    def get_asset_by_code(self, asset_code: str, company_id: str = "COMP-000001") -> Optional[FixedAssetModel]:
        return self.db.query(FixedAssetModel).filter(
            FixedAssetModel.asset_code == asset_code,
            FixedAssetModel.company_id == company_id
        ).first()

    def create_fixed_asset(self, req: FixedAssetCreate) -> FixedAssetModel:
        # 1. Check duplicate asset code
        existing = self.get_asset_by_code(req.asset_code, req.company_id)
        if existing:
            raise ValueError(f"Asset with code '{req.asset_code}' already exists.")

        # 2. Verify Cost Account exists in COA
        cost_acc = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.account_code == req.cost_account_code,
            ChartOfAccountModel.company_id == req.company_id,
            ChartOfAccountModel.is_active == True
        ).first()
        if not cost_acc:
            raise ValueError(f"Cost account '{req.cost_account_code}' does not exist or is inactive.")
        if cost_acc.account_type != "Asset":
            raise ValueError(f"Cost account '{req.cost_account_code}' must be of type 'Asset'.")

        # 3. Verify Accum Depr Account exists in COA
        accum_acc = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.account_code == req.accum_depr_account_code,
            ChartOfAccountModel.company_id == req.company_id,
            ChartOfAccountModel.is_active == True
        ).first()
        if not accum_acc:
            raise ValueError(f"Accumulated depreciation account '{req.accum_depr_account_code}' does not exist or is inactive.")

        # 4. Value validation
        cost_dec = _to_decimal(req.purchase_cost)
        if cost_dec <= Decimal("0.00"):
            raise ValueError("Purchase cost must be greater than zero.")

        salvage_dec = _to_decimal(req.salvage_value)
        if salvage_dec < Decimal("0.00"):
            raise ValueError("Salvage value cannot be negative.")
        if salvage_dec >= cost_dec:
            raise ValueError("Salvage value must be strictly less than purchase cost.")

        if req.useful_life_years <= 0:
            raise ValueError("Useful life years must be greater than zero.")

        accum_dec = _to_decimal(req.accumulated_depreciation)
        if accum_dec < Decimal("0.00"):
            raise ValueError("Accumulated depreciation cannot be negative.")
        if accum_dec > (cost_dec - salvage_dec):
            raise ValueError("Accumulated depreciation cannot exceed depreciable cost (Cost - Salvage Value).")

        initial_carrying_amount = cost_dec - accum_dec

        new_asset = FixedAssetModel(
            company_id=req.company_id,
            asset_code=req.asset_code.strip(),
            asset_name=req.asset_name.strip(),
            asset_category=req.asset_category,
            cost_account_code=req.cost_account_code.strip(),
            accum_depr_account_code=req.accum_depr_account_code.strip(),
            acquisition_date=req.acquisition_date.strip(),
            purchase_cost=_round_float(cost_dec),
            salvage_value=_round_float(salvage_dec),
            useful_life_years=float(req.useful_life_years),
            depreciation_method=req.depreciation_method,
            accumulated_depreciation=_round_float(accum_dec),
            current_carrying_amount=_round_float(initial_carrying_amount),
            status="ACTIVE"
        )
        self.db.add(new_asset)
        self.db.commit()
        self.db.refresh(new_asset)
        return new_asset

    def calculate_depreciation_to_date(self, asset: FixedAssetModel, target_date_str: str) -> float:
        """
        Calculates straight-line depreciation from acquisition_date to target_date_str.
        """
        acq_date = datetime.datetime.strptime(asset.acquisition_date, "%Y-%m-%d").date()
        target_date = datetime.datetime.strptime(target_date_str, "%Y-%m-%d").date()
        if target_date <= acq_date:
            return 0.0

        cost = _to_decimal(asset.purchase_cost)
        salvage = _to_decimal(asset.salvage_value)
        depreciable_base = cost - salvage
        life_years = Decimal(str(asset.useful_life_years))

        # Annual and daily straight-line rate
        annual_depr = depreciable_base / life_years
        daily_depr = annual_depr / Decimal("365")

        days = Decimal((target_date - acq_date).days)
        total_depr = daily_depr * days

        # Cap at depreciable base
        if total_depr > depreciable_base:
            total_depr = depreciable_base

        return _round_float(total_depr)

    def preview_disposal(self, asset_id: int, req: FixedAssetDisposalRequest) -> FixedAssetDisposalPreview:
        asset = self.get_asset_by_id(asset_id)
        if not asset:
            raise ValueError(f"Asset with ID {asset_id} not found.")

        if asset.status == "DISPOSED":
            raise ValueError(
                f"Asset '{asset.asset_code}' is already DISPOSED on {asset.disposal_date} "
                f"(Journal: {asset.disposal_journal_id}). Duplicate disposal is strictly prohibited."
            )

        # 1. Accounts verification
        proceeds_acc = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.account_code == req.proceeds_account_code,
            ChartOfAccountModel.company_id == asset.company_id,
            ChartOfAccountModel.is_active == True
        ).first()
        if not proceeds_acc:
            raise ValueError(f"Proceeds account '{req.proceeds_account_code}' does not exist or is inactive.")

        cost_acc = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.account_code == asset.cost_account_code,
            ChartOfAccountModel.company_id == asset.company_id
        ).first()

        accum_acc = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.account_code == asset.accum_depr_account_code,
            ChartOfAccountModel.company_id == asset.company_id
        ).first()

        gain_acc = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.account_code == "550-0000",
            ChartOfAccountModel.company_id == asset.company_id
        ).first()

        loss_acc = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.account_code == "916-0000",
            ChartOfAccountModel.company_id == asset.company_id
        ).first()

        disp_exp_acc = self.db.query(ChartOfAccountModel).filter(
            ChartOfAccountModel.account_code == "917-0000",
            ChartOfAccountModel.company_id == asset.company_id
        ).first()

        # 2. Precision Math
        cost_dec = _to_decimal(asset.purchase_cost)
        prior_accum_dec = _to_decimal(asset.accumulated_depreciation)
        add_depr_dec = _to_decimal(req.additional_depreciation)

        total_accum_dec = prior_accum_dec + add_depr_dec
        if total_accum_dec > cost_dec:
            raise ValueError(
                f"Total accumulated depreciation ({total_accum_dec}) cannot exceed historical cost ({cost_dec})."
            )

        nbv_dec = cost_dec - total_accum_dec  # Carrying Amount
        proceeds_dec = _to_decimal(req.disposal_proceeds)
        expenses_dec = _to_decimal(req.disposal_expenses)
        net_proceeds_dec = proceeds_dec - expenses_dec

        # Derecognition gain / loss on the asset derecognition vs proceeds
        # Double-entry lines:
        # Dr Proceeds Account: (proceeds_dec - expenses_dec) if proceeds >= expenses
        # Dr Disposal Expenses (917-0000): expenses_dec
        # Dr Accum Depr: total_accum_dec
        # Cr Asset Cost: cost_dec
        # Cr Gain on Disposal (550-0000) if proceeds > nbv
        # Dr Loss on Disposal (916-0000) if proceeds < nbv
        
        diff_dec = proceeds_dec - nbv_dec
        if diff_dec > Decimal("0.00"):
            gain_loss_type = "GAIN"
            gain_amount_dec = diff_dec
            loss_amount_dec = Decimal("0.00")
            gain_loss_code = "550-0000"
            gain_loss_name = gain_acc.account_name if gain_acc else "GAIN ON DISPOSAL OF FIXED ASSETS"
        elif diff_dec < Decimal("0.00"):
            gain_loss_type = "LOSS"
            gain_amount_dec = Decimal("0.00")
            loss_amount_dec = abs(diff_dec)
            gain_loss_code = "916-0000"
            gain_loss_name = loss_acc.account_name if loss_acc else "LOSS ON DISPOSAL OF FIXED ASSETS"
        else:
            gain_loss_type = "ZERO"
            gain_amount_dec = Decimal("0.00")
            loss_amount_dec = Decimal("0.00")
            gain_loss_code = None
            gain_loss_name = None

        # Build balanced journal lines
        journal_lines: List[DisposalJournalLine] = []
        line_num = 1

        # Liability account for unpaid disposal expenses (if any)
        liability_acc = None
        if expenses_dec > Decimal("0.00") and not req.expenses_paid:
            liability_code = req.expense_liability_account_code or "405-0000"
            liability_acc = self.db.query(ChartOfAccountModel).filter(
                ChartOfAccountModel.account_code == liability_code,
                ChartOfAccountModel.company_id == asset.company_id
            ).first()
            if not liability_acc:
                raise ValueError(f"Liability account '{liability_code}' for unpaid disposal expenses does not exist.")

        # Proceeds & Cash logic:
        # If expenses are paid immediately: Net cash received into bank = proceeds_dec - expenses_dec
        # If expenses are unpaid: Cash received into bank = proceeds_dec (gross), and expenses are credited to liability
        if req.expenses_paid:
            net_bank_cash = proceeds_dec - expenses_dec
            if net_bank_cash > Decimal("0.00"):
                journal_lines.append(DisposalJournalLine(
                    line_id=line_num,
                    account_code=proceeds_acc.account_code,
                    account_name=proceeds_acc.account_name,
                    account_type=proceeds_acc.account_type,
                    debit=_round_float(net_bank_cash),
                    credit=0.0,
                    description=f"Net disposal proceeds received for {asset.asset_name} ({asset.asset_code})"
                ))
                line_num += 1
            elif net_bank_cash < Decimal("0.00"):
                journal_lines.append(DisposalJournalLine(
                    line_id=line_num,
                    account_code=proceeds_acc.account_code,
                    account_name=proceeds_acc.account_name,
                    account_type=proceeds_acc.account_type,
                    debit=0.0,
                    credit=_round_float(abs(net_bank_cash)),
                    description=f"Net cash paid for disposal expenses of {asset.asset_name} ({asset.asset_code})"
                ))
                line_num += 1
        else:
            # Unpaid expenses: Gross proceeds received into bank
            if proceeds_dec > Decimal("0.00"):
                journal_lines.append(DisposalJournalLine(
                    line_id=line_num,
                    account_code=proceeds_acc.account_code,
                    account_name=proceeds_acc.account_name,
                    account_type=proceeds_acc.account_type,
                    debit=_round_float(proceeds_dec),
                    credit=0.0,
                    description=f"Gross disposal proceeds received for {asset.asset_name} ({asset.asset_code})"
                ))
                line_num += 1

        # Line: Disposal Expenses (917-0000)
        if expenses_dec > Decimal("0.00"):
            journal_lines.append(DisposalJournalLine(
                line_id=line_num,
                account_code="917-0000",
                account_name=disp_exp_acc.account_name if disp_exp_acc else "FIXED ASSET DISPOSAL EXPENSES",
                account_type="Expense",
                debit=_round_float(expenses_dec),
                credit=0.0,
                description=f"Direct disposal expenses incurred for {asset.asset_name} ({asset.asset_code})"
            ))
            line_num += 1

            # If expenses unpaid: record liability credit (e.g. 405-0000 OTHER CREDITORS / ACCRUALS)
            if not req.expenses_paid:
                journal_lines.append(DisposalJournalLine(
                    line_id=line_num,
                    account_code=liability_acc.account_code,
                    account_name=liability_acc.account_name,
                    account_type=liability_acc.account_type,
                    debit=0.0,
                    credit=_round_float(expenses_dec),
                    description=f"Unpaid disposal expenses payable for {asset.asset_name} ({asset.asset_code})"
                ))
                line_num += 1

        # Line 3: Remove Accumulated Depreciation
        if total_accum_dec > Decimal("0.00"):
            journal_lines.append(DisposalJournalLine(
                line_id=line_num,
                account_code=asset.accum_depr_account_code,
                account_name=accum_acc.account_name if accum_acc else "ACCUMULATED DEPRECIATION",
                account_type="Asset",
                debit=_round_float(total_accum_dec),
                credit=0.0,
                description=f"Derecognition of accumulated depreciation for {asset.asset_name} ({asset.asset_code})"
            ))
            line_num += 1

        # Line 4: Derecognition of Asset Historical Cost (Credit Asset Account)
        journal_lines.append(DisposalJournalLine(
            line_id=line_num,
            account_code=asset.cost_account_code,
            account_name=cost_acc.account_name if cost_acc else "FIXED ASSETS",
            account_type="Asset",
            debit=0.0,
            credit=_round_float(cost_dec),
            description=f"Derecognition of historical cost for {asset.asset_name} ({asset.asset_code})"
        ))
        line_num += 1

        # Line 5: Gain or Loss on Asset Derecognition
        if gain_loss_type == "GAIN":
            journal_lines.append(DisposalJournalLine(
                line_id=line_num,
                account_code="550-0000",
                account_name=gain_loss_name or "GAIN ON DISPOSAL OF FIXED ASSETS",
                account_type="Revenue",
                debit=0.0,
                credit=_round_float(gain_amount_dec),
                description=f"Gain on disposal of {asset.asset_name} ({asset.asset_code})"
            ))
            line_num += 1
        elif gain_loss_type == "LOSS":
            journal_lines.append(DisposalJournalLine(
                line_id=line_num,
                account_code="916-0000",
                account_name=gain_loss_name or "LOSS ON DISPOSAL OF FIXED ASSETS",
                account_type="Expense",
                debit=_round_float(loss_amount_dec),
                credit=0.0,
                description=f"Loss on disposal of {asset.asset_name} ({asset.asset_code})"
            ))
            line_num += 1

        total_debit = round(sum(l.debit for l in journal_lines), 2)
        total_credit = round(sum(l.credit for l in journal_lines), 2)
        is_balanced = abs(total_debit - total_credit) < 0.001

        # Net accounting gain/loss = net_proceeds_dec - nbv_dec
        net_gain_loss = _round_float(net_proceeds_dec - nbv_dec)
        net_cash = _round_float(proceeds_dec - expenses_dec) if req.expenses_paid else _round_float(proceeds_dec)

        return FixedAssetDisposalPreview(
            asset_code=asset.asset_code,
            asset_name=asset.asset_name,
            disposal_date=req.disposal_date,
            purchase_cost=_round_float(cost_dec),
            prior_accumulated_depreciation=_round_float(prior_accum_dec),
            additional_depreciation=_round_float(add_depr_dec),
            total_accumulated_depreciation=_round_float(total_accum_dec),
            carrying_amount_nbv=_round_float(nbv_dec),
            disposal_proceeds=_round_float(proceeds_dec),
            disposal_expenses=_round_float(expenses_dec),
            expenses_paid=req.expenses_paid,
            net_cash_received=net_cash,
            net_proceeds=_round_float(net_proceeds_dec),
            gain_loss_amount=net_gain_loss,
            gain_loss_type=gain_loss_type,
            gain_loss_account_code=gain_loss_code,
            gain_loss_account_name=gain_loss_name,
            is_balanced=is_balanced,
            total_debit=total_debit,
            total_credit=total_credit,
            journal_lines=journal_lines
        )

    def execute_disposal(self, asset_id: int, req: FixedAssetDisposalRequest) -> Tuple[FixedAssetModel, JournalEntryModel]:
        # 1. Preview and validate balancing
        preview = self.preview_disposal(asset_id, req)
        if not preview.is_balanced:
            raise ValueError(
                f"Disposal journal entry does not balance! Total Debits: {preview.total_debit}, Total Credits: {preview.total_credit}."
            )

        asset = self.get_asset_by_id(asset_id)
        if not asset or asset.status == "DISPOSED":
            raise ValueError("Asset cannot be disposed (not found or already disposed).")

        import json

        # 2. Generate unique Journal ID
        timestamp_str = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        journal_id = f"JRN-DISP-{asset.asset_code}-{timestamp_str}"
        txn_id = f"TXN-DISP-{asset.asset_code}"
        doc_id = f"DOC-DISP-{asset.asset_code}"

        lines_dicts = [l.model_dump() for l in preview.journal_lines]

        journal_entry = JournalEntryModel(
            journal_id=journal_id,
            transaction_id=txn_id,
            company_id=asset.company_id,
            document_id=doc_id,
            journal_date=req.disposal_date,
            reference=f"Disposal of {asset.asset_code}",
            description=f"Derecognition on disposal of fixed asset {asset.asset_name} ({asset.asset_code})",
            total_debit=preview.total_debit,
            total_credit=preview.total_credit,
            is_balanced=True,
            lines_json=json.dumps(lines_dicts),
            status="POSTED",
            audit_reasoning=(
                f"Fixed asset derecognition in accordance with MFRS 116. "
                f"Original cost RM {preview.purchase_cost:,.2f} removed from {asset.cost_account_code}; "
                f"Accumulated depreciation RM {preview.total_accumulated_depreciation:,.2f} removed from {asset.accum_depr_account_code}; "
                f"Net Book Value: RM {preview.carrying_amount_nbv:,.2f}; "
                f"Net Proceeds: RM {preview.net_proceeds:,.2f}; "
                f"Recognized {preview.gain_loss_type} of RM {abs(preview.gain_loss_amount):,.2f}."
            )
        )
        self.db.add(journal_entry)

        # 3. Update Asset Record
        asset.status = "DISPOSED"
        asset.accumulated_depreciation = preview.total_accumulated_depreciation
        asset.current_carrying_amount = 0.0  # Derecognized from Balance Sheet
        asset.disposal_date = req.disposal_date
        asset.disposal_proceeds = preview.disposal_proceeds
        asset.disposal_expenses = preview.disposal_expenses
        asset.expenses_paid = req.expenses_paid
        asset.expense_liability_account_code = req.expense_liability_account_code if not req.expenses_paid else None
        asset.net_proceeds = preview.net_proceeds
        asset.proceeds_account_code = req.proceeds_account_code
        asset.gain_loss_amount = preview.gain_loss_amount
        asset.gain_loss_type = preview.gain_loss_type
        asset.disposal_journal_id = journal_id
        asset.disposal_notes = req.disposal_notes

        self.db.commit()
        self.db.refresh(asset)
        self.db.refresh(journal_entry)

        return asset, journal_entry
