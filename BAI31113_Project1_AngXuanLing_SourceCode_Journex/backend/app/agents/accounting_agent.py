from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.schemas.document import (
    ExtractedDocumentData,
    AccountingAnalysisSchema,
    SelectedAccountSchema,
    JournalEntrySchema,
    JournalEntryLineSchema
)
from app.db.models import ChartOfAccountModel, CompanyModel
from app.db.database import DEFAULT_CHART_OF_ACCOUNTS


class AccountingAgent:
    """
    Milestone 2 Phase 1: Accounting Agent
    Aligned with standard Malaysian Chart of Accounts (SQL Account / AutoCount / UBS format)
    
    Responsibilities:
    1. Ingests VERIFIED document output from DocumentProcessingAgent (Stage 1).
    2. Identifies the Accounting Event (Stage 1).
    3. Selects the Book of Prime Entry (Stage 2).
    4. Selects affected accounts strictly from the active Company's Chart of Accounts (Stage 3).
    5. Determines full Debits and Credits and generates a Journal Entry.
    """

    def __init__(self, db: Optional[Session] = None, company_id: str = "COMP-000001"):
        self.db = db
        self.company_id = company_id
        self._coa_cache: List[Dict[str, str]] = []
        self._load_chart_of_accounts()

    def _is_our_company(self, name: Optional[str]) -> bool:
        if not name or not isinstance(name, str):
            return False
        clean_n = name.strip().upper()
        if not clean_n or clean_n in ["N/A", "UNKNOWN", "NONE", "NULL"]:
            return False
        
        comp_id_upper = str(self.company_id or "").strip().upper()
        
        if self.db:
            try:
                comp = self.db.query(CompanyModel).filter(CompanyModel.company_id == self.company_id).first()
                if comp and comp.company_name:
                    clean_db = comp.company_name.strip().upper()
                    if clean_db in clean_n or clean_n in clean_db:
                        return True
            except Exception:
                pass

        return "NEXTTECH" in clean_n or comp_id_upper in clean_n

    def _load_chart_of_accounts(self):
        if self.db:
            accounts = self.db.query(ChartOfAccountModel).filter(
                ChartOfAccountModel.company_id == self.company_id,
                ChartOfAccountModel.is_active == True,
                ChartOfAccountModel.is_group == False
            ).all()
            if accounts:
                self._coa_cache = [
                    {
                        "code": acc.account_code,
                        "name": acc.account_name,
                        "type": acc.account_type,
                        "desc": acc.description or ""
                    }
                    for acc in accounts
                ]
                return

        # Fallback to default COA list (excluding groups) if DB session is not passed or empty
        self._coa_cache = [
            {"code": item["code"], "name": item["name"], "type": item["type"], "desc": item["desc"]}
            for item in DEFAULT_CHART_OF_ACCOUNTS if not item.get("is_group")
        ]

    def _find_account(self, code: str) -> Optional[SelectedAccountSchema]:
        for acc in self._coa_cache:
            if acc["code"] == code:
                return SelectedAccountSchema(
                    account_code=acc["code"],
                    account_name=acc["name"],
                    account_type=acc["type"]
                )
        return None

    def analyze(self, document_input: Any) -> AccountingAnalysisSchema:
        """
        Executes 3-stage accounting analysis on verified structured document input:
        1. Identify Accounting Event
        2. Select Book of Prime Entry
        3. Select Accounts from Chart of Accounts
        """
        if isinstance(document_input, ExtractedDocumentData):
            data = document_input.dict()
        elif isinstance(document_input, dict):
            data = document_input
        else:
            data = {}

        doc_type = data.get("document_type", "Unknown")
        line_items = data.get("line_items", [])
        tax_amount = float(data.get("tax_amount") or 0.0)
        payment_method = str(data.get("payment_method") or "").strip().lower()

        currency = str(data.get("currency") or "MYR").upper().strip()
        is_foreign = currency not in ["MYR", "RM"]

        # Ensure foreign currency conversion is populated
        if is_foreign and not data.get("converted_amount_myr"):
            try:
                from app.services.currency_service import CurrencyExchangeService
                conv_res = CurrencyExchangeService.convert_document_amounts(
                    currency=currency,
                    transaction_date=data.get("transaction_date") or data.get("statement_date"),
                    grand_total=data.get("grand_total"),
                    subtotal=data.get("subtotal"),
                    discount=data.get("discount"),
                    shipping=data.get("shipping"),
                    tax_amount=data.get("tax_amount")
                )
                for k, v in conv_res.items():
                    if k not in data or data[k] is None:
                        data[k] = v
            except Exception as e:
                needs_review = True
                review_reason = f"Currency conversion failed for {currency}: {str(e)}"

        # Inspect line item descriptions to understand transaction specifics
        item_descs = " ".join([str(item.get("item_description", "")).lower() for item in line_items])

        accounting_event = ""
        book_of_prime_entry = ""
        selected_accounts: List[SelectedAccountSchema] = []
        needs_review = False
        review_reason = None

        # ---------------------------------------------------------------------
        # 1. SALES INVOICE
        # ---------------------------------------------------------------------
        if doc_type == "Sales Invoice":
            if "service" in item_descs or "hosting" in item_descs or "maintenance" in item_descs or "consulting" in item_descs:
                accounting_event = "Credit sale of IT services"
            else:
                accounting_event = "Credit sale of goods/services"

            book_of_prime_entry = "Sales Day Book"

            debtor_acc = self._find_account("300-0000")  # TRADE DEBTORS
            sales_acc = self._find_account("500-0000")   # SALES
            tax_acc = self._find_account("430-0000")     # SALES TAX

            if debtor_acc:
                selected_accounts.append(debtor_acc)
            if sales_acc:
                selected_accounts.append(sales_acc)
            if tax_amount > 0 and tax_acc:
                selected_accounts.append(tax_acc)

        # ---------------------------------------------------------------------
        # 2. PURCHASE INVOICE / SUPPLIER INVOICE
        # ---------------------------------------------------------------------
        elif doc_type in ["Purchase Invoice", "Supplier Invoice"]:
            if any(k in item_descs for k in ["subscription", "software", "license", "cloud", "server", "hosting", "ssl", "maintenance", "digital"]):
                accounting_event = "Credit purchase of IT services/subscriptions"
                asset_exp_acc = self._find_account("915-0000")  # GENERAL EXPENSES
            elif any(k in item_descs for k in ["computer", "hardware", "laptop", "equipment", "keyboard", "monitor", "electronic"]):
                accounting_event = "Credit purchase of computer equipment"
                asset_exp_acc = self._find_account("200-3000")  # OFFICE EQUIPMENT
            else:
                accounting_event = "Credit purchase of goods/services"
                asset_exp_acc = self._find_account("610-0000") or self._find_account("200-3000")  # PURCHASES

            book_of_prime_entry = "Purchases Day Book"

            creditor_acc = self._find_account("400-0000")  # TRADE CREDITORS
            tax_acc = self._find_account("430-0000")       # SALES TAX
            shipping_acc = self._find_account("615-0000")  # CARRIAGE INWARDS
            discount_acc = self._find_account("540-0000")  # DISCOUNT RECEIVED

            if asset_exp_acc:
                selected_accounts.append(asset_exp_acc)
            if (data.get("shipping") or data.get("shipping_myr")) and shipping_acc:
                selected_accounts.append(shipping_acc)
            if creditor_acc:
                selected_accounts.append(creditor_acc)
            if (data.get("discount") or data.get("discount_myr")) and discount_acc:
                selected_accounts.append(discount_acc)
            if (tax_amount > 0 or data.get("tax_amount_myr")) and tax_acc:
                selected_accounts.append(tax_acc)

        # ---------------------------------------------------------------------
        # 3. PURCHASE RECEIPT
        # ---------------------------------------------------------------------
        elif doc_type == "Purchase Receipt":
            if "cash" in payment_method:
                pay_method_str = "cash"
            elif "card" in payment_method:
                pay_method_str = "company card" if "company" in payment_method else "card"
            elif payment_method:
                pay_method_str = payment_method.lower()
            else:
                pay_method_str = "cash"

            if any(k in item_descs for k in ["paper", "folder", "pen", "stationery", "office"]):
                accounting_event = f"Purchase of office supplies paid by {pay_method_str}"
                exp_acc = self._find_account("910-0000") or self._find_account("610-0000")  # PRINTING & STATIONERY
            else:
                accounting_event = f"Purchase paid by {pay_method_str}"
                exp_acc = self._find_account("610-0000") or self._find_account("910-0000")  # PURCHASES

            book_of_prime_entry = "Cash Book"

            pay_acc = self._find_account("320-0000") if "cash" in payment_method else self._find_account("310-1000")
            tax_acc = self._find_account("430-0000")

            if exp_acc:
                selected_accounts.append(exp_acc)
            if tax_amount > 0 and tax_acc:
                selected_accounts.append(tax_acc)
            if pay_acc:
                selected_accounts.append(pay_acc)

        # ---------------------------------------------------------------------
        # 4. EXPENSE RECEIPT
        # ---------------------------------------------------------------------
        elif doc_type == "Expense Receipt":
            merchant = str(data.get("merchant_name") or data.get("vendor_name") or "").lower()
            if "company card" in payment_method or "card" in payment_method:
                pay_method_str = "company card"
            elif "cash" in payment_method:
                pay_method_str = "cash"
            elif payment_method:
                pay_method_str = payment_method.lower()
            else:
                pay_method_str = "company card"

            if any(k in item_descs or k in merchant for k in ["lunch", "cafe", "café", "coffee", "meal", "food", "dining", "restaurant"]):
                accounting_event = f"Business meal expense paid by {pay_method_str}"
                exp_acc = self._find_account("915-0000") or self._find_account("905-0000")  # GENERAL EXPENSES
            elif any(k in item_descs for k in ["paper", "stationery", "supplies"]):
                accounting_event = f"Office supplies expense paid by {pay_method_str}"
                exp_acc = self._find_account("910-0000")  # PRINTING & STATIONERY
            else:
                accounting_event = f"Business expense paid by {pay_method_str}"
                exp_acc = self._find_account("915-0000")  # GENERAL EXPENSES

            book_of_prime_entry = "Cash Book"

            pay_acc = self._find_account("310-1000") if ("card" in payment_method or "bank" in payment_method or "transfer" in payment_method) else (self._find_account("320-0000") or self._find_account("310-1000"))
            tax_acc = self._find_account("430-0000")

            if exp_acc:
                selected_accounts.append(exp_acc)
            if tax_amount > 0 and tax_acc:
                selected_accounts.append(tax_acc)
            if pay_acc:
                selected_accounts.append(pay_acc)

        # ---------------------------------------------------------------------
        # 5. PAYMENT RECEIPT / OFFICIAL RECEIPT
        # ---------------------------------------------------------------------
        elif doc_type in ["Payment Receipt", "Official Receipt"]:
            accounting_event = "Customer payment received"
            book_of_prime_entry = "Cash Book"

            pay_method = (data.get("payment_method") or "").upper()
            if "CASH" in pay_method and "CHEQUE" not in pay_method and "BANK" not in pay_method:
                bank_acc = self._find_account("320-0000") or self._find_account("310-1000")  # CASH IN HAND
            else:
                bank_acc = self._find_account("310-1000") or self._find_account("320-0000")  # CASH AT BANK
            debtor_acc = self._find_account("300-0000") or self._find_account("300-9000")    # TRADE DEBTORS

            if bank_acc:
                selected_accounts.append(bank_acc)
            if debtor_acc:
                selected_accounts.append(debtor_acc)

        # ---------------------------------------------------------------------
        # 5b. PAYMENT VOUCHER
        # ---------------------------------------------------------------------
        elif doc_type == "Payment Voucher":
            raw_txt_upper = str(data.get("raw_text") or "").upper()
            pay_method = (data.get("payment_method") or "").upper()
            is_float_topup = any(k in raw_txt_upper or k in item_descs.upper() for k in ["FLOAT TOP-UP", "PETTY CASH FLOAT", "CASH WITHDRAWAL FROM BANK", "PETTY CASH REPLENISHMENT"])

            if is_float_topup:
                accounting_event = "Petty cash float top-up / cash withdrawal from bank"
                book_of_prime_entry = "Cash Book"
                exp_acc = self._find_account("320-0000")   # Dr CASH IN HAND
                bank_acc = self._find_account("310-1000")  # Cr CASH AT BANK
                if exp_acc:
                    selected_accounts.append(exp_acc)
                if bank_acc:
                    selected_accounts.append(bank_acc)
            else:
                accounting_event = "Cash / Cheque payment for expenses / liabilities"
                book_of_prime_entry = "Cash Book"

                if ("CASH" in pay_method and "CHEQUE" not in pay_method and "BANK" not in pay_method) or "CASH IN HAND" in raw_txt_upper or "PETTY CASH" in raw_txt_upper:
                    bank_acc = self._find_account("320-0000") or self._find_account("310-1000")  # CASH IN HAND
                else:
                    bank_acc = self._find_account("310-1000") or self._find_account("320-0000")  # CASH AT BANK
                for item in line_items:
                    c = item.get("account_code")
                    if c:
                        acc = self._find_account(c)
                        if acc:
                            selected_accounts.append(acc)
                if not selected_accounts:
                    if any(k in item_descs for k in ["printing", "stationery", "paper"]):
                        exp_acc = self._find_account("910-0000") or self._find_account("915-0000")
                    else:
                        exp_acc = self._find_account("915-0000") or self._find_account("909-0000") or self._find_account("907-0000")
                    if exp_acc:
                        selected_accounts.append(exp_acc)
                if bank_acc:
                    selected_accounts.append(bank_acc)

        # ---------------------------------------------------------------------
        # 5c. STOCK TAKE (INVENTORY / STOCK TAKE REGISTER - NON-POSTING UNTIL APPROVED)
        # ---------------------------------------------------------------------
        elif doc_type == "Stock Take":
            accounting_event = "Physical inventory count / Stock discrepancy record"
            book_of_prime_entry = "Inventory / Stock Take Register"
            selected_accounts = []

        # ---------------------------------------------------------------------
        # 5d. DELIVERY ORDER / PURCHASE ORDER / SALES ORDER (NON-POSTING)
        # ---------------------------------------------------------------------
        elif doc_type == "Delivery Order":
            accounting_event = "Goods delivered to customer (Shipping document)"
            book_of_prime_entry = "Delivery Order Listing"
            selected_accounts = []

        elif doc_type == "Purchase Order":
            accounting_event = "Purchase order issued to supplier"
            book_of_prime_entry = "Purchase Order Register"
            selected_accounts = []

        elif doc_type == "Sales Order":
            accounting_event = "Sales order received from customer"
            book_of_prime_entry = "Sales Order Register"
            selected_accounts = []

        # ---------------------------------------------------------------------
        # 5e. PURCHASE RETURN
        # ---------------------------------------------------------------------
        elif doc_type == "Purchase Return":
            accounting_event = "Purchase return / goods returned to supplier"
            book_of_prime_entry = "Purchases Returns Day Book"
            creditor_acc = self._find_account("400-0000")
            return_acc = self._find_account("612-0000") or self._find_account("610-0000")
            if creditor_acc:
                selected_accounts.append(creditor_acc)
            if return_acc:
                selected_accounts.append(return_acc)

        # ---------------------------------------------------------------------
        # 6. BANK TRANSFER RECEIPT
        # ---------------------------------------------------------------------
        elif doc_type == "Bank Transfer Receipt":
            roles = data.get("business_roles") or {}
            ref_desc = str(data.get("payment_reference") or data.get("payment_description") or "").lower()
            
            if "inv-" in ref_desc or roles.get("customer") or data.get("buyer_name"):
                accounting_event = "Customer payment received via bank transfer"
                debtor_acc = self._find_account("300-0000")
                bank_acc = self._find_account("310-1000")
                if bank_acc:
                    selected_accounts.append(bank_acc)
                if debtor_acc:
                    selected_accounts.append(debtor_acc)
            else:
                accounting_event = "Vendor payment made via bank transfer"
                creditor_acc = self._find_account("400-0000")
                bank_acc = self._find_account("310-1000")
                if creditor_acc:
                    selected_accounts.append(creditor_acc)
                if bank_acc:
                    selected_accounts.append(bank_acc)

            book_of_prime_entry = "Cash Book"

        # ---------------------------------------------------------------------
        # 7. BANK STATEMENT & BANK TRANSACTION RECORD
        # ---------------------------------------------------------------------
        elif doc_type in ["Bank Statement", "Bank Transaction Record"]:
            if doc_type == "Bank Statement":
                opening_bal = float(data.get("opening_balance") or 0.0)
                if opening_bal > 0:
                    accounting_event = "Opening balance - Cash at Bank"
                    book_of_prime_entry = "General Journal"
                    bank_acc = self._find_account("310-1000")
                    equity_acc = self._find_account("150-0000") or self._find_account("100-0000")
                    if bank_acc:
                        selected_accounts.append(bank_acc)
                    if equity_acc:
                        selected_accounts.append(equity_acc)
                else:
                    accounting_event = "Bank account statement for bank reconciliation"
                    book_of_prime_entry = "Bank Statement Record"
                    selected_accounts = []  # Bank Statement is a source document, not a posted ledger transaction
            else:
                roles = data.get("business_roles") or {}
                ref_desc = str(data.get("payment_reference") or data.get("payment_description") or "").lower()
                accounting_event = "Customer payment received via bank transfer"
                book_of_prime_entry = "Cash Book"
                bank_acc = self._find_account("310-1000")
                debtor_acc = self._find_account("300-0000")
                if bank_acc:
                    selected_accounts.append(bank_acc)
                if debtor_acc:
                    selected_accounts.append(debtor_acc)

        # ---------------------------------------------------------------------
        # 8. CREDIT / DEBIT NOTES
        # ---------------------------------------------------------------------
        elif "Credit Note" in doc_type or doc_type in ["Credit Note", "Supplier Credit Note", "Debit Note"]:
            roles = data.get("business_roles") or {}
            vendor_name = data.get("vendor_name") or roles.get("vendor") or roles.get("supplier")
            buyer_name = data.get("buyer_name") or roles.get("customer") or roles.get("buyer")
            rel_inv = str(data.get("related_invoice_number") or data.get("related_invoice") or "").strip().upper()
            
            # Determine direction:
            # IT IS A PURCHASE RETURN if:
            # 1. doc_type specifies "Supplier Credit Note" or "Purchase Credit Note"
            # 2. Related Invoice prefix starts with PUR- or SUP-
            # 3. Extracted Vendor is NOT our company AND/OR Buyer IS our company
            is_purchase_return = False
            
            if "supplier" in doc_type.lower() or "purchase" in doc_type.lower():
                is_purchase_return = True
            elif rel_inv.startswith("PUR-") or rel_inv.startswith("SUP-"):
                is_purchase_return = True
            elif vendor_name and not self._is_our_company(vendor_name):
                is_purchase_return = True
            elif buyer_name and self._is_our_company(buyer_name):
                is_purchase_return = True
            elif roles.get("vendor") or roles.get("supplier"):
                is_purchase_return = True
            
            if is_purchase_return:
                accounting_event = "Purchase return / goods returned to supplier"
                book_of_prime_entry = "Purchases Returns Day Book"
                creditor_acc = self._find_account("400-0000")   # TRADE CREDITORS
                equip_acc = self._find_account("200-3000") or self._find_account("610-0000")  # OFFICE EQUIPMENT / PURCHASES
                tax_acc = self._find_account("430-0000")        # SALES TAX
                if creditor_acc:
                    selected_accounts.append(creditor_acc)
                if equip_acc:
                    selected_accounts.append(equip_acc)
                if tax_amount > 0 and tax_acc:
                    selected_accounts.append(tax_acc)
            else:
                accounting_event = "Sales return / customer return"
                book_of_prime_entry = "Sales Returns Day Book"
                debtor_acc = self._find_account("300-0000")    # TRADE DEBTORS
                sales_acc = self._find_account("510-0000")     # RETURN INWARDS
                tax_acc = self._find_account("430-0000")       # SALES TAX
                if debtor_acc:
                    selected_accounts.append(debtor_acc)
                if sales_acc:
                    selected_accounts.append(sales_acc)
                if tax_amount > 0 and tax_acc:
                    selected_accounts.append(tax_acc)

        else:
            accounting_event = "Unclassified accounting transaction"
            book_of_prime_entry = "General Journal"
            needs_review = True
            review_reason = f"Document type '{doc_type}' requires manual accounting review."

        is_order_or_memo = doc_type in ["Sales Order", "Purchase Order", "Delivery Order"]
        if not selected_accounts and not needs_review and not is_order_or_memo:
            needs_review = True
            review_reason = "Required COA account is not configured."

        # Ensure selected_accounts contains unique entries
        unique_accounts = []
        seen_codes = set()
        for acc in selected_accounts:
            if acc.account_code not in seen_codes:
                seen_codes.add(acc.account_code)
                unique_accounts.append(acc)


        # ---------------------------------------------------------------------
        # GENERATE JOURNAL ENTRY
        # ---------------------------------------------------------------------
        journal_entry = None
        opening_bal = float(data.get("opening_balance") or 0.0) if doc_type == "Bank Statement" else 0.0
        orig_grand_total = float(data.get("grand_total") or data.get("transaction_amount") or opening_bal or 0.0)
        orig_subtotal = float(data.get("subtotal") or (orig_grand_total - tax_amount))
        if orig_subtotal == 0.0 and orig_grand_total > 0:
            orig_subtotal = orig_grand_total - tax_amount

        # Multi-currency effective MYR values for journal posting
        if is_foreign:
            eff_grand_total = float(data.get("converted_amount_myr") or (orig_grand_total * float(data.get("exchange_rate", 1.0))))
            eff_subtotal = float(data.get("subtotal_myr") or (orig_subtotal * float(data.get("exchange_rate", 1.0))))
            eff_discount = float(data.get("discount_myr") or (float(data.get("discount") or 0.0) * float(data.get("exchange_rate", 1.0))))
            eff_shipping = float(data.get("shipping_myr") or (float(data.get("shipping") or 0.0) * float(data.get("exchange_rate", 1.0))))
            eff_tax = float(data.get("tax_amount_myr") or (tax_amount * float(data.get("exchange_rate", 1.0))))
            rate_val = data.get("exchange_rate", 1.0)
            rate_prov = data.get("exchange_rate_provider", "BNM")
            rate_info_str = f" [Original: {currency} {orig_grand_total:.2f} @ {rate_val} {rate_prov}]"
        else:
            eff_grand_total = orig_grand_total
            eff_subtotal = orig_subtotal
            eff_discount = float(data.get("discount") or 0.0)
            eff_shipping = float(data.get("shipping") or 0.0)
            eff_tax = tax_amount
            rate_info_str = ""

        txn_date = str(data.get("transaction_date") or data.get("statement_date") or "")
        ref = str(data.get("invoice_number") or data.get("receipt_number") or data.get("reference_number") or data.get("credit_note_number") or data.get("debit_note_number") or "")
        if not ref and doc_type == "Bank Statement":
            acc_num = data.get("account_number")
            ref = f"BS-{acc_num}" if acc_num else "BS-OPENING"

        if (doc_type != "Bank Statement" or opening_bal > 0) and eff_grand_total > 0 and not needs_review:
            journal_lines = []
            
            def add_line(acc, debit=0.0, credit=0.0, description=None):
                if acc and (debit > 0 or credit > 0):
                    journal_lines.append(JournalEntryLineSchema(
                        account_code=acc.account_code,
                        account_name=acc.account_name,
                        debit=round(debit, 2),
                        credit=round(credit, 2),
                        description=description
                    ))

            if doc_type == "Sales Invoice":
                add_line(debtor_acc, debit=eff_grand_total)
                if eff_discount > 0:
                    disc_allow_acc = self._find_account("520-0000")
                    if disc_allow_acc: add_line(disc_allow_acc, debit=eff_discount)
                add_line(sales_acc, credit=eff_subtotal)
                if eff_shipping > 0:
                    ship_acc = self._find_account("615-0000")
                    if ship_acc: add_line(ship_acc, credit=eff_shipping)
                if eff_tax > 0: add_line(tax_acc, credit=eff_tax)
                
            elif doc_type in ["Purchase Invoice", "Supplier Invoice"]:
                desc_p = f"{asset_exp_acc.account_name}" + (f" (Original: {currency} {orig_subtotal:.2f})" if is_foreign else "")
                add_line(asset_exp_acc, debit=eff_subtotal, description=desc_p)
                if eff_shipping > 0 and shipping_acc:
                    desc_s = "Carriage Inwards" + (f" (Original: {currency} {float(data.get('shipping') or 0.0):.2f})" if is_foreign else "")
                    add_line(shipping_acc, debit=eff_shipping, description=desc_s)
                if eff_tax > 0 and tax_acc:
                    desc_t = "Input Tax" + (f" (Original: {currency} {tax_amount:.2f})" if is_foreign else "")
                    add_line(tax_acc, debit=eff_tax, description=desc_t)
                if eff_discount > 0 and discount_acc:
                    desc_d = "Discount Received" + (f" (Original: {currency} {float(data.get('discount') or 0.0):.2f})" if is_foreign else "")
                    add_line(discount_acc, credit=eff_discount, description=desc_d)
                vendor_lbl = data.get("vendor_name") or "Trade Creditor"
                desc_c = f"Trade Creditors - {vendor_lbl}" + (f" (Original: {currency} {orig_grand_total:.2f})" if is_foreign else "")
                add_line(creditor_acc, credit=eff_grand_total, description=desc_c)
                
            elif doc_type in ["Purchase Receipt", "Expense Receipt"]:
                add_line(exp_acc, debit=eff_subtotal)
                if eff_tax > 0 and tax_acc: add_line(tax_acc, debit=eff_tax)
                add_line(pay_acc, credit=eff_grand_total)
                
            elif doc_type in ["Payment Receipt", "Official Receipt"]:
                add_line(bank_acc, debit=eff_grand_total)
                add_line(debtor_acc, credit=eff_grand_total)

            elif doc_type == "Payment Voucher":
                raw_txt_upper = str(data.get("raw_text") or "").upper()
                is_float_topup = any(k in raw_txt_upper or k in item_descs.upper() for k in ["FLOAT TOP-UP", "PETTY CASH FLOAT", "CASH WITHDRAWAL FROM BANK", "PETTY CASH REPLENISHMENT"])
                if is_float_topup:
                    cash_acc = self._find_account("320-0000")
                    bank_acc_cr = self._find_account("310-1000")
                    add_line(cash_acc, debit=eff_grand_total, description="Petty cash float top-up from bank")
                    add_line(bank_acc_cr, credit=eff_grand_total, description="Cash withdrawal for petty cash float")
                else:
                    alloc_total = 0.0
                    for item in line_items:
                        c = item.get("account_code")
                        amt = float(item.get("line_total") or item.get("total_amount") or item.get("amount") or 0.0)
                        acc = self._find_account(c) if c else None
                        desc_item = item.get("description") or item.get("item_description") or "Expense allocation"
                        if not acc:
                            if any(k in desc_item.lower() for k in ["printing", "stationery", "paper"]):
                                acc = self._find_account("910-0000") or self._find_account("915-0000")
                            else:
                                acc = self._find_account("915-0000") or self._find_account("909-0000")
                        if acc and amt > 0:
                            add_line(acc, debit=amt, description=desc_item)
                            alloc_total += amt
                    if alloc_total == 0.0 and eff_grand_total > 0:
                        if any(k in item_descs or k in str(data.get("raw_text") or "").lower() for k in ["printing", "stationery", "paper"]):
                            exp_fallback = self._find_account("910-0000") or self._find_account("915-0000")
                        else:
                            exp_fallback = self._find_account("915-0000")
                        add_line(exp_fallback, debit=eff_grand_total)
                    add_line(bank_acc, credit=eff_grand_total)

            elif doc_type == "Stock Take":
                abs_adj = abs(eff_grand_total)
                if abs_adj > 0:
                    if eff_grand_total < 0:
                        add_line(adj_acc, debit=abs_adj, description="Stock adjustment loss / inventory reduction")
                        add_line(stock_acc, credit=abs_adj, description="Inventory decrease")
                    else:
                        add_line(stock_acc, debit=abs_adj, description="Inventory increase")
                        add_line(adj_acc, credit=abs_adj, description="Stock adjustment gain")

            elif doc_type == "Purchase Return":
                add_line(creditor_acc, debit=eff_grand_total)
                add_line(return_acc, credit=eff_grand_total)
                
            elif doc_type == "Bank Transfer Receipt":
                if "inv-" in ref_desc or roles.get("customer") or data.get("buyer_name"):
                    add_line(bank_acc, debit=eff_grand_total)
                    add_line(debtor_acc, credit=eff_grand_total)
                else:
                    add_line(creditor_acc, debit=eff_grand_total)
                    add_line(bank_acc, credit=eff_grand_total)
                    
            elif doc_type == "Bank Transaction Record":
                add_line(bank_acc, debit=eff_grand_total)
                add_line(debtor_acc, credit=eff_grand_total)

            elif doc_type == "Bank Statement" and opening_bal > 0:
                add_line(bank_acc, debit=opening_bal)
                add_line(equity_acc, credit=opening_bal)
                
            elif "Credit Note" in doc_type or doc_type == "Debit Note":
                if is_purchase_return:
                    add_line(creditor_acc, debit=eff_grand_total)
                    add_line(equip_acc, credit=eff_subtotal)
                    if eff_tax > 0 and tax_acc: add_line(tax_acc, credit=eff_tax)
                else:
                    add_line(sales_acc, debit=eff_subtotal)
                    if eff_tax > 0 and tax_acc: add_line(tax_acc, debit=eff_tax)
                    add_line(debtor_acc, credit=eff_grand_total)

            total_dr = round(sum(l.debit for l in journal_lines), 2)
            total_cr = round(sum(l.credit for l in journal_lines), 2)
            diff = round(total_dr - total_cr, 2)

            # Automated 1-cent rounding reconciliation
            if abs(diff) == 0.01:
                for line in journal_lines:
                    if doc_type in ["Purchase Invoice", "Supplier Invoice"] and line.account_code == (creditor_acc.account_code if creditor_acc else "") and line.credit > 0:
                        line.credit = round(line.credit + diff, 2)
                        break
                    elif doc_type == "Sales Invoice" and line.account_code == (debtor_acc.account_code if debtor_acc else "") and line.debit > 0:
                        line.debit = round(line.debit - diff, 2)
                        break
                total_dr = round(sum(l.debit for l in journal_lines), 2)
                total_cr = round(sum(l.credit for l in journal_lines), 2)

            is_balanced = (total_dr == total_cr and total_dr > 0)
            
            if is_balanced and journal_lines:
                journal_entry = JournalEntrySchema(
                    journal_date=txn_date,
                    reference=ref,
                    description=f"{accounting_event}{rate_info_str}",
                    lines=journal_lines,
                    total_debit=total_dr,
                    total_credit=total_cr,
                    is_balanced=is_balanced
                )

        return AccountingAnalysisSchema(
            journal_entry=journal_entry,
            accounting_event=accounting_event,
            book_of_prime_entry=book_of_prime_entry,
            selected_accounts=unique_accounts,
            confidence_score=0.95 if not needs_review else 0.50,
            reasoning=f"Analyzed {doc_type} for active company {self.company_id} against PDF-aligned Chart of Accounts.",
            needs_review=needs_review,
            review_reason=review_reason
        )
