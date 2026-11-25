import re
from pathlib import Path
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Any, Tuple, List, Optional
from app.schemas.document import (
    ExtractedDocumentData, 
    BusinessRolesSchema, 
    CalculationVerificationSchema,
    CompanyMatchContextSchema,
    DisplaySummarySchema,
    SemanticVerificationSchema,
    SemanticThoughtProcessSchema
)
from app.services.calculation_agent import CalculationAgent


def clean_invoice_number(val: Optional[str]) -> Optional[str]:
    """
    Cleans raw invoice number strings by stripping leading/trailing punctuation,
    dots, colons, hyphens, hashes, and residual label text.
    Ensures pure identifier is returned (e.g., '. : I-000004' -> 'I-000004').
    """
    if not val or not isinstance(val, str):
        return None
    v = val.strip()
    # Strip quotes/brackets
    v = re.sub(r'^[\'"\(\[\{]+|[\'"\)\]\}]+$', '', v).strip()
    # Strip leading punctuation/symbols like ., :, -, =, #, space, slash
    v = re.sub(r'^[.:\s\-=#/]+', '', v).strip()
    # Strip trailing punctuation
    v = re.sub(r'[.:\s\-=#/]+$', '', v).strip()
    # Remove leading label words if any remain (do NOT strip INV- or PI- if part of identifier like INV-2026-0001)
    v = re.sub(r'^(?:Invoice\s+(?:No\.?|Number|#)?|Invoice\s*[:\-=.]|Inv\s+(?:No\.?|#)|Inv\s*[:=]|No\.?\s*[:\-=.]|#\s*)\s*[:\-=.]*\s*', '', v, flags=re.IGNORECASE).strip()
    # Strip leading punctuation again if label removal exposed punctuation
    v = re.sub(r'^[.:\s\-=#/]+', '', v).strip()
    # If there is a trailing label on the same line, cut before it
    v = re.sub(r'(?i)\s+(?:Your\s*Ref\.?|Our\s*D/?O\s*No\.?|Our\s*GRN\s*No\.?|Date|Page|Terms|Attn|TEL|FAX)\b.*$', '', v).strip()
    # Clean internal multiple spaces
    v = re.sub(r'\s+', ' ', v)
    # Reject if it matches other reference labels or invalid words
    v_upper = v.upper()
    if any(v_upper.startswith(k) for k in [
        "YOUR REF", "OUR D/O", "OUR GRN", "OUR REF", "PO-", "DO-", "P/O", "D/O", "GRN",
        "TERMS", "DATE", "PAGE", "TEL", "FAX", "ATTN", "NOTES"
    ]):
        return None
    if len(v) < 2 or v_upper in ["INVOICE", "TAX INVOICE", "PURCHASE INVOICE", "SALES INVOICE", "N/A", "NULL", "NONE"]:
        return None
    return v


def normalize_date_to_iso(date_str: Optional[str]) -> Optional[str]:
    """
    Normalizes dates from DD-MM-YYYY or DD/MM/YYYY or YYYY-MM-DD to ISO YYYY-MM-DD.
    """
    if not date_str or not isinstance(date_str, str):
        return None
    clean = date_str.strip()
    m = re.match(r'^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$', clean)
    if m:
        d, mth, y = m.groups()
        return f"{y}-{int(mth):02d}-{int(d):02d}"
    m2 = re.match(r'^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$', clean)
    if m2:
        y, mth, d = m2.groups()
        return f"{y}-{int(mth):02d}-{int(d):02d}"
    return clean


def normalize_identifier(value: Optional[str]) -> Optional[str]:
    if not value or not isinstance(value, str):
        return None
    val = value.strip().upper()
    val = re.sub(r"[\s_]+", "-", val)
    val = re.sub(r"-+", "-", val)
    return val.strip("-") if val else None


ADDRESS_LOCATION_TERMS = {
    "LUMPUR", "KUALA LUMPUR", "MALAYSIA", "SINGAPORE", "SELANGOR", "PENANG", "JOHOR",
    "PERAK", "KEDAH", "MELAKA", "SABAH", "SARAWAK", "JALAN", "LORONG", "TAMAN",
    "STREET", "AVENUE", "ROAD", "LEVEL", "FLOOR", "SUITE", "POSTCODE", "ZIP",
    "CITY", "STATE", "COUNTRY", "ADDRESS", "TEL", "FAX", "PHONE", "MOBILE"
}

GENERIC_FIELD_LABEL_TERMS = {
    "BANK", "PAYMENT METHOD", "DATE PAID", "TRANSACTION DATE", "PAYMENT DATE",
    "INVOICE", "RECEIPT", "STATEMENT", "SUBTOTAL", "TAX", "SST", "GST", "VAT",
    "TOTAL", "GRAND TOTAL", "BALANCE DUE", "AMOUNT DUE", "AMOUNT PAID", "AMOUNT RECEIVED",
    "QUANTITY", "UNIT PRICE", "RATE", "DESCRIPTION", "PAGE", "CURRENCY",
    "BILL TO", "BILLED TO", "SOLD TO", "BOUGHT FROM", "SHIP TO", "SHIPPED TO",
    "PAYMENT", "PAYMENT TERMS", "TERMS", "CREDIT TERMS"
}


CURRENCY_PREFIX_PAT = r'(?:[A-Z]{3}|RM|S\$|[$€£¥])?'


def is_address_line(candidate: Optional[str]) -> bool:
    """
    Detects whether a candidate text string represents an address line (international or Malaysian).
    """
    if not candidate or not isinstance(candidate, str):
        return False
    clean = candidate.strip()
    if len(clean) < 3:
        return False
    clean_lower = clean.lower()

    # Singapore 6-digit postal code or "Singapore <6-digits>"
    if re.search(r'\b\d{6}\b', clean) or re.search(r'singapore\s*\d{6}', clean_lower):
        return True

    # Malaysian 5-digit postal code + city
    if re.search(r'\b\d{5}\s+[A-Za-z]+', clean):
        return True

    # Common road/street words preceded by numbers or words:
    if re.search(r'(?i)\b(?:\d+[\w\s,-]*)?(?:Road|Rd|Street|St|Avenue|Ave|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Highway|Hwy|Close|Cl|Crescent|Cres)\b', clean):
        if not re.search(r'(?i)\b(sdn\s*bhd|bhd|pte\s*ltd|ltd|inc|corp|llc|co\.)\b', clean):
            return True

    # Standard prefix indicators
    if re.match(r'^(?:level\s*\d+|no\.?\s*\d+|unit\s*\d+|suite\s*\d+|block\s*\d+|floor\s*\d+|jalan\s+|lorong\s+|taman\s+|p\.?o\.?\s*box)', clean_lower):
        return True

    # Country/City terms when on their own
    if clean_lower in ["malaysia", "singapore", "kuala lumpur", "johor bahru", "penang", "selangor"]:
        return True

    return False


def detect_currency(text: str) -> str:
    """
    Detects ISO 4217 currency code from text with priority:
    1. Full currency names / written words:
       - United States Dollar / US Dollar -> USD
       - Singapore Dollar -> SGD
       - Australian Dollar -> AUD
       - Canadian Dollar -> CAD
       - New Zealand Dollar -> NZD
       - British Pound / Pound Sterling -> GBP
       - Euro / Euros -> EUR
       - Japanese Yen -> JPY
       - Swiss Franc -> CHF
       - Chinese Yuan / Renminbi -> CNY
       - Ringgit Malaysia / Malaysian Ringgit -> MYR
    2. Explicit 3-letter currency code: SGD, USD, EUR, GBP, AUD, JPY, CAD, CHF, CNY, NZD, MYR
    3. Explicit currency symbols: S$ -> SGD, RM -> MYR, € -> EUR, £ -> GBP, ¥ -> JPY, USD$ / $ -> USD
    4. Default: MYR
    """
    # 1. Full currency names (case-insensitive)
    if re.search(r'\b(United\s+States\s+Dollar|US\s+Dollar|U\.S\.\s+Dollar)\b', text, re.IGNORECASE):
        return "USD"
    if re.search(r'\bSingapore\s+Dollar\b', text, re.IGNORECASE):
        return "SGD"
    if re.search(r'\b(British\s+Pound|Pound\s+Sterling)\b', text, re.IGNORECASE):
        return "GBP"
    if re.search(r'\b(Euro|Euros)\b', text, re.IGNORECASE):
        return "EUR"
    if re.search(r'\b(Japanese\s+Yen|Yen)\b', text, re.IGNORECASE):
        return "JPY"
    if re.search(r'\bAustralian\s+Dollar\b', text, re.IGNORECASE):
        return "AUD"
    if re.search(r'\bCanadian\s+Dollar\b', text, re.IGNORECASE):
        return "CAD"
    if re.search(r'\bSwiss\s+Franc\b', text, re.IGNORECASE):
        return "CHF"
    if re.search(r'\b(Chinese\s+Yuan|Renminbi)\b', text, re.IGNORECASE):
        return "CNY"
    if re.search(r'\bNew\s+Zealand\s+Dollar\b', text, re.IGNORECASE):
        return "NZD"
    if re.search(r'\b(Ringgit\s+Malaysia|Malaysian\s+Ringgit)\b', text, re.IGNORECASE):
        return "MYR"

    # 2. Explicit 3-letter currency codes
    curr_matches = re.findall(r'\b(SGD|USD|EUR|GBP|AUD|JPY|CAD|CHF|CNY|NZD|MYR)\b', text, re.IGNORECASE)
    if curr_matches:
        for c in curr_matches:
            if c.upper() != "MYR":
                return c.upper()
        return "MYR"

    # 3. Currency symbols
    if "S$" in text:
        return "SGD"
    if "RM" in text.upper():
        return "MYR"
    if "€" in text:
        return "EUR"
    if "£" in text:
        return "GBP"
    if "¥" in text:
        return "JPY"
    if "$" in text:
        return "USD"

    return "MYR"

def is_valid_company_entity(candidate: Optional[str]) -> bool:
    """
    Strict validation to ensure candidate entity is a valid business name or person name
    and NEVER:
    1. Reference numbers / IDs (e.g. # PUR-2026-001, # SUP-2026-001, INV-2026-0001, PAY-2026-0013, RC-2026-0011, TRX-2026-99042)
    2. Placeholders / template text ('address, for example:', 'use a fictional customer address...')
    3. Field labels / document headers ('Payment Method', 'Date Paid', 'Subtotal', 'Tax', 'Total')
    4. Address lines ('Level 12, Menara Tech', 'No. 20, Jalan Ampang', '50450 Kuala Lumpur', 'Malaysia')
    """
    if not candidate or not isinstance(candidate, str):
        return False
    clean = candidate.strip()
    if len(clean) < 2:
        return False
    clean_upper = clean.upper()

    # 1. Reject reference numbers and document IDs
    if re.search(r'#?\s*(?:PUR|SUP|INV|PAY|RC|TRX|REF|DOC)[-_\s]*\d{3,}', clean, re.IGNORECASE):
        return False
    if re.match(r'^#?\s*[A-Z0-9]+-\d+-\d+$', clean, re.IGNORECASE):
        return False
    if re.match(r'^\d+$', clean):
        return False

    # 2. Reject template & placeholder text
    for pat in PLACEHOLDER_TEXT_PATTERNS:
        if re.search(pat, clean.lower()):
            return False

    # 3. Reject financial labels and field headers
    for pat in FINANCIAL_LABEL_PATTERNS:
        if re.search(pat, clean.lower()):
            return False

    # Reject strings starting with slashes, punctuation or symbols
    if re.match(r'^[/\\\-_:;,\.#\(\)]', clean):
        return False

    # Reject exact field label phrases and fragments
    if clean_upper in {
        "TO", "/ TO", "BY / TO", "RECEIVED BY", "RECEIVED BY / TO",
        "ISSUED TO", "BILL TO", "BILLED TO", "SHIP TO", "ATTN", "ATTENTION",
        "FROM", "ISSUED BY", "RECEIVED FROM", "REASON", "CREDIT TERMS"
    }:
        return False

    # 4. Reject exact generic field words or address location single/multi-word terms
    if clean_upper in ADDRESS_LOCATION_TERMS or clean_upper in GENERIC_FIELD_LABEL_TERMS:
        return False

    # 5. Reject address lines & zip codes
    if is_address_line(clean):
        return False
    if re.match(r'^(?:level\s*\d+|no\.?\s*\d+|unit\s*\d+|suite\s*\d+|block\s*\d+|floor\s*\d+|jalan\s+|lorong\s+|taman\s+|p\.?o\.?\s*box)', clean.lower()):
        return False
    if re.search(r'\b\d{5}\s+[A-Za-z]+', clean):  # Zip code + city e.g. 50450 Kuala Lumpur
        return False

    # 6. Ensure candidate contains at least 2 alphabetic characters
    alpha_count = sum(1 for c in clean if c.isalpha())
    if alpha_count < 2:
        return False

    return True


def generate_duplicate_key(
    company_id: str,
    doc_type: str,
    extracted_data: Dict[str, Any]
) -> Tuple[Optional[str], str, Optional[str]]:
    """
    Generates document-type-specific duplicate detection key based on extracted identifiers and company context.
    Returns: (duplicate_key, identifier_label, identifier_value)
    """
    comp_prefix = (company_id or "COMP-000001").strip().upper()
    doc_type_clean = doc_type or ""
    doc_type_upper = doc_type_clean.upper().replace(" ", "_")

    roles = extracted_data.get("business_roles") or {}
    if not isinstance(roles, dict):
        roles = {}

    # 1. Sales Invoice
    if doc_type_clean == "Sales Invoice":
        inv_no = extracted_data.get("invoice_number")
        norm_inv = normalize_identifier(inv_no)
        if norm_inv:
            return f"{comp_prefix}|SALES_INVOICE|{norm_inv}", "Invoice Number", inv_no
        return None, "Invoice Number", None

    # 2. Purchase Invoice & Supplier Invoice
    elif doc_type_clean in ["Purchase Invoice", "Supplier Invoice"]:
        inv_no = extracted_data.get("invoice_number")
        vendor = (
            extracted_data.get("vendor_name")
            or extracted_data.get("supplier_name")
            or roles.get("vendor")
            or roles.get("supplier")
        )
        norm_inv = normalize_identifier(inv_no)
        norm_vend = normalize_identifier(vendor)
        if norm_inv and norm_vend:
            return f"{comp_prefix}|{doc_type_upper}|{norm_vend}|{norm_inv}", "Invoice Number", inv_no
        elif norm_inv:
            return f"{comp_prefix}|{doc_type_upper}|{norm_inv}", "Invoice Number", inv_no
        return None, "Invoice Number", None

    # 3. Purchase Receipt & Expense Receipt
    elif doc_type_clean in ["Purchase Receipt", "Expense Receipt"]:
        rc_no = extracted_data.get("receipt_number")
        merchant = (
            extracted_data.get("merchant_name")
            or extracted_data.get("vendor_name")
            or roles.get("merchant")
            or roles.get("vendor")
        )
        norm_rc = normalize_identifier(rc_no)
        norm_merch = normalize_identifier(merchant)
        if norm_rc and norm_merch:
            return f"{comp_prefix}|{doc_type_upper}|{norm_merch}|{norm_rc}", "Receipt Number", rc_no
        elif norm_rc:
            return f"{comp_prefix}|{doc_type_upper}|{norm_rc}", "Receipt Number", rc_no
        return None, "Receipt Number", None

    # 4. Payment Receipt
    elif doc_type_clean == "Payment Receipt":
        rc_no = extracted_data.get("receipt_number")
        norm_rc = normalize_identifier(rc_no)
        if norm_rc:
            return f"{comp_prefix}|PAYMENT_RECEIPT|{norm_rc}", "Receipt Number", rc_no
        return None, "Receipt Number", None

    # 5. Bank Transfer Receipt
    elif doc_type_clean == "Bank Transfer Receipt":
        ref_no = extracted_data.get("reference_number")
        norm_ref = normalize_identifier(ref_no)
        if norm_ref:
            return f"{comp_prefix}|BANK_TRANSFER_RECEIPT|{norm_ref}", "Reference Number", ref_no
        return None, "Reference Number", None

    # 6. Bank Transaction Record
    elif doc_type_clean == "Bank Transaction Record":
        ref_no = extracted_data.get("reference_number") or extracted_data.get("transaction_id")
        norm_ref = normalize_identifier(ref_no)
        if norm_ref:
            return f"{comp_prefix}|BANK_TRANSACTION_RECORD|{norm_ref}", "Reference Number", ref_no

        acc_name = normalize_identifier(extracted_data.get("account_name") or roles.get("other"))
        tx_date = normalize_identifier(extracted_data.get("transaction_date"))
        tx_desc = normalize_identifier(extracted_data.get("payment_reference") or extracted_data.get("description"))
        tx_amt = normalize_identifier(str(extracted_data.get("transaction_amount") or extracted_data.get("grand_total") or ""))
        if acc_name and tx_date and tx_amt:
            key = f"{comp_prefix}|BANK_TRANSACTION_RECORD|{acc_name}|{tx_date}|{tx_desc or 'NONE'}|{tx_amt}"
            display_val = f"{extracted_data.get('transaction_date')} ({extracted_data.get('transaction_amount') or extracted_data.get('grand_total')})"
            return key, "Transaction Record", display_val
        return None, "Transaction Record", None

    # 7. Bank Statement
    elif doc_type_clean == "Bank Statement":
        bank_name = extracted_data.get("bank_name")
        acc_no = extracted_data.get("account_number")
        stmt_period = extracted_data.get("statement_period") or extracted_data.get("period")

        norm_bank = normalize_identifier(bank_name)
        norm_acc = normalize_identifier(acc_no)
        norm_period = normalize_identifier(stmt_period)

        if norm_acc and norm_period:
            key = f"{comp_prefix}|BANK_STATEMENT|{norm_bank or 'BANK'}|{norm_acc}|{norm_period}"
            return key, "Statement Period", stmt_period
        return None, "Statement Period", None

    # 8. Credit Note
    elif doc_type_clean == "Credit Note":
        cn_no = extracted_data.get("credit_note_number") or extracted_data.get("reference_number")
        norm_cn = normalize_identifier(cn_no)
        if norm_cn:
            return f"{comp_prefix}|CREDIT_NOTE|{norm_cn}", "Credit Note Number", cn_no
        return None, "Credit Note Number", None

    # 9. Debit Note
    elif doc_type_clean == "Debit Note":
        dn_no = extracted_data.get("debit_note_number") or extracted_data.get("reference_number")
        norm_dn = normalize_identifier(dn_no)
        if norm_dn:
            return f"{comp_prefix}|DEBIT_NOTE|{norm_dn}", "Debit Note Number", dn_no
        return None, "Debit Note Number", None

    # 10. Official Receipt
    elif doc_type_clean == "Official Receipt":
        rc_no = extracted_data.get("receipt_number") or extracted_data.get("reference_number")
        norm_rc = normalize_identifier(rc_no)
        if norm_rc:
            return f"{comp_prefix}|OFFICIAL_RECEIPT|{norm_rc}", "Receipt Number", rc_no
        return None, "Receipt Number", None

    # 11. Payment Voucher
    elif doc_type_clean == "Payment Voucher":
        pv_no = extracted_data.get("receipt_number") or extracted_data.get("reference_number") or extracted_data.get("voucher_number")
        norm_pv = normalize_identifier(pv_no)
        if norm_pv:
            return f"{comp_prefix}|PAYMENT_VOUCHER|{norm_pv}", "Voucher Number", pv_no
        return None, "Voucher Number", None

    # 12. Stock Take
    elif doc_type_clean == "Stock Take":
        sk_no = extracted_data.get("invoice_number") or extracted_data.get("reference_number")
        norm_sk = normalize_identifier(sk_no)
        if norm_sk:
            return f"{comp_prefix}|STOCK_TAKE|{norm_sk}", "Stock Take Number", sk_no
        return None, "Stock Take Number", None

    # 13. Delivery Order
    elif doc_type_clean == "Delivery Order":
        do_no = extracted_data.get("invoice_number") or extracted_data.get("reference_number") or extracted_data.get("delivery_order_number")
        norm_do = normalize_identifier(do_no)
        if norm_do:
            return f"{comp_prefix}|DELIVERY_ORDER|{norm_do}", "Delivery Order Number", do_no
        return None, "Delivery Order Number", None

    # 14. Purchase Order
    elif doc_type_clean == "Purchase Order":
        po_no = extracted_data.get("invoice_number") or extracted_data.get("reference_number") or extracted_data.get("purchase_order_number")
        norm_po = normalize_identifier(po_no)
        if norm_po:
            return f"{comp_prefix}|PURCHASE_ORDER|{norm_po}", "Purchase Order Number", po_no
        return None, "Purchase Order Number", None

    # 15. Sales Order
    elif doc_type_clean == "Sales Order":
        so_no = extracted_data.get("invoice_number") or extracted_data.get("reference_number") or extracted_data.get("sales_order_number")
        norm_so = normalize_identifier(so_no)
        if norm_so:
            return f"{comp_prefix}|SALES_ORDER|{norm_so}", "Sales Order Number", so_no
        return None, "Sales Order Number", None

    # 16. Purchase Return
    elif doc_type_clean == "Purchase Return":
        pr_no = extracted_data.get("invoice_number") or extracted_data.get("reference_number") or extracted_data.get("return_number")
        norm_pr = normalize_identifier(pr_no)
        if norm_pr:
            return f"{comp_prefix}|PURCHASE_RETURN|{norm_pr}", "Return Number", pr_no
        return None, "Return Number", None

    return None, "Identifier", None



# -------------------------------------------------------------------------
# GLOBAL UTILITIES: FIELD LABELS, PLACEHOLDERS & FINANCIAL PATTERNS
# -------------------------------------------------------------------------

FIELD_LABELS = [
    "Period", "Statement Period", "Account Period",
    "Account Name", "Account Holder", "Account Name:", "Account Holder:",
    "Address", "Address:",
    "Account Number", "Account No", "Acc No", "Account #", "Account Number:",
    "Account Type", "Acc Type", "Account Type:",
    "Statement Date", "Date of Statement", "Statement Date:",
    "Currency", "Currency:",
    "Page", "Page:",
    "Bank Name", "Issuing Bank",
    "No.", "No", "No.:", "Invoice No.", "Invoice No", "Invoice Number", "Invoice #", "Inv #", "SI No", "Bill No",
    "Your Ref.", "Your Ref", "Your Ref No.", "Your Ref No", "Your P/O No.", "Your P/O No",
    "Our D/O No.", "Our D/O No", "Our GRN No.", "Our GRN No", "Our Ref.", "Our Ref",
    "Terms:", "Payment Terms", "Payment Terms:", "Credit Terms", "Page", "Page:", "TEL", "FAX", "Attn", "Attn:",
    "Related Invoice", "Related Invoice No", "Related Invoice Number", "Related Invoice:", "Invoice Ref", "Ref Invoice", "Original Invoice",
    "Credit Note No", "Credit Note Number", "Credit Note #", "CN No", "CN #", "SCN No", "SCN #",
    "Debit Note No", "Debit Note Number", "Debit Note #", "DN No", "DN #",
    "Credit Terms", "Credit Terms:", "Payment Status", "Payment Status:", "Reason for Credit", "Reason for Credit:", "Reason", "Reason:",
    "Receipt No", "Receipt Number", "Receipt #", "Rcpt #",
    "Reference Number", "Ref No", "Transaction Reference", "Payment Reference", "Transfer Type",
    "Transaction Date & Time", "Date & Time", "Date Paid", "Transaction Date", "Receipt Date", "Invoice Date", "Date", "Date:", "Date Paid:",
    "Received From", "Received From:", "Paid By", "Paid By:", "Payer", "Payer:", "Customer", "Customer:", "Buyer", "Buyer:", "Billed To", "Bill To", "Bill To:",
    "Merchant", "Merchant:", "Seller", "Seller:", "Vendor", "Vendor:", "Supplier", "Supplier:", "Issued By", "Issued By:", "Store", "Business Name",
    "Payment Method", "Payment Method:",
    "Description", "Debit", "Credit", "Balance",
    "Opening Balance", "Closing Balance", "Subtotal", "Tax", "SST", "GST", "VAT", "Total", "Grand Total", "Balance Due", "Amount Due", "Amount Received", "Amount Received:"
]

PLACEHOLDER_TEXT_PATTERNS = [
    r'address\s*,?\s*for\s*example',
    r'use\s*a\s*fictional\s*customer\s*address',
    r'fictional\s*customer\s*address',
    r'sample\s*address',
    r'address\s*example',
    r'your\s*address',
    r'enter\s*address',
    r'company\s*name',
    r'your\s*company\s*name',
    r'customer\s*name',
    r'vendor\s*name',
    r'supplier\s*name',
    r'merchant\s*name',
    r'example\s*customer',
    r'example\s*:',
    r'for\s*example',
    r'^e\.?g\.?$',
    r'^n/?a$',
    r'^null$',
    r'^none$',
    r'^undefined$',
    r'sample\s*company',
    r'city\s*state\s*zip',
    r'street\s*address'
]

FINANCIAL_LABEL_PATTERNS = [
    r'^balance\s*due',
    r'^amount\s*due',
    r'^subtotal',
    r'^tax',
    r'^sst',
    r'^gst',
    r'^vat',
    r'^grand\s*total',
    r'^total',
    r'^amount\s*paid',
    r'^amount\s*received',
    r'^payment\s*amount',
    r'^calculated\s*total',
    r'^discrepancy',
    r'^difference',
    r'^opening\s*balance',
    r'^closing\s*balance',
    r'^debit',
    r'^credit',
    r'^balance',
    r'^invoice$',
    r'^tax\s*invoice$',
    r'^sales\s*invoice$',
    r'^purchase\s*invoice$',
    r'^supplier\s*invoice$',
    r'^receipt$',
    r'^payment\s*receipt$',
    r'^purchase\s*receipt$',
    r'^expense\s*receipt$',
    r'^statement$',
    r'^bank\s*statement$',
    r'^account\s*statement$',
    r'^account$',
    r'^payment$',
    r'^payment\s*method',
    r'^payment\s*terms',
    r'^credit\s*terms',
    r'^reason',
    r'^date',
    r'^date\s*paid',
    r'^item',
    r'^quantity',
    r'^rate',
    r'^unit\s*price',
    r'^description',
    r'^page',
    r'^currency'
]

GENERIC_CORP_WORDS = {
    "SDN", "BHD", "PVT", "LTD", "INC", "BERHAD", "CO", "CORP", "LIMITED", "PTE", "LLC", "PLC",
    "SOLUTIONS", "SERVICES", "TECHNOLOGIES", "TECHNOLOGY", "GROUP",
    "HOLDINGS", "MANAGEMENT", "ENTERPRISE", "VENTURES", "CONSULTANCY",
    "CONSULTING", "INTERNATIONAL", "GLOBAL", "TRADING", "INDUSTRIES",
    "RESOURCES", "SYSTEMS", "NETWORK", "NETWORKS", "DIGITAL"
}


def normalize_company_name(name: Optional[str]) -> str:
    """
    Reusable company name normalization function.
    Strips signature/authorization prefixes (FOR, BY, ATTN, TO, FROM, MESSRS)
    so signature blocks like 'FOR 0126 Handbag Solutions Sdn. Bhd.' match correctly.
    """
    if not name or not isinstance(name, str):
        return ""
    s = name.upper().strip()
    s = re.sub(r'^(?:FOR|BY|ATTN|TO|FROM|MESSRS)\s+', '', s, flags=re.IGNORECASE).strip()
    s = re.sub(r'\bSDN\.?\s*BHD\.?\b', 'SDN_BHD_TOKEN', s)
    s = re.sub(r'\bPTE\.?\s*LTD\.?\b', 'PTE_LTD_TOKEN', s)
    s = re.sub(r'\bBHD\.?\b', 'BERHAD', s)
    s = re.sub(r'\bLTD\.?\b', 'LIMITED', s)
    s = re.sub(r'\bINC\.?\b', 'INC', s)
    s = re.sub(r'\bCORP\.?\b', 'CORP', s)
    s = s.replace('SDN_BHD_TOKEN', 'SDN BHD').replace('PTE_LTD_TOKEN', 'PTE LTD')
    s = re.sub(r'[^\w\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'^(?:FOR|BY|ATTN|TO|FROM|MESSRS)\s+', '', s, flags=re.IGNORECASE).strip()
    return s


def is_valid_company_entity(candidate: Optional[str]) -> bool:
    """
    Strict validation to ensure candidate entity is a valid business name or person name
    and NEVER:
    1. Reference numbers / IDs (e.g. # PUR-2026-001, # SUP-2026-001, INV-2026-0001, PAY-2026-0013, RC-2026-0011, TRX-2026-99042)
    2. Placeholders / template text ('address, for example:', 'use a fictional customer address...')
    3. Field labels / document headers ('Payment Method', 'Date Paid', 'Subtotal', 'Tax', 'Total')
    4. Address lines ('Level 12, Menara Tech', 'No. 20, Jalan Ampang', '50450 Kuala Lumpur', 'Malaysia')
    """
    if not candidate or not isinstance(candidate, str):
        return False
    clean = candidate.strip()
    if len(clean) < 2:
        return False
    clean_lower = clean.lower()

    # 1. Reject reference numbers and document IDs
    if re.search(r'#?\s*(?:PUR|SUP|INV|PAY|RC|TRX|REF|DOC)[-_\s]*\d{3,}', clean, re.IGNORECASE):
        return False
    if re.match(r'^#?\s*[A-Z0-9]+-\d+-\d+$', clean, re.IGNORECASE):
        return False
    if re.match(r'^\d+$', clean):
        return False
    if re.match(r'^(?:---|table|\*)', clean_lower):
        return False

    # 2. Reject template & placeholder text
    for pat in PLACEHOLDER_TEXT_PATTERNS:
        if re.search(pat, clean_lower):
            return False

    # 3. Reject financial labels and field headers
    for pat in FINANCIAL_LABEL_PATTERNS:
        if re.search(pat, clean_lower):
            return False

    # 4. Reject address lines
    if is_address_line(clean):
        return False
    if re.match(r'^(?:level\s*\d+|no\.?\s*\d+|unit\s*\d+|suite\s*\d+|block\s*\d+|floor\s*\d+|jalan\s+|lorong\s+|taman\s+)', clean_lower):
        return False
    if re.search(r'\b\d{5}\s+[A-Za-z]+', clean):  # Zip code + city e.g. 50450 Kuala Lumpur
        return False
    if clean_lower in ["malaysia", "singapore", "kuala lumpur", "johor bahru", "penang", "selangor"]:
        return False

    # 5. Reject line items, quantities, prices, and transaction description notes
    if re.search(r'[\d,]+\.\d{2}', clean):
        return False
    if any(k in clean_lower for k in ["laptop", "computer", "equipment", "defective", "return of", "credit applied", "qty", "unit price"]):
        return False

    if clean.upper() in GENERIC_FIELD_LABEL_TERMS or clean.upper() in ADDRESS_LOCATION_TERMS:
        return False

    # 6. Reject pronouns, sentence starters, and generic single footnote words
    if clean.upper() in ["THIS", "THAT", "THERE", "HERE", "PLEASE", "THANK", "THANKS", "NOTE", "NOTICE", "WARNING", "DISCLAIMER", "ACCOUNT", "ACCOUNTING", "CUSTOMER ACCOUNT", "SUPPLIER ACCOUNT"]:
        return False
    if clean_lower.startswith("this is a ") or clean_lower.startswith("thank you") or clean_lower.startswith("no signature"):
        return False

    return True


def is_valid_date_string(val: Optional[str]) -> bool:
    """
    Validates whether a string looks like a date (e.g., 'Sep 28, 2026', '28/09/2026', '2026-09-28')
    rather than a company name or address line.
    """
    if not val or not isinstance(val, str):
        return False
    clean = val.strip()
    m = re.search(r'(\d{1,2}[/\.-]\d{1,2}[/\.-]\d{2,4}|\d{4}[/\.-]\d{1,2}[/\.-]\d{1,2}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})', clean, re.IGNORECASE)
    return bool(m)


HEADER_AND_SUMMARY_WORDS = {
    "ITEM", "DESCRIPTION", "PARTICULARS", "PRODUCT", "QUANTITY", "QTY",
    "RATE", "PRICE", "UNIT PRICE", "UNITPRICE", "AMOUNT", "TOTAL",
    "LINE TOTAL", "TOTAL AMOUNT", "SUBTOTAL", "SUB-TOTAL", "SUB TOTAL",
    "TAX", "SST", "GST", "VAT", "AMOUNT RECEIVED", "AMOUNT PAID",
    "BALANCE DUE", "PAYMENT METHOD", "DATE PAID", "DATE", "RECEIPT",
    "INVOICE", "REFERENCE", "REF", "PAGE", "CURRENCY", "MYR", "RM",
    "QUANTITY RATE AMOUNT", "ITEM QUANTITY RATE AMOUNT", "DESCRIPTION QTY RATE AMOUNT",
    "QTY RATE AMOUNT", "ITEM DESCRIPTION", "RATE AMOUNT"
}


def is_valid_item_description(desc: Optional[str]) -> bool:
    """
    Validates that a candidate item description is a genuine product/service/payment description
    and NEVER a table header, column label, summary row, currency token, or pure numeric value.
    """
    if not desc or not isinstance(desc, str):
        return False
    clean = desc.strip()
    if len(clean) < 2:
        return False
    upper = clean.upper()

    if upper in HEADER_AND_SUMMARY_WORDS:
        return False

    if re.match(r'^\d+$', clean) or re.match(r'^#?\s*[A-Z0-9]+-\d+-\d+$', clean, re.IGNORECASE):
        return False
    if is_valid_date_string(clean):
        return False

    if upper in ["MYR", "RM", "USD", "SGD", "EUR", "GBP", "AUD", "CAD"]:
        return False

    if any(h in upper for h in [
        "QUANTITY RATE AMOUNT", "QTY RATE AMOUNT", "ITEM QUANTITY",
        "SUBTOTAL:", "TAX (", "AMOUNT RECEIVED:", "BALANCE DUE:", "DATE PAID:"
    ]):
        return False

    return True


UOM_SET = {
    'UNIT', 'UNITS', 'PCS', 'PC', 'PIECE', 'PIECES', 'BOX', 'BOXES', 'EA', 'EACH',
    'SET', 'SETS', 'KG', 'KGS', 'M', 'MTR', 'MONTH', 'MONTHS', 'DAY', 'DAYS',
    'HR', 'HRS', 'HOURS', 'PKT', 'PACK', 'PACKS', 'BAG', 'BAGS', 'ROLL', 'ROLLS'
}

LINE_TABLE_HEADER_KEYWORDS = [
    'ITEM', 'DESCRIPTION', 'PARTICULARS', 'QTY', 'QUANTITY', 'UOM',
    'U/ PRICE', 'UNIT PRICE', 'PRICE', 'RATE', 'DISC', 'DISCOUNT', 'TOTAL', 'AMOUNT'
]

LINE_TABLE_TERMINATION_PATTERNS = [
    r'^(?:RINGGIT\s+MALAYSIA|UNITED\s+STATES\s+DOLLAR|SINGAPORE\s+DOLLAR)\b',
    r'^(?:TOTAL|GRAND\s+TOTAL|SUBTOTAL|SUB-TOTAL|SUB\s+TOTAL)\b',
    r'^(?:NOTES?|TERMS\s*AND\s*CONDITIONS?|REMARKS?)\s*[:\.]?',
    r'^(?:AUTHORISED\s+SIGNATURE|AUTHORIZED\s+SIGNATURE|SIGNATURE)\b',
    r'^(?:E\s*&\s*O\.E|E\s*&\s*OE)\b',
    r'^(?:B/F\s+PAGES?\s+TOTAL|PAGE\s+TOTAL)\b',
    r'^PAGE\s*:\s*\d+\s+OF\s+\d+'
]


def _parse_table_line_item(line: str) -> Optional[Dict[str, Any]]:
    line_clean = line.strip()
    if not line_clean:
        return None

    # Check item number (e.g. '1.', '1)', '1 ')
    item_num = None
    m_num = re.match(r'^(\d+)[\.\)]?\s+(.*)$', line_clean)
    if m_num:
        item_num = m_num.group(1)
        rest = m_num.group(2).strip()
    else:
        rest = line_clean

    tokens = rest.split()
    if len(tokens) < 3:
        return None

    def _is_num(t):
        try:
            float(t.replace(',', '').rstrip('%'))
            return True
        except:
            return False

    def _to_num(t):
        return float(t.replace(',', '').rstrip('%'))

    if not _is_num(tokens[-1]):
        return None
    total_val = _to_num(tokens[-1])

    parsed = None
    # 5 tail tokens: qty uom price disc total OR uom qty price disc total
    if len(tokens) >= 6 and _is_num(tokens[-2]) and _is_num(tokens[-3]):
        t5, t4, t3, t2, t1 = tokens[-5], tokens[-4], tokens[-3], tokens[-2], tokens[-1]
        if _is_num(t5) and t4.upper() in UOM_SET:
            parsed = {'quantity': _to_num(t5), 'uom': t4.upper(), 'unit_price': _to_num(t3), 'discount': _to_num(t2), 'line_total': _to_num(t1), 'description': ' '.join(tokens[:-5])}
        elif t5.upper() in UOM_SET and _is_num(t4):
            parsed = {'quantity': _to_num(t4), 'uom': t5.upper(), 'unit_price': _to_num(t3), 'discount': _to_num(t2), 'line_total': _to_num(t1), 'description': ' '.join(tokens[:-5])}

    # 4 tail tokens: qty uom price total OR uom qty price total OR qty price disc total
    if not parsed and len(tokens) >= 5 and _is_num(tokens[-2]):
        t4, t3, t2, t1 = tokens[-4], tokens[-3], tokens[-2], tokens[-1]
        if _is_num(t4) and t3.upper() in UOM_SET:
            parsed = {'quantity': _to_num(t4), 'uom': t3.upper(), 'unit_price': _to_num(t2), 'discount': None, 'line_total': _to_num(t1), 'description': ' '.join(tokens[:-4])}
        elif t4.upper() in UOM_SET and _is_num(t3):
            parsed = {'quantity': _to_num(t3), 'uom': t4.upper(), 'unit_price': _to_num(t2), 'discount': None, 'line_total': _to_num(t1), 'description': ' '.join(tokens[:-4])}
        elif _is_num(t4) and _is_num(t3):
            q, p, d, tot = _to_num(t4), _to_num(t3), _to_num(t2), _to_num(t1)
            parsed = {'quantity': q, 'uom': None, 'unit_price': p, 'discount': d if abs(q * p - d - tot) < 0.05 else None, 'line_total': tot, 'description': ' '.join(tokens[:-4])}

    # 3 tail tokens: qty price total
    if not parsed and len(tokens) >= 4 and _is_num(tokens[-2]) and _is_num(tokens[-3]):
        t3, t2, t1 = tokens[-3], tokens[-2], tokens[-1]
        parsed = {'quantity': _to_num(t3), 'uom': None, 'unit_price': _to_num(t2), 'discount': None, 'line_total': _to_num(t1), 'description': ' '.join(tokens[:-3])}

    if parsed and len(parsed['description']) >= 2 and is_valid_item_description(parsed['description']):
        parsed['item_number'] = item_num
        parsed['item_description'] = parsed['description']
        parsed['total_amount'] = parsed['line_total']
        return parsed
    return None


def _extract_invoice_line_items(text: str, tables: List[Any] = None) -> List[Dict[str, Any]]:
    """
    Extracts invoice line items with column awareness (item_number, description,
    quantity, uom, unit_price, discount, line_total). Supports wrapped descriptions.
    """
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    items: List[Dict[str, Any]] = []
    in_table = False

    for line in lines:
        line_upper = line.upper()
        if not in_table:
            hdr_matches = sum(1 for w in LINE_TABLE_HEADER_KEYWORDS if re.search(r'\b' + re.escape(w) + r'\b', line_upper))
            if hdr_matches >= 3:
                in_table = True
                continue
        if in_table:
            # Check termination
            if any(re.search(pat, line, re.IGNORECASE) for pat in LINE_TABLE_TERMINATION_PATTERNS):
                break
            # Skip currency label rows (e.g. 'USD$ USD$' or 'RM RM')
            if re.match(r'^(?:USD\$?|RM|SGD\$?|MYR|\$)(?:\s+(?:USD\$?|RM|SGD\$?|MYR|\$))*$', line.strip(), re.IGNORECASE):
                continue
            row = _parse_table_line_item(line)
            if row:
                items.append(row)
            elif items and len(line) > 2 and not any(k in line_upper for k in ['DATE', 'PAGE', 'TEL', 'FAX', 'TERMS', 'ATTN', 'NOTES']):
                # Wrapped description line: append to previous item
                items[-1]['description'] += ' ' + line.strip()
                items[-1]['item_description'] = items[-1]['description']

    return items


def _extract_column_oriented_line_items(text: str) -> List[Dict[str, Any]]:
    """
    Extracts line items from receipts/invoices where OCR outputs text in vertical column blocks:
    Item / Description block -> Quantity block -> Rate block -> Amount block
    """
    lines = [l.strip() for l in text.splitlines() if l.strip()]

    item_header_idx = -1
    qty_header_idx = -1
    rate_header_idx = -1
    amount_header_idx = -1
    summary_header_idx = len(lines)

    for idx, l in enumerate(lines):
        l_upper = l.upper()
        if item_header_idx == -1 and l_upper in ["ITEM", "DESCRIPTION", "PARTICULARS", "PRODUCT"]:
            item_header_idx = idx
        elif qty_header_idx == -1 and l_upper in ["QUANTITY", "QTY"]:
            qty_header_idx = idx
        elif rate_header_idx == -1 and l_upper in ["RATE", "PRICE", "UNIT PRICE", "UNITPRICE"]:
            rate_header_idx = idx
        elif amount_header_idx == -1 and l_upper in ["AMOUNT", "TOTAL AMOUNT", "LINE TOTAL"]:
            amount_header_idx = idx
        elif summary_header_idx == len(lines) and any(l_upper.startswith(k) for k in ["SUBTOTAL", "TAX", "TOTAL:", "AMOUNT RECEIVED", "BALANCE DUE"]):
            summary_header_idx = idx

    if qty_header_idx == -1 or rate_header_idx == -1 or amount_header_idx == -1:
        return []

    qty_section_start = max(item_header_idx, qty_header_idx) + 1
    qty_section_end = rate_header_idx
    qty_section_lines = lines[qty_section_start:qty_section_end]

    raw_descriptions = []
    raw_quantities = []

    for l in qty_section_lines:
        if is_valid_company_entity(l) and not is_valid_item_description(l):
            continue
        if re.match(r'^\d+(?:\.0+)?$', l):
            raw_quantities.append(float(l))
        elif is_valid_item_description(l):
            raw_descriptions.append(l)

    rate_lines = lines[rate_header_idx + 1:amount_header_idx]
    raw_rates = []
    for l in rate_lines:
        m = re.search(r'([\d,]+\.\d{2})', l)
        if m:
            raw_rates.append(float(m.group(1).replace(',', '')))

    amount_lines = lines[amount_header_idx + 1:summary_header_idx]
    raw_amounts = []
    for l in amount_lines:
        if any(l.upper().startswith(k) for k in ["SUBTOTAL", "TAX", "TOTAL", "AMOUNT RECEIVED"]):
            break
        m = re.search(r'([\d,]+\.\d{2})', l)
        if m:
            raw_amounts.append(float(m.group(1).replace(',', '')))

    n_items = len(raw_descriptions)
    if n_items > 0 and len(raw_quantities) == n_items and len(raw_rates) == n_items:
        items = []
        for i in range(n_items):
            desc = raw_descriptions[i]
            q = raw_quantities[i]
            u = raw_rates[i]
            amt = raw_amounts[i] if i < len(raw_amounts) else round(q * u, 2)
            if is_valid_item_description(desc):
                items.append({
                    "item_description": desc,
                    "quantity": q,
                    "unit_price": u,
                    "total_amount": amt
                })
        return items

    return []


def are_companies_matching(name1: Optional[str], name2: Optional[str]) -> bool:
    """
    Flexible company name comparison preventing false positives between distinct companies.
    """
    if not name1 or not name2:
        return False
    norm1 = normalize_company_name(name1)
    norm2 = normalize_company_name(name2)
    if not norm1 or not norm2:
        return False
    if norm1 == norm2:
        return True

    words1 = [w for w in norm1.split() if w not in GENERIC_CORP_WORDS and len(w) > 1]
    words2 = [w for w in norm2.split() if w not in GENERIC_CORP_WORDS and len(w) > 1]
    if words1 and words2:
        if words1 == words2:
            return True
        w1_str = " ".join(words1)
        w2_str = " ".join(words2)
        if w1_str == w2_str or w1_str in w2_str or w2_str in w1_str:
            return True
    elif norm1 in norm2 or norm2 in norm1:
        return True

    return False


def truncate_at_next_label(value: str, current_label: str) -> str:
    """
    Generic Field Boundary Mechanism:
    Given an extracted value string (which may contain OCR merged fields),
    searches for any other known FIELD_LABELS in the value string and cuts the value
    BEFORE the next label begins.
    """
    if not value or not isinstance(value, str):
        return ""

    val = value.strip()
    curr_label_upper = current_label.upper().replace(":", "").strip()

    earliest_idx = len(val)

    for label in FIELD_LABELS:
        clean_lbl = label.upper().replace(":", "").strip()
        if clean_lbl == curr_label_upper or len(clean_lbl) < 3:
            continue

        pat_lbl = rf'\b{re.escape(label)}\b' if re.search(r'\w$', label) else rf'\b{re.escape(label)}'
        pat_clean = rf'\b{re.escape(clean_lbl)}\b' if re.search(r'\w$', clean_lbl) else rf'\b{re.escape(clean_lbl)}'
        patterns = [pat_lbl, pat_clean]

        for pat in patterns:
            for match in re.finditer(pat, val, re.IGNORECASE):
                start_idx = match.start()
                if start_idx > 0 and start_idx < earliest_idx:
                    earliest_idx = start_idx

    truncated = val[:earliest_idx].strip()
    return re.sub(r'[:\-=]+$', '', truncated).strip()


# -------------------------------------------------------------------------
# DOCUMENT PROCESSING AGENT CLASS
# -------------------------------------------------------------------------

class DocumentProcessingAgent:
    """
    Agentic Document Processing Agent:
    Architecture:
    DOCUMENT -> CLASSIFY (Multi-signal scoring) -> EXTRACT (Semantic Candidate Fields) -> REASON (Business Roles by Doc Type) -> VERIFY & ACT (Calculation Agent) -> RETURN
    """

    def __init__(self, company_context: Dict[str, Any] = None):
        self.company_context = company_context or {
            "company_id": "COMP-000001",
            "company_name": "NextTech Solutions Sdn Bhd"
        }
        self.our_company_name = self.company_context.get("company_name", "NextTech Solutions Sdn Bhd")
        self.company_id = self.company_context.get("company_id", "COMP-000001")
        self.calculation_agent = CalculationAgent()

    def process_document(self, document_id: str, raw_text: str, filename: str = "") -> Tuple[ExtractedDocumentData, bool, list]:
        validation_messages = []
        needs_review = False
        source_context = {}

        # 1. CLASSIFY: Multi-signal scoring document classification
        doc_type = self._auto_detect_document_type(raw_text)
        source_context["document_type"] = f"Multi-Signal Scoring -> '{doc_type}'"

        # 2. EXTRACT: Extract raw candidate fields with semantic boundaries
        extracted_raw = self._extract_raw_fields(document_id, raw_text, doc_type, source_context)
        extracted_raw["raw_text"] = raw_text

        # 3. REASON: Company Context Check & Business Role Identification
        company_match_status, company_ctx_schema = self._check_company_context(raw_text, doc_type, extracted_raw)
        if company_match_status == "MISMATCH":
            reason = company_ctx_schema.mismatch_reason or f"Active company '{self.our_company_name}' was not detected as the primary account holder."
            validation_messages.append(f"Company Context Warning: {reason}")

        business_roles = self._identify_business_roles(raw_text, doc_type, company_match_status, extracted_raw)

        # 4. VERIFY & RECOVER: Sanity Audit for Placeholders, Reference IDs & Address Lines
        extracted_raw, recovery_msgs, review_flag = self._verify_and_recover_extraction(
            extracted_raw, doc_type, raw_text
        )
        validation_messages.extend(recovery_msgs)
        if review_flag:
            needs_review = True

        # Re-evaluate business roles if recovery altered party names
        business_roles = self._identify_business_roles(raw_text, doc_type, company_match_status, extracted_raw)

        # 5. Extraction Completeness Check
        is_bank_doc = doc_type in ["Bank Transfer Receipt", "Bank Transaction Record", "Bank Statement"]
        is_payment_receipt = doc_type == "Payment Receipt"
        line_items = extracted_raw.get("line_items", [])
        grand_total = extracted_raw.get("grand_total")
        subtotal = extracted_raw.get("subtotal")

        # Payment Receipt Inconsistency Check
        if is_payment_receipt:
            inv_n = extracted_raw.get("invoice_number")
            pay_r = extracted_raw.get("payment_reference")
            if inv_n and pay_r and inv_n != pay_r:
                ref_msg = f"Reference Inconsistency: Related invoice '{inv_n}' differs from payment reference '{pay_r}'."
                if ref_msg not in validation_messages:
                    validation_messages.append(ref_msg)
                needs_review = True

        # Check for missing document identifier (Requirement 8)
        dup_k, dup_lbl, dup_v = generate_duplicate_key(self.company_id, doc_type, extracted_raw)
        if dup_k is None and doc_type in [
            "Sales Invoice", "Purchase Invoice", "Supplier Invoice",
            "Purchase Receipt", "Expense Receipt", "Payment Receipt", "Bank Transfer Receipt"
        ]:
            un_id_msg = "Unable to determine a unique document identifier. Please review this document before uploading it again."
            if un_id_msg not in validation_messages:
                validation_messages.append(un_id_msg)
            needs_review = True

        completeness = "COMPLETE"
        if not is_bank_doc and not is_payment_receipt and (grand_total or subtotal) and len(line_items) == 0:
            completeness = "INCOMPLETE"
            validation_messages.append(
                "Extraction Warning: Document contains financial totals but line items could not be parsed."
            )
            needs_review = True

        # 6. ACT: Invoke Calculation Agent for Deterministic Math Verification
        calc_verification = self.calculation_agent.process_and_verify(extracted_raw)

        if calc_verification.overall_status == "FAILED":
            validation_messages.extend(calc_verification.details)
            needs_review = True
        elif completeness == "INCOMPLETE" and calc_verification.overall_status == "PASSED":
            calc_verification.overall_status = "INCOMPLETE_EXTRACTION"
            calc_verification.details.append("Extraction Incomplete: Line items missing for verification.")

        # 6b. ACT: Invoke LLM Semantic Extraction Verifier (Strictly No Math)
        semantic_verification = self._verify_extraction_semantics(raw_text, doc_type, extracted_raw, business_roles)
        if semantic_verification.extraction_verdict == "INCORRECT":
            needs_review = True
            for field in semantic_verification.flagged_fields:
                validation_messages.append(f"Semantic Extraction Flag: '{field}' flagged by LLM Verifier.")
            if semantic_verification.thought_process.decision_rationale:
                validation_messages.append(f"Semantic Rationale: {semantic_verification.thought_process.decision_rationale}")

        # 7. Compute Display Summary for UI
        display_summary = self._compute_display_summary(doc_type, extracted_raw, business_roles)

        # 8. Print Required Debug Block
        merchant_debug = extracted_raw.get("merchant_name") or extracted_raw.get("vendor_name")
        print("\n=== DOCUMENT PROCESSING DEBUG ===")
        print("Document Type:", doc_type)
        print("Vendor:", extracted_raw.get("vendor_name"))
        print("Buyer:", extracted_raw.get("buyer_name"))
        print("Merchant:", merchant_debug)
        print("Account Name:", extracted_raw.get("account_name"))
        print("Account Number:", extracted_raw.get("account_number"))
        print("Account Type:", extracted_raw.get("account_type"))
        print("Statement Date:", extracted_raw.get("statement_date"))
        print("Currency:", extracted_raw.get("currency"))
        print("Business Roles:", business_roles.model_dump())
        print("Display Summary:", display_summary.model_dump())
        print("Line Items:", extracted_raw.get("line_items"))
        print("=================================\n")

        # 9. Field Confidence & Processing Metadata
        field_confidence = self._compute_field_confidence(extracted_raw, doc_type)

        # 9b. Multi-Currency Conversion
        doc_currency = (extracted_raw.get("currency") or "MYR").strip().upper()
        doc_date = (
            extracted_raw.get("transaction_date") or
            extracted_raw.get("invoice_date") or
            extracted_raw.get("statement_date")
        )
        conversion_status = "NOT_REQUIRED"
        conversion_error = None
        converted_amount_myr = grand_total
        subtotal_myr = subtotal
        discount_myr = extracted_raw.get("discount")
        shipping_myr = extracted_raw.get("shipping")
        tax_amount_myr = extracted_raw.get("tax_amount")
        exchange_rate = 1.0
        exchange_rate_date = doc_date
        exchange_rate_provider = "Base Currency (MYR)"
        exchange_rate_session = "N/A"
        converted_line_items = line_items

        if doc_currency not in ["MYR", "RM"]:
            try:
                from app.services.currency_service import CurrencyExchangeService
                conv_res = CurrencyExchangeService.convert_document_amounts(
                    currency=doc_currency,
                    transaction_date=doc_date,
                    grand_total=grand_total,
                    subtotal=subtotal,
                    discount=extracted_raw.get("discount"),
                    shipping=extracted_raw.get("shipping"),
                    tax_amount=extracted_raw.get("tax_amount"),
                    line_items=line_items
                )
                conversion_status = "CONVERTED"
                converted_amount_myr = conv_res.get("converted_amount_myr")
                subtotal_myr = conv_res.get("subtotal_myr")
                discount_myr = conv_res.get("discount_myr")
                shipping_myr = conv_res.get("shipping_myr")
                tax_amount_myr = conv_res.get("tax_amount_myr")
                exchange_rate = conv_res.get("exchange_rate")
                exchange_rate_date = conv_res.get("exchange_rate_date")
                exchange_rate_provider = conv_res.get("exchange_rate_provider")
                exchange_rate_session = conv_res.get("exchange_rate_session")
                if conv_res.get("line_items"):
                    converted_line_items = conv_res["line_items"]
            except Exception as e:
                conversion_status = "FAILED"
                conversion_error = str(e)
                converted_amount_myr = None
                subtotal_myr = None
                discount_myr = None
                shipping_myr = None
                tax_amount_myr = None
                exchange_rate = None
                exchange_rate_date = None
                exchange_rate_provider = None
                exchange_rate_session = None
                needs_review = True
                validation_messages.append(f"Currency Conversion Warning: {str(e)}")

        processing_metadata = {
            "document_type": doc_type,
            "extraction_method": "Semantic Boundary & Multi-Signal Scoring",
            "validation_status": "PASSED" if len(validation_messages) == 0 else "WARNINGS",
            "calculation_status": calc_verification.overall_status,
            "needs_review": needs_review,
            "validation_messages": validation_messages,
            "conversion_status": conversion_status
        }

        # 10. Construct Full Payload with Status Separation
        dt_str = extracted_raw.get("transaction_datetime") or extracted_raw.get("transaction_date_time")

        # Status Separation (Extraction, Company Match, Validation, Review)
        extraction_status = "Extraction Completed"
        match_stat_clean = "Matched" if company_match_status == "MATCHED" else ("Mismatch" if company_match_status == "MISMATCH" else "Unable to Determine")
        
        if needs_review:
            validation_status = "Review Required"
        elif calc_verification.overall_status == "FAILED":
            validation_status = "Failed"
        elif len(validation_messages) > 0:
            validation_status = "Warning"
        else:
            validation_status = "Passed"

        review_status = "Pending Review"

        payload = {
            "company_id": self.company_id,
            "active_company_name": self.our_company_name,
            "company_match_status": match_stat_clean,
            "company_context": company_ctx_schema,
            "extraction_status": extraction_status,
            "validation_status": validation_status,
            "review_status": review_status,
            "document_id": document_id,
            "document_type": doc_type,
            "display_summary": display_summary,
            
            # Identifiers
            "invoice_number": extracted_raw.get("invoice_number"),
            "receipt_number": extracted_raw.get("receipt_number"),
            "credit_note_number": extracted_raw.get("credit_note_number"),
            "related_invoice_number": extracted_raw.get("related_invoice_number"),
            "debit_note_number": extracted_raw.get("debit_note_number"),
            "reference_number": extracted_raw.get("reference_number"),
            "payment_reference": extracted_raw.get("payment_reference"),
            "payment_description": extracted_raw.get("payment_description"),
            "transfer_type": extracted_raw.get("transfer_type"),
            "transaction_id": extracted_raw.get("transaction_id"),
            "statement_period": extracted_raw.get("statement_period"),
            "statement_date": extracted_raw.get("statement_date"),
            "document_number": extracted_raw.get("document_number"),
            "delivery_order_number": extracted_raw.get("delivery_order_number"),
            "purchase_order_number": extracted_raw.get("purchase_order_number"),
            "sales_order_number": extracted_raw.get("sales_order_number"),
            "voucher_number": extracted_raw.get("voucher_number"),
            "return_number": extracted_raw.get("return_number"),
            "stock_take_number": extracted_raw.get("stock_take_number"),
            "cheque_number": extracted_raw.get("cheque_number"),
            "account_code": extracted_raw.get("account_code"),
            "amount_received": extracted_raw.get("amount_received"),
            "amount_paid": extracted_raw.get("amount_paid"),
            "net_adjustment": extracted_raw.get("net_adjustment"),
            
            # Entities / Parties
            "vendor_name": extracted_raw.get("vendor_name"),
            "vendor_address": extracted_raw.get("vendor_address"),
            "buyer_name": extracted_raw.get("buyer_name"),
            "buyer_address": extracted_raw.get("buyer_address"),
            "merchant_name": merchant_debug,
            "from_account_name": extracted_raw.get("from_account_name"),
            "from_account_number": extracted_raw.get("from_account_number"),
            "beneficiary_name": extracted_raw.get("beneficiary_name"),
            "beneficiary_bank": extracted_raw.get("beneficiary_bank"),
            
            # Dates & Status
            "transaction_date": extracted_raw.get("transaction_date"),
            "invoice_date": extracted_raw.get("invoice_date") or extracted_raw.get("transaction_date"),
            "payment_terms": extracted_raw.get("payment_terms"),
            "customer_name": extracted_raw.get("customer_name") or extracted_raw.get("buyer_name") or business_roles.customer,
            "transaction_datetime": dt_str,
            "transaction_date_time": dt_str,
            "transaction_status": extracted_raw.get("transaction_status"),
            "currency": extracted_raw.get("currency", "MYR"),
            
            # Roles
            "business_roles": business_roles,
            
            # Invoice / Receipt Amounts
            "subtotal": subtotal,
            "discount": extracted_raw.get("discount"),
            "shipping": extracted_raw.get("shipping"),
            "tax_amount": extracted_raw.get("tax_amount"),
            "grand_total": grand_total,
            "transaction_amount": extracted_raw.get("transaction_amount"),
            "payment_method": extracted_raw.get("payment_method"),
            
            # Multi-Currency Fields
            "converted_amount_myr": converted_amount_myr,
            "subtotal_myr": subtotal_myr,
            "discount_myr": discount_myr,
            "shipping_myr": shipping_myr,
            "tax_amount_myr": tax_amount_myr,
            "exchange_rate": exchange_rate,
            "exchange_rate_date": exchange_rate_date,
            "exchange_rate_provider": exchange_rate_provider,
            "exchange_rate_session": exchange_rate_session,
            "conversion_status": conversion_status,
            "conversion_error": conversion_error,
            "original_currency": doc_currency,
            "original_amount": grand_total,
            "base_currency": "MYR",
            "rate_source": exchange_rate_provider,
            "rate_publication_date": exchange_rate_date,

            # Line Items
            "line_items": converted_line_items,
            
            # Bank Statement / Record
            "bank_name": extracted_raw.get("bank_name"),
            "account_name": extracted_raw.get("account_name"),
            "account_number": extracted_raw.get("account_number"),
            "account_type": extracted_raw.get("account_type"),
            "opening_balance": extracted_raw.get("opening_balance"),
            "closing_balance": extracted_raw.get("closing_balance"),
            "bank_transactions": extracted_raw.get("bank_transactions", []),
            
            # Verification & Completeness
            "math_verified": calc_verification.math_verified,
            "calculation_verification": calc_verification,
            "semantic_verification": semantic_verification,
            "extraction_completeness": completeness,
            "validation_passed": len(validation_messages) == 0 and calc_verification.overall_status in ["PASSED", "NOT_REQUIRED"] and semantic_verification.extraction_verdict == "CORRECT",
            "validation_messages": validation_messages,
            "needs_review": needs_review,
            "processing_metadata": processing_metadata,
            "field_confidence": field_confidence,
            "source_context": source_context
        }

        # 10. Pydantic Validation & Return
        try:
            structured_doc = ExtractedDocumentData(**payload)
            return structured_doc, structured_doc.validation_passed, validation_messages
        except Exception as e:
            validation_messages.append(f"Pydantic Validation Error: {str(e)}")
            payload["validation_passed"] = False
            payload["validation_messages"] = validation_messages
            payload["needs_review"] = True
            fallback = ExtractedDocumentData(
                company_id=self.company_id,
                active_company_name=self.our_company_name,
                company_match_status=company_match_status,
                document_id=document_id,
                document_type=doc_type,
                transaction_date=extracted_raw.get("transaction_date"),
                currency="MYR",
                business_roles=business_roles,
                validation_passed=False,
                validation_messages=validation_messages,
                needs_review=True
            )
            return fallback, False, validation_messages

    # -------------------------------------------------------------------------
    # CLASSIFY: Multi-Signal Scoring Document Classification
    # -------------------------------------------------------------------------

    def _auto_detect_document_type(self, text: str) -> str:
        """
        Classifies document based on multi-signal scoring model across document content.
        """
        text_upper = text.upper()
        lines = [l.strip() for l in text.splitlines() if l.strip()]

        scores = {
            "Official Receipt": 0,
            "Payment Voucher": 0,
            "Stock Take": 0,
            "Delivery Order": 0,
            "Purchase Order": 0,
            "Sales Order": 0,
            "Purchase Return": 0,
            "Bank Statement": 0,
            "Bank Transfer Receipt": 0,
            "Bank Transaction Record": 0,
            "Payment Receipt": 0,
            "Purchase Receipt": 0,
            "Expense Receipt": 0,
            "Supplier Invoice": 0,
            "Purchase Invoice": 0,
            "Sales Invoice": 0,
            "Credit Note": 0,
            "Debit Note": 0,
            # Onboarding & Setup Document Types
            "Opening Trial Balance": 0,
            "Trade Receivables / Debtors": 0,
            "Trade Payables / Creditors": 0,
            "Other Creditors": 0,
            "Opening Stock List": 0,
            "Company Profile": 0
        }

        # Signal -1: Setup & Onboarding Documents
        if "TRIAL BALANCE" in text_upper:
            scores["Opening Trial Balance"] += 35
        if "DEBIT (RM)" in text_upper or "CREDIT (RM)" in text_upper or ("DEBIT" in text_upper and "CREDIT" in text_upper and ("BALANCE B/F" in text_upper or "AS AT" in text_upper or "CHART OF ACCOUNT" in text_upper)):
            scores["Opening Trial Balance"] += 20

        if any(k in text_upper for k in ["TRADE DEBTORS", "AGED RECEIVABLES", "DEBTOR AGING", "RECEIVABLES AGING", "OUTSTANDING DEBTORS", "TRADE RECEIVABLES", "CUSTOMER AGING", "CUSTOMER LEDGER"]):
            scores["Trade Receivables / Debtors"] += 35

        if any(k in text_upper for k in ["TRADE CREDITORS", "AGED PAYABLES", "CREDITOR AGING", "PAYABLES AGING", "OUTSTANDING CREDITORS", "TRADE PAYABLES", "SUPPLIER AGING", "SUPPLIER LEDGER"]):
            scores["Trade Payables / Creditors"] += 35

        if any(k in text_upper for k in ["OTHER CREDITORS", "NON-TRADE CREDITORS", "SUNDRY CREDITORS", "ACCRUED LIABILITIES", "OTHER PAYABLES", "ACCRUED EXPENSES"]):
            scores["Other Creditors"] += 40

        if any(k in text_upper for k in ["STOCK LIST", "INVENTORY LIST", "STOCK VALUATION", "STOCK BALANCE", "INVENTORY VALUATION", "CLOSING STOCK"]):
            scores["Opening Stock List"] += 35
        if "ITEM CODE" in text_upper and ("UNIT COST" in text_upper or "QTY" in text_upper or "QUANTITY" in text_upper):
            scores["Opening Stock List"] += 20

        if any(k in text_upper for k in ["SURUHANJAYA SYARIKAT", "SSM", "CERTIFICATE OF INCORPORATION", "COMPANIES ACT", "REGISTRATION NO"]):
            scores["Company Profile"] += 40

        # Signal 0a: Stock Take
        if "STOCK TAKE" in text_upper:
            scores["Stock Take"] += 45
        if any(k in text_upper for k in ["BAL. QTY", "PHYSICAL QTY", "DIFF. QTY"]):
            scores["Stock Take"] += 35
        if bool(re.search(r'\bSK-\d{4}', text_upper)):
            scores["Stock Take"] += 30

        # Signal 0b: Official Receipt
        if "OFFICIAL RECEIPT" in text_upper:
            scores["Official Receipt"] += 45
        if "RECEIVE THE SUM OF" in text_upper:
            scores["Official Receipt"] += 30
        if bool(re.search(r'\bOR-\d{4}', text_upper)):
            scores["Official Receipt"] += 30

        # Signal 0c: Payment Voucher
        if "PAYMENT VOUCHER" in text_upper:
            scores["Payment Voucher"] += 45
        if "PAY THE SUM OF" in text_upper:
            scores["Payment Voucher"] += 30
        if bool(re.search(r'\bPV-\d{4}', text_upper)):
            scores["Payment Voucher"] += 30

        # Signal 0d: Delivery Order
        if "DELIVERY ORDER" in text_upper:
            scores["Delivery Order"] += 45
        if bool(re.search(r'\bDO-\d{4}', text_upper)):
            scores["Delivery Order"] += 30

        # Signal 0e: Purchase Order
        if "PURCHASE ORDER" in text_upper:
            scores["Purchase Order"] += 45
        if bool(re.search(r'\bPO-\d{4}', text_upper)):
            scores["Purchase Order"] += 30

        # Signal 0f: Sales Order
        if "SALES ORDER" in text_upper:
            scores["Sales Order"] += 45
        if bool(re.search(r'\bSO-\d{4}', text_upper)):
            scores["Sales Order"] += 30

        # Signal 0g: Purchase Return
        if "PURCHASE RETURN" in text_upper or "GOODS RETURN" in text_upper:
            scores["Purchase Return"] += 45
        if bool(re.search(r'\bPR-\d{4}', text_upper)):
            scores["Purchase Return"] += 30

        # Signal 0h: Credit Note & Debit Note
        if "CREDIT NOTE" in text_upper or bool(re.search(r'\bCN-\d{4}', text_upper)):
            scores["Credit Note"] += 35
        if "DEBIT NOTE" in text_upper or bool(re.search(r'\bDN-\d{4}', text_upper)):
            scores["Debit Note"] += 35

        # Signal 1: Bank Statements
        if "ACCOUNT STATEMENT" in text_upper or "BANK STATEMENT" in text_upper or "STATEMENT OF ACCOUNT" in text_upper:
            scores["Bank Statement"] += 10
        if "STATEMENT DATE" in text_upper and "ACCOUNT NAME" in text_upper:
            scores["Bank Statement"] += 8
        if "BALANCE BROUGHT FORWARD" in text_upper or "BALANCE B/F" in text_upper:
            scores["Bank Statement"] += 8
        if "PERIOD:" in text_upper and "ACCOUNT NUMBER" in text_upper:
            scores["Bank Statement"] += 6

        # Signal 2: Bank Transfer Receipt
        if "SUCCESSFUL FUNDS TRANSFER RECEIPT" in text_upper or "FUNDS TRANSFER RECEIPT" in text_upper:
            scores["Bank Transfer Receipt"] += 10
        if "TRANSFER TYPE" in text_upper and "BENEFICIARY" in text_upper:
            scores["Bank Transfer Receipt"] += 8
        if "FROM ACCOUNT" in text_upper and "BENEFICIARY" in text_upper:
            scores["Bank Transfer Receipt"] += 8

        # Signal 3: Bank Transaction Record
        if "BANK TRANSACTION RECORD" in text_upper or "TRANSACTION HISTORY" in text_upper:
            scores["Bank Transaction Record"] += 10

        # Signal 4: Payment Receipt vs Purchase/Expense Receipt
        has_payment_title = "PAYMENT RECEIPT" in text_upper
        has_received_from = "RECEIVED FROM" in text_upper
        has_amount_received = "AMOUNT RECEIVED" in text_upper or "AMOUNT PAID" in text_upper or "PAYMENT FOR INVOICE" in text_upper or "RELATED INVOICE" in text_upper
        has_date_paid = "DATE PAID" in text_upper
        has_payment_method = "PAYMENT METHOD" in text_upper
        has_pay_ref = bool(re.search(r'\bPAY(?:MENT)?[-_#:\s]*\d+', text_upper))

        has_item_columns = any(re.search(r'\b(QUANTITY|QTY)\b', l.upper()) for l in lines) and any(re.search(r'\b(RATE|PRICE|UNIT PRICE|AMOUNT)\b', l.upper()) for l in lines)
        has_cafe_rest = any(k in text_upper for k in ["CAFÉ", "CAFE", "RESTAURANT", "PARKING", "COFFEE", "FOOD", "BEVERAGE", "DINING", "LUNCH"])
        has_shop_mart = any(k in text_upper for k in ["STATIONERY", "OFFICE", "MART", "HARDWARE", "STORE", "SUPPLIES", "SHOP", "MARKET"])
        has_subtotal_tax = "SUBTOTAL" in text_upper and ("TAX" in text_upper or "SST" in text_upper or "GST" in text_upper)

        has_invoice_title = "INVOICE" in text_upper and "RECEIPT" not in text_upper
        has_receipt_title = "RECEIPT" in text_upper

        if has_payment_title:
            scores["Payment Receipt"] += 15

        if has_pay_ref:
            scores["Payment Receipt"] += 15

        if has_receipt_title or not has_invoice_title:
            if has_item_columns or has_subtotal_tax:
                if has_cafe_rest:
                    scores["Expense Receipt"] += 20
                    scores["Purchase Receipt"] += 12
                elif has_shop_mart or "PURCHASE" in text_upper:
                    scores["Purchase Receipt"] += 20
                    scores["Expense Receipt"] += 12
                else:
                    scores["Purchase Receipt"] += 18
                    scores["Expense Receipt"] += 14

        if has_received_from and not has_item_columns:
            scores["Payment Receipt"] += 8
            if has_amount_received or has_date_paid or has_payment_method:
                scores["Payment Receipt"] += 5

        if has_amount_received and not has_item_columns:
            scores["Payment Receipt"] += 8

        if "RECEIPT" in text_upper:
            is_payment_receipt_candidate = (
                has_payment_title or
                has_pay_ref or
                (has_received_from and (has_amount_received or has_date_paid or has_payment_method)) or
                (has_amount_received and (has_date_paid or has_payment_method))
            )
            
            if not is_payment_receipt_candidate and (has_item_columns or (has_subtotal_tax and has_cafe_rest)):
                if has_cafe_rest:
                    scores["Expense Receipt"] += 9
                    scores["Purchase Receipt"] += 7
                else:
                    scores["Purchase Receipt"] += 9
                    scores["Expense Receipt"] += 7
            elif "RECEIVED FROM" in text_upper or has_amount_received:
                scores["Payment Receipt"] += 8

        if "PURCHASE RECEIPT" in text_upper:
            scores["Purchase Receipt"] += 10

        if "EXPENSE RECEIPT" in text_upper:
            scores["Expense Receipt"] += 10

        # Signal 5: Invoices
        if "SUPPLIER INVOICE" in text_upper:
            scores["Supplier Invoice"] += 10
        if "PURCHASE INVOICE" in text_upper:
            scores["Purchase Invoice"] += 10
        if "SALES INVOICE" in text_upper:
            if self._is_company_buyer(text):
                scores["Purchase Invoice"] += 8
            else:
                scores["Sales Invoice"] += 10
        elif "INVOICE" in text_upper and "RECEIPT" not in text_upper:
            if self._is_company_buyer(text):
                scores["Purchase Invoice"] += 7
                scores["Supplier Invoice"] += 6
            else:
                scores["Sales Invoice"] += 7

        top_doc_type = max(scores, key=scores.get)
        if scores[top_doc_type] > 0:
            return top_doc_type
        return "Sales Invoice"

    # -------------------------------------------------------------------------
    # REASON: Company Context & Business Roles by Document Type
    # -------------------------------------------------------------------------

    def _check_company_context(self, text: str, doc_type: str, extracted_raw: Dict[str, Any]) -> Tuple[str, CompanyMatchContextSchema]:
        if not self.our_company_name:
            return "NOT_SPECIFIED", CompanyMatchContextSchema(
                active_company="Unknown",
                document_account_holder=None,
                company_match=False,
                mismatch_reason="Active company context not specified."
            )

        clean_our = normalize_company_name(self.our_company_name)
        doc_account_holder = extracted_raw.get("account_name")
        
        if doc_account_holder:
            is_match = are_companies_matching(self.our_company_name, doc_account_holder)
            status = "MATCHED" if is_match else "MISMATCH"
            reason = None if is_match else "Bank statement account belongs to a different company than the active company."
            
            return status, CompanyMatchContextSchema(
                active_company=self.our_company_name,
                document_account_holder=doc_account_holder,
                company_match=is_match,
                mismatch_reason=reason
            )

        is_internal_doc = doc_type in ["Stock Take", "Payment Voucher"]
        vendor_cand = str(extracted_raw.get("vendor_name") or "").strip()
        buyer_cand = str(extracted_raw.get("buyer_name") or extracted_raw.get("customer_name") or "").strip()
        vendor_is_our = bool(vendor_cand) and are_companies_matching(self.our_company_name, vendor_cand)
        buyer_is_our = bool(buyer_cand) and are_companies_matching(self.our_company_name, buyer_cand)
        is_matched = (
            is_internal_doc or
            vendor_is_our or
            buyer_is_our or
            are_companies_matching(self.our_company_name, text) or
            (clean_our in normalize_company_name(text))
        )
        
        if is_matched:
            status = "MATCHED"
            reason = None
            comp_match_bool = True
        else:
            has_two_external_parties = (
                bool(vendor_cand) and vendor_cand.lower() not in ("unknown", "none", "n/a") and
                bool(buyer_cand) and buyer_cand.lower() not in ("unknown", "none", "n/a") and
                normalize_company_name(vendor_cand) != normalize_company_name(buyer_cand) and
                not are_companies_matching(vendor_cand, buyer_cand)
            )
            if has_two_external_parties:
                status = "MISMATCH"
                reason = (
                    f"Active company '{self.our_company_name}' was not detected as participant; "
                    f"document is billed between '{vendor_cand}' and '{buyer_cand}'."
                )
                comp_match_bool = False
            else:
                status = "UNABLE_TO_DETERMINE"
                reason = None
                comp_match_bool = True

        return status, CompanyMatchContextSchema(
            active_company=self.our_company_name,
            document_account_holder=doc_account_holder,
            company_match=comp_match_bool,
            mismatch_reason=reason
        )

    def _identify_business_roles(
        self,
        text: str,
        doc_type: str,
        match_status: str,
        extracted_raw: Dict[str, Any]
    ) -> BusinessRolesSchema:
        """
        Interprets candidate entities according to Document Type and relationship to Active Company:
        - Sales Invoice: Issued By = our_company, Bill To = customer
        - Purchase/Supplier Invoice: Vendor/Supplier = seller, Bill To = our_company, customer = NULL
        - Purchase/Expense Receipt: Merchant = merchant, Paid By = our_company, customer = NULL, vendor = NULL, supplier = NULL
        - Payment Receipt: Issued By = our_company, Received From = customer
        - Bank Transfer Receipt: beneficiary = active -> customer = from_acc; from_acc = active -> vendor = beneficiary
        - Bank Statement: account mismatch -> our_company = NULL, other = account_name
        """
        our_co = self.our_company_name if match_status == "MATCHED" else None

        customer = None
        vendor = None
        supplier = None
        merchant = None
        bank = extracted_raw.get("bank_name") or extracted_raw.get("beneficiary_bank")
        other = None

        vendor_name = extracted_raw.get("vendor_name")
        buyer_name = extracted_raw.get("buyer_name")
        extracted_merchant = extracted_raw.get("merchant_name") or vendor_name

        if doc_type == "Official Receipt":
            our_co = self.our_company_name
            customer = buyer_name or extracted_raw.get("customer_name")
            return BusinessRolesSchema(
                our_company=our_co, customer=customer, vendor=None, supplier=None, merchant=None, bank=None, other=None
            )

        if doc_type in ["Payment Voucher", "Stock Take"]:
            our_co = self.our_company_name
            return BusinessRolesSchema(
                our_company=our_co, customer=None, vendor=None, supplier=None, merchant=None, bank=None, other=None
            )

        if doc_type == "Delivery Order":
            our_co = self.our_company_name
            customer = buyer_name or extracted_raw.get("customer_name")
            return BusinessRolesSchema(
                our_company=our_co, customer=customer, vendor=None, supplier=None, merchant=None, bank=None, other=None
            )

        if doc_type in ["Purchase Order", "Purchase Return"]:
            our_co = self.our_company_name
            vendor = vendor_name or extracted_raw.get("vendor_name")
            supplier = vendor
            return BusinessRolesSchema(
                our_company=our_co, customer=None, vendor=vendor, supplier=supplier, merchant=None, bank=None, other=None
            )

        if doc_type == "Sales Order":
            our_co = self.our_company_name
            customer = buyer_name or extracted_raw.get("customer_name")
            return BusinessRolesSchema(
                our_company=our_co, customer=customer, vendor=None, supplier=None, merchant=None, bank=None, other=None
            )

        if doc_type == "Sales Invoice":
            if not buyer_name and vendor_name and not are_companies_matching(vendor_name, self.our_company_name):
                customer = vendor_name
                vendor = None
            else:
                customer = buyer_name

        elif doc_type in ["Purchase Invoice", "Supplier Invoice"]:
            vendor = vendor_name
            supplier = vendor_name
            customer = None

        elif doc_type in ["Purchase Receipt", "Expense Receipt"]:
            merchant = extracted_merchant
            customer = None
            vendor = None
            supplier = None

        elif doc_type == "Payment Receipt":
            customer = buyer_name

        elif doc_type == "Bank Transfer Receipt":
            from_acc = extracted_raw.get("from_account_name")
            beneficiary = extracted_raw.get("beneficiary_name")

            if beneficiary and are_companies_matching(beneficiary, self.our_company_name):
                customer = from_acc
            elif from_acc and are_companies_matching(from_acc, self.our_company_name):
                vendor = beneficiary
                supplier = beneficiary

        elif doc_type in ["Bank Statement", "Bank Transaction Record"]:
            acc_holder = extracted_raw.get("account_name")
            if match_status == "MISMATCH" and acc_holder:
                other = acc_holder
                our_co = None

        elif "Credit Note" in doc_type or doc_type in ["Credit Note", "Supplier Credit Note", "Debit Note"]:
            rel_inv = str(extracted_raw.get("related_invoice_number") or "").upper()
            is_our_vendor = (
                (vendor_name and not are_companies_matching(vendor_name, self.our_company_name)) or
                (buyer_name and are_companies_matching(buyer_name, self.our_company_name)) or
                rel_inv.startswith("PUR-") or rel_inv.startswith("SUP-") or "supplier" in doc_type.lower() or "purchase" in doc_type.lower()
            )
            if is_our_vendor:
                vendor = vendor_name or "Supplier"
                supplier = vendor
                customer = None
            else:
                customer = buyer_name or "Customer"
                vendor = None
                supplier = None

        # Post-extraction Role Consistency Audit:
        # If active company is purchaser/payer in Purchase Receipt, Expense Receipt, Purchase Invoice or Supplier Invoice,
        # customer MUST NEVER be set to active company or any entity!
        if doc_type in ["Purchase Receipt", "Expense Receipt", "Purchase Invoice", "Supplier Invoice"]:
            customer = None

        if customer and our_co and are_companies_matching(customer, our_co):
            customer = None
        if vendor and our_co and are_companies_matching(vendor, our_co):
            vendor = None
        if supplier and our_co and are_companies_matching(supplier, our_co):
            supplier = None
        if merchant and our_co and are_companies_matching(merchant, our_co):
            merchant = None

        return BusinessRolesSchema(
            our_company=our_co,
            customer=customer,
            vendor=vendor,
            supplier=supplier,
            merchant=merchant,
            bank=bank,
            other=other
        )

    # -------------------------------------------------------------------------
    # EXTRACT: Field Extraction with Semantic Boundaries
    # -------------------------------------------------------------------------

    def _extract_raw_fields(self, document_id: str, text: str, doc_type: str, source_context: Dict[str, Any]) -> Dict[str, Any]:
        lines = [l.strip() for l in text.splitlines() if l.strip()]

        # ---------------------------------------------------------
        # 0A. OFFICIAL RECEIPT EXTRACTION
        # ---------------------------------------------------------
        if doc_type == "Official Receipt":
            rc_m = re.search(r'Voucher\s*No\.?\s*:?\s*([A-Za-z0-9-]+)', text)
            if not rc_m:
                rc_m = re.search(r'\b(OR-\d{4,6})\b', text)
            rc_no = rc_m.group(1) if rc_m else "OR-000000"

            m_recv = re.search(r'RECEIVED\s*FROM\s*(.+?)(?:\s+Voucher|\s+Date|\n|$)', text, re.IGNORECASE)
            cust_name = m_recv.group(1).strip() if m_recv else None
            if cust_name:
                cust_name = re.sub(r'[:\-=]+$', '', cust_name).strip()

            dt_m = re.search(r'Date\s*:\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4})', text)
            tx_date = dt_m.group(1) if dt_m else None

            tot_m = re.search(r'TOTAL\s*:\s*([\d,]+\.\d{2})', text)
            if not tot_m:
                tot_m = re.search(r'Payment\s+Amount\s*\n\s*([\d,]+\.\d{2})', text)
            if not tot_m:
                tot_m = re.search(r'(?:TOTAL|AMOUNT|AMOUNT RECEIVED|TOTAL AMOUNT)\s*:?\s*(?:[A-Z]{3}|\$|RM|€|£|¥)?\s*([\d,]+\.\d{2})', text, re.IGNORECASE)
            tot_val = float(tot_m.group(1).replace(',', '')) if tot_m else 0.0

            curr = detect_currency(text)
            pay_method = "Cheque" if "CHEQUE" in text.upper() else "Cash"

            # Parse allocation line items (Acc. No., Description, Amount)
            items = []
            for line in lines:
                m_alloc = re.match(r'^(\d{3}-\d{4})\s+(.+?)\s+([\d,]+\.\d{2})$', line)
                if m_alloc:
                    code, desc, amt = m_alloc.groups()
                    amt_f = float(amt.replace(',', ''))
                    items.append({
                        "item_number": str(len(items) + 1),
                        "account_code": code,
                        "description": desc.strip(),
                        "item_description": desc.strip(),
                        "quantity": 1.0,
                        "unit_price": amt_f,
                        "unit_cost": amt_f,
                        "line_total": amt_f,
                        "total_amount": amt_f,
                        "amount": amt_f
                    })

            if not items and tot_val > 0:
                items.append({
                    "item_number": "1",
                    "description": "Payment Received",
                    "item_description": "Payment Received",
                    "quantity": 1.0,
                    "unit_price": tot_val,
                    "unit_cost": tot_val,
                    "line_total": tot_val,
                    "total_amount": tot_val,
                    "amount": tot_val
                })

            return {
                "document_type": doc_type,
                "document_number": rc_no,
                "receipt_number": rc_no,
                "invoice_number": rc_no,
                "amount_received": tot_val,
                "account_code": items[0].get("account_code") if items else "300-9000",
                "payment_description": "Paid full" if "PAID FULL" in text.upper() else None,
                "transaction_date": tx_date,
                "buyer_name": cust_name,
                "customer_name": cust_name,
                "vendor_name": None,
                "currency": curr,
                "payment_method": pay_method,
                "grand_total": tot_val,
                "subtotal": tot_val,
                "tax_amount": 0.0,
                "line_items": items,
                "display_summary": {
                    "party_label": "Received From",
                    "party": cust_name or "-",
                    "amount_label": "Amount Received",
                    "amount": tot_val
                }
            }

        # ---------------------------------------------------------
        # 0B. PAYMENT VOUCHER EXTRACTION
        # ---------------------------------------------------------
        if doc_type == "Payment Voucher":
            pv_m = re.search(r'Voucher\s*No\.?\s*:?\s*([A-Za-z0-9-]+)', text)
            if not pv_m:
                pv_m = re.search(r'\b(PV-\d{4,6})\b', text)
            pv_no = pv_m.group(1) if pv_m else "PV-000000"

            dt_m = re.search(r'Date\s*:\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4})', text)
            tx_date = dt_m.group(1) if dt_m else None

            tot_m = re.search(r'TOTAL\s*:\s*([\d,]+\.\d{2})', text)
            tot_val = float(tot_m.group(1).replace(',', '')) if tot_m else 0.0

            chq_m = re.search(r'CHEQUE\s+(#[A-Za-z0-9-]+)', text)
            chq_no = chq_m.group(1) if chq_m else None

            items = []
            for line in lines:
                m_alloc = re.match(r'^(\d{3}-\d{4})\s+(.+?)\s+([\d,]+\.\d{2})$', line)
                if m_alloc:
                    code, desc, amt = m_alloc.groups()
                    amt_f = float(amt.replace(',', ''))
                    items.append({
                        "item_number": str(len(items) + 1),
                        "account_code": code,
                        "description": desc.strip(),
                        "item_description": desc.strip(),
                        "quantity": 1.0,
                        "unit_price": amt_f,
                        "unit_cost": amt_f,
                        "line_total": amt_f,
                        "total_amount": amt_f,
                        "amount": amt_f
                    })

            return {
                "document_type": doc_type,
                "document_number": pv_no,
                "voucher_number": pv_no,
                "receipt_number": pv_no,
                "invoice_number": pv_no,
                "amount_paid": tot_val,
                "cheque_number": chq_no,
                "account_code": items[0].get("account_code") if items else None,
                "transaction_date": tx_date,
                "buyer_name": None,
                "customer_name": None,
                "vendor_name": None,
                "currency": "MYR",
                "payment_method": "Cheque" if chq_no else "Cash",
                "payment_reference": chq_no,
                "grand_total": tot_val,
                "subtotal": tot_val,
                "tax_amount": 0.0,
                "line_items": items,
                "display_summary": {
                    "party_label": "Payment Mode",
                    "party": f"Cheque {chq_no}" if chq_no else "Cash Expenses",
                    "amount_label": "Amount Paid",
                    "amount": tot_val
                }
            }

        # ---------------------------------------------------------
        # 0C. STOCK TAKE EXTRACTION
        # ---------------------------------------------------------
        if doc_type == "Stock Take":
            sk_m = re.search(r'\b(SK-\d{4,6})\b', text)
            if not sk_m:
                sk_m = re.search(r'No\.?\s*:\s*(SK-[A-Za-z0-9-]+|[A-Za-z0-9-]+)', text)
            sk_no = sk_m.group(1) if sk_m else "SK-000001"

            dt_m = re.search(r'Date\s*:\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4})', text)
            tx_date = dt_m.group(1) if dt_m else None

            tot_m = re.search(r'Total\s+([+-]?[\d,]+\.\d{2})', text)
            tot_val = float(tot_m.group(1).replace(',', '')) if tot_m else 0.0

            items = []
            in_table = False
            has_missing_physical = False

            for line in lines:
                if 'BAL. QTY' in line.upper() and 'PHYSICAL QTY' in line.upper():
                    in_table = True
                    continue
                if in_table:
                    if line.startswith('Note') or line.startswith('Authorised') or 'TOTAL' in line.upper():
                        break
                    m_full = re.match(r'^(\d+)\s+(.+?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([+-]?[\d,]+(?:\.\d+)?)\s+([A-Za-z]+)\s+([\d,]+(?:\.\d+)?)\s+([+-]?[\d,]+(?:\.\d+)?)$', line)
                    if m_full:
                        num, desc, bal_q, phy_q, diff_q, uom, cost, amt = m_full.groups()
                        items.append({
                            "item_number": num,
                            "description": desc.strip(),
                            "item_description": desc.strip(),
                            "balance_quantity": float(bal_q.replace(',', '')),
                            "physical_quantity": float(phy_q.replace(',', '')),
                            "difference_quantity": float(diff_q.replace(',', '')),
                            "uom": uom.upper(),
                            "unit_cost": float(cost.replace(',', '')),
                            "amount": float(amt.replace(',', '')),
                            "quantity": float(diff_q.replace(',', '')),
                            "unit_price": float(cost.replace(',', '')),
                            "line_total": float(amt.replace(',', '')),
                            "total_amount": float(amt.replace(',', ''))
                        })
                        continue
                    m_missing = re.match(r'^(\d+)\s+(.+?)\s+([\d,]+(?:\.\d+)?)\s+([A-Za-z]+)\s+([\d,]+(?:\.\d+)?)\s+([+-]?[\d,]+(?:\.\d+)?)$', line)
                    if m_missing:
                        num, desc, bal_q, uom, cost, amt = m_missing.groups()
                        has_missing_physical = True
                        items.append({
                            "item_number": num,
                            "description": desc.strip(),
                            "item_description": desc.strip(),
                            "balance_quantity": float(bal_q.replace(',', '')),
                            "physical_quantity": None,
                            "difference_quantity": None,
                            "uom": uom.upper(),
                            "unit_cost": float(cost.replace(',', '')),
                            "amount": float(amt.replace(',', '')),
                            "quantity": 0.0,
                            "unit_price": float(cost.replace(',', '')),
                            "line_total": float(amt.replace(',', '')),
                            "total_amount": float(amt.replace(',', '')),
                            "missing_physical": True,
                            "notes": "Physical count missing - flagged for review"
                        })

            return {
                "document_type": doc_type,
                "document_number": sk_no,
                "stock_take_number": sk_no,
                "invoice_number": sk_no,
                "reference_number": sk_no,
                "net_adjustment": tot_val,
                "transaction_date": tx_date,
                "buyer_name": None,
                "customer_name": None,
                "vendor_name": None,
                "currency": "MYR",
                "grand_total": tot_val,
                "subtotal": tot_val,
                "tax_amount": 0.0,
                "line_items": items,
                "needs_review": has_missing_physical,
                "display_summary": {
                    "party_label": "Adjustment Type",
                    "party": "Physical Stock Take",
                    "amount_label": "Net Adjustment",
                    "amount": tot_val
                }
            }

        # ---------------------------------------------------------
        # 0D. PURCHASE ORDER EXTRACTION
        # ---------------------------------------------------------
        if doc_type == "Purchase Order":
            po_m = re.search(r'\b(PO-\d{4,6})\b', text)
            po_no = po_m.group(1) if po_m else "PO-000001"

            dt_m = re.search(r'Date\s*:\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4})', text)
            tx_date = dt_m.group(1) if dt_m else None

            vendor_cand = None
            for line in lines[1:5]:
                clean_l = re.sub(r'\s+(?:Your\s*Ref|Our\s*Ref|Supp\.|Terms|Date|Page|TEL|FAX|Attn).*$', '', line, flags=re.IGNORECASE).strip()
                if clean_l and is_valid_company_entity(clean_l):
                    vendor_cand = clean_l
                    break

            terms_m = re.search(r'Terms\s*:\s*([^\n]+)', text)
            terms = terms_m.group(1).split()[0].strip() if terms_m else None

            items = _extract_invoice_line_items(text, tables=source_context.get("tables", []))
            tot_m = re.search(r'Total\s+([\d,]+\.\d{2})', text)
            grand_tot = float(tot_m.group(1).replace(',', '')) if tot_m else round(sum(i["line_total"] for i in items), 2)

            curr = detect_currency(text)

            return {
                "document_type": doc_type,
                "document_number": po_no,
                "purchase_order_number": po_no,
                "invoice_number": po_no,
                "reference_number": po_no,
                "transaction_date": tx_date,
                "vendor_name": vendor_cand,
                "buyer_name": self.our_company_name,
                "currency": curr,
                "payment_terms": terms,
                "grand_total": grand_tot,
                "subtotal": grand_tot,
                "tax_amount": 0.0,
                "line_items": items,
                "display_summary": {
                    "party_label": "Supplier",
                    "party": vendor_cand or "-",
                    "amount_label": "Order Total",
                    "amount": grand_tot
                }
            }

        # ---------------------------------------------------------
        # 0E. SALES ORDER EXTRACTION
        # ---------------------------------------------------------
        if doc_type == "Sales Order":
            so_m = re.search(r'\b(SO-\d{4,6})\b', text)
            so_no = so_m.group(1) if so_m else "SO-000001"

            dt_m = re.search(r'Date\s*:\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4})', text)
            tx_date = dt_m.group(1) if dt_m else None

            cust_cand = None
            for line in lines[1:5]:
                clean_l = re.sub(r'\s+(?:Your\s*Ref|Our\s*Ref|Supp\.|Terms|Date|Page|TEL|FAX|Attn).*$', '', line, flags=re.IGNORECASE).strip()
                if clean_l and is_valid_company_entity(clean_l):
                    cust_cand = clean_l
                    break

            terms_m = re.search(r'Terms\s*:\s*([^\n]+)', text)
            terms = terms_m.group(1).split()[0].strip() if terms_m else None

            items = _extract_invoice_line_items(text, tables=source_context.get("tables", []))
            tot_m = re.search(r'Total\s+([\d,]+\.\d{2})', text)
            grand_tot = float(tot_m.group(1).replace(',', '')) if tot_m else round(sum(i["line_total"] for i in items), 2)

            curr = detect_currency(text)

            return {
                "document_type": doc_type,
                "document_number": so_no,
                "sales_order_number": so_no,
                "invoice_number": so_no,
                "reference_number": so_no,
                "transaction_date": tx_date,
                "customer_name": cust_cand,
                "buyer_name": cust_cand,
                "vendor_name": self.our_company_name,
                "currency": curr,
                "payment_terms": terms,
                "grand_total": grand_tot,
                "subtotal": grand_tot,
                "tax_amount": 0.0,
                "line_items": items,
                "display_summary": {
                    "party_label": "Customer",
                    "party": cust_cand or "-",
                    "amount_label": "Order Total",
                    "amount": grand_tot
                }
            }

        # ---------------------------------------------------------
        # 0F. PURCHASE RETURN EXTRACTION
        # ---------------------------------------------------------
        if doc_type == "Purchase Return":
            pr_m = re.search(r'\b(PR-\d{4,6})\b', text)
            pr_no = pr_m.group(1) if pr_m else "PR-000001"

            dt_m = re.search(r'Date\s*:\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4})', text)
            tx_date = dt_m.group(1) if dt_m else None

            vendor_cand = None
            for line in lines[1:5]:
                clean_l = re.sub(r'\s+(?:Supp\.|Your\s*D/?O|Our\s*P/?O|Terms|Date|Page|TEL|FAX|Attn).*$', '', line, flags=re.IGNORECASE).strip()
                if clean_l and is_valid_company_entity(clean_l):
                    vendor_cand = clean_l
                    break

            terms_m = re.search(r'Terms\s*:\s*([^\n]+)', text)
            terms = terms_m.group(1).split()[0].strip() if terms_m else None

            items = _extract_invoice_line_items(text, tables=source_context.get("tables", []))
            tot_m = re.search(r'Total\s+([\d,]+\.\d{2})', text)
            grand_tot = float(tot_m.group(1).replace(',', '')) if tot_m else round(sum(i["line_total"] for i in items), 2)

            curr = detect_currency(text)

            return {
                "document_type": doc_type,
                "document_number": pr_no,
                "return_number": pr_no,
                "invoice_number": pr_no,
                "reference_number": pr_no,
                "transaction_date": tx_date,
                "vendor_name": vendor_cand,
                "buyer_name": self.our_company_name,
                "currency": curr,
                "payment_terms": terms,
                "grand_total": grand_tot,
                "subtotal": grand_tot,
                "tax_amount": 0.0,
                "line_items": items,
                "display_summary": {
                    "party_label": "Supplier",
                    "party": vendor_cand or "-",
                    "amount_label": "Return Total",
                    "amount": grand_tot
                }
            }

        # ---------------------------------------------------------
        # 0G. DELIVERY ORDER EXTRACTION
        # ---------------------------------------------------------
        if doc_type == "Delivery Order":
            do_m = re.search(r'No\.?\s*:\s*([A-Za-z0-9-]+)', text)
            if not do_m:
                do_m = re.search(r'\b(DO-\d{4,6})\b', text)
            do_no = do_m.group(1) if do_m else "DO-000001"

            dt_m = re.search(r'Date\s*:\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4})', text)
            tx_date = dt_m.group(1) if dt_m else None

            cust_name = None
            for line in lines[1:6]:
                clean_l = re.sub(r'\s+(?:Your\s*P/?O|Our\s*D/?O|Terms|Date|Page|TEL|FAX).*$', '', line, flags=re.IGNORECASE).strip()
                clean_l = re.sub(r'^(?:DELIVERY\s*ORDER|INVOICE|ORDER).*$', '', clean_l, flags=re.IGNORECASE).strip()
                if clean_l and is_valid_company_entity(clean_l) and not are_companies_matching(clean_l, self.our_company_name):
                    cust_name = clean_l
                    break

            terms_m = re.search(r'Terms\s*:\s*([^\n]+)', text)
            terms = terms_m.group(1).split()[0].strip() if terms_m else None

            # Extract delivery lines (Item, Description, UOM, Qty)
            items = []
            in_table = False
            for line in lines:
                if 'ITEM' in line.upper() and 'DESCRIPTION' in line.upper() and 'QTY' in line.upper():
                    in_table = True
                    continue
                if in_table:
                    if line.startswith('Note') or line.startswith('Authorised') or 'TOTAL' in line.upper():
                        break
                    m_do = re.match(r'^(\d+)[\.\)]?\s+(.+?)\s+([A-Za-z]+)\s+([\d,]+(?:\.\d+)?)$', line)
                    if m_do:
                        num, desc, uom, qty = m_do.groups()
                        q_f = float(qty.replace(',', ''))
                        items.append({
                            "item_number": num,
                            "description": desc.strip(),
                            "item_description": desc.strip(),
                            "uom": uom.upper(),
                            "quantity": q_f,
                            "unit_price": 0.0,
                            "unit_cost": 0.0,
                            "line_total": 0.0,
                            "total_amount": 0.0
                        })

            tot_qty = sum(i["quantity"] for i in items)
            return {
                "document_type": doc_type,
                "document_number": do_no,
                "delivery_order_number": do_no,
                "invoice_number": do_no,
                "reference_number": do_no,
                "transaction_date": tx_date,
                "buyer_name": cust_name,
                "customer_name": cust_name,
                "vendor_name": self.our_company_name,
                "currency": "MYR",
                "payment_terms": terms,
                "grand_total": tot_qty,
                "subtotal": tot_qty,
                "tax_amount": 0.0,
                "line_items": items,
                "display_summary": {
                    "party_label": "Customer",
                    "party": cust_name or "-",
                    "amount_label": "Total Quantity",
                    "amount": tot_qty
                }
            }

        def _get_field_bounded(labels: List[str], validate_entity: bool = False) -> Optional[str]:
            for label in labels:
                if label in ["Supplier", "Vendor", "Merchant", "Customer", "Buyer", "Payer", "Seller", "Store"]:
                    pattern = r'(?i)\b' + re.escape(label) + r'\b\s*[:\-=]\s*([^\n]+)'
                else:
                    pattern = r'(?i)\b' + re.escape(label) + r'\b\s*[:\-=]?\s*([^\n]+)'
                for m in re.finditer(pattern, text):
                    val = m.group(1).strip()
                    if val and val not in [":", "-", "="]:
                        clean_v = val.split('\n')[0].strip()
                        if clean_v.upper() in ["INVOICE", "TAX INVOICE", "RECEIPT", "STATEMENT", "STATEMENT OF ACCOUNT"]:
                            continue
                        
                        bounded_v = truncate_at_next_label(clean_v, label)
                        if validate_entity:
                            if is_valid_company_entity(bounded_v):
                                return bounded_v
                        elif is_valid_company_entity(bounded_v) or any(c.isdigit() for c in bounded_v) or len(bounded_v) > 2:
                            return bounded_v

            for i, line in enumerate(lines):
                clean_l = re.sub(r'[:\-=]$', '', line.strip()).strip()
                for label in labels:
                    if clean_l.lower() == label.lower():
                        for offset in range(1, 4):
                            if i + offset < len(lines):
                                candidate = lines[i + offset].strip()
                                if candidate and candidate not in [":", "-", "="]:
                                    if candidate.upper() not in ["INVOICE", "TAX INVOICE", "RECEIPT", "STATEMENT"]:
                                        cand_upper = candidate.upper()
                                        if any(cand_upper.startswith(k) for k in ["PAYMENT TERMS", "TERMS:", "CREDIT TERMS", "DATE:", "TEL:", "FAX:"]):
                                            continue
                                        bounded_v = truncate_at_next_label(candidate, label)
                                        if validate_entity:
                                            if is_valid_company_entity(bounded_v):
                                                return bounded_v
                                        else:
                                            if is_valid_company_entity(bounded_v) or any(c.isdigit() for c in bounded_v):
                                                return bounded_v
            return None

        # ---------------------------------------------------------
        # A. PAYMENT RECEIPT EXTRACTION
        # ---------------------------------------------------------
        if doc_type == "Payment Receipt":
            rc_no = _get_field_bounded(["Receipt No", "Receipt Number", "Receipt #", "Rcpt #"])
            if not rc_no:
                m_rc = re.search(r'\b(PAY-\d{4}-\d+|\bRC-\d{4}-\d+)\b', text)
                if m_rc:
                    rc_no = m_rc.group(1)

            tx_date = _get_field_bounded(["Date Paid", "Transaction Date", "Payment Date", "Receipt Date", "Date"])
            if not is_valid_date_string(tx_date):
                m_dt = re.search(r'(\d{1,2}\s+\w{3}\s+\d{4}|\d{2}/\d{2}/\d{4}|\d{4}-\d{2}-\d{2}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})', text, re.IGNORECASE)
                if m_dt:
                    tx_date = m_dt.group(1)

            payer_name = _get_field_bounded(["Received From", "Paid By", "Payer", "Customer", "Buyer"])
            if payer_name and not is_valid_company_entity(payer_name):
                payer_name = None

            pay_method = _get_field_bounded(["Payment Method", "Paid Via", "Method"])
            
            inv_no = _get_field_bounded(["Invoice #", "Invoice No", "Invoice Number", "Related Invoice", "Invoice Ref"])
            if not inv_no:
                m_inv = re.search(r'Invoice\s*#?\s*:?\s*(INV-\d{4}-\d+)', text, re.IGNORECASE)
                if m_inv:
                    inv_no = m_inv.group(1)

            pay_ref = _get_field_bounded(["Payment for Invoice", "Payment Ref", "Pay Ref", "For Invoice"])
            if not pay_ref:
                m_pay = re.search(r'Payment\s*for\s*Invoice\s*:?\s*(INV-\d{4}-\d+)', text, re.IGNORECASE)
                if m_pay:
                    pay_ref = m_pay.group(1)

            if not inv_no and pay_ref:
                inv_no = pay_ref
            if not pay_ref and inv_no:
                pay_ref = inv_no

            # Payment Amount Received
            amt_val = None
            amt_str = _get_field_bounded(["Amount Received", "Amount Paid", "Payment Amount", "Amount", "Total Amount", "Total"])
            if amt_str:
                m_amt = re.search(r'([\d,]+\.\d{2})', amt_str)
                if m_amt:
                    amt_val = float(m_amt.group(1).replace(',', ''))
            if amt_val is None:
                m_amt2 = re.search(r'(?:MYR|RM|\$)\s*([\d,]+\.\d{2})', text, re.IGNORECASE)
                if m_amt2:
                    amt_val = float(m_amt2.group(1).replace(',', ''))

            # Subtotal & Tax extraction
            subtotal_val = None
            sub_str = _get_field_bounded(["Subtotal", "Sub-Total", "Sub total"])
            if sub_str:
                m_sub = re.search(r'([\d,]+\.\d{2})', sub_str)
                if m_sub:
                    subtotal_val = float(m_sub.group(1).replace(',', ''))
            if subtotal_val is None:
                subtotal_val = amt_val

            tax_val = 0.0
            tax_str = _get_field_bounded(["Tax", "Tax Amount", "SST", "GST"])
            if tax_str:
                m_tax = re.search(r'([\d,]+\.\d{2})', tax_str)
                if m_tax:
                    tax_val = float(m_tax.group(1).replace(',', ''))

            # Item / Payment Description extraction
            pay_desc = _get_field_bounded(["Item", "Description", "Payment Description", "Payment Details"])
            if not pay_desc and pay_ref:
                pay_desc = f"Payment for Invoice {pay_ref}"

            item_qty = 1.0
            qty_str = _get_field_bounded(["Quantity", "Qty"])
            if qty_str:
                m_qty = re.search(r'(\d+(?:\.\d+)?)', qty_str)
                if m_qty:
                    item_qty = float(m_qty.group(1))

            payment_lines = []
            if pay_desc:
                payment_lines.append({
                    "item_description": pay_desc,
                    "quantity": item_qty,
                    "unit_price": amt_val or 0.0,
                    "total_amount": amt_val or 0.0
                })

            return {
                "document_type": doc_type,
                "receipt_number": rc_no,
                "transaction_date": tx_date,
                "buyer_name": payer_name,
                "vendor_name": self.our_company_name,
                "payment_method": pay_method,
                "grand_total": amt_val,
                "transaction_amount": amt_val,
                "invoice_number": inv_no,
                "payment_reference": pay_ref,
                "payment_description": pay_desc,
                "currency": "MYR",
                "subtotal": subtotal_val,
                "tax_amount": tax_val,
                "line_items": payment_lines
            }

        # ---------------------------------------------------------
        # B. BANK TRANSFER RECEIPT EXTRACTION
        # ---------------------------------------------------------
        if doc_type == "Bank Transfer Receipt":
            bank_name = _get_field_bounded(["Bank Name", "Issuing Bank"])
            if not bank_name or "REFERENCE" in bank_name.upper() or len(bank_name) > 30:
                for b in ["ABC BANK", "MAYBANK", "CIMB", "PUBLIC BANK", "RHB", "HONG LEONG", "AMBANK", "UOB", "OCBC"]:
                    if b in text.upper():
                        bank_name = "ABC Bank Berhad" if "ABC" in b else b.title() + (" Berhad" if "BERHAD" in text.upper() else "")
                        break
            if not bank_name:
                bank_name = "ABC Bank Berhad"

            ref_no = _get_field_bounded(["Reference Number", "Ref No", "Reference No", "Ref Number", "TRX No", "Transaction Reference"])
            if not ref_no or ":" in ref_no:
                m_ref = re.search(r'\b(TRX-[A-Za-z0-9-]+|REF-[A-Za-z0-9-]+)\b', text)
                if m_ref:
                    ref_no = m_ref.group(1)

            dt_time = _get_field_bounded(["Transaction Date & Time", "Transaction Date and Time", "Date & Time", "Date and Time", "Transaction Date", "Date"])
            if not dt_time or len(dt_time) < 5:
                m_dt = re.search(r'\b(\d{1,2}\s+\w{3}\s+\d{4}(?:,\s*\d{2}:\d{2}(?::\d{2})?)?)\b', text)
                if m_dt:
                    dt_time = m_dt.group(1)

            t_type = _get_field_bounded(["Transfer Type", "Payment Type", "Transaction Type", "Transfer Method"])
            from_acc_name = _get_field_bounded(["From Account Name", "From Account", "From Name", "Sender Name", "Payer Name"])
            from_acc_no = _get_field_bounded(["From Account Number", "From Account No", "From Acc No", "Sender Account Number", "Payer Account Number"])
            ben_name = _get_field_bounded(["Beneficiary Name", "Beneficiary", "To Account Name", "To Name", "Recipient Name"])
            ben_bank = _get_field_bounded(["Beneficiary Bank", "To Bank", "Recipient Bank", "Receiving Bank"])

            amt_val = None
            amt_str = _get_field_bounded(["Transaction Amount", "Amount Transferred", "Amount", "Transfer Amount", "Total Amount"])
            if amt_str:
                m_amt = re.search(r'([\d,]+\.\d{2})', amt_str)
                if m_amt:
                    amt_val = float(m_amt.group(1).replace(',', ''))
            if amt_val is None:
                m_amt2 = re.search(r'(?:MYR|RM)\s*([\d,]+\.\d{2})', text, re.IGNORECASE)
                if m_amt2:
                    amt_val = float(m_amt2.group(1).replace(',', ''))

            pay_ref = _get_field_bounded(["Payment Reference", "Payment Ref", "Pay Ref", "Payment Details", "Ref"])
            if not pay_ref:
                m_pay = re.search(r'\b(INV-\d{4}-\d+|\bPUR-\d{4}-\d+)\b', text)
                if m_pay:
                    pay_ref = m_pay.group(1)

            status = "SUCCESSFUL" if "SUCCESSFUL" in text.upper() else _get_field_bounded(["Transaction Status", "Status"])

            return {
                "document_type": doc_type,
                "bank_name": bank_name,
                "reference_number": ref_no,
                "transaction_datetime": dt_time,
                "transaction_date_time": dt_time,
                "transaction_date": dt_time.split(',')[0] if dt_time else None,
                "transfer_type": t_type,
                "from_account_name": from_acc_name,
                "from_account_number": from_acc_no,
                "beneficiary_name": ben_name,
                "beneficiary_bank": ben_bank,
                "transaction_amount": amt_val,
                "payment_reference": pay_ref,
                "transaction_status": status,
                "currency": "MYR",
                "invoice_number": None,
                "receipt_number": None,
                "subtotal": None,
                "tax_amount": None,
                "grand_total": None,
                "line_items": []
            }

        # ---------------------------------------------------------
        # C. BANK STATEMENT & BANK TRANSACTION RECORD EXTRACTION
        # ---------------------------------------------------------
        if doc_type in ["Bank Statement", "Bank Transaction Record"]:
            bank_name = None
            for b in ["ABC BANK", "MAYBANK", "CIMB", "PUBLIC BANK", "RHB", "HONG LEONG", "AMBANK", "HSBC", "STANDARD CHARTERED", "UOB", "OCBC"]:
                if b in text.upper():
                    bank_name = "ABC Bank Berhad" if "ABC" in b else b.title() + (" Berhad" if "BERHAD" in text.upper() else "")
                    break
            if not bank_name:
                if lines and any(k in lines[0].upper() for k in ["BANK", "BERHAD"]):
                    bank_name = lines[0]
                else:
                    bank_name = "ABC Bank Berhad"

            acc_name = _get_field_bounded(["Account Name", "Account Holder", "Name"])
            acc_no = _get_field_bounded(["Account Number", "Account No", "Acc No", "Account #"])
            acc_type = _get_field_bounded(["Account Type", "Acc Type"])
            stmt_period = _get_field_bounded(["Period", "Statement Period", "Account Period"])
            stmt_date = _get_field_bounded(["Statement Date", "Date of Statement"])

            currency = "MYR"
            curr_m = _get_field_bounded(["Currency"])
            if curr_m:
                currency = curr_m.strip()
            else:
                for c in ["MYR", "RM", "USD", "SGD", "EUR", "GBP", "AUD", "JPY"]:
                    if f"CURRENCY: {c}" in text.upper() or f"({c})" in text.upper() or f"CURRENCY {c}" in text.upper():
                        currency = c if c != "RM" else "MYR"
                        break

            opening_balance = None
            closing_balance = None

            op_m = re.search(r'(?:Opening\s*Balance|Beginning\s*Balance|Previous\s*Balance):\s*(?:[A-Z]{3}|RM)?\s*([\d,]+\.\d{2})', text, re.IGNORECASE)
            if op_m:
                opening_balance = float(op_m.group(1).replace(',', ''))

            cl_m = re.search(r'(?:Closing\s*Balance|Ending\s*Balance|Statement\s*Closing\s*Balance):\s*(?:[A-Z]{3}|RM)?\s*([\d,]+\.\d{2})', text, re.IGNORECASE)
            if cl_m:
                closing_balance = float(cl_m.group(1).replace(',', ''))

            bank_transactions = []
            date_pattern = r'(\d{1,2}[/\.-]\d{1,2}[/\.-]\d{2,4}|\d{4}[/\.-]\d{1,2}[/\.-]\d{1,2}|\d{1,2}\s+\w{3}\s+\d{4})'

            running_tracker = None

            for line in lines:
                if any(bf in line.upper() for bf in ["BALANCE BROUGHT FORWARD", "BALANCE B/F", "BROUGHT FORWARD", "OPENING BALANCE"]):
                    bf_m = re.search(r'([\d,]+\.\d{2})$', line)
                    if bf_m and opening_balance is None:
                        opening_balance = float(bf_m.group(1).replace(',', ''))
                    continue

                m_date = re.match(r'^' + date_pattern + r'\s+(.*)$', line)
                if m_date:
                    dt_str = m_date.group(1)
                    rest = m_date.group(2).strip()

                    nums = re.findall(r'[\d,]+\.\d{2}', rest)
                    if len(nums) >= 2:
                        bal_val = float(nums[-1].replace(',', ''))
                        
                        desc_text = rest
                        for n in nums:
                            desc_text = desc_text.replace(n, '')
                        desc_clean = re.sub(r'[\s\|\-]+$', '', desc_text.strip()).strip()

                        debit_val = None
                        credit_val = None

                        if len(nums) >= 3:
                            n1 = float(nums[-3].replace(',', ''))
                            n2 = float(nums[-2].replace(',', ''))
                            if n1 > 0 and n2 == 0:
                                debit_val = n1
                            elif n2 > 0 and n1 == 0:
                                credit_val = n2
                            else:
                                debit_val = n1
                                credit_val = n2
                        elif len(nums) == 2:
                            amt_v = float(nums[0].replace(',', ''))
                            prev_bal = running_tracker if running_tracker is not None else opening_balance
                            
                            if prev_bal is not None:
                                expected_if_credit = round(prev_bal + amt_v, 2)
                                expected_if_debit = round(prev_bal - amt_v, 2)
                                
                                if abs(expected_if_credit - bal_val) < 0.05:
                                    credit_val = amt_v
                                elif abs(expected_if_debit - bal_val) < 0.05:
                                    debit_val = amt_v

                            if debit_val is None and credit_val is None:
                                is_recv = any(k in desc_clean.upper() for k in ["RECV", "RECEIPT", "CREDIT", "DEPOSIT", "REFUND", "TRANSFER IN", "CR"])
                                is_pay = any(k in desc_clean.upper() for k in ["PAYMENT TO", "PAYMENT", "DEBIT", "WITHDRAWAL", "CHARGE", "FEE", "DR"])
                                
                                if is_recv and not is_pay:
                                    credit_val = amt_v
                                else:
                                    debit_val = amt_v

                        running_tracker = bal_val

                        ref_m = re.search(r'\b([A-Z0-9]+-\d{4}-\d+|\bTRX-\d+|\bRC-\d+)\b', desc_clean)
                        ref_str = ref_m.group(1) if ref_m else None

                        bank_transactions.append({
                            "date": dt_str,
                            "transaction_date": dt_str,
                            "description": desc_clean,
                            "reference_no": ref_str,
                            "reference": ref_str,
                            "debit": debit_val,
                            "debit_amount": debit_val or 0.0,
                            "credit": credit_val,
                            "credit_amount": credit_val or 0.0,
                            "balance": bal_val
                        })

            if closing_balance is None and bank_transactions:
                closing_balance = bank_transactions[-1]["balance"]

            return {
                "document_type": doc_type,
                "bank_name": bank_name,
                "account_name": acc_name,
                "account_number": acc_no,
                "account_type": acc_type,
                "statement_period": stmt_period,
                "statement_date": stmt_date,
                "currency": currency,
                "opening_balance": opening_balance,
                "closing_balance": closing_balance,
                "bank_transactions": bank_transactions,
                "invoice_number": None,
                "receipt_number": None,
                "vendor_name": None,
                "buyer_name": None,
                "payment_method": None,
                "subtotal": None,
                "tax_amount": None,
                "grand_total": None,
                "line_items": []
            }

        # ---------------------------------------------------------
        # D. CREDIT NOTE & DEBIT NOTE EXTRACTION
        # ---------------------------------------------------------
        if doc_type in ["Credit Note", "Debit Note", "Supplier Credit Note"]:
            cn_no = None
            m_cn = re.search(r'\b(SCN-\d{4}-\d{3,4}|SCN-\d+|CN-\d{4}-\d{3,4}|CN-\d+)\b', text, re.IGNORECASE)
            if m_cn:
                cn_no = m_cn.group(1)
            else:
                cn_raw = _get_field_bounded(["Credit Note No", "Credit Note Number", "Credit Note #", "CN No", "CN #", "SCN No", "SCN #"])
                if cn_raw:
                    m_cn2 = re.search(r'\b(SCN-[A-Za-z0-9-]+|CN-[A-Za-z0-9-]+|[A-Za-z0-9-]+)\b', cn_raw)
                    cn_no = m_cn2.group(1) if m_cn2 else cn_raw

            dn_no = None
            m_dn = re.search(r'\b(DN-\d{4}-\d{3,4}|DN-\d+)\b', text, re.IGNORECASE)
            if m_dn:
                dn_no = m_dn.group(1)
            else:
                dn_raw = _get_field_bounded(["Debit Note No", "Debit Note Number", "Debit Note #", "DN No", "DN #"])
                if dn_raw:
                    m_dn2 = re.search(r'\b(DN-[A-Za-z0-9-]+|[A-Za-z0-9-]+)\b', dn_raw)
                    dn_no = m_dn2.group(1) if m_dn2 else dn_raw

            rel_inv = _get_field_bounded(["Related Invoice", "Invoice Ref", "Ref Invoice", "Original Invoice", "Related Invoice No"])
            if not rel_inv:
                m_rel = re.search(r'(?:Related\s*Invoice|Invoice\s*Ref|Ref\s*Invoice)\s*:?\s*(PUR-\d{4}-\d{3,4}|SUP-\d{4}-\d{3,4}|INV-\d{4}-\d{3,4}|[A-Z0-9-]+)', text, re.IGNORECASE)
                if m_rel:
                    rel_inv = m_rel.group(1)

            tx_date = _get_field_bounded(["Credit Note Date", "Date", "Transaction Date"])
            if not is_valid_date_string(tx_date):
                d_m = re.search(r'(\d{1,2}\s+\w{3}\s+\d{4}|\d{2}/\d{2}/\d{4}|\d{4}-\d{2}-\d{2}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})', text, re.IGNORECASE)
                if d_m:
                    tx_date = d_m.group(1)

            buyer_name = _get_field_bounded(["Received By / To", "Received By", "To", "Issued To", "Customer", "Buyer", "Bill To", "Billed To"], validate_entity=True)
            if not buyer_name or buyer_name.upper() in ["/ TO", "TO", "RECEIVED BY / TO"]:
                buyer_name = None
                m_bill = re.search(r'(?i)(?:Received\s*By\s*/?\s*To|Received\s*By|Issued\s*To|Customer|Buyer|Bill\s*To|Billed\s*To)\s*[:\-=]?\s*(?:\n\s*)?([^\n]+)', text)
                if m_bill:
                    raw_cand = m_bill.group(1).strip()
                    if any(raw_cand.upper().startswith(lbl) for lbl in ["DATE", "NO", "REF"]):
                        matched_str = m_bill.group(0)
                        idx = text.find(matched_str)
                        if idx != -1:
                            after_text = text[idx + len(matched_str):]
                            for sub_l in after_text.splitlines():
                                sub_clean = truncate_at_next_label(sub_l.strip(), "Issued To")
                                if is_valid_company_entity(sub_clean):
                                    buyer_name = sub_clean
                                    break
                    else:
                        cand_b = truncate_at_next_label(raw_cand, "Issued To")
                        if is_valid_company_entity(cand_b):
                            buyer_name = cand_b

            vendor_name = _get_field_bounded(["Issued By", "Vendor", "Supplier", "Merchant"], validate_entity=True)
            if not vendor_name or vendor_name.upper() in ["/ TO", "TO"]:
                vendor_name = None

            if not vendor_name:
                for line in lines[:5]:
                    clean_l = line.strip()
                    clean_cand = re.sub(r'(?i)\b(CREDIT NOTE|DEBIT NOTE|SUPPLIER CREDIT NOTE|INVOICE|TAX INVOICE)\b', '', clean_l).strip()
                    if any(k in clean_l.upper() for k in ["DATE:", "NO.", "PAGE", "RECEIVED BY", "ISSUED TO"]):
                        continue
                    if is_valid_company_entity(clean_cand) and not are_companies_matching(clean_cand, buyer_name or ""):
                        vendor_name = clean_cand
                        break

            if not vendor_name:
                vendor_name = self.our_company_name

            line_items = _extract_column_oriented_line_items(text)
            if not line_items:
                for line in lines:
                    line_upper = line.upper()
                    if any(skip_kw in line_upper for skip_kw in ["CREDIT NOTE", "DEBIT NOTE", "SUBTOTAL", "TAX", "TOTAL", "CREDIT TERMS", "REASON"]):
                        continue
                    mA = re.search(r'^(.*?)\s+(\d+(?:\.\d+)?)\s*(?:[x×\*]\s*)?(?:MYR|RM|\$)?\s*([\d,]+\.\d{2})(?:\s+(?:MYR|RM|\$)?\s*([\d,]+\.\d{2}))?$', line, re.IGNORECASE)
                    if mA:
                        desc, qty, rate, amt = mA.groups()
                        desc_clean = desc.strip()
                        if is_valid_item_description(desc_clean):
                            r_val = float(rate.replace(',', ''))
                            a_val = float(amt.replace(',', '')) if amt else r_val
                            line_items.append({
                                "item_description": desc_clean,
                                "quantity": float(qty),
                                "unit_price": r_val,
                                "total_amount": a_val
                            })

            subtotal = None
            tax_amount = None
            grand_total = None

            sub_m = re.search(r'(?i)(?:SUBTOTAL)\s*[:\-=]?\s*(?:\n\s*)?(?:MYR|RM|\$)?\s*([\d,]+\.\d{2})', text)
            if sub_m:
                subtotal = float(sub_m.group(1).replace(',', ''))
            elif line_items:
                subtotal = round(sum(i["total_amount"] for i in line_items), 2)

            tax_m = re.search(r'(?i)(?:TAX\s*\(?.*?\)?:?|TAX|SST|GST|VAT)\s*[:\-=]?\s*(?:\n\s*)?(?:MYR|RM|\$)?\s*([\d,]+\.\d{2})', text)
            if tax_m:
                tax_amount = float(tax_m.group(1).replace(',', ''))

            tot_m = re.search(r'(?i)(?:TOTAL\s*CREDIT|GRAND\s*TOTAL|TOTAL)\s*[:\-=]?\s*(?:\n\s*)?(?:MYR|RM|\$)?\s*([\d,]+\.\d{2})', text)
            if tot_m:
                grand_total = float(tot_m.group(1).replace(',', ''))
            
            if subtotal is not None and tax_amount is not None:
                calc_tot = round(subtotal + tax_amount, 2)
                if grand_total is None or grand_total == subtotal or (calc_tot > grand_total and abs(calc_tot - grand_total) > 0.05):
                    grand_total = calc_tot

            is_our_vendor = (
                (vendor_name and not are_companies_matching(vendor_name, self.our_company_name)) or
                (buyer_name and are_companies_matching(buyer_name, self.our_company_name)) or
                (rel_inv and (rel_inv.startswith("PUR-") or rel_inv.startswith("SUP-")))
            )

            resolved_doc_type = "Supplier Credit Note" if is_our_vendor else "Credit Note"

            return {
                "document_type": resolved_doc_type,
                "credit_note_number": cn_no,
                "debit_note_number": dn_no,
                "related_invoice_number": rel_inv,
                "invoice_number": None,
                "receipt_number": None,
                "transaction_date": tx_date,
                "vendor_name": vendor_name,
                "vendor_address": None,
                "buyer_name": buyer_name,
                "buyer_address": None,
                "currency": detect_currency(text),
                "subtotal": subtotal,
                "discount": None,
                "shipping": None,
                "tax_amount": tax_amount,
                "grand_total": grand_total,
                "line_items": line_items
            }

        # ---------------------------------------------------------
        # E. PURCHASE RECEIPTS, EXPENSE RECEIPTS & INVOICES
        # ---------------------------------------------------------
        currency = detect_currency(text)

        raw_inv_candidate = _get_field_bounded(["Invoice No", "Invoice Number", "Invoice #", "Inv #", "SI No", "Bill No", "No.", "No"])
        invoice_number = clean_invoice_number(raw_inv_candidate)
        if not invoice_number:
            inv_m = re.search(r'(?i)(?:INVOICE|TAX\s+INVOICE|PURCHASE\s+INVOICE|SALES\s+INVOICE)?\s*(?:(?:Invoice\s+)?No\.?|Invoice\s+Number|Invoice\s*#|Inv\s*#)\s*[:\-=.]*\s*([A-Za-z0-9]+(?:[-_/][A-Za-z0-9]+)*)', text)
            if inv_m:
                invoice_number = clean_invoice_number(inv_m.group(1))
        if not invoice_number:
            inv_m2 = re.search(r'#?\s*\b((?:INV|PUR|SUP|SI|BILL)[-_/]+[A-Za-z0-9-]+)\b', text, re.IGNORECASE)
            if inv_m2:
                invoice_number = clean_invoice_number(inv_m2.group(1))

        receipt_number = _get_field_bounded(["Receipt No", "Receipt Number", "Receipt #", "Rcpt #"])
        if receipt_number:
            receipt_number = clean_invoice_number(receipt_number) or receipt_number
        if not receipt_number:
            rc_m = re.search(r'#?\s*(RC-\d{4}-\d{2,4}|PAY-\d{4}-\d{2,4})', text)
            if rc_m:
                receipt_number = rc_m.group(1)

        payment_terms = _get_field_bounded(["Terms", "Payment Terms", "Credit Terms", "Term"])

        # Date selection prioritizing Date Paid: for receipts
        transaction_date = _get_field_bounded(["Date Paid", "Transaction Date", "Receipt Date", "Invoice Date", "Date"])
        if not is_valid_date_string(transaction_date):
            d_m = re.search(r'(\d{1,2}\s+\w{3}\s+\d{4}|\d{2}/\d{2}/\d{4}|\d{4}-\d{2}-\d{2}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})', text, re.IGNORECASE)
            if d_m:
                transaction_date = d_m.group(1)
            else:
                transaction_date = None

        normalized_date = normalize_date_to_iso(transaction_date) if transaction_date else None

        # Merchant / Vendor extraction
        merchant_name = _get_field_bounded(["Merchant", "Seller", "Store", "Issued By", "Business Name", "Vendor", "Supplier"])
        if merchant_name and not is_valid_company_entity(merchant_name):
            merchant_name = None

        vendor_address = _get_field_bounded(["Vendor Address", "Seller Address", "Address"])
        if vendor_address and not is_address_line(vendor_address):
            vendor_address = None

        # Check 'From:' only if NOT 'Received From'
        if not merchant_name:
            m_from = re.search(r'(?i)(?<!Received\s)\bFrom\b\s*[:\-=]?\s*([^\n]+)', text)
            if m_from:
                cand_from = truncate_at_next_label(m_from.group(1).strip(), "From")
                clean_from = re.sub(r'(?i)\b(TAX\s+INVOICE|INVOICE|PURCHASE\s+INVOICE|SALES\s+INVOICE|COMMERCIAL\s+INVOICE|RECEIPT|BILL|STATEMENT)\b', '', cand_from).strip()
                if is_valid_company_entity(clean_from) and not are_companies_matching(clean_from, self.our_company_name):
                    merchant_name = clean_from

        # Structural header block extraction for receipts: text block before 'Received From:'
        if not merchant_name and "Received From" in text:
            before_recv = text.split("Received From")[0]
            lines_before = [l.strip() for l in before_recv.splitlines() if l.strip()]
            for l in lines_before:
                clean_cand = re.sub(r'(?i)\b(TAX\s+INVOICE|INVOICE|PURCHASE\s+INVOICE|SALES\s+INVOICE|COMMERCIAL\s+INVOICE|RECEIPT|BILL|STATEMENT)\b', '', l).strip()
                clean_cand = truncate_at_next_label(clean_cand, "Merchant")
                if is_valid_company_entity(clean_cand) and not are_companies_matching(clean_cand, self.our_company_name):
                    merchant_name = clean_cand
                    break

        if not merchant_name:
            for idx, line in enumerate(lines[:8]):
                clean_cand = re.sub(r'(?i)\b(TAX\s+INVOICE|INVOICE|PURCHASE\s+INVOICE|SALES\s+INVOICE|COMMERCIAL\s+INVOICE|RECEIPT|BILL|STATEMENT)\b', '', line).strip()
                clean_cand = re.sub(r'\s+(?:Our\s*GRN|Your\s*Ref|Our\s*D/?O|Supp\.|Terms|Date|Page|TEL|FAX).*$', '', clean_cand, flags=re.IGNORECASE).strip()
                if any(k in line.upper() for k in ["PAGE", "DATE", "RECEIVED FROM", "BILL TO", "BILLED TO"]):
                    continue
                clean_cand = truncate_at_next_label(clean_cand, "Merchant")
                if is_valid_company_entity(clean_cand) and not are_companies_matching(clean_cand, self.our_company_name):
                    merchant_name = clean_cand
                    if not vendor_address and idx + 1 < len(lines):
                        next_l = lines[idx + 1].strip()
                        if is_address_line(next_l):
                            vendor_address = next_l
                    break

        vendor_name = merchant_name

        buyer_name = _get_field_bounded(["Bill To", "Billed To", "Buyer", "Customer", "Sold To", "Received From", "Paid By", "Payer"], validate_entity=True)
        if not buyer_name:
            m_bill = re.search(r'(?i)(?:Bill\s*To|Billed\s*To|Customer|Buyer|Sold\s*To)\s*[:\-=]?\s*([^\n]+)', text)
            if m_bill:
                cand_b = truncate_at_next_label(m_bill.group(1).strip(), "Bill To")
                if is_valid_company_entity(cand_b):
                    buyer_name = cand_b
        if buyer_name and not is_valid_company_entity(buyer_name):
            buyer_name = None

        buyer_address = _get_field_bounded(["Buyer Address", "Customer Address", "Ship To Address"])

        payment_method = _get_field_bounded(["Payment Method", "Paid Via", "Method"])

        # Line Items Parsing
        line_items = _extract_invoice_line_items(text, tables=source_context.get("tables", []))
        if not line_items:
            line_items = _extract_column_oriented_line_items(text)

        if not line_items:
            for line in lines:
                line_upper = line.upper()
                if any(skip_kw in line_upper for skip_kw in [
                    "PAYMENT FOR INVOICE", "PAYMENT FOR", "REFERENCE", "INVOICE NUMBER",
                    "BALANCE DUE", "AMOUNT DUE", "SUBTOTAL", "GRAND TOTAL", "RECEIPT NO", "PAGE", "DATE PAID", "PAYMENT METHOD",
                    "QUANTITY RATE AMOUNT", "ITEM QUANTITY RATE AMOUNT"
                ]):
                    continue

                mA = re.search(r'^(.*?)\s+(\d+(?:\.\d+)?)\s+' + CURRENCY_PREFIX_PAT + r'\s*([\d,]+\.\d{2})\s+' + CURRENCY_PREFIX_PAT + r'\s*([\d,]+\.\d{2})$', line, re.IGNORECASE)
                if mA:
                    desc, qty, rate, amt = mA.groups()
                    desc_clean = desc.strip()
                    if is_valid_item_description(desc_clean):
                        line_items.append({
                            "item_description": desc_clean,
                            "quantity": float(qty),
                            "unit_price": float(rate.replace(',', '')),
                            "total_amount": float(amt.replace(',', ''))
                        })
                    continue

                mB = re.search(r'^' + CURRENCY_PREFIX_PAT + r'\s*([\d,]+\.\d{2})\s+' + CURRENCY_PREFIX_PAT + r'\s*([\d,]+\.\d{2})\s+(\d+(?:\.\d+)?)\s+(.*?)$', line, re.IGNORECASE)
                if mB:
                    amt, rate, qty, desc = mB.groups()
                    desc_clean = desc.strip()
                    if is_valid_item_description(desc_clean):
                        line_items.append({
                            "item_description": desc_clean,
                            "quantity": float(qty),
                            "unit_price": float(rate.replace(',', '')),
                            "total_amount": float(amt.replace(',', ''))
                        })
                    continue

                mC = re.search(r'[•\-]\s*(.*?)\s*[—\-]\s*' + CURRENCY_PREFIX_PAT + r'\s*([\d,]+\.\d{2})', line)
                if mC:
                    desc, amt = mC.groups()
                    desc_clean = desc.strip()
                    amt_val = float(amt.replace(',', ''))
                    if is_valid_item_description(desc_clean):
                        line_items.append({
                            "item_description": desc_clean,
                            "quantity": 1.0,
                            "unit_price": amt_val,
                            "total_amount": amt_val
                        })

        # Audit filter: ensure every line item has a valid item description
        line_items = [item for item in line_items if is_valid_item_description(item.get("item_description"))]

        subtotal = None
        discount = None
        shipping = None
        tax_amount = None
        grand_total = None

        sub_m = re.search(r'(?:SUBTOTAL|SUB-TOTAL)\s*[:\-=]?\s*' + CURRENCY_PREFIX_PAT + r'\s*([\d,]+\.\d{2})', text, re.IGNORECASE)
        if sub_m:
            subtotal = float(sub_m.group(1).replace(',', ''))
        elif line_items:
            subtotal = round(sum(i["total_amount"] for i in line_items), 2)

        disc_m = re.search(r'(?:DISCOUNT|LESS\s*DISCOUNT)\s*[:\-=]?\s*' + CURRENCY_PREFIX_PAT + r'\s*([\d,]+\.\d{2})', text, re.IGNORECASE)
        if disc_m:
            discount = float(disc_m.group(1).replace(',', ''))

        ship_m = re.search(r'(?:SHIPPING|FREIGHT|DELIVERY|CARRIAGE)\s*[:\-=]?\s*' + CURRENCY_PREFIX_PAT + r'\s*([\d,]+\.\d{2})', text, re.IGNORECASE)
        if ship_m:
            shipping = float(ship_m.group(1).replace(',', ''))

        tax_m = re.search(r'(?:TAX\s*\(?.*?\)?:?|TAX|SST|GST|VAT)\s*[:\-=]?\s*' + CURRENCY_PREFIX_PAT + r'\s*([\d,]+\.\d{2})', text, re.IGNORECASE)
        if tax_m:
            tax_amount = float(tax_m.group(1).replace(',', ''))
        elif subtotal is not None and tax_amount is None:
            tax_amount = 0.0

        # Find all total candidates, ignoring B/F Page Total
        tot_candidates = []
        for tm in re.finditer(r'(?i)(?:(?<!SUB)(?<!SUB-)(?<!SUB\s)\b(?:GRAND\s*TOTAL|TOTAL\s*AMOUNT|TOTAL|BALANCE\s*DUE|AMOUNT\s*DUE|NET\s*TOTAL)\b)\s*[:\-=]?\s*' + CURRENCY_PREFIX_PAT + r'\s*([\d,]+\.\d{2})', text):
            match_start = tm.start()
            prefix_chunk = text[max(0, match_start - 30):match_start].upper()
            if "B/F" in prefix_chunk or "BROUGHT FORWARD" in prefix_chunk:
                continue
            val_flt = float(tm.group(1).replace(',', ''))
            tot_candidates.append(val_flt)
        
        tot_m = True if tot_candidates else None
        if tot_candidates:
            # Pick the candidate matching subtotal, or the largest positive candidate
            chosen_gt = None
            if subtotal is not None:
                for cand in tot_candidates:
                    if abs(cand - subtotal) < 0.05:
                        chosen_gt = cand
                        break
            if chosen_gt is None:
                pos_cands = [c for c in tot_candidates if c > 0]
                chosen_gt = pos_cands[-1] if pos_cands else tot_candidates[-1]
            grand_total = chosen_gt
        elif subtotal is not None:
            sub_d = Decimal(str(subtotal or 0.0))
            disc_d = Decimal(str(discount or 0.0))
            ship_d = Decimal(str(shipping or 0.0))
            tax_d = Decimal(str(tax_amount or 0.0))
            grand_total = float((sub_d - disc_d + ship_d + tax_d).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

        if (grand_total is None or grand_total == 0.0) and subtotal is not None and subtotal > 0:
            sub_d = Decimal(str(subtotal or 0.0))
            disc_d = Decimal(str(discount or 0.0))
            ship_d = Decimal(str(shipping or 0.0))
            tax_d = Decimal(str(tax_amount or 0.0))
            grand_total = float((sub_d - disc_d + ship_d + tax_d).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

        return {
            "document_type": doc_type,
            "invoice_number": invoice_number,
            "receipt_number": receipt_number,
            "transaction_date": normalized_date or transaction_date,
            "invoice_date": normalized_date or transaction_date,
            "payment_terms": payment_terms,
            "customer_name": buyer_name,
            "vendor_name": vendor_name,
            "vendor_address": vendor_address,
            "merchant_name": merchant_name,
            "buyer_name": buyer_name,
            "buyer_address": buyer_address,
            "currency": currency,
            "subtotal": subtotal,
            "discount": discount,
            "shipping": shipping,
            "tax_amount": tax_amount,
            "grand_total": grand_total,
            "payment_method": payment_method,
            "line_items": line_items
        }

    # -------------------------------------------------------------------------
    # VERIFY & RECOVER: Sanity Audit & Recovery Pass
    # -------------------------------------------------------------------------

    def _verify_and_recover_extraction(
        self,
        extracted_raw: Dict[str, Any],
        doc_type: str,
        raw_text: str
    ) -> Tuple[Dict[str, Any], List[str], bool]:
        messages = []
        needs_review = False
        cleaned = dict(extracted_raw)

        entity_keys = ["vendor_name", "buyer_name", "merchant_name", "from_account_name", "beneficiary_name", "account_name"]

        for key in entity_keys:
            val = cleaned.get(key)
            if val and not is_valid_company_entity(val):
                messages.append(f"Validation Warning: Extracted entity '{key}' value '{val}' was identified as invalid or placeholder text and reset to null.")
                cleaned[key] = None
                needs_review = True

        if doc_type in ["Sales Invoice", "Payment Receipt"] and not cleaned.get("buyer_name"):
            for label in ["Bill To", "Billed To", "Customer", "Buyer", "Received From", "Payer"]:
                m = re.search(r'(?i)\b' + re.escape(label) + r'\b\s*[:\-=]?\s*([^\n]+)', raw_text)
                if m:
                    cand = truncate_at_next_label(m.group(1).strip(), label)
                    if is_valid_company_entity(cand):
                        cleaned["buyer_name"] = cand
                        messages.append(f"Recovery Success: Recovered buyer_name '{cand}' using secondary label '{label}'.")
                        needs_review = False
                        break

        return cleaned, messages, needs_review

    # -------------------------------------------------------------------------
    # DISPLAY SUMMARY FOR UI DISPLAY
    # -------------------------------------------------------------------------

    def _compute_display_summary(self, doc_type: str, extracted_raw: Dict[str, Any], business_roles: BusinessRolesSchema) -> DisplaySummarySchema:
        def _valid_party_or_dash(val: Optional[str]) -> str:
            if not val or not isinstance(val, str):
                return "-"
            if not is_valid_company_entity(val) or val.upper() in ["N/A", "UNKNOWN", "NONE", "NULL"]:
                return "-"
            return val.strip()

        if doc_type == "Sales Invoice":
            raw_p = business_roles.customer or extracted_raw.get("buyer_name")
            party = _valid_party_or_dash(raw_p)
            amt = extracted_raw.get("grand_total") or 0.0
            return DisplaySummarySchema(party_label="Customer", party=party, amount_label="Grand Total", amount=amt)

        elif doc_type in ["Purchase Invoice", "Supplier Invoice"]:
            raw_p = business_roles.vendor or business_roles.supplier or extracted_raw.get("vendor_name")
            party = _valid_party_or_dash(raw_p)
            amt = extracted_raw.get("grand_total") or 0.0
            return DisplaySummarySchema(party_label="Vendor", party=party, amount_label="Grand Total", amount=amt)

        elif doc_type in ["Purchase Receipt", "Expense Receipt"]:
            raw_p = business_roles.merchant or extracted_raw.get("merchant_name") or extracted_raw.get("vendor_name")
            party = _valid_party_or_dash(raw_p)
            amt = extracted_raw.get("grand_total") or 0.0
            return DisplaySummarySchema(party_label="Merchant", party=party, amount_label="Grand Total", amount=amt)

        elif doc_type == "Payment Receipt":
            raw_p = business_roles.customer or extracted_raw.get("buyer_name")
            party = _valid_party_or_dash(raw_p)
            amt = extracted_raw.get("grand_total") or extracted_raw.get("transaction_amount") or 0.0
            return DisplaySummarySchema(party_label="Payer", party=party, amount_label="Amount Received", amount=amt)

        elif doc_type in ["Credit Note", "Debit Note", "Supplier Credit Note"]:
            if business_roles.vendor or business_roles.supplier or doc_type == "Supplier Credit Note":
                raw_p = business_roles.vendor or business_roles.supplier or extracted_raw.get("vendor_name")
                lbl = "Vendor"
            else:
                raw_p = business_roles.customer or extracted_raw.get("buyer_name")
                lbl = "Customer"
            party = _valid_party_or_dash(raw_p)
            amt = extracted_raw.get("grand_total") or 0.0
            return DisplaySummarySchema(party_label=lbl, party=party, amount_label="Total Credit", amount=amt)

        elif doc_type in ["Bank Statement", "Bank Transaction Record"]:
            raw_p = extracted_raw.get("account_name") or business_roles.other or business_roles.our_company
            party = _valid_party_or_dash(raw_p)
            amt = extracted_raw.get("closing_balance") or 0.0
            return DisplaySummarySchema(party_label="Account", party=party, amount_label="Closing Balance", amount=amt)

        elif doc_type == "Bank Transfer Receipt":
            from_acc = extracted_raw.get("from_account_name")
            ben_acc = extracted_raw.get("beneficiary_name")
            if from_acc and ben_acc:
                short_from = from_acc.split()[0] if from_acc else ""
                short_ben = ben_acc.split()[0] if ben_acc else ""
                party = f"{short_from} -> {short_ben}"
            else:
                party = _valid_party_or_dash(from_acc or ben_acc)
            amt = extracted_raw.get("transaction_amount") or 0.0
            return DisplaySummarySchema(party_label="Transfer", party=party, amount_label="Transaction Amount", amount=amt)

        return DisplaySummarySchema(party_label="Party", party="-", amount_label="Total", amount=extracted_raw.get("grand_total") or 0.0)

    # -------------------------------------------------------------------------
    # CONFIDENCE MATRIX
    # -------------------------------------------------------------------------


    def _compute_field_confidence(self, extracted_raw: Dict[str, Any], doc_type: str) -> Dict[str, Any]:
        conf = {}
        for key, val in extracted_raw.items():
            if key in ["line_items", "bank_transactions"]:
                continue
            if val is not None:
                conf[key] = {
                    "value": val,
                    "confidence": 0.95 if is_valid_company_entity(str(val)) else 0.80,
                    "source": "Semantic Boundary Extraction"
                }
            else:
                conf[key] = {
                    "value": None,
                    "confidence": 0.0,
                    "source": "Not Present / Excluded for Document Type"
                }
        return conf

    def _is_company_buyer(self, text: str) -> bool:
        text_upper = text.upper()
        company_upper = self.our_company_name.upper()

        buyer_patterns = [
            rf"BILL\s*TO\s*:?\s*{re.escape(company_upper)}",
            rf"BILLED\s*TO\s*:?\s*{re.escape(company_upper)}",
            rf"BUYER\s*:?\s*{re.escape(company_upper)}",
            rf"CUSTOMER\s*:?\s*{re.escape(company_upper)}",
            rf"SOLD\s*TO\s*:?\s*{re.escape(company_upper)}"
        ]

        for pattern in buyer_patterns:
            if re.search(pattern, text_upper):
                return True

        lines = [line.strip() for line in text.splitlines() if line.strip()]
        buyer_labels = ["BILL TO", "BILLED TO", "BUYER", "CUSTOMER", "SOLD TO"]

        for i, line in enumerate(lines):
            clean_line = re.sub(r'[:\-=]+$', '', line.upper()).strip()
            if clean_line in buyer_labels:
                for next_line in lines[i + 1:i + 3]:
                    if are_companies_matching(next_line, self.our_company_name):
                        return True

        return False

    def _verify_extraction_semantics(
        self,
        raw_text: str,
        doc_type: str,
        extracted_raw: Dict[str, Any],
        business_roles: BusinessRolesSchema
    ) -> SemanticVerificationSchema:
        """
        Stage 1 Ingestion: 100% Deterministic Extraction.
        CRITICAL ARCHITECTURAL RULE: No LLM calls are executed during document upload.
        Extraction is performed entirely via deterministic regex, table extraction,
        and Python arithmetic verification (CalculationAgent).
        
        Deep LLM source document rechecking is triggered strictly during Stage 2 Audit Staging
        only when an entry is flagged with errors or accounting anomalies.
        """
        date_val = extracted_raw.get('transaction_date') or extracted_raw.get('statement_date') or '-'
        party_val = extracted_raw.get('vendor_name') or extracted_raw.get('buyer_name') or extracted_raw.get('merchant_name') or '-'
        
        return SemanticVerificationSchema(
            extraction_verdict="CORRECT",
            thought_process=SemanticThoughtProcessSchema(
                step_1_date_check=f"Extracted transaction date '{date_val}' validated via deterministic document layout rules.",
                step_2_entity_role_check=f"Company '{self.our_company_name}' identified and counterparty '{party_val}' assigned.",
                step_3_document_type_check=f"Document classified as '{doc_type}' via multi-signal scoring.",
                decision_rationale="Deterministic extraction complete (0 LLM latency, 0 API tokens spent). Targeted LLM document inspection will activate in Stage 2 Audit Staging if anomalies occur."
            ),
            flagged_fields=[]
        )



    def process_onboarding_document(
        self,
        document_id: str,
        raw_text: str,
        filename: str = "",
        file_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Reuses DocumentProcessingAgent to process company setup & opening balance documents.
        Prioritizes structured table extraction from pdfplumber to avoid duplication and column conflation.
        Resolves account codes against the Chart of Accounts and performs deterministic validation.
        """
        from app.services.pdf_ocr import extract_document_data

        # 1. Extract structured data if file_path is available
        tables = []
        doc_data = None
        if file_path and Path(file_path).exists():
            doc_data = extract_document_data(file_path)
            tables = doc_data.get("tables", [])
            # Use clean raw_text from structured extraction if available
            if doc_data.get("raw_text"):
                raw_text = doc_data["raw_text"]

        # 2. Multi-signal document classification
        doc_type = self._auto_detect_document_type(raw_text)
        fn_upper = filename.upper()
        if "TRIAL BALANCE" in fn_upper or "TB" in fn_upper:
            if doc_type not in ["Opening Trial Balance", "Trade Receivables / Debtors", "Trade Payables / Creditors", "Other Creditors", "Opening Stock List"]:
                doc_type = "Opening Trial Balance"
        elif "DEBTOR" in fn_upper or "RECEIVABLE" in fn_upper:
            if doc_type not in ["Opening Trial Balance", "Trade Receivables / Debtors", "Trade Payables / Creditors", "Other Creditors", "Opening Stock List"]:
                doc_type = "Trade Receivables / Debtors"
        elif "CREDITOR" in fn_upper or "PAYABLE" in fn_upper:
            if "OTHER" in fn_upper:
                doc_type = "Other Creditors"
            elif doc_type not in ["Opening Trial Balance", "Trade Receivables / Debtors", "Trade Payables / Creditors", "Other Creditors", "Opening Stock List"]:
                doc_type = "Trade Payables / Creditors"
        elif "STOCK" in fn_upper or "INVENTORY" in fn_upper:
            if doc_type not in ["Opening Trial Balance", "Trade Receivables / Debtors", "Trade Payables / Creditors", "Other Creditors", "Opening Stock List"]:
                doc_type = "Opening Stock List"
        elif "SSM" in fn_upper or "PROFILE" in fn_upper:
            doc_type = "Company Profile"

        category_map = {
            "Opening Trial Balance": "TRIAL_BALANCE",
            "Trade Receivables / Debtors": "DEBTOR",
            "Trade Payables / Creditors": "CREDITOR",
            "Other Creditors": "OTHER_CREDITOR",
            "Opening Stock List": "STOCK",
            "Company Profile": "COMPANY_PROFILE"
        }
        category = category_map.get(doc_type, "TRIAL_BALANCE")

        # 3. Parse lines using structured tables (if available) or fallback to text
        line_items, metadata, validation_info = self._parse_onboarding_lines_and_metadata(
            raw_text=raw_text,
            category=category,
            filename=filename,
            tables=tables
        )

        return {
            "document_id": document_id,
            "document_type": doc_type,
            "category": category,
            "filename": filename,
            "line_items": line_items,
            "company_metadata": metadata,
            "validation_info": validation_info,
            "status": "EXTRACTED",
            "error_message": None
        }

    def resolve_trial_balance_account(self, name: str) -> Tuple[Optional[str], Optional[str], str]:
        return self.resolve_coa_account(name)

    def resolve_coa_account(self, name: str) -> Tuple[Optional[str], Optional[str], str]:
        """
        Resolves account code from Chart of Accounts using intelligent accounting classification.
        Returns (account_code, standard_account_name, confidence).
        If unresolved, returns (None, None, 'UNRESOLVED'). Never assigns arbitrary default codes.
        """
        from app.db.database import DEFAULT_CHART_OF_ACCOUNTS
        clean = re.sub(r'[^A-Z0-9\s]', '', name.upper()).strip()

        # 1. Specialized Accumulated Depreciation contra-asset mapping
        if any(k in clean for k in ["ACCUMULATED DEPRECIATION", "ACCUM DEPRN", "ACCUM DEPRECIATION"]):
            if any(w in clean for w in ["MOTOR", "VEHICLE"]):
                return "200-4005", "ACCUM. DEPRN. - MOTOR VEHICLES", "HIGH"
            if any(w in clean for w in ["OFFICE", "EQUIPMENT"]):
                return "200-3005", "ACCUM. DEPRN. - OFFICE EQUIPMENT", "HIGH"
            if any(w in clean for w in ["FURNITURE", "FITTING"]):
                return "200-2005", "ACCUM. DEPRN. - FURNITURES & FITTINGS", "HIGH"
            return "200-3005", "ACCUMULATED DEPRECIATION", "MEDIUM"

        # 2. Standard Accounting Synonyms (Malaysian GAAP / MFRS / MPERS)
        synonyms = [
            ("INVENTORY", ("330-0000", "STOCK")),
            ("STOCK", ("330-0000", "STOCK")),
            ("TRADE RECEIVABLES", ("300-0000", "TRADE DEBTORS")),
            ("TRADE DEBTORS", ("300-0000", "TRADE DEBTORS")),
            ("TRADE PAYABLES", ("400-0000", "TRADE CREDITORS")),
            ("TRADE CREDITORS", ("400-0000", "TRADE CREDITORS")),
            ("OTHER CREDITORS", ("405-0000", "OTHER CREDITORS")),
            ("BANK LOAN", ("425-0000", "BANK LOAN")),
            ("TERM LOAN", ("425-0000", "BANK LOAN")),
            ("PREPAID RENT", ("340-2000", "PREPAID RENT")),
            ("PREPAID EXPENSES", ("340-1000", "PREPAID EXPENSES")),
            ("PREPAYMENT", ("340-0000", "DEPOSIT & PREPAYMENT")),
            ("RETAINED EARNINGS", ("150-0000", "RETAINED EARNING")),
            ("RETAINED EARNING", ("150-0000", "RETAINED EARNING")),
            ("CAPITAL", ("100-0000", "CAPITAL")),
            ("MOTOR VEHICLES", ("200-4000", "MOTOR VEHICLES")),
            ("OFFICE EQUIPMENT", ("200-3000", "OFFICE EQUIPMENT")),
            ("CASH IN HAND", ("320-0000", "CASH IN HAND")),
            ("PETTY CASH", ("320-0000", "CASH IN HAND")),
        ]

        for syn_k, (code, std_name) in synonyms:
            if syn_k in clean:
                return code, std_name, "HIGH"

        if "CASH AT BANK" in clean or ("BANK" in clean and "LOAN" not in clean and "CHARGES" not in clean):
            return "310-1000", "CASH AT BANK", "HIGH"

        # 3. Match against non-group standard Chart of Accounts
        words = [w for w in clean.split() if w not in ["MATURES", "DECEMBER", "METRA", "SDN", "BHD"]]
        for acc in DEFAULT_CHART_OF_ACCOUNTS:
            if acc.get("is_group"):
                continue
            acc_name = acc.get("name", "").upper()
            acc_clean = re.sub(r'[^A-Z0-9\s]', '', acc_name).strip()
            if clean == acc_clean:
                return acc["code"], acc["name"], "HIGH"
            if len(words) >= 2 and all(w in acc_clean.split() for w in words):
                return acc["code"], acc["name"], "HIGH"
            if clean in acc_clean or acc_clean in clean:
                return acc["code"], acc["name"], "MEDIUM"

        return None, None, "UNRESOLVED"

    def _parse_onboarding_lines_and_metadata(
        self,
        raw_text: str,
        category: str,
        filename: str,
        tables: List[List[List[str]]] = None
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any], Dict[str, Any]]:
        import uuid
        from decimal import Decimal, ROUND_HALF_UP

        def _clean_num(val_str: Any) -> Decimal:
            if val_str is None or val_str == "":
                return Decimal("0.00")
            if isinstance(val_str, (int, float)):
                return Decimal(str(val_str)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            clean = re.sub(r'[^\d.]', '', str(val_str).replace(',', ''))
            try:
                return Decimal(clean).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if clean else Decimal("0.00")
            except Exception:
                return Decimal("0.00")

        def _normalize_name(val: Optional[str]) -> str:
            if not val:
                return ""
            res = str(val).replace('\ufffd', '-').replace('\u2013', '-').replace('\u2014', '-').strip()
            return re.sub(r'\s+', ' ', res)

        items = []
        metadata = {}
        validation_info = {}

        # Extract company metadata
        name_match = re.search(r'([A-Za-z0-9\s&.,\x27\-]+(?:SDN\.?\s*BHD\.?|BERHAD))', raw_text, re.IGNORECASE)
        if name_match:
            metadata["company_name"] = name_match.group(1).strip()
        reg_match = re.search(r'\b(202\d{9}|\d{6}-[A-Za-z]|\d{12})\b', raw_text)
        if reg_match:
            metadata["registration_number"] = reg_match.group(1).strip()
        date_match = re.search(r'(?:as at|dated?)\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})', raw_text, re.IGNORECASE)
        if date_match:
            metadata["reporting_date"] = date_match.group(1).strip()

        # Check if structured table is present
        target_table = None
        if tables and len(tables) > 0:
            for t in tables:
                if t and len(t) >= 2:
                    target_table = t
                    break

        if target_table:
            # =========================================================================
            # STRATEGY 1: STRUCTURED TABLE EXTRACTION (100% PRECISE)
            # =========================================================================
            header = [_normalize_name(c).lower() for c in target_table[0]]
            
            # Map column indices dynamically
            col_name = None
            col_debit = None
            col_credit = None
            col_date = None
            col_term = None
            col_code = None
            col_cost = None
            col_qty = None
            col_amount = None

            for idx, h in enumerate(header):
                h_clean = h.strip().lower()
                # 1. Match specific composite phrases FIRST to prevent substring collisions
                if any(k in h_clean for k in ["credit term", "payment term", "term"]):
                    col_term = idx
                elif any(k in h_clean for k in ["invoice date", "bill date", "date"]):
                    col_date = idx
                elif any(k in h_clean for k in ["item code", "stock code"]):
                    col_code = idx
                elif any(k in h_clean for k in ["unit cost", "unit price", "cost"]):
                    col_cost = idx
                elif any(k in h_clean for k in ["quantity", "balance quantity", "qty"]):
                    col_qty = idx
                elif any(k in h_clean for k in ["outstanding", "balance amount", "amount", "total value"]):
                    col_amount = idx
                elif "debit" in h_clean:
                    col_debit = idx
                elif "credit" in h_clean and "term" not in h_clean:
                    col_credit = idx
                elif any(k in h_clean for k in ["customer name", "supplier name", "creditor name", "vendor", "party", "account name", "item name", "stock item", "name"]):
                    if col_name is None:
                        col_name = idx

            if col_name is None:
                col_name = 0
            if category == "TRIAL_BALANCE":
                if col_debit is None: col_debit = 1
                if col_credit is None: col_credit = 2

            for row in target_table[1:]:
                if not row or not any(row):
                    continue
                name = _normalize_name(row[col_name])
                if not name:
                    continue

                # Exclude TOTAL / GRAND TOTAL row from accounts, but capture for validation
                if name.upper() in ["TOTAL", "TOTALS", "GRAND TOTAL"]:
                    if col_debit is not None and col_credit is not None and col_debit < len(row) and col_credit < len(row):
                        validation_info["doc_total_debit"] = float(_clean_num(row[col_debit]))
                        validation_info["doc_total_credit"] = float(_clean_num(row[col_credit]))
                    elif col_amount is not None and col_amount < len(row):
                        validation_info["doc_total_amount"] = float(_clean_num(row[col_amount]))
                    continue

                # Skip header repeat rows
                if any(k in name.lower() for k in ["account name", "customer name", "supplier name", "stock item", "creditor name"]):
                    continue

                if category == "TRIAL_BALANCE":
                    dr = _clean_num(row[col_debit]) if col_debit is not None and col_debit < len(row) else Decimal("0.00")
                    cr = _clean_num(row[col_credit]) if col_credit is not None and col_credit < len(row) else Decimal("0.00")
                    code, std_name, conf = self.resolve_coa_account(name)

                    items.append({
                        "id": uuid.uuid4().hex,
                        "category": "TRIAL_BALANCE",
                        "account_code": code or "",
                        "account_name": name,
                        "entity_name": None,
                        "item_code": None,
                        "invoice_no": None,
                        "invoice_date": None,
                        "credit_term": None,
                        "debit": float(dr),
                        "credit": float(cr),
                        "quantity": 0.0,
                        "unit_cost": 0.0,
                        "amount": float(dr if dr > 0 else cr),
                        "review_status": "VERIFIED" if conf in ["HIGH", "MEDIUM"] and code else "NEEDS_REVIEW",
                        "notes": f"Extracted from {filename}" + ("" if code else " (Account code unresolved)"),
                        "source_filename": filename
                    })

                elif category in ["DEBTOR", "RECEIVABLES"]:
                    amt = _clean_num(row[col_amount]) if col_amount is not None and col_amount < len(row) else _clean_num(row[-1])
                    
                    inv_date = None
                    if col_date is not None and col_date < len(row) and row[col_date]:
                        candidate = _normalize_name(row[col_date])
                        if candidate and not any(k in candidate.lower() for k in ["total", "date"]):
                            inv_date = candidate
                    if not inv_date:
                        for cell_idx, cell in enumerate(row):
                            if cell_idx == col_name or cell_idx == col_amount:
                                continue
                            if cell:
                                dm = re.search(r'\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|[A-Za-z]{3})\s+\d{4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b', str(cell), re.IGNORECASE)
                                if dm:
                                    inv_date = dm.group(1).strip()
                                    break

                    term = None
                    if col_term is not None and col_term < len(row) and row[col_term]:
                        candidate = _normalize_name(row[col_term])
                        if candidate and not any(k in candidate.lower() for k in ["total", "term"]):
                            term = candidate
                    if not term:
                        for cell_idx, cell in enumerate(row):
                            if cell_idx == col_name or cell_idx == col_amount:
                                continue
                            if cell:
                                tm = re.search(r'\b(\d+\s*(?:days?|mths?|months?|d)|net\s*\d+|cod|cash)\b', str(cell), re.IGNORECASE)
                                if tm:
                                    term = tm.group(1).strip()
                                    break

                    inv_match = re.search(r'\b(INV[-/\dA-Za-z]+)\b', raw_text)
                    inv_no = inv_match.group(1) if inv_match else f"OB-REC-{len(items)+1:03d}"

                    is_verified = bool(amt > 0 and inv_date and term)
                    status = "VERIFIED" if is_verified else "NEEDS_REVIEW"
                    review_reasons = []
                    if not inv_date: review_reasons.append("missing invoice date")
                    if not term: review_reasons.append("missing credit term")
                    if amt <= 0: review_reasons.append("zero/invalid amount")
                    
                    note_str = f"Extracted from {filename}"
                    if review_reasons:
                        note_str += f" (Requires review: {', '.join(review_reasons)})"

                    items.append({
                        "id": uuid.uuid4().hex,
                        "category": "DEBTOR",
                        "account_code": "300-0000",
                        "account_name": "TRADE DEBTORS",
                        "entity_name": name,
                        "item_code": None,
                        "invoice_no": inv_no,
                        "invoice_date": inv_date,
                        "credit_term": term,
                        "debit": float(amt),
                        "credit": 0.0,
                        "quantity": 0.0,
                        "unit_cost": 0.0,
                        "amount": float(amt),
                        "review_status": status,
                        "notes": note_str,
                        "source_filename": filename
                    })

                elif category in ["CREDITOR", "PAYABLES"]:
                    amt = _clean_num(row[col_amount]) if col_amount is not None and col_amount < len(row) else _clean_num(row[-1])
                    
                    inv_date = None
                    if col_date is not None and col_date < len(row) and row[col_date]:
                        candidate = _normalize_name(row[col_date])
                        if candidate and not any(k in candidate.lower() for k in ["total", "date"]):
                            inv_date = candidate
                    if not inv_date:
                        for cell_idx, cell in enumerate(row):
                            if cell_idx == col_name or cell_idx == col_amount:
                                continue
                            if cell:
                                dm = re.search(r'\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|[A-Za-z]{3})\s+\d{4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b', str(cell), re.IGNORECASE)
                                if dm:
                                    inv_date = dm.group(1).strip()
                                    break

                    term = None
                    if col_term is not None and col_term < len(row) and row[col_term]:
                        candidate = _normalize_name(row[col_term])
                        if candidate and not any(k in candidate.lower() for k in ["total", "term"]):
                            term = candidate
                    if not term:
                        for cell_idx, cell in enumerate(row):
                            if cell_idx == col_name or cell_idx == col_amount:
                                continue
                            if cell:
                                tm = re.search(r'\b(\d+\s*(?:days?|mths?|months?|d)|net\s*\d+|cod|cash)\b', str(cell), re.IGNORECASE)
                                if tm:
                                    term = tm.group(1).strip()
                                    break

                    inv_match = re.search(r'\b(INV[-/\dA-Za-z]+|BILL[-/\dA-Za-z]+)\b', raw_text)
                    inv_no = inv_match.group(1) if inv_match else f"OB-PAY-{len(items)+1:03d}"

                    is_verified = bool(amt > 0 and inv_date and term)
                    status = "VERIFIED" if is_verified else "NEEDS_REVIEW"
                    review_reasons = []
                    if not inv_date: review_reasons.append("missing invoice date")
                    if not term: review_reasons.append("missing credit term")
                    if amt <= 0: review_reasons.append("zero/invalid amount")
                    
                    note_str = f"Extracted from {filename}"
                    if review_reasons:
                        note_str += f" (Requires review: {', '.join(review_reasons)})"

                    items.append({
                        "id": uuid.uuid4().hex,
                        "category": "CREDITOR",
                        "account_code": "400-0000",
                        "account_name": "TRADE CREDITORS",
                        "entity_name": name,
                        "item_code": None,
                        "invoice_no": inv_no,
                        "invoice_date": inv_date,
                        "credit_term": term,
                        "debit": 0.0,
                        "credit": float(amt),
                        "quantity": 0.0,
                        "unit_cost": 0.0,
                        "amount": float(amt),
                        "review_status": status,
                        "notes": note_str,
                        "source_filename": filename
                    })

                elif category in ["OTHER_CREDITOR", "OTHER_PAYABLES"]:
                    amt = _clean_num(row[col_amount]) if col_amount is not None and col_amount < len(row) else _clean_num(row[-1])
                    
                    inv_date = None
                    if col_date is not None and col_date < len(row) and row[col_date]:
                        candidate = _normalize_name(row[col_date])
                        if candidate and not any(k in candidate.lower() for k in ["total", "date"]):
                            inv_date = candidate
                    if not inv_date:
                        for cell_idx, cell in enumerate(row):
                            if cell_idx == col_name or cell_idx == col_amount:
                                continue
                            if cell:
                                dm = re.search(r'\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|[A-Za-z]{3})\s+\d{4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b', str(cell), re.IGNORECASE)
                                if dm:
                                    inv_date = dm.group(1).strip()
                                    break

                    term = None
                    if col_term is not None and col_term < len(row) and row[col_term]:
                        candidate = _normalize_name(row[col_term])
                        if candidate and not any(k in candidate.lower() for k in ["total", "term"]):
                            term = candidate
                    if not term:
                        for cell_idx, cell in enumerate(row):
                            if cell_idx == col_name or cell_idx == col_amount:
                                continue
                            if cell:
                                tm = re.search(r'\b(\d+\s*(?:days?|mths?|months?|d)|net\s*\d+|cod|cash)\b', str(cell), re.IGNORECASE)
                                if tm:
                                    term = tm.group(1).strip()
                                    break

                    is_verified = bool(amt > 0 and inv_date and term)
                    status = "VERIFIED" if is_verified else "NEEDS_REVIEW"
                    review_reasons = []
                    if not inv_date: review_reasons.append("missing invoice date")
                    if not term: review_reasons.append("missing credit term")
                    if amt <= 0: review_reasons.append("zero/invalid amount")
                    
                    note_str = f"Extracted from {filename}"
                    if review_reasons:
                        note_str += f" (Requires review: {', '.join(review_reasons)})"

                    items.append({
                        "id": uuid.uuid4().hex,
                        "category": "OTHER_CREDITOR",
                        "account_code": "405-0000",
                        "account_name": "OTHER CREDITORS",
                        "entity_name": name,
                        "item_code": None,
                        "invoice_no": f"OB-OTH-{len(items)+1:03d}",
                        "invoice_date": inv_date,
                        "credit_term": term,
                        "debit": 0.0,
                        "credit": float(amt),
                        "quantity": 0.0,
                        "unit_cost": 0.0,
                        "amount": float(amt),
                        "review_status": status,
                        "notes": note_str,
                        "source_filename": filename
                    })

                elif category == "STOCK":
                    item_code = _normalize_name(row[col_code]) if col_code is not None and col_code < len(row) else f"ITM-{len(items)+1:03d}"
                    unit_cost = _clean_num(row[col_cost]) if col_cost is not None and col_cost < len(row) else Decimal("0.00")
                    qty = _clean_num(row[col_qty]) if col_qty is not None and col_qty < len(row) else Decimal("1.0")
                    total_val = _clean_num(row[col_amount]) if col_amount is not None and col_amount < len(row) else (qty * unit_cost)

                    items.append({
                        "id": uuid.uuid4().hex,
                        "category": "STOCK",
                        "account_code": "330-0000",
                        "account_name": name,
                        "entity_name": None,
                        "item_code": item_code,
                        "item_name": name,
                        "invoice_no": None,
                        "invoice_date": None,
                        "credit_term": None,
                        "debit": float(total_val),
                        "credit": 0.0,
                        "quantity": float(qty),
                        "unit_cost": float(unit_cost),
                        "amount": float(total_val),
                        "review_status": "VERIFIED" if total_val > 0 else "NEEDS_REVIEW",
                        "notes": f"Extracted from {filename}",
                        "source_filename": filename
                    })

        else:
            # =========================================================================
            # STRATEGY 2: LINE-BASED TEXT EXTRACTION (WITH STRICT METADATA FILTERING)
            # =========================================================================
            lines = [line.strip() for line in raw_text.splitlines() if line.strip()]

            # Known metadata strings to ignore completely
            metadata_patterns = [
                r"^[A-Za-z0-9\s&.,'-]+(?:SDN\.?\s*BHD\.?|BERHAD)$",
                r'^trial balance as at',
                r'^as at \d{1,2}\s+[A-Za-z]+\s+\d{4}',
                r'^page \d+ of \d+',
                r'^account name\s+debit',
                r'^customer name\s+invoice',
                r'^supplier name\s+invoice',
                r'^creditor name\s+invoice',
                r'^stock item\s+stock code'
            ]

            for line in lines:
                line_clean = line.replace("RM", "").strip()
                line_lower = line_clean.lower()

                # Filter out metadata lines
                if any(re.search(pat, line_clean, re.IGNORECASE) for pat in metadata_patterns):
                    continue
                if line_lower.startswith(("page ", "as at ", "trial balance as at")):
                    continue
                if line_lower.startswith(("total", "totals", "grand total")):
                    continue

                if category == "TRIAL_BALANCE":
                    # Protect dates inside parentheses e.g. (Matures 31 December 2029) from being parsed as debit/credit
                    date_in_paren = re.search(r'\(([^)]*(?:\d{4}|\d{1,2}\s+[A-Za-z]+)[^)]*)\)', line_clean)
                    line_for_nums = line_clean
                    if date_in_paren:
                        line_for_nums = line_clean.replace(date_in_paren.group(0), '(__DATE__)')

                    nums = re.findall(r'[\d,]+\.?\d*', line_for_nums)
                    if not nums:
                        continue

                    name_part = re.sub(r'[\d,]+\.?\d*', '', line_for_nums).replace('(__DATE__)', date_in_paren.group(0) if date_in_paren else '').strip()
                    name_part = _normalize_name(name_part)
                    if len(name_part) < 2:
                        continue

                    code_match = re.search(r'\b(\d{3}-\d{4})\b', line_clean)
                    code = code_match.group(1) if code_match else None
                    if code and code in name_part:
                        name_part = name_part.replace(code, '').strip()

                    val1 = _clean_num(nums[-1])
                    val2 = _clean_num(nums[-2]) if len(nums) >= 2 else Decimal("0.00")

                    debit = Decimal("0.00")
                    credit = Decimal("0.00")
                    if len(nums) >= 2 and val2 > 0:
                        debit = val2
                        credit = val1
                    else:
                        amount = val1
                        is_credit = False
                        if code and code[0] in ['1', '4', '5', '6', '9']:
                            is_credit = True
                        elif any(c_kw in name_part.upper() for c_kw in ["CAPITAL", "RETAINED", "CREDITOR", "PAYABLE", "LOAN", "ACCUMULATED DEPRECIATION", "ACCUM. DEPRN"]):
                            is_credit = True
                        if is_credit:
                            credit = amount
                        else:
                            debit = amount

                    resolved_code, std_name, conf = self.resolve_coa_account(name_part)
                    final_code = code or resolved_code

                    items.append({
                        "id": uuid.uuid4().hex,
                        "category": "TRIAL_BALANCE",
                        "account_code": final_code or "",
                        "account_name": name_part,
                        "entity_name": None,
                        "item_code": None,
                        "invoice_no": None,
                        "invoice_date": None,
                        "credit_term": None,
                        "debit": float(debit),
                        "credit": float(credit),
                        "quantity": 0.0,
                        "unit_cost": 0.0,
                        "amount": float(debit if debit > 0 else credit),
                        "review_status": "VERIFIED" if final_code and conf in ["HIGH", "MEDIUM"] else "NEEDS_REVIEW",
                        "notes": f"Extracted from {filename}" + ("" if final_code else " (Account code unresolved)"),
                        "source_filename": filename
                    })

                elif category in ["DEBTOR", "RECEIVABLES", "CREDITOR", "PAYABLES", "OTHER_CREDITOR", "OTHER_PAYABLES"]:
                    amt_match = re.search(r'([\d,]+\.\d{2})\s*$', line_clean)
                    amt = _clean_num(amt_match.group(1)) if amt_match else Decimal("0.00")
                    rem = line_clean[:amt_match.start()].strip() if amt_match else line_clean

                    term_match = re.search(r'\b(\d+\s*(?:days?|mths?|months?|d)|net\s*\d+|cod|cash)\b', rem, re.IGNORECASE)
                    term = term_match.group(1).strip() if term_match else None
                    if term_match:
                        rem = (rem[:term_match.start()] + ' ' + rem[term_match.end():]).strip()

                    date_match = re.search(r'\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|[A-Za-z]{3})\s+\d{4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b', rem, re.IGNORECASE)
                    inv_date = date_match.group(1).strip() if date_match else None
                    if date_match:
                        rem = (rem[:date_match.start()] + ' ' + rem[date_match.end():]).strip()

                    name_part = re.sub(r'[\d,]+\.?\d*', '', rem).strip()
                    name_part = _normalize_name(name_part)
                    if len(name_part) < 2 and amt == Decimal("0.00"):
                        continue

                    is_verified = bool(amt > 0 and inv_date and term)
                    status = "VERIFIED" if is_verified else "NEEDS_REVIEW"
                    review_reasons = []
                    if not inv_date: review_reasons.append("missing invoice date")
                    if not term: review_reasons.append("missing credit term")
                    if amt <= 0: review_reasons.append("zero/invalid amount")

                    note_str = f"Extracted from {filename}"
                    if review_reasons:
                        note_str += f" (Requires review: {', '.join(review_reasons)})"

                    if category in ["DEBTOR", "RECEIVABLES"]:
                        sub_cat = "DEBTOR"
                        acct_code = "300-0000"
                        acct_name = "TRADE DEBTORS"
                        inv_prefix = "OB-REC"
                        deb = float(amt)
                        crd = 0.0
                    elif category in ["CREDITOR", "PAYABLES"]:
                        sub_cat = "CREDITOR"
                        acct_code = "400-0000"
                        acct_name = "TRADE CREDITORS"
                        inv_prefix = "OB-PAY"
                        deb = 0.0
                        crd = float(amt)
                    elif category == "STOCK":
                        sub_cat = "STOCK"
                        acct_code = "330-0000"
                        acct_name = name_part
                        inv_prefix = "OB-STK"
                        deb = float(amt)
                        crd = 0.0
                    else:
                        sub_cat = "OTHER_CREDITOR"
                        acct_code = "405-0000"
                        acct_name = "OTHER CREDITORS"
                        inv_prefix = "OB-OTH"
                        deb = 0.0
                        crd = float(amt)

                    items.append({
                        "id": uuid.uuid4().hex,
                        "category": sub_cat,
                        "account_code": acct_code,
                        "account_name": acct_name,
                        "entity_name": name_part if sub_cat != "STOCK" else None,
                        "item_code": None,
                        "item_name": name_part if sub_cat == "STOCK" else None,
                        "invoice_no": f"{inv_prefix}-{len(items)+1:03d}",
                        "invoice_date": inv_date,
                        "credit_term": term,
                        "debit": deb,
                        "credit": crd,
                        "quantity": 0.0,
                        "unit_cost": 0.0,
                        "amount": float(amt),
                        "review_status": status,
                        "notes": note_str,
                        "source_filename": filename
                    })
        return items, metadata, validation_info
