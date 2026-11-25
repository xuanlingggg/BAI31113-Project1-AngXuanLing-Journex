"""
Bank Transaction Classifier and Document Matching Module.
Provides:
1. Explainable rule-based accounting classification against Chart of Accounts.
2. Cross-matching of bank transactions with accounting documents (invoices, receipts).
3. Audit trail maintenance for classification, review, and reconciliation events.
"""

import json
import re
import unicodedata
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session

from app.db.models import (
    BankTransactionModel,
    DocumentModel,
    ChartOfAccountModel,
    get_local_now,
)


# Standard accounting category definitions aligned with Malaysian COA
CATEGORY_ACCOUNTS = {
    "Owner's Equity / Capital": {
        "code": "100-0000",
        "name": "CAPITAL",
        "type": "Equity",
        "direction": "in",
    },
    "Loan Payable / Liability": {
        "code": "425-0000",
        "name": "BANK LOAN",
        "type": "Liability",
        "direction": "both",
    },
    "Customer Deposits / Liability": {
        "code": "440-0000",
        "name": "DEPOSIT RECEIVED",
        "type": "Liability",
        "direction": "in",
    },
    "Accounts Receivable Settlement": {
        "code": "300-0000",
        "name": "TRADE DEBTORS",
        "type": "Asset",
        "direction": "in",
    },
    "Customer receipt / accounts receivable settlement": {
        "code": "300-0000",
        "name": "TRADE DEBTORS",
        "type": "Asset",
        "direction": "in",
    },
    "Sales receipt": {
        "code": "500-1000",
        "name": "CASH SALES",
        "type": "Revenue",
        "direction": "in",
    },
    "Supplier payment / accounts payable settlement": {
        "code": "400-0000",
        "name": "TRADE CREDITORS",
        "type": "Liability",
        "direction": "out",
    },
    "Property, Plant and Equipment": {
        "code": "200-2000",
        "name": "FURNITURES & FITTINGS",
        "type": "Asset",
        "direction": "out",
    },
    "Equipment / fixed asset": {
        "code": "200-3000",
        "name": "OFFICE EQUIPMENT",
        "type": "Asset",
        "direction": "out",
    },
    "Rent / Prepayment": {
        "code": "914-0000",
        "name": "OFFICE RENTAL",
        "type": "Expense",
        "direction": "out",
    },
    "Printing and Advertising Expense": {
        "code": "910-0000",
        "name": "PRINTING & STATIONERY",
        "type": "Expense",
        "direction": "out",
    },
    "Professional Fees": {
        "code": "405-0000",
        "name": "OTHER CREDITORS",
        "type": "Liability",
        "direction": "out",
    },
    "Salary Expense / Payroll": {
        "code": "904-0000",
        "name": "SALARIES",
        "type": "Expense",
        "direction": "out",
    },
    "Bank Charges Expense": {
        "code": "902-0000",
        "name": "BANK CHARGES",
        "type": "Expense",
        "direction": "out",
    },
    "Bank charge": {
        "code": "902-0000",
        "name": "BANK CHARGES",
        "type": "Expense",
        "direction": "out",
    },
    "Operating expense": {
        "code": "915-0000",
        "name": "GENERAL EXPENSES",
        "type": "Expense",
        "direction": "out",
    },
    "Loan or financing transaction": {
        "code": "420-0000",
        "name": "HIRE PURCHASE CREDITOR",
        "type": "Liability",
        "direction": "both",
    },
    "Transfer between accounts": {
        "code": "490-0000",
        "name": "TEMPORARY ACCOUNT FOR CONTRA",
        "type": "Liability",
        "direction": "both",
    },
    "Refund": {
        "code": "510-0000",
        "name": "RETURN INWARDS",
        "type": "Sales Adjustment",
        "direction": "both",
    },
    "Unknown / needs review": {
        "code": "915-0000",
        "name": "GENERAL EXPENSES",
        "type": "Expense",
        "direction": "both",
    },
}


def classify_bank_transaction(
    tx: BankTransactionModel,
    db: Session,
    company_id: str = "COMP-000001"
) -> Dict[str, Any]:
    """
    Classifies a bank transaction into a standard accounting category and Chart of Accounts account.
    Returns:
        dict with suggested_category, suggested_account_code, suggested_account_name,
        classification_confidence, classification_explanation, classification_status, review_status.
    """
    desc = (tx.description or "").strip().lower()
    ref = (tx.reference or "").strip().lower()
    combined_text = f"{desc} {ref}"
    money_in = tx.money_in or 0.0
    money_out = tx.money_out or 0.0

    category = "Unknown / needs review"
    account_code = "915-0000"
    account_name = "GENERAL EXPENSES"
    confidence = 0.50
    explanation = "General transaction requiring manual review."

    # 1. Incoming Money (money_in > 0)
    if money_in > 0:
        if any(w in combined_text for w in ["capital contribution", "capital contributed", "additional capital", "share capital", "equity contribution"]):
            category = "Owner's Equity / Capital"
            account_code = "100-0000"
            account_name = "CAPITAL"
            confidence = 0.95
            explanation = "Incoming capital contribution from owner categorized under Capital / Equity."
        elif any(w in combined_text for w in ["owner loan", "loan contributed", "director loan", "shareholder loan", "loan from owner"]):
            category = "Loan Payable / Liability"
            account_code = "425-0000"
            account_name = "BANK LOAN"
            confidence = 0.92
            explanation = "Incoming financing or owner loan categorized under Loan Payable / Liability."
        elif any(w in combined_text for w in ["customer deposit", "deposit from", "advance deposit", "security deposit received"]):
            category = "Customer Deposits / Liability"
            account_code = "440-0000"
            account_name = "DEPOSIT RECEIVED"
            confidence = 0.92
            explanation = "Customer advance payment or deposit received categorized under Current Liabilities."
        elif any(w in combined_text for w in ["customer payment", "payment from", "receipt from", "debtor", "collection", "cust pay", "full online payment", "full payment", "outstanding payment"]):
            category = "Accounts Receivable Settlement"
            account_code = "300-0000"
            account_name = "TRADE DEBTORS"
            confidence = 0.92
            explanation = "Incoming customer settlement of accounts receivable (Trade Debtors)."
        elif any(w in combined_text for w in ["cash sale", "direct sale", "pos collection", "counter sale", "walk-in"]):
            category = "Sales receipt"
            account_code = "500-1000"
            account_name = "CASH SALES"
            confidence = 0.88
            explanation = "Incoming funds identified as immediate cash sales revenue."
        elif any(w in combined_text for w in ["refund from", "supplier refund", "vendor rebate", "claim refund"]):
            category = "Refund"
            account_code = "612-0000"
            account_name = "PURCHASES RETURN"
            confidence = 0.85
            explanation = "Incoming credit identified as purchase rebate or supplier refund."
        elif any(w in combined_text for w in ["loan drawdown", "financing disbursement", "hire purchase drawdown"]):
            category = "Loan or financing transaction"
            account_code = "420-0000"
            account_name = "HIRE PURCHASE CREDITOR"
            confidence = 0.85
            explanation = "Incoming financing or loan disbursement."
        elif any(w in combined_text for w in ["inter-account", "fund transfer from", "contra", "transfer from"]):
            category = "Transfer between accounts"
            account_code = "490-0000"
            account_name = "TEMPORARY ACCOUNT FOR CONTRA"
            confidence = 0.80
            explanation = "Incoming inter-account or internal treasury transfer."
        else:
            category = "Accounts Receivable Settlement"
            account_code = "300-0000"
            account_name = "TRADE DEBTORS"
            confidence = 0.65
            explanation = "Unspecified incoming deposit provisionally classified as trade receivable receipt. Review recommended."

    # 2. Outgoing Money (money_out > 0)
    elif money_out > 0:
        if any(w in combined_text for w in ["rental deposit", "rent paid", "rental", "office rental", "january rent", "premises rent", "tenancy", "conway properties"]):
            category = "Rent / Prepayment"
            account_code = "914-0000"
            account_name = "OFFICE RENTAL"
            confidence = 0.92
            explanation = "Rental payment and lease deposit for office premises."
        elif any(w in combined_text for w in ["display shelves", "shelves", "fixtures", "fittings", "baggypro", "renovation", "machinery", "furniture", "desk", "chair"]):
            category = "Property, Plant and Equipment"
            account_code = "200-2000"
            account_name = "FURNITURES & FITTINGS"
            confidence = 0.92
            explanation = "Capital expenditure for shop display shelves, furniture or fixtures categorized under Fixed Assets."
        elif any(w in combined_text for w in ["it equipment", "computer", "laptop", "server", "office equipment", "hardware", "printer", "monitors"]):
            category = "Property, Plant and Equipment"
            account_code = "200-3000"
            account_name = "OFFICE EQUIPMENT"
            confidence = 0.92
            explanation = "Capital expenditure for IT / office equipment categorized as Fixed Asset."
        elif any(w in combined_text for w in ["printing", "catalogues", "promotional", "advertising", "marketing", "flyers", "brochures", "shopping bags", "sprint sdn bhd"]):
            category = "Printing and Advertising Expense"
            account_code = "910-0000"
            account_name = "PRINTING & STATIONERY"
            confidence = 0.92
            explanation = "Marketing, promotional catalogues, shopping bags and printing expenditure."
        elif any(w in combined_text for w in ["audit and assurance", "assurance", "audit", "tax service", "tax fee", "tax service sdn bhd", "legal fee", "consultancy", "professional fee", "accounting fee", "sara & co"]):
            category = "Professional Fees"
            account_code = "405-0000" if "tax service" in combined_text else "915-0000"
            account_name = "OTHER CREDITORS" if "tax service" in combined_text else "GENERAL EXPENSES"
            confidence = 0.92
            explanation = "Professional audit, assurance, or tax advisory services disbursement."
        elif any(w in combined_text for w in ["salary", "salaries", "payroll", "wages", "staff pay", "employee pay", "net salary", "payroll bank transfer", "epf", "socso", "eis"]):
            category = "Salary Expense / Payroll"
            account_code = "904-0000"
            account_name = "SALARIES"
            confidence = 0.95
            explanation = "Employee net salary and payroll compensation disbursement."
        elif any(w in combined_text for w in ["bank charge", "service fee", "interbank fee", "transfer fee", "annual fee", "commission charge"]):
            category = "Bank Charges Expense"
            account_code = "902-0000"
            account_name = "BANK CHARGES"
            confidence = 0.95
            explanation = "Bank charges and financial institution processing fees."
        elif any(w in combined_text for w in ["telekom", "telephone", "broadband", "internet", "unifi", "maxis", "celcom", "digi"]):
            category = "Operating expense"
            account_code = "909-0000"
            account_name = "TELEPHONE CHARGES"
            confidence = 0.90
            explanation = "Telecommunication and internet service operating expense."
        elif any(w in combined_text for w in ["utility", "utilities", "electricity", "water", "tnb", "tqm", "air selangor"]):
            category = "Operating expense"
            account_code = "907-0000"
            account_name = "WATER & ELECTRICITY"
            confidence = 0.90
            explanation = "Water and electrical utility operating expense."
        elif any(w in combined_text for w in ["supplier payment", "vendor payment", "creditor payment", "bill payment", "settlement of outstanding invoice", "bag wholesalers", "payment to supplier", "pay to vendor"]):
            category = "Supplier payment / accounts payable settlement"
            account_code = "400-0000"
            account_name = "TRADE CREDITORS"
            confidence = 0.92
            explanation = "Disbursement identified as settlement of trade supplier invoice (Trade Creditors)."
        elif any(w in combined_text for w in ["cleaning", "cleanpro", "maintenance", "air conditioner", "good service", "repair", "service"]):
            category = "Operating expense"
            account_code = "915-0000"
            account_name = "GENERAL EXPENSES"
            confidence = 0.90
            explanation = "Premises cleaning, upkeep, and equipment maintenance expense."
        elif any(w in combined_text for w in ["lunch", "dinner", "meal", "meals", "cafe", "café", "restaurant", "food", "dining", "entertainment", "refreshment", "refreshments"]):
            category = "Operating expense"
            account_code = "915-0000"
            account_name = "GENERAL EXPENSES"
            confidence = 0.90
            explanation = "Staff refreshment, meal or business entertainment expense categorized under General Expenses."
        elif any(w in combined_text for w in ["customer refund", "refund to customer", "return payout"]):
            category = "Refund"
            account_code = "510-0000"
            account_name = "RETURN INWARDS"
            confidence = 0.85
            explanation = "Outgoing customer rebate or sales return payout."
        elif any(w in combined_text for w in ["inter-account", "contra", "transfer to"]):
            category = "Transfer between accounts"
            account_code = "490-0000"
            account_name = "TEMPORARY ACCOUNT FOR CONTRA"
            confidence = 0.80
            explanation = "Outgoing inter-account or internal treasury transfer."
        else:
            category = "Operating expense"
            account_code = "915-0000"
            account_name = "GENERAL EXPENSES"
            confidence = 0.65
            explanation = "General operating expenditure categorized under General Expenses. Review recommended."

    # Look up actual Chart of Accounts entry if company_id is provided
    coa_entry = db.query(ChartOfAccountModel).filter(
        ChartOfAccountModel.company_id == company_id,
        ChartOfAccountModel.account_code == account_code
    ).first()
    if coa_entry:
        account_name = coa_entry.account_name

    classification_status = "AUTO_CLASSIFIED" if confidence >= 0.70 else "NEEDS_REVIEW"
    review_status = "NEEDS_REVIEW"  # Per accounting requirements, always requires human review before journal posting

    return {
        "suggested_category": category,
        "suggested_account_code": account_code,
        "suggested_account_name": account_name,
        "classification_confidence": round(confidence, 2),
        "classification_explanation": explanation,
        "classification_status": classification_status,
        "review_status": review_status,
        "classification_timestamp": get_local_now(),
    }


def _normalize_text(text: str) -> str:
    """Normalizes text by removing diacritics/accents, special characters, and extra spaces."""
    if not text:
        return ""
    norm = unicodedata.normalize("NFKD", text).encode("ASCII", "ignore").decode("utf-8")
    clean = re.sub(r"[^a-zA-Z0-9\s]", " ", norm).lower()
    return " ".join(clean.split())


def _check_party_match(party: str, text: str) -> bool:
    """
    Checks if a counterparty name matches transaction text.
    Handles corporate suffixes (Sdn Bhd, etc.), accents (Café vs Cafe), and substring/token overlap.
    """
    np = _normalize_text(party)
    nt = _normalize_text(text)
    if not np or not nt:
        return False
    if np in nt or nt in np:
        return True

    # Strip standard corporate designations
    clean_p = re.sub(r"\b(sdn|bhd|pte|ltd|inc|llc|co)\b", "", np).strip()
    clean_p = " ".join(clean_p.split())
    if len(clean_p) >= 4 and (clean_p in nt or nt in clean_p):
        return True

    # Check multi-word phrase or significant token (>= 5 characters)
    words = [w for w in clean_p.split() if len(w) >= 3]
    if len(words) >= 2:
        two_word = " ".join(words[:2])
        if two_word in nt:
            return True
    for w in words:
        if len(w) >= 5 and w in nt:
            return True

    return False


def match_bank_transaction_to_documents(
    tx: BankTransactionModel,
    db: Session,
    company_id: str = "COMP-000001"
) -> Dict[str, Any]:
    """
    Searches for candidate accounting documents matching this bank transaction.
    Compares amounts, references, document identifiers, and entity names.
    Returns:
        dict with match_status, matched_document_id, match_confidence, match_explanation,
        and candidates list.
    """
    money_in = tx.money_in or 0.0
    money_out = tx.money_out or 0.0
    target_amount = money_in if money_in > 0 else money_out
    desc = (tx.description or "").lower()
    ref = (tx.reference or "").lower()

    # Determine relevant document types based on cashflow direction
    if money_in > 0:
        relevant_types = ["Sales Invoice", "Payment Receipt", "Official Receipt", "Credit Note"]
    else:
        relevant_types = ["Purchase Invoice", "Supplier Invoice", "Expense Receipt", "Purchase Receipt", "Payment Voucher", "Debit Note"]

    docs = db.query(DocumentModel).filter(
        DocumentModel.company_id == company_id
    ).all()

    candidates: List[Dict[str, Any]] = []

    for d in docs:
        extracted = {}
        if d.extracted_data_json:
            try:
                extracted = json.loads(d.extracted_data_json)
            except Exception:
                extracted = {}

        doc_total = float(
            getattr(d, 'converted_amount_myr', None) or
            extracted.get("converted_amount_myr") or
            d.grand_total or
            extracted.get("grand_total") or
            0.0
        )
        doc_type = d.document_type or "Unknown"

        # Collect invoice/receipt identifiers
        inv_nums = []
        for key in ["invoice_number", "receipt_number", "credit_note_number", "debit_note_number", "reference_number"]:
            val = extracted.get(key)
            if val and isinstance(val, str) and val.strip():
                inv_nums.append(val.strip().lower())

        # Collect counterparty candidates based on document type
        party_candidates: List[str] = []
        if doc_type in ["Sales Invoice", "Credit Note"]:
            for key in ["buyer_name", "customer_name"]:
                if extracted.get(key) and isinstance(extracted[key], str) and extracted[key].strip():
                    party_candidates.append(extracted[key].strip())
            disp_party = extracted.get("display_summary", {}).get("party")
            if disp_party and isinstance(disp_party, str) and disp_party.strip():
                party_candidates.append(disp_party.strip())
            if d.vendor_name and d.vendor_name.strip().lower() != "lumpur":
                party_candidates.append(d.vendor_name.strip())
        else:
            if d.vendor_name and d.vendor_name.strip():
                party_candidates.append(d.vendor_name.strip())
            for key in ["vendor_name", "merchant_name", "seller_name"]:
                if extracted.get(key) and isinstance(extracted[key], str) and extracted[key].strip():
                    party_candidates.append(extracted[key].strip())
            disp_party = extracted.get("display_summary", {}).get("party")
            if disp_party and isinstance(disp_party, str) and disp_party.strip():
                party_candidates.append(disp_party.strip())

        score = 0.0
        reasons = []

        # 1. Type compatibility
        if doc_type in relevant_types:
            score += 0.20
            reasons.append(f"Compatible type ({doc_type})")

        # 2. Exact or close amount match
        amount_diff = abs(doc_total - target_amount)
        if target_amount > 0 and amount_diff < 0.01:
            score += 0.50
            reasons.append(f"Exact amount match (RM {target_amount:,.2f})")
        elif target_amount > 0 and amount_diff / max(target_amount, 1.0) < 0.05:
            score += 0.25
            reasons.append(f"Close amount match (diff RM {amount_diff:.2f})")

        # 3. Reference or invoice number match
        matched_inv = None
        for inum in inv_nums:
            if inum and (inum in ref or inum in desc or ref in inum):
                matched_inv = inum
                break
        if matched_inv:
            score += 0.30
            reasons.append(f"Invoice/Ref number '{matched_inv}' match")

        # 4. Entity/party name match
        matched_party = None
        for p in party_candidates:
            if _check_party_match(p, desc) or _check_party_match(p, ref):
                matched_party = p
                break
        if matched_party:
            score += 0.20
            reasons.append(f"Entity name '{matched_party}' match")

        # Determine display vendor for candidates list
        display_vendor = d.vendor_name
        if doc_type in ["Sales Invoice", "Credit Note"] and (not display_vendor or display_vendor.lower() == "lumpur"):
            display_vendor = extracted.get("buyer_name") or extracted.get("display_summary", {}).get("party") or display_vendor
        elif not display_vendor or display_vendor.lower() == "lumpur":
            display_vendor = extracted.get("vendor_name") or extracted.get("merchant_name") or extracted.get("display_summary", {}).get("party") or display_vendor

        if score >= 0.40:
            candidates.append({
                "document_id": d.document_id,
                "document_type": doc_type,
                "filename": d.original_filename,
                "vendor_name": display_vendor,
                "grand_total": doc_total,
                "score": round(min(score, 1.0), 2),
                "reasons": reasons,
            })

    # Sort candidates by score descending
    candidates.sort(key=lambda c: c["score"], reverse=True)

    if candidates and candidates[0]["score"] >= 0.70:
        best = candidates[0]
        status = "SUGGESTED_MATCH" if best["score"] < 0.90 else "MATCHED"
        return {
            "match_status": status,
            "matched_document_id": best["document_id"],
            "match_confidence": best["score"],
            "match_explanation": f"Matched to {best['document_type']} ({best['document_id']}): " + ", ".join(best["reasons"]),
            "candidates": candidates,
            "match_timestamp": get_local_now(),
        }
    else:
        direction_label = "sales invoice or customer receipt" if money_in > 0 else "supplier invoice or expense bill"
        return {
            "match_status": "UNMATCHED",
            "matched_document_id": None,
            "match_confidence": 0.0,
            "match_explanation": f"No {direction_label} found matching amount RM {target_amount:,.2f} or reference '{tx.reference or tx.description}'. Supporting document required for reconciliation.",
            "candidates": candidates,
            "match_timestamp": get_local_now(),
        }


def append_audit_entry(
    current_audit_json: Optional[str],
    action: str,
    details: str,
    actor: str = "SYSTEM"
) -> str:
    """Appends an event entry to the audit trail JSON string."""
    trail: List[Dict[str, Any]] = []
    if current_audit_json:
        try:
            trail = json.loads(current_audit_json)
        except Exception:
            trail = []

    trail.append({
        "timestamp": get_local_now().strftime("%Y-%m-%d %H:%M:%S"),
        "action": action,
        "actor": actor,
        "details": details,
    })
    return json.dumps(trail)


def process_bank_transaction_intelligence(
    tx: BankTransactionModel,
    db: Session,
    company_id: str = "COMP-000001",
    commit: bool = True
) -> BankTransactionModel:
    """
    Orchestrates classification, document matching, and audit logging for a bank transaction.
    """
    # 1. Classification
    cls_res = classify_bank_transaction(tx, db, company_id=company_id)
    tx.suggested_category = cls_res["suggested_category"]
    tx.suggested_account_code = cls_res["suggested_account_code"]
    tx.suggested_account_name = cls_res["suggested_account_name"]
    tx.classification_confidence = cls_res["classification_confidence"]
    tx.classification_explanation = cls_res["classification_explanation"]
    tx.classification_status = cls_res["classification_status"]
    tx.review_status = cls_res["review_status"]
    tx.classification_timestamp = cls_res["classification_timestamp"]

    # 2. Matching
    match_res = match_bank_transaction_to_documents(tx, db, company_id=company_id)
    tx.match_status = match_res["match_status"]
    tx.matched_document_id = match_res["matched_document_id"]
    tx.match_confidence = match_res["match_confidence"]
    tx.match_explanation = match_res["match_explanation"]
    tx.match_timestamp = match_res["match_timestamp"]
    tx.reconciliation_status = "REVIEW_READY" if tx.match_status in ["MATCHED", "SUGGESTED_MATCH"] else "UNRECONCILED"

    # 3. Audit trail
    cls_desc = f"Classified as '{tx.suggested_category}' ({tx.suggested_account_code} {tx.suggested_account_name}) with confidence {tx.classification_confidence:.2f}. {tx.classification_explanation}"
    tx.audit_trail_json = append_audit_entry(
        tx.audit_trail_json,
        action="AUTO_CLASSIFIED",
        details=cls_desc,
        actor="Bank Classification Engine"
    )

    match_desc = f"Matching evaluated: status={tx.match_status}. {tx.match_explanation}"
    tx.audit_trail_json = append_audit_entry(
        tx.audit_trail_json,
        action="DOCUMENT_MATCH_EVALUATED",
        details=match_desc,
        actor="Bank Reconciliation Engine"
    )

    if commit:
        db.commit()
        db.refresh(tx)

    return tx


def classify_all_pending_transactions(db: Session, company_id: str = "COMP-000001") -> int:
    """
    Evaluates and updates any bank transactions missing classification or matching.
    """
    txs = db.query(BankTransactionModel).filter(
        BankTransactionModel.company_id == company_id
    ).all()

    updated = 0
    for tx in txs:
        # Run if unclassified or missing suggested_category
        if not tx.suggested_category or tx.classification_status in ["PENDING", None]:
            process_bank_transaction_intelligence(tx, db, company_id=company_id, commit=False)
            updated += 1

    if updated > 0:
        db.commit()

    return updated



def reclassify_company_bank_transactions(db: Session, company_id: str) -> int:
    """
    Re-evaluates classification suggestions for all unreconciled/unposted
    bank transactions belonging to a company using current classification rules.
    Does not modify already posted or human-confirmed journal entries.
    """
    txs = db.query(BankTransactionModel).filter(
        BankTransactionModel.company_id == company_id,
        BankTransactionModel.reconciliation_status != "POSTED"
    ).all()
    count = 0
    for tx in txs:
        classification = classify_bank_transaction(tx, db, company_id=company_id)
        tx.suggested_category = classification["suggested_category"]
        tx.suggested_account_code = classification["suggested_account_code"]
        tx.suggested_account_name = classification["suggested_account_name"]
        tx.classification_confidence = classification["classification_confidence"]
        tx.classification_explanation = classification["classification_explanation"]
        tx.classification_status = classification["classification_status"]
        tx.classification_timestamp = classification["classification_timestamp"]
        count += 1
    db.commit()
    return count
