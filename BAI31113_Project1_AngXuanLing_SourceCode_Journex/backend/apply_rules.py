import re

# 1. Patch llm_parser.py (Strict Date Extraction)
with open(r'c:\Users\User\Documents\FYP - AI Agentic Accounting v3\backend\app\services\llm_parser.py', 'r', encoding='utf-8') as f:
    parser_content = f.read()

old_date_logic = """    # 4. Date Extraction
    transaction_date = "2026-09-29"
    date_match = re.search(r'(\w{3}\s+\d{1,2},\s+\d{4}|\d{2}/\d{2}/\d{4}|\d{4}-\d{2}-\d{2})', text)
    if date_match:
        transaction_date = date_match.group(1)"""

new_date_logic = """    # 4. Date Extraction (Strict Rule Applied)
    transaction_date = "2026-09-29"
    strict_date_match = re.search(r'(?:Transaction Date & Time|Transaction Date|Payment Date|Date)\s*[:\-]?\s*(\w{3}\s+\d{1,2},\s+\d{4}|\d{1,2}\s+\w{3}\s+\d{4}|\d{2}/\d{2}/\d{4}|\d{4}-\d{2}-\d{2})', text, re.IGNORECASE)
    if strict_date_match:
        transaction_date = strict_date_match.group(1)
    else:
        date_match = re.search(r'(\w{3}\s+\d{1,2},\s+\d{4}|\d{1,2}\s+\w{3}\s+\d{4}|\d{2}/\d{2}/\d{4}|\d{4}-\d{2}-\d{2})', text)
        if date_match:
            transaction_date = date_match.group(1)"""

parser_content = parser_content.replace(old_date_logic, new_date_logic)

with open(r'c:\Users\User\Documents\FYP - AI Agentic Accounting v3\backend\app\services\llm_parser.py', 'w', encoding='utf-8') as f:
    f.write(parser_content)


# 2. Patch accounting_agent.py (Intangible Services vs Physical Assets & Contra-Revenue)
with open(r'c:\Users\User\Documents\FYP - AI Agentic Accounting v3\backend\app\agents\accounting_agent.py', 'r', encoding='utf-8') as f:
    agent_content = f.read()

# Intangible vs Physical Assets
old_purchase_logic = """        elif doc_type in ["Purchase Invoice", "Supplier Invoice"]:
            if any(k in item_descs for k in ["computer", "server", "hardware", "laptop", "equipment"]):
                accounting_event = "Credit purchase of computer equipment"
                asset_exp_acc = self._find_account("200-3000") or self._find_account("610-0000")  # OFFICE EQUIPMENT / PURCHASES
            else:
                accounting_event = "Credit purchase of goods/services"
                asset_exp_acc = self._find_account("610-0000") or self._find_account("200-3000")  # PURCHASES"""

new_purchase_logic = """        elif doc_type in ["Purchase Invoice", "Supplier Invoice"]:
            if any(k in item_descs for k in ["subscription", "software", "license", "cloud", "server", "hosting", "ssl", "maintenance", "digital"]):
                accounting_event = "Credit purchase of IT services/subscriptions"
                asset_exp_acc = self._find_account("915-0000")  # GENERAL EXPENSES
            elif any(k in item_descs for k in ["computer", "hardware", "laptop", "equipment", "keyboard", "monitor", "electronic"]):
                accounting_event = "Credit purchase of computer equipment"
                asset_exp_acc = self._find_account("200-3000")  # OFFICE EQUIPMENT
            else:
                accounting_event = "Credit purchase of goods/services"
                asset_exp_acc = self._find_account("610-0000") or self._find_account("200-3000")  # PURCHASES"""

agent_content = agent_content.replace(old_purchase_logic, new_purchase_logic)

# Contra-Revenue
old_return_logic = """            else:
                accounting_event = "Sales return / customer return"
                book_of_prime_entry = "Sales Returns Day Book"
                debtor_acc = self._find_account("300-0000")    # TRADE DEBTORS
                sales_acc = self._find_account("500-0000")     # SALES"""

new_return_logic = """            else:
                accounting_event = "Sales return / customer return"
                book_of_prime_entry = "Sales Returns Day Book"
                debtor_acc = self._find_account("300-0000")    # TRADE DEBTORS
                sales_acc = self._find_account("510-0000")     # RETURN INWARDS"""

agent_content = agent_content.replace(old_return_logic, new_return_logic)

with open(r'c:\Users\User\Documents\FYP - AI Agentic Accounting v3\backend\app\agents\accounting_agent.py', 'w', encoding='utf-8') as f:
    f.write(agent_content)

print("Patching complete!")
