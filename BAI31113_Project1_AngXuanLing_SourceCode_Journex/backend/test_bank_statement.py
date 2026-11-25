import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.document_agent import DocumentProcessingAgent
from app.services.calculation_agent import CalculationAgent

def test_user_bank_statement():
    sample_text = """
ABC BANK BERHAD
ACCOUNT STATEMENT
Menara ABC, 88 Jalan Ampang, 50450 Kuala Lumpur, Malaysia
Tel: 1-800-88-2222 | www.abcbank.com.my

Period: 01/09/2026 - 30/09/2026
Account Name: TechCore Solutions Sdn Bhd
Address: No. 20, Jalan Cheras, 50450 Kuala Lumpur, Malaysia
Account Number: 8880-1234-5678
Account Type: Business Current Account
Statement Date: 30 Sep 2026
Currency: MYR
Page: 1 of 1

Date Description / Reference Debit (RM) Credit (RM) Balance (RM)
01/09/2026 BALANCE BROUGHT FORWARD-- 10,000.00
15/09/2026 PAYMENT TO NEXTTECH - INV-2026-0001 1,060.00 8,940.00
20/09/2026 PAYMENT RECV - CLIENT ALPHA SDN BHD 3,500.00 12,440.00
29/09/2026 PAYMENT TO MEGA OFFICE - INV-2026-0002 689.00 11,751.00
30/09/2026 MONTHLY SERVICE CHARGE 10.00 11,741.00

This is a computer-generated statement and no signature is required
    """

    agent = DocumentProcessingAgent({
        "company_id": "COMP-000001",
        "company_name": "NextTech Solutions Sdn Bhd"
    })

    doc, passed, msgs = agent.process_document("DOC-STMT-001", sample_text, "bank_statement.pdf")

    print("=== EXTRACTED BANK STATEMENT MODEL DUMP ===")
    dump = doc.model_dump()
    print(json.dumps(dump, indent=2))

    print("\n=== BUSINESS ROLES ===")
    print(json.dumps(doc.business_roles.model_dump(), indent=2))

    print("\n=== COMPANY CONTEXT ===")
    print(json.dumps(doc.company_context.model_dump(), indent=2))

    print("\n=== CALCULATION VERIFICATION ===")
    print(json.dumps(doc.calculation_verification.model_dump(), indent=2))

    # Strict Assertions matching User Requirements
    assert doc.document_type == "Bank Statement", f"Expected Bank Statement, got {doc.document_type}"
    assert doc.bank_name == "ABC Bank Berhad"
    assert doc.account_name == "TechCore Solutions Sdn Bhd"
    assert doc.account_number == "8880-1234-5678"
    assert doc.account_type == "Business Current Account"
    assert doc.statement_period == "01/09/2026 - 30/09/2026"
    assert doc.statement_date == "30 Sep 2026"
    assert doc.currency == "MYR"
    assert doc.opening_balance == 10000.00
    assert doc.closing_balance == 11741.00

    # No Invoice Fields
    assert doc.invoice_number is None, "invoice_number MUST be None for Bank Statement!"
    assert doc.receipt_number is None
    assert doc.line_items == [], "line_items MUST be empty [] for Bank Statement!"

    # Bank Transactions (4 transaction rows extracted, balance brought forward excluded!)
    assert len(doc.bank_transactions) == 4, f"Expected 4 transactions, got {len(doc.bank_transactions)}"
    
    tx1 = doc.bank_transactions[0]
    assert tx1.date == "15/09/2026"
    assert tx1.description == "PAYMENT TO NEXTTECH - INV-2026-0001"
    assert tx1.debit == 1060.00 or tx1.debit_amount == 1060.00
    assert tx1.balance == 8940.00

    tx2 = doc.bank_transactions[1]
    assert tx2.date == "20/09/2026"
    assert tx2.description == "PAYMENT RECV - CLIENT ALPHA SDN BHD"
    assert tx2.credit == 3500.00 or tx2.credit_amount == 3500.00
    assert tx2.balance == 12440.00

    # Business Roles Assertions
    roles = doc.business_roles
    assert roles.our_company is None, "our_company MUST be None because statement account belongs to TechCore!"
    assert roles.customer is None
    assert roles.vendor is None
    assert roles.supplier is None
    assert roles.merchant is None
    assert roles.bank == "ABC Bank Berhad"
    assert roles.other == "TechCore Solutions Sdn Bhd"

    # Company Context Mismatch Assertions
    ctx = doc.company_context
    assert ctx.active_company == "NextTech Solutions Sdn Bhd"
    assert ctx.document_account_holder == "TechCore Solutions Sdn Bhd"
    assert ctx.company_match is False
    assert ctx.mismatch_reason == "Bank statement account belongs to a different company than the active company."

    # Calculation Agent Assertions
    calc = doc.calculation_verification
    assert calc.calculation_required is True
    assert calc.tool_used == "calculate_bank_balance"
    assert calc.opening_balance == 10000.00
    assert calc.total_debit == 1759.00
    assert calc.total_credit == 3500.00
    assert calc.calculated_closing_balance == 11741.00
    assert calc.document_closing_balance == 11741.00
    assert calc.difference == 0.00
    assert len(calc.running_balance_checks) == 4
    assert calc.overall_status == "PASSED"

    print("\n>>> ALL BANK STATEMENT TESTS PASSED PERFECTLY! <<<")

if __name__ == "__main__":
    test_user_bank_statement()
