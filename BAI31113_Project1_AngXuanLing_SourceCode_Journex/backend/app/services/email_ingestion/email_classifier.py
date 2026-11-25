"""
Rule-Based Email Classifier for Document Ingestion.
Classifies emails as ACCOUNTING_RELATED, UNRELATED, or UNCERTAIN based on multi-signal scoring.
Does not invoke LLMs and treats email contents as untrusted input.
"""

import re
from enum import Enum
from typing import Dict, Any, List, Optional, Set
from dataclasses import dataclass, field


class EmailClassification(str, Enum):
    ACCOUNTING_RELATED = "ACCOUNTING_RELATED"
    UNRELATED = "UNRELATED"
    UNCERTAIN = "UNCERTAIN"


@dataclass
class ClassificationResult:
    classification: EmailClassification
    confidence: float
    reasons: List[str] = field(default_factory=list)
    detected_signals: Dict[str, Any] = field(default_factory=dict)


# Keyword catalogs for multi-signal rule evaluation
STRONG_ACCOUNTING_KEYWORDS: Set[str] = {
    "invoice", "invoices", "tax invoice", "tax invoices", "commercial invoice", "commercial invoices", "proforma invoice",
    "supplier invoice", "supplier invoices", "sales invoice", "sales invoices", "purchase invoice", "purchase invoices",
    "billing statement", "billing statements",
    "receipt", "receipts", "official receipt", "official receipts", "payment receipt", "payment receipts",
    "expense receipt", "expense receipts", "e-receipt", "e-receipts",
    "payment confirmation", "payment advice", "remittance advice",
    "credit note", "credit notes", "debit note", "debit notes", "credit memo", "debit memo",
    "purchase order", "purchase orders", "delivery order", "delivery orders",
    "bank statement", "bank statements", "account statement", "account statements", "statement of account", "statements of account",
    "bank transaction", "bank transactions", "wire transfer", "bank transfer receipt", "bank transfer receipts",
    "sst", "gst", "vat"
}

SECONDARY_ACCOUNTING_KEYWORDS: Set[str] = {
    "billing", "billed", "amount due", "balance due", "payment due",
    "outstanding balance", "remittance", "tax exemption", "withholding tax",
    "subtotal", "grand total", "inv#", "inv-", "rcpt#", "po#", "so#"
}

UNRELATED_KEYWORDS: Set[str] = {
    "meeting", "agenda", "sync", "standup", "calendar", "invite", "invitation",
    "minutes of meeting", "mom", "interview", "webinar", "happy hour",
    "newsletter", "digest", "marketing", "promotion", "discount coupon",
    "birthday", "celebration", "lunch", "dinner", "flight", "boarding pass",
    "hotel reservation", "itinerary", "vacation", "annual leave", "out of office",
    "resume", "curriculum vitae", "job application", "press release"
}

SUPPORTED_ATTACHMENT_EXTENSIONS: Set[str] = {".pdf", ".jpg", ".jpeg", ".png"}


def normalize_text(text: Optional[str]) -> str:
    """Normalizes text for robust case-insensitive matching."""
    if not text:
        return ""
    text_lower = text.lower()
    # Normalize excessive whitespaces and punctuation spacing
    text_clean = re.sub(r"[\s\-_/]+", " ", text_lower)
    return text_clean.strip()


def extract_matched_keywords(text: str, keywords: Set[str]) -> List[str]:
    """Finds all matching keywords using word-boundary search."""
    matched = []
    for kw in sorted(keywords, key=len, reverse=True):
        # Match whole word or exact term
        pattern = r"\b" + re.escape(kw) + r"\b"
        if re.search(pattern, text):
            matched.append(kw)
    return matched


class EmailClassifier:
    """
    Modular rule-based classifier that analyzes email metadata
    (subject, sender, body snippet, attachments) to identify accounting documents.
    """

    def classify(
        self,
        subject: Optional[str] = None,
        snippet: Optional[str] = None,
        sender_email: Optional[str] = None,
        sender_name: Optional[str] = None,
        attachments: Optional[List[Dict[str, Any]]] = None
    ) -> ClassificationResult:
        attachments = attachments or []
        norm_subj = normalize_text(subject)
        norm_snip = normalize_text(snippet)
        combined_text = f"{norm_subj} {norm_snip}".strip()

        # 1. Analyze keywords
        strong_acct_matches = extract_matched_keywords(combined_text, STRONG_ACCOUNTING_KEYWORDS)
        sec_acct_matches = extract_matched_keywords(combined_text, SECONDARY_ACCOUNTING_KEYWORDS)
        unrelated_matches = extract_matched_keywords(combined_text, UNRELATED_KEYWORDS)

        # 2. Analyze attachments
        total_attachments = len(attachments)
        supported_attachments = []
        attachment_names = []
        att_acct_matches = []
        att_unrelated_matches = []

        for att in attachments:
            fname = att.get("filename", "")
            attachment_names.append(fname)
            ext = att.get("extension", "").lower()
            if not ext and "." in fname:
                ext = "." + fname.rsplit(".", 1)[-1].lower()

            if ext in SUPPORTED_ATTACHMENT_EXTENSIONS:
                supported_attachments.append(att)

            norm_fname = normalize_text(fname)
            f_acct = extract_matched_keywords(norm_fname, STRONG_ACCOUNTING_KEYWORDS)
            if f_acct:
                att_acct_matches.extend(f_acct)

            f_unrelated = extract_matched_keywords(norm_fname, UNRELATED_KEYWORDS)
            if f_unrelated:
                att_unrelated_matches.extend(f_unrelated)

        has_supported_attachments = len(supported_attachments) > 0
        signals = {
            "strong_accounting": strong_acct_matches,
            "secondary_accounting": sec_acct_matches,
            "unrelated": unrelated_matches,
            "attachment_accounting": att_acct_matches,
            "attachment_unrelated": att_unrelated_matches,
            "total_attachments": total_attachments,
            "supported_attachments": len(supported_attachments),
        }

        reasons = []

        # RULE 1: Conflicting signals (both strong accounting and unrelated keywords present)
        if (strong_acct_matches or att_acct_matches) and (unrelated_matches or att_unrelated_matches):
            reasons.append(
                f"Conflicting signals detected: accounting terms ({strong_acct_matches or att_acct_matches}) "
                f"and unrelated terms ({unrelated_matches or att_unrelated_matches})."
            )
            return ClassificationResult(
                classification=EmailClassification.UNCERTAIN,
                confidence=0.5,
                reasons=reasons,
                detected_signals=signals
            )

        # RULE 2: Clear Unrelated Signal
        if unrelated_matches and not strong_acct_matches and not att_acct_matches:
            reasons.append(f"Unrelated keywords detected in email: {unrelated_matches}")
            if att_unrelated_matches:
                reasons.append(f"Unrelated attachment filenames: {att_unrelated_matches}")
            return ClassificationResult(
                classification=EmailClassification.UNRELATED,
                confidence=0.9,
                reasons=reasons,
                detected_signals=signals
            )

        # RULE 3: Accounting keywords present but NO attachments at all
        if (strong_acct_matches or sec_acct_matches) and total_attachments == 0:
            reasons.append(
                f"Accounting keywords found ({strong_acct_matches or sec_acct_matches}), "
                "but email contains no attachments to process."
            )
            return ClassificationResult(
                classification=EmailClassification.UNCERTAIN,
                confidence=0.4,
                reasons=reasons,
                detected_signals=signals
            )

        # RULE 4: Accounting keywords present with attachments to inspect
        if (strong_acct_matches or att_acct_matches) and total_attachments > 0:
            reasons.append(f"Strong accounting signals identified: {strong_acct_matches or att_acct_matches}")
            reasons.append(f"Found {total_attachments} attachment(s) to inspect.")
            return ClassificationResult(
                classification=EmailClassification.ACCOUNTING_RELATED,
                confidence=0.95 if has_supported_attachments else 0.75,
                reasons=reasons,
                detected_signals=signals
            )

        # RULE 5: Secondary accounting keywords with supported attachments
        if sec_acct_matches and has_supported_attachments:
            reasons.append(f"Secondary accounting clues found ({sec_acct_matches}) with supported attachments.")
            return ClassificationResult(
                classification=EmailClassification.ACCOUNTING_RELATED,
                confidence=0.75,
                reasons=reasons,
                detected_signals=signals
            )

        # RULE 6: Has attachments, but text is completely generic / vague
        if has_supported_attachments and not strong_acct_matches and not sec_acct_matches and not unrelated_matches:
            reasons.append("Email has supported attachment(s) but subject and body lack definitive accounting keywords.")
            return ClassificationResult(
                classification=EmailClassification.UNCERTAIN,
                confidence=0.5,
                reasons=reasons,
                detected_signals=signals
            )

        # RULE 7: No keywords matched and no supported attachments
        reasons.append("No accounting keywords matched and no eligible accounting attachments found.")
        return ClassificationResult(
            classification=EmailClassification.UNRELATED,
            confidence=0.8,
            reasons=reasons,
            detected_signals=signals
        )
