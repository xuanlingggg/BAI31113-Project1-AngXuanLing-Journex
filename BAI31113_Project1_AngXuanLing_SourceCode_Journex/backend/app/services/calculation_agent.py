from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Any, List, Tuple, Optional
from app.schemas.document import CalculationVerificationSchema


class CalculationTools:
    """
    Deterministic Python calculation tools for precise financial arithmetic.
    LLMs decide tool invocation; Python executes exact math.
    """
    @staticmethod
    def calculate_line_total(quantity: float, unit_price: float, discount: float = 0.0) -> float:
        q_dec = Decimal(str(quantity or 0.0))
        u_dec = Decimal(str(unit_price or 0.0))
        d_dec = Decimal(str(discount or 0.0))
        tot = (q_dec * u_dec) - d_dec
        return float(tot.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

    @staticmethod
    def calculate_subtotal(line_totals: List[float]) -> float:
        tot = sum(Decimal(str(amt or 0.0)) for amt in line_totals)
        return float(tot.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

    @staticmethod
    def calculate_invoice_total(
        subtotal: float,
        tax_amount: float = 0.0,
        discount: float = 0.0,
        shipping: float = 0.0
    ) -> float:
        sub_dec = Decimal(str(subtotal or 0.0))
        tax_dec = Decimal(str(tax_amount or 0.0))
        disc_dec = Decimal(str(discount or 0.0))
        ship_dec = Decimal(str(shipping or 0.0))
        total = sub_dec - disc_dec + ship_dec + tax_dec
        return float(total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

    @staticmethod
    def calculate_stock_take_total(line_amounts: List[float]) -> float:
        tot = sum(Decimal(str(amt or 0.0)) for amt in line_amounts)
        return float(tot.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

    @staticmethod
    def calculate_bank_balance(opening_balance: float, total_credits: float, total_debits: float) -> float:
        return round(float(opening_balance) + float(total_credits) - float(total_debits), 2)

    @staticmethod
    def verify_amount(document_amount: float, calculated_amount: float, tolerance: float = 0.05) -> Tuple[bool, float]:
        diff = round(abs(float(document_amount) - float(calculated_amount)), 2)
        passed = diff <= tolerance
        signed_diff = round(float(calculated_amount) - float(document_amount), 2)
        return passed, signed_diff


class CalculationAgent:
    """
    Calculation Agent:
    - Inspects extracted document data and document type
    - Decides whether calculation is required (Bank Transfer Receipt & Payment Receipt -> NOT_REQUIRED)
    - Selects appropriate deterministic calculation tools (Bank Statement -> calculate_bank_balance, Invoices/Receipts -> calculate_invoice_total)
    - Runs mathematical checks and outputs CalculationVerificationSchema
    """
    def __init__(self):
        self.tools = CalculationTools()

    def _should_calculate_document(self, extracted_data: Dict[str, Any]) -> bool:
        doc_type = extracted_data.get("document_type", "")
        if doc_type == "Bank Transfer Receipt":
            return False

        line_items = extracted_data.get("line_items", [])
        subtotal = float(extracted_data.get("subtotal") or 0.0)
        tax = float(extracted_data.get("tax_amount") or 0.0)

        has_real_itemized_lines = False
        if line_items:
            for item in line_items:
                desc = str(item.get("item_description", "")).lower().strip()
                if any(k in desc for k in ["payment for invoice", "payment amount", "amount received", "quantity rate amount", "item description", "qty rate", "description qty"]):
                    continue
                q = float(item.get("quantity") or 0.0)
                u = float(item.get("unit_price") or 0.0)
                tot = float(item.get("total_amount") or 0.0)
                if len(line_items) > 1 or (q > 0 and u > 0 and tot > 0) or (q > 1):
                    has_real_itemized_lines = True
                    break

        discount = float(extracted_data.get("discount") or 0.0)
        shipping = float(extracted_data.get("shipping") or 0.0)
        has_tax_calculation = tax > 0.0 and subtotal > 0.0
        has_adjustments = discount > 0.0 or shipping > 0.0

        if doc_type == "Stock Take":
            return True

        if doc_type in ["Sales Invoice", "Purchase Invoice", "Supplier Invoice", "Purchase Order", "Sales Order", "Purchase Return"]:
            return has_real_itemized_lines or has_tax_calculation or has_adjustments or len(line_items) > 0

        if doc_type in ["Purchase Receipt", "Expense Receipt", "Payment Receipt", "Receipt"]:
            return has_real_itemized_lines or has_tax_calculation

        return False

    def process_and_verify(self, extracted_data: Dict[str, Any]) -> CalculationVerificationSchema:
        doc_type = extracted_data.get("document_type", "")
        opening = extracted_data.get("opening_balance")
        closing = extracted_data.get("closing_balance")
        bank_txs = extracted_data.get("bank_transactions", [])

        is_bank_stmt = doc_type in ["Bank Statement", "Bank Transaction Record"] or (opening is not None and closing is not None and bank_txs)

        # 1. If document does NOT require calculation and is not a Bank Statement
        if not is_bank_stmt and not self._should_calculate_document(extracted_data):
            amount_val = float(extracted_data.get("grand_total") or extracted_data.get("transaction_amount") or 0.0)
            return CalculationVerificationSchema(
                calculation_required=False,
                tool_used=None,
                math_verified=True,
                line_items_check=True,
                subtotal_check=True,
                tax_check=True,
                grand_total_check=True,
                running_balance_check=True,
                opening_balance=None,
                total_debit=None,
                total_credit=None,
                calculated_closing_balance=None,
                document_closing_balance=None,
                running_balance_checks=[],
                document_total=amount_val,
                calculated_total=amount_val,
                difference=0.0,
                overall_status="NOT_REQUIRED",
                details=[]
            )

        # 2. Bank Statement & Bank Transaction Record Calculation Workflow
        bank_txs = extracted_data.get("bank_transactions", [])
        opening = extracted_data.get("opening_balance")
        closing = extracted_data.get("closing_balance")

        if doc_type in ["Bank Statement", "Bank Transaction Record"] or (opening is not None and closing is not None and bank_txs):
            details = []
            tool_used = "calculate_bank_balance"
            
            tot_debit = 0.0
            tot_credit = 0.0
            for tx in bank_txs:
                d = tx.get("debit") if tx.get("debit") is not None else tx.get("debit_amount", 0.0)
                c = tx.get("credit") if tx.get("credit") is not None else tx.get("credit_amount", 0.0)
                tot_debit += float(d or 0.0)
                tot_credit += float(c or 0.0)
            
            tot_debit = round(tot_debit, 2)
            tot_credit = round(tot_credit, 2)

            op_val = float(opening) if opening is not None else 0.0
            cl_val = float(closing) if closing is not None else 0.0
            
            calc_closing = self.tools.calculate_bank_balance(op_val, tot_credit, tot_debit)
            passed_bank, bank_diff = self.tools.verify_amount(cl_val, calc_closing)
            
            if not passed_bank and closing is not None:
                details.append(
                    f"Bank Balance Discrepancy: Opening ({op_val:.2f}) + Credits ({tot_credit:.2f}) - Debits ({tot_debit:.2f}) = {calc_closing:.2f}, but Document Closing is {cl_val:.2f}."
                )

            # Check running balances step by step
            running_checks = []
            all_running_passed = True
            curr_balance = op_val
            
            for tx in bank_txs:
                tx_date = tx.get("date") or tx.get("transaction_date", "")
                d = tx.get("debit") if tx.get("debit") is not None else tx.get("debit_amount", 0.0)
                c = tx.get("credit") if tx.get("credit") is not None else tx.get("credit_amount", 0.0)
                doc_bal = tx.get("balance")
                
                d_val = float(d or 0.0)
                c_val = float(c or 0.0)
                
                expected_bal = round(curr_balance + c_val - d_val, 2)
                
                if doc_bal is not None:
                    doc_bal_val = float(doc_bal)
                    row_pass, row_diff = self.tools.verify_amount(doc_bal_val, expected_bal)
                    row_status = "PASSED" if row_pass else "FAILED"
                    if not row_pass:
                        all_running_passed = False
                        details.append(
                            f"Running Balance Mismatch on {tx_date}: Document states {doc_bal_val:.2f}, expected {expected_bal:.2f}."
                        )
                    running_checks.append({
                        "date": tx_date,
                        "calculated_balance": expected_bal,
                        "document_balance": doc_bal_val,
                        "difference": row_diff,
                        "status": row_status
                    })
                    curr_balance = doc_bal_val
                else:
                    curr_balance = expected_bal

            overall_passed = passed_bank and all_running_passed
            status = "PASSED" if overall_passed else "FAILED"

            return CalculationVerificationSchema(
                calculation_required=True,
                tool_used=tool_used,
                math_verified=overall_passed,
                line_items_check=True,
                subtotal_check=True,
                tax_check=True,
                grand_total_check=passed_bank,
                running_balance_check=all_running_passed,
                opening_balance=op_val,
                total_debit=tot_debit,
                total_credit=tot_credit,
                calculated_closing_balance=calc_closing,
                document_closing_balance=cl_val,
                running_balance_checks=running_checks,
                document_total=cl_val,
                calculated_total=calc_closing,
                difference=bank_diff,
                overall_status=status,
                details=details
            )

        # 2b. Stock Take Calculation Workflow
        if doc_type == "Stock Take":
            tool_used = "calculate_stock_take_total"
            line_items = extracted_data.get("line_items", [])
            extracted_total = float(extracted_data.get("grand_total") or 0.0)
            curr = extracted_data.get("currency") or "MYR"

            details = []
            line_items_check = True
            calc_line_amounts = []

            for item in line_items:
                desc = item.get("description") or item.get("item_description") or "Item"
                bal_q = item.get("balance_quantity")
                phy_q = item.get("physical_quantity")
                diff_q = item.get("difference_quantity")
                cost = float(item.get("unit_cost") or item.get("unit_price") or 0.0)
                doc_amt = float(item.get("amount") or item.get("total_amount") or 0.0)

                if item.get("missing_physical") or phy_q is None:
                    details.append(f"Physical count missing for '{desc}' (Bal Qty: {bal_q}) - flagged for review.")
                    calc_line_amounts.append(doc_amt)
                    continue

                expected_diff = round(float(phy_q) - float(bal_q or 0.0), 4)
                diff_match = abs(float(diff_q or 0.0) - expected_diff) < 0.01
                if not diff_match:
                    line_items_check = False
                    details.append(f"Qty difference mismatch for '{desc}': Physical {phy_q} - Balance {bal_q} = {expected_diff}, but stated {diff_q}.")

                expected_amt = round(expected_diff * cost, 2)
                amt_match = abs(doc_amt - expected_amt) < 0.10
                if not amt_match:
                    line_items_check = False
                    details.append(f"Adjustment amount mismatch for '{desc}': Diff Qty {diff_q} x Unit Cost {cost} = {expected_amt:.2f}, but stated {doc_amt:.2f}.")

                calc_line_amounts.append(doc_amt)

            calculated_total = self.tools.calculate_stock_take_total(calc_line_amounts)
            passed_total, total_diff = self.tools.verify_amount(extracted_total, calculated_total)

            if not passed_total:
                details.append(f"Stock Take Total Discrepancy: Document states {curr} {extracted_total:.2f}, but Calculated Net Adjustment is {curr} {calculated_total:.2f} (Diff: {curr} {total_diff:.2f}).")
            else:
                details.append(f"Stock Take Math Verified: Net adjustment of {curr} {calculated_total:.2f} across {len(line_items)} inventory lines.")

            overall_passed = line_items_check and passed_total
            status = "PASSED" if overall_passed else "FAILED"

            return CalculationVerificationSchema(
                calculation_required=True,
                tool_used=tool_used,
                math_verified=overall_passed,
                line_items_check=line_items_check,
                subtotal_check=True,
                tax_check=True,
                grand_total_check=passed_total,
                running_balance_check=True,
                opening_balance=None,
                total_debit=None,
                total_credit=None,
                calculated_closing_balance=None,
                document_closing_balance=None,
                running_balance_checks=[],
                document_total=extracted_total,
                calculated_total=calculated_total,
                difference=total_diff,
                overall_status=status,
                details=details
            )

        # 3. Invoices & Receipts Calculation Workflow
        if self._should_calculate_document(extracted_data):
            line_items = extracted_data.get("line_items", [])
            extracted_subtotal = round(float(extracted_data.get("subtotal") or 0.0), 2)
            extracted_discount = round(float(extracted_data.get("discount") or 0.0), 2)
            extracted_shipping = round(float(extracted_data.get("shipping") or 0.0), 2)
            extracted_tax = round(float(extracted_data.get("tax_amount") or 0.0), 2)
            extracted_total = round(float(extracted_data.get("grand_total") or 0.0), 2)
            curr = extracted_data.get("currency") or "MYR"

            details = []
            line_items_check = True
            subtotal_check = True
            tax_check = True
            grand_total_check = True
            tool_used = "calculate_invoice_total"
            
            # Step A: Verify individual line item totals
            line_totals = []
            for item in line_items:
                q = float(item.get("quantity") or 1.0)
                u = float(item.get("unit_price") or 0.0)
                disc = float(item.get("discount") or 0.0)
                tot_val = item.get("line_total")
                if tot_val is None:
                    tot_val = item.get("total_amount", 0.0)
                extracted_item_tot = round(float(tot_val or 0.0), 2)
                calc_item_tot = self.tools.calculate_line_total(q, u, discount=disc)
                
                passed_line, _ = self.tools.verify_amount(extracted_item_tot, calc_item_tot)
                if not passed_line:
                    line_items_check = False
                    desc_str = item.get("description") or item.get("item_description") or "Item"
                    disc_info = f" - Disc {curr} {disc:.2f}" if disc > 0 else ""
                    details.append(
                        f"Line Item Mismatch: '{desc_str}' Qty {q} x {curr} {u:.2f}{disc_info} = {curr} {calc_item_tot:.2f}, but document states {curr} {extracted_item_tot:.2f}."
                    )
                line_totals.append(calc_item_tot)

            # Step B: Verify Subtotal
            if line_totals:
                calc_subtotal = self.tools.calculate_subtotal(line_totals)
                if extracted_subtotal > 0:
                    sub_passed, sub_diff = self.tools.verify_amount(extracted_subtotal, calc_subtotal)
                    if not sub_passed:
                        subtotal_check = False
                        details.append(f"Subtotal Mismatch: Sum of line items is {curr} {calc_subtotal:.2f}, but document subtotal is {curr} {extracted_subtotal:.2f}.")
                else:
                    calc_subtotal = calc_subtotal
            else:
                calc_subtotal = extracted_subtotal

            # Step C: Calculate Grand Total (Subtotal - Discount + Shipping + Tax)
            calculated_total = self.tools.calculate_invoice_total(
                calc_subtotal,
                tax_amount=extracted_tax,
                discount=extracted_discount,
                shipping=extracted_shipping
            )

            # Step D: Verify Document Total vs Calculated Total
            passed_total, diff = self.tools.verify_amount(extracted_total, calculated_total)
            if not passed_total:
                grand_total_check = False
                details.append(
                    f"Grand Total Discrepancy: Document states {curr} {extracted_total:.2f}, but Calculated Total is {curr} {calculated_total:.2f} (Difference: {curr} {diff:.2f})."
                )

            overall_passed = line_items_check and subtotal_check and grand_total_check
            status = "PASSED" if overall_passed else "FAILED"

            return CalculationVerificationSchema(
                calculation_required=True,
                tool_used=tool_used,
                math_verified=overall_passed,
                line_items_check=line_items_check,
                subtotal_check=subtotal_check,
                tax_check=tax_check,
                grand_total_check=grand_total_check,
                running_balance_check=True,
                document_total=extracted_total,
                calculated_total=calculated_total,
                difference=round(calculated_total - extracted_total, 2),
                overall_status=status,
                details=details
            )

        # 4. Default fallback: No numerical calculation required
        amount_val = float(extracted_data.get("grand_total") or extracted_data.get("transaction_amount") or 0.0)
        return CalculationVerificationSchema(
            calculation_required=False,
            tool_used=None,
            math_verified=True,
            line_items_check=True,
            subtotal_check=True,
            tax_check=True,
            grand_total_check=True,
            running_balance_check=True,
            opening_balance=None,
            total_debit=None,
            total_credit=None,
            calculated_closing_balance=None,
            document_closing_balance=None,
            running_balance_checks=[],
            document_total=amount_val,
            calculated_total=amount_val,
            difference=0.0,
            overall_status="NOT_REQUIRED",
            details=["No itemized calculation required for this document."]
        )

    def calculate_book_total(
        self,
        company_id: str,
        book_of_prime_entry: str,
        from_date: Optional[str],
        to_date: Optional[str],
        transactions: List[Dict[str, Any]],
        currency: str = "MYR"
    ) -> Dict[str, Any]:
        """
        Deterministic book-level total calculation using Decimal arithmetic.
        Filters transactions by date range [from_date, to_date] and company_id,
        calculates verified totals, and returns status.
        """
        def _to_decimal(val: Any) -> Decimal:
            if val is None:
                return Decimal("0.00")
            try:
                if isinstance(val, (int, float)):
                    return Decimal(str(val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                s = str(val).strip().replace(",", "")
                if not s or s == "—":
                    return Decimal("0.00")
                return Decimal(s).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            except Exception:
                return Decimal("0.00")

        # Filter transactions deterministically by date range and company_id
        from app.utils.date_utils import is_date_in_range
        filtered = []
        for t in transactions:
            t_comp = t.get("company_id")
            if t_comp and t_comp != company_id:
                continue

            t_date = t.get("transaction_date")
            if not is_date_in_range(t_date, from_date, to_date):
                continue
            filtered.append(t)

        count = len(filtered)

        if book_of_prime_entry == "Cash Book":
            receipts_cash = Decimal("0.00")
            receipts_bank = Decimal("0.00")
            payments_cash = Decimal("0.00")
            payments_bank = Decimal("0.00")

            receipt_count = 0
            payment_count = 0
            valid_txns = []

            for t in filtered:
                doc_type = str(t.get("document_type") or "").lower()
                bope = str(t.get("book_of_prime_entry") or "").lower()
                
                # Exclude Bank Statement and Bank Transaction Record
                if doc_type in ["bank statement", "bank transaction record"] or bope in ["bank statement record", "bank statement"]:
                    continue

                valid_txns.append(t)
                ext = t.get("extracted_data") or {}
                event = str(t.get("accounting_event") or "").lower()
                method = str(ext.get("payment_method") or "").lower()

                # Get Folio code if present
                analysis = t.get("accounting_analysis") or {}
                sel_accs = analysis.get("selected_accounts") or []
                folio = sel_accs[0].get("account_code", "") if sel_accs else ""

                amt = _to_decimal(
                    t.get("amount") or 
                    ext.get("grand_total") or 
                    ext.get("transaction_amount") or 
                    ext.get("total_amount") or 
                    0.0
                )

                is_receipt = (
                    doc_type == "payment receipt" or
                    ("receipt" in doc_type and not any(k in doc_type for k in ["purchase", "expense", "supplier"])) or
                    "received" in event or
                    "inflow" in event or
                    "customer payment" in event or
                    "sales payment" in event
                ) and not (
                    "purchase" in doc_type or
                    "expense" in doc_type or
                    any(k in event for k in ["purchase", "expense", "supplier", "vendor", "outflow"])
                )

                is_cash = (
                    ("cash" in method and "bank" not in method) or
                    "320-" in folio or
                    "petty" in method
                )

                if is_receipt:
                    receipt_count += 1
                    if is_cash:
                        receipts_cash += amt
                    else:
                        receipts_bank += amt
                else:
                    payment_count += 1
                    if is_cash:
                        payments_cash += amt
                    else:
                        payments_bank += amt

            total_rec = receipts_cash + receipts_bank
            total_pay = payments_cash + payments_bank

            return {
                "book_of_prime_entry": book_of_prime_entry,
                "company_id": company_id,
                "from_date": from_date,
                "to_date": to_date,
                "transaction_count": len(valid_txns),
                "receipt_count": receipt_count,
                "payment_count": payment_count,
                "receipts": {
                    "cash_total": float(receipts_cash),
                    "bank_total": float(receipts_bank)
                },
                "payments": {
                    "cash_total": float(payments_cash),
                    "bank_total": float(payments_bank)
                },
                "total_receipts_cash": float(receipts_cash),
                "total_receipts_bank": float(receipts_bank),
                "total_payments_cash": float(payments_cash),
                "total_payments_bank": float(payments_bank),
                "total_receipts": float(total_rec),
                "total_payments": float(total_pay),
                "total_amount": float(total_rec + total_pay),
                "calculated_total": float(total_rec + total_pay),
                "currency": currency,
                "calculation_status": "VERIFIED",
                "verifier": "CalculationAgent"
            }

        elif book_of_prime_entry == "General Journal":
            total_debit = Decimal("0.00")
            total_credit = Decimal("0.00")
            valid_gj_txns = []
            for t in filtered:
                status = str(t.get("status") or "")
                doc_type = str(t.get("document_type") or "")
                # Exclude unposted / staged transactions and stock take adjustments
                if status in ["Pending Approval", "Unposted / Pending Approval", "Unposted"] or doc_type == "Stock Take":
                    continue
                amt = _to_decimal(t.get("amount", 0.0))
                if amt <= Decimal("0.00"):
                    continue
                valid_gj_txns.append(t)
                total_debit += amt
                total_credit += amt

            return {
                "book_of_prime_entry": book_of_prime_entry,
                "company_id": company_id,
                "from_date": from_date,
                "to_date": to_date,
                "transaction_count": len(valid_gj_txns),
                "total_debit": float(total_debit),
                "total_credit": float(total_credit),
                "total_amount": float(total_debit),
                "calculated_total": float(total_debit),
                "currency": currency,
                "calculation_status": "VERIFIED",
                "verifier": "CalculationAgent"
            }

        else:
            # Sales Day Book, Sales Returns Day Book, Purchases Day Book, Purchases Returns Day Book
            total_sum = Decimal("0.00")
            for t in filtered:
                total_sum += _to_decimal(t.get("amount", 0.0))

            return {
                "book_of_prime_entry": book_of_prime_entry,
                "company_id": company_id,
                "from_date": from_date,
                "to_date": to_date,
                "transaction_count": count,
                "total_amount": float(total_sum),
                "calculated_total": float(total_sum),
                "currency": currency,
                "calculation_status": "VERIFIED",
                "verifier": "CalculationAgent"
            }
