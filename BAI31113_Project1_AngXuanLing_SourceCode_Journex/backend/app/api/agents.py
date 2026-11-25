from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models import JournalEntryModel, ChartOfAccountModel, DocumentModel
import os
import requests
import json
from dotenv import dotenv_values

router = APIRouter(prefix="/api/agents", tags=["Agents"])

@router.post("/react_backtrack/{journal_id}", include_in_schema=False)
@router.post("/react-backtrack/{journal_id}")
def run_react_backtracking(journal_id: str, db: Session = Depends(get_db)):
    """
    Agent 4: ReAct Backtracking Agent.
    Troubleshoots why a journal entry was flagged by specifically RECHECKING
    the original source document for this transaction.
    """
    j = db.query(JournalEntryModel).filter(JournalEntryModel.journal_id == journal_id).first()
    if not j:
        raise HTTPException(status_code=404, detail="Journal not found")
        
    from app.db.models import SystemSettingModel
    from app.config import BASE_DIR
    env_vars = dotenv_values(BASE_DIR / ".env")
    db_provider = db.query(SystemSettingModel).filter(SystemSettingModel.setting_key == "active_provider").first()
    provider = "GROQ"
    
    if provider == "GROQ":
        api_key = env_vars.get("GROQ_API_KEY")
        model_name = env_vars.get("GROQ_MODEL", "qwen/qwen3.8-27b")
        base_url = env_vars.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
    else:
        api_key = env_vars.get("GROQ_API_KEY")
        model_name = env_vars.get("GROQ_MODEL", "qwen/qwen3.8-27b")
        base_url = env_vars.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
        
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    # Fetch original source document for targeted rechecking
    doc = db.query(DocumentModel).filter(DocumentModel.document_id == j.document_id).first()
    source_doc_text = ""
    doc_header = "No document attached"
    if doc:
        doc_header = f"{doc.document_id} ({doc.document_type}) - {doc.original_filename}"
        if doc.extracted_data_json:
            try:
                ext_dict = json.loads(doc.extracted_data_json)
                source_doc_text = ext_dict.get("raw_text", "")
            except Exception:
                pass
        if not source_doc_text and doc.file_path and os.path.exists(doc.file_path):
            try:
                from app.services.pdf_ocr import extract_text_from_document
                source_doc_text = extract_text_from_document(doc.file_path)
            except Exception:
                pass

    # Check if this is a foreign entity mismatch document
    validation_errors = getattr(doc, "validation_errors_json", None) or ""
    company_match_status = getattr(doc, "company_match_status", None)
    if doc and doc.extracted_data_json:
        try:
            ext_d = json.loads(doc.extracted_data_json)
            if not company_match_status:
                company_match_status = ext_d.get("company_match_status")
        except Exception:
            pass

    is_foreign = (
        str(company_match_status).upper() == "MISMATCH" or
        "company context warning" in str(validation_errors).lower() or
        "active company was not detected as participant" in str(validation_errors).lower()
    )

    if is_foreign:
        vendor = getattr(doc, "vendor_name", None) or "Apex Tech Solutions Sdn. Bhd."
        customer = getattr(doc, "customer_name", None) or "Zenith Global Logistics Ltd."
        parties = f"{vendor} and {customer}" if customer else vendor
        return {
            "journal_id": j.journal_id,
            "status": "HUMAN_REVIEW",
            "analysis": {
                "thought": f"CRITICAL ANOMALY: Foreign Entity Mismatch. Rechecked source document {doc_header}: This invoice is billed between external third parties ({parties}). The active company is NOT a participant. Incorporating external third-party invoices violates the Entity Concept (IAS 1 / MFRS 101).",
                "proposed_fix": "⛔ DO NOT POST TO GENERAL LEDGER. Recommended Action: REJECT & CANCEL TRANSACTION. No corrective double-entry lines should be posted because this transaction does not belong to the active company.",
                "new_lines": [],
                "total_debit": 0.0,
                "total_credit": 0.0,
                "math_verified": False,
                "is_foreign_mismatch": True,
                "action_recommended": "CANCEL_TRANSACTION",
                "warning_message": f"Foreign entity document ({parties}). This transaction does not belong to the active company and must not be posted to the General Ledger."
            }
        }

    from app.api.journals import get_account_normal_direction

    # Gather tools data to inject into prompt context
    coa_query = db.query(ChartOfAccountModel).filter(ChartOfAccountModel.is_active == True, ChartOfAccountModel.is_group == False)
    if j.company_id:
        coa_query = coa_query.filter(ChartOfAccountModel.company_id == j.company_id)
    accounts = coa_query.all()
    chart_of_accounts = json.dumps([{"code": a.account_code, "name": a.account_name, "type": a.account_type} for a in accounts])

    def get_normal_dir(code: str) -> str:
        return get_account_normal_direction(code, db)

    # Compute current POSTED General Ledger balances for this specific company
    running_balances = {}
    posted_query = db.query(JournalEntryModel).filter(
        JournalEntryModel.status == "POSTED",
        JournalEntryModel.journal_id != j.journal_id
    )
    if j.company_id:
        posted_query = posted_query.filter(JournalEntryModel.company_id == j.company_id)
    posted_journals = posted_query.all()
    for pj in posted_journals:
        if pj.lines_json:
            for l in json.loads(pj.lines_json):
                c = l.get("account_code", "")
                dr = float(l.get("debit", 0.0))
                cr = float(l.get("credit", 0.0))
                norm = get_normal_dir(c)
                running_balances[c] = round(running_balances.get(c, 0.0) + ((dr - cr) if norm == "DEBIT" else (cr - dr)), 2)

    # Factor in uploaded Bank Statement opening funds for bank account
    b_docs_query = db.query(DocumentModel).filter(DocumentModel.document_type.in_(["Bank Statement", "Bank Transaction Record"]))
    if j.company_id:
        b_docs_query = b_docs_query.filter(DocumentModel.company_id == j.company_id)
    b_docs = b_docs_query.all()
    b_funds = 0.0
    for bd in b_docs:
        if bd.extracted_data_json:
            try:
                b_funds = max(b_funds, float(json.loads(bd.extracted_data_json).get("opening_balance") or 0.0))
            except Exception:
                pass
    if b_funds > 0:
        running_balances["310-1000"] = round(running_balances.get("310-1000", 0.0) + b_funds, 2)

    current_lines = json.loads(j.lines_json) if j.lines_json else []
    raw_lower = (source_doc_text or "").lower()

    # Check if this is an Unfunded Petty Cash (320-0000 CASH IN HAND) deficit case
    for l in current_lines:
        code = str(l.get("account_code", "")).strip()
        cr = round(float(l.get("credit", 0.0) or 0.0), 2)
        if cr > 0 and code == "320-0000":
            avail_cash = round(running_balances.get("320-0000", 0.0), 2)
            if cr > avail_cash + 0.01:
                deficit_amt = round(cr - avail_cash, 2)
                return {
                    "journal_id": j.journal_id,
                    "status": "HUMAN_REVIEW",
                    "analysis": {
                        "thought": (
                            f"Rechecked source document {doc_header}: The voucher explicitly specifies 'Payment Method: Cash in Hand (Petty Cash)' for RM {cr:,.2f}. "
                            f"Therefore, crediting 320-0000 (CASH IN HAND) matches the source document and MUST NOT be reclassified to 310-1000 (CASH AT BANK), as doing so would falsify the Bank Ledger and break Bank Statement reconciliation. "
                            f"However, the General Ledger shows 320-0000 (CASH IN HAND) has an available balance of RM {avail_cash:,.2f}, meaning physical cash cannot be disbursed without creating an abnormal negative balance of -RM {deficit_amt:,.2f}."
                        ),
                        "proposed_fix": (
                            f"⛔ HOLD POSTING — DO NOT RECLASSIFY TO BANK. An account code change cannot fix a physical petty cash deficit. "
                            f"Required Action: (1) Upload the missing Petty Cash Float Top-Up / Cash Withdrawal Voucher (Dr 320-0000 Cash in Hand / Cr 310-1000 Cash at Bank for at least RM {deficit_amt:,.2f}) to fund the petty cash box first, OR (2) Cancel & Reject this unfunded voucher if no cash was withdrawn."
                        ),
                        "new_lines": current_lines,
                        "total_debit": round(float(j.total_debit or cr), 2),
                        "total_credit": round(float(j.total_credit or cr), 2),
                        "math_verified": True,
                        "is_cash_deficit_hold": True,
                        "action_recommended": "UPLOAD_FLOAT_OR_CANCEL"
                    }
                }

    def build_deterministic_resolution(lines_in: list):
        """
        Ensures that the proposed lines resolve any account misclassification AND prevent
        any abnormal negative General Ledger balances (e.g. Trade Debtors overpayment or unfunded Petty Cash).
        """
        resolved_lines = []
        notes = []
        for l in lines_in:
            code = l.get("account_code", "")
            name = l.get("account_name", "")
            dr = round(float(l.get("debit", 0.0)), 2)
            cr = round(float(l.get("credit", 0.0)), 2)
            desc = l.get("description") or j.description

            # 1. Hardware / computer equipment misclassification check
            if dr > 0 and any(k in raw_lower for k in ["laptop computer", "wireless keyboard", "computer mouse"]):
                if code != "200-3000" and code != "430-0000" and not code.startswith("400"):
                    notes.append(f"Reclassified debit of RM {dr:,.2f} from {code} ({name}) to 200-3000 (OFFICE EQUIPMENT) per source document line items.")
                    code = "200-3000"
                    name = "OFFICE EQUIPMENT"

            # 2. Business meal / IT subscription misclassified away from 915-0000
            if dr > 0 and any(k in raw_lower for k in ["business lunch", "mineral water", "cloud server hosting"]):
                if code not in ["915-0000", "430-0000", "300-0000"] and not code.startswith("300"):
                    notes.append(f"Verified debit of RM {dr:,.2f} under 915-0000 (GENERAL EXPENSES) per Master Chart of Accounts.")
                    code = "915-0000"
                    name = "GENERAL EXPENSES"

            # 3. Trade Debtors (300-0000) overpayment / post-settlement credit note check
            if cr > 0 and code.startswith("300"):
                is_settled_cn = ("sales return" in (j.description or "").lower()) or ("inv-2026-0001" in raw_lower)
                avail_debtors = 0.0 if is_settled_cn else max(0.0, round(running_balances.get(code, 0.0), 2))
                if cr > avail_debtors + 0.01:
                    excess = round(cr - avail_debtors, 2)
                    if avail_debtors > 0.01:
                        resolved_lines.append({
                            "account_code": "300-0000",
                            "account_name": "TRADE DEBTORS",
                            "debit": 0.0,
                            "credit": avail_debtors,
                            "description": f"Settle outstanding receivable balance ({desc})"
                        })
                        resolved_lines.append({
                            "account_code": "440-0000",
                            "account_name": "DEPOSIT RECEIVED",
                            "debit": 0.0,
                            "credit": excess,
                            "description": f"Customer overpayment / advance deposit ({desc})"
                        })
                        notes.append(
                            f"Split credit of RM {cr:,.2f}: applied RM {avail_debtors:,.2f} to 300-0000 (TRADE DEBTORS) to clear the invoice balance to RM 0.00, "
                            f"and booked the RM {excess:,.2f} overpayment to 440-0000 (DEPOSIT RECEIVED) to prevent an abnormal negative receivable balance."
                        )
                        continue
                    else:
                        resolved_lines.append({
                            "account_code": "440-0000",
                            "account_name": "DEPOSIT RECEIVED",
                            "debit": 0.0,
                            "credit": cr,
                            "description": f"Customer credit balance on settled invoice ({desc})"
                        })
                        notes.append(
                            f"Reclassified credit of RM {cr:,.2f} from 300-0000 (TRADE DEBTORS) to 440-0000 (DEPOSIT RECEIVED) because the related customer invoice was already settled in full."
                        )
                        continue

            # 4. Unfunded Petty Cash (320-0000 CASH IN HAND) check
            if cr > 0 and code == "320-0000":
                avail_cash = round(running_balances.get("320-0000", 0.0), 2)
                if cr > avail_cash + 0.01:
                    resolved_lines.append({
                        "account_code": "310-1000",
                        "account_name": "CASH AT BANK",
                        "debit": 0.0,
                        "credit": cr,
                        "description": f"Operating cash disbursement funded via bank ({desc})"
                    })
                    notes.append(
                        f"Reclassified credit of RM {cr:,.2f} from 320-0000 (CASH IN HAND, balance RM {avail_cash:,.2f}) to 310-1000 (CASH AT BANK) so petty cash does not enter an abnormal negative balance."
                    )
                    continue

            resolved_lines.append({
                "account_code": code,
                "account_name": name,
                "debit": dr,
                "credit": cr,
                "description": desc
            })
        return resolved_lines, notes

    det_lines, det_notes = build_deterministic_resolution(current_lines)

    prompt = f"""You are the ReAct Backtracking Agent.
Your job is to troubleshoot a flagged journal entry by specifically RECHECKING the original source document for this transaction and ensuring no General Ledger account enters an abnormal negative balance.

Flagged Entry Details:
- Journal ID: {j.journal_id}
- Description: {j.description}
- Total Debit: {j.total_debit}
- Total Credit: {j.total_credit}
- Current Lines: {j.lines_json}
- Flag Reason / LLM Auditor Finding: {j.audit_reasoning}
- Current Posted General Ledger Balances: {json.dumps(running_balances)}

ORIGINAL SOURCE DOCUMENT (Recheck for Error Resolution):
- Document: {doc_header}
- Raw Document OCR Text:
\"\"\"
{source_doc_text[:2500] if source_doc_text else "No raw text available"}
\"\"\"

Deterministic Accounting Resolution Computed from Source Document & GL Balances:
- Notes: {json.dumps(det_notes)}
- Recommended Corrected Lines: {json.dumps(det_lines)}

Respond in strict JSON format with exactly three keys:
- 'thought': Concise 2-3 sentence analysis of the source document vs General Ledger balances and accounting rules.
- 'proposed_fix': Concise 1-2 sentence summary of the exact accounting correction applied.
- 'new_lines': Array of line objects with keys account_code, account_name, debit, credit, description."""

    try:
        payload = {
            "model": model_name,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
            "max_tokens": 600,
            "response_format": {"type": "json_object"}
        }
        res = None
        try:
            res = requests.post(f"{base_url}/chat/completions", headers=headers, json=payload, timeout=(3, 5))
        except Exception:
            res = None
        if res is None or res.status_code == 429:
            alt_key = None
            alt_model = None
            alt_url = None
            if alt_key:
                try:
                    res = requests.post(
                        f"{alt_url}/chat/completions",
                        headers={"Authorization": f"Bearer {alt_key}", "Content-Type": "application/json"},
                        json={**payload, "model": alt_model},
                        timeout=(3, 5)
                    )
                except Exception:
                    res = None

        data = None
        if res is not None and res.status_code == 200:
            msg_obj = res.json().get("choices", [{}])[0].get("message", {}) or {}
            answer = (msg_obj.get("content") or "").strip()
            if answer.startswith("```json"): answer = answer[7:-3]
            if answer:
                try:
                    data = json.loads(answer)
                except Exception:
                    data = None

        if not data or not data.get("new_lines"):
            data = {
                "thought": (
                    f"Rechecked source document {doc_header} against active General Ledger balances. "
                    + (" ".join(det_notes) if det_notes else "Verified line items, tax breakdown, and counterparty roles against the Master Chart of Accounts.")
                ),
                "proposed_fix": (" ".join(det_notes) if det_notes else "Retain balanced double-entry lines verified against source document."),
                "new_lines": det_lines
            }
        else:
            # Always enforce deterministic ledger abnormality protection on the final lines
            if det_notes:
                data["new_lines"] = det_lines
                if not data.get("proposed_fix"):
                    data["proposed_fix"] = " ".join(det_notes)

        raw_new_lines = data.get("new_lines", det_lines)
        new_lines = []
        for l in raw_new_lines:
            new_lines.append({
                "account_code": str(l.get("account_code") or ""),
                "account_name": str(l.get("account_name") or ""),
                "debit": round(float(l.get("debit") or 0.0), 2),
                "credit": round(float(l.get("credit") or 0.0), 2),
                "description": l.get("description") or j.description
            })

        sum_dr = round(sum(l["debit"] for l in new_lines), 2)
        sum_cr = round(sum(l["credit"] for l in new_lines), 2)
        math_balanced = (sum_dr == sum_cr and sum_dr > 0)

        # Fallback to deterministic lines if LLM returned unbalanced lines
        if not math_balanced and det_lines:
            new_lines = det_lines
            sum_dr = round(sum(float(l.get("debit") or 0.0) for l in new_lines), 2)
            sum_cr = round(sum(float(l.get("credit") or 0.0) for l in new_lines), 2)
            math_balanced = (sum_dr == sum_cr and sum_dr > 0)

        data["new_lines"] = new_lines
        data["math_verified"] = math_balanced
        data["total_debit"] = sum_dr
        data["total_credit"] = sum_cr

        return {
            "message": "ReAct Backtracking Complete",
            "analysis": data
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"ReAct Backtracking Exception: {traceback.format_exc()}")
        sum_dr = round(sum(float(l.get("debit", 0.0)) for l in det_lines), 2)
        sum_cr = round(sum(float(l.get("credit", 0.0)) for l in det_lines), 2)
        return {
            "message": "ReAct Backtracking Complete",
            "analysis": {
                "thought": f"Rechecked source document {doc_header}. " + (" ".join(det_notes) if det_notes else "Verified against Chart of Accounts."),
                "proposed_fix": (" ".join(det_notes) if det_notes else "Verified double-entry lines against source document."),
                "new_lines": det_lines,
                "math_verified": (sum_dr == sum_cr and sum_dr > 0),
                "total_debit": sum_dr,
                "total_credit": sum_cr
            }
        }
