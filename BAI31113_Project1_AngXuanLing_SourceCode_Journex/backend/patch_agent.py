import re

with open(r'c:\Users\User\Documents\FYP - AI Agentic Accounting v3\backend\app\agents\accounting_agent.py', 'r', encoding='utf-8') as f:
    content = f.read()

journal_logic = """
        # ---------------------------------------------------------------------
        # GENERATE JOURNAL ENTRY
        # ---------------------------------------------------------------------
        journal_entry = None
        grand_total = float(data.get("grand_total") or data.get("transaction_amount") or 0.0)
        subtotal = float(data.get("subtotal") or (grand_total - tax_amount))
        if subtotal == 0.0 and grand_total > 0:
            subtotal = grand_total - tax_amount
            
        txn_date = str(data.get("transaction_date") or data.get("statement_date") or "")
        ref = str(data.get("invoice_number") or data.get("receipt_number") or data.get("reference_number") or data.get("credit_note_number") or data.get("debit_note_number") or "")

        if doc_type != "Bank Statement" and grand_total > 0 and not needs_review:
            journal_lines = []
            
            def add_line(acc, debit=0.0, credit=0.0):
                if acc and (debit > 0 or credit > 0):
                    journal_lines.append(JournalEntryLineSchema(
                        account_code=acc.account_code,
                        account_name=acc.account_name,
                        debit=round(debit, 2),
                        credit=round(credit, 2)
                    ))

            if doc_type == "Sales Invoice":
                add_line(debtor_acc, debit=grand_total)
                add_line(sales_acc, credit=subtotal)
                if tax_amount > 0: add_line(tax_acc, credit=tax_amount)
                
            elif doc_type in ["Purchase Invoice", "Supplier Invoice"]:
                add_line(asset_exp_acc, debit=subtotal)
                if tax_amount > 0: add_line(tax_acc, debit=tax_amount)
                add_line(creditor_acc, credit=grand_total)
                
            elif doc_type in ["Purchase Receipt", "Expense Receipt"]:
                add_line(exp_acc, debit=subtotal)
                if tax_amount > 0: add_line(tax_acc, debit=tax_amount)
                add_line(pay_acc, credit=grand_total)
                
            elif doc_type == "Payment Receipt":
                add_line(bank_acc, debit=grand_total)
                add_line(debtor_acc, credit=grand_total)
                
            elif doc_type == "Bank Transfer Receipt":
                if "inv-" in ref_desc or roles.get("customer") or data.get("buyer_name"):
                    add_line(bank_acc, debit=grand_total)
                    add_line(debtor_acc, credit=grand_total)
                else:
                    add_line(creditor_acc, debit=grand_total)
                    add_line(bank_acc, credit=grand_total)
                    
            elif doc_type == "Bank Transaction Record":
                add_line(bank_acc, debit=grand_total)
                add_line(debtor_acc, credit=grand_total)
                
            elif "Credit Note" in doc_type or doc_type == "Debit Note":
                if is_purchase_return:
                    add_line(creditor_acc, debit=grand_total)
                    add_line(equip_acc, credit=subtotal)
                    if tax_amount > 0: add_line(tax_acc, credit=tax_amount)
                else:
                    add_line(sales_acc, debit=subtotal)
                    if tax_amount > 0: add_line(tax_acc, debit=tax_amount)
                    add_line(debtor_acc, credit=grand_total)

            total_dr = round(sum(l.debit for l in journal_lines), 2)
            total_cr = round(sum(l.credit for l in journal_lines), 2)
            is_balanced = (total_dr == total_cr and total_dr > 0)
            
            if is_balanced and journal_lines:
                journal_entry = JournalEntrySchema(
                    journal_date=txn_date,
                    reference=ref,
                    description=accounting_event,
                    lines=journal_lines,
                    total_debit=total_dr,
                    total_credit=total_cr,
                    is_balanced=is_balanced
                )

        return AccountingAnalysisSchema(
            journal_entry=journal_entry,"""

content = content.replace("        return AccountingAnalysisSchema(", journal_logic)

with open(r'c:\Users\User\Documents\FYP - AI Agentic Accounting v3\backend\app\agents\accounting_agent.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched accounting_agent.py")
