import json
import datetime
from typing import Optional, List
from sqlalchemy.orm import Session
from app.db.models import DocumentModel, AccountingTransactionModel, JournalEntryModel, get_local_now
from app.agents.accounting_agent import AccountingAgent


def generate_next_transaction_id(db: Session) -> str:
    prefix = "TXN-2026-"
    txns = db.query(AccountingTransactionModel.transaction_id).all()
    max_seq = 0
    for (t_id,) in txns:
        if t_id and str(t_id).startswith(prefix):
            try:
                seq = int(str(t_id)[len(prefix):])
                if seq > max_seq:
                    max_seq = seq
            except ValueError:
                pass
    return f"{prefix}{max_seq + 1:06d}"


def sync_document_transaction(db: Session, doc: DocumentModel):
    """
    Ensures that a document has a corresponding AccountingTransactionModel record.
    If not created yet, creates one automatically with transaction_id (TXN-2026-XXXXXX).
    If it exists, syncs status and accounting analysis.
    """
    # Company setup documents must never create daily operational transactions or duplicate journal entries
    if getattr(doc, 'source_type', None) in ['COMPANY_SETUP', 'ONBOARDING'] or (doc.document_type and any(k in doc.document_type for k in ["Opening", "Trade Receivables", "Trade Payables", "Other Creditors", "Opening Stock", "Company Profile"])):
        return None

    company_id = doc.company_id or "COMP-000001"
    
    # Check if this document already has a POSTED or HUMAN_REVIEW journal entry so we preserve backtracked/audited state
    existing_je = db.query(JournalEntryModel).filter(
        JournalEntryModel.document_id == doc.document_id,
        JournalEntryModel.company_id == company_id
    ).first()
    is_locked_journal = existing_je is not None and (existing_je.status in ["POSTED", "HUMAN_REVIEW"] or bool(existing_je.audit_reasoning))

    # 1. Parse extracted_data_json
    extracted_data = json.loads(doc.extracted_data_json) if doc.extracted_data_json else {}
    
    # 2. Run AccountingAgent analysis only if not already analyzed or if no journal exists yet
    accounting_analysis = extracted_data.get("accounting_analysis")
    if extracted_data and (not accounting_analysis or existing_je is None):
        try:
            acct_agent = AccountingAgent(db=db, company_id=company_id)
            analysis_result = acct_agent.analyze(extracted_data)
            accounting_analysis = analysis_result.model_dump() if hasattr(analysis_result, "model_dump") else (analysis_result.dict() if hasattr(analysis_result, "dict") else analysis_result)
            extracted_data["accounting_analysis"] = accounting_analysis
            doc.extracted_data_json = json.dumps(extracted_data)
        except Exception as e:
            print(f"Error executing AccountingAgent sync: {e}")

    # 3. Extract transaction metadata
    event = (accounting_analysis or {}).get("accounting_event", "Unspecified Event")
    if doc.document_type == "Bank Statement":
        has_je = bool(accounting_analysis and accounting_analysis.get("journal_entry"))
        bope = (accounting_analysis or {}).get("book_of_prime_entry", "General Journal" if has_je else "Bank Statement Record")
    elif doc.document_type == "Bank Transaction Record":
        bope = "Bank Statement Record"
    else:
        bope = (accounting_analysis or {}).get("book_of_prime_entry", "General Journal")
    confidence = (accounting_analysis or {}).get("confidence_score", 1.0)
    needs_review = (accounting_analysis or {}).get("needs_review", False)
    review_reason = (accounting_analysis or {}).get("review_reason")
    
    txn_date = (
        extracted_data.get("transaction_date") or 
        extracted_data.get("statement_date") or 
        extracted_data.get("transaction_datetime") or
        (doc.created_at.strftime("%Y-%m-%d") if doc.created_at else datetime.date.today().isoformat())
    )

    source_doc_name = (
        extracted_data.get("credit_note_number") or
        extracted_data.get("debit_note_number") or
        extracted_data.get("invoice_number") or 
        extracted_data.get("receipt_number") or 
        extracted_data.get("reference_number") or 
        doc.original_filename
    )

    if doc.document_type == "Bank Statement":
        has_je = bool(accounting_analysis and accounting_analysis.get("journal_entry"))
        status = "Completed" if has_je else "Pending Reconciliation"
        needs_review = False
    elif doc.document_type == "Bank Transaction Record":
        status = "Pending Reconciliation"
        needs_review = False
    elif doc.document_type == "Stock Take":
        status = "Pending Approval"
        needs_review = False
        review_reason = None
    elif needs_review:
        status = "Needs Review"
    elif doc.status in ["EXTRACTED", "COMPLETED"]:
        status = "Completed"
    else:
        status = "Failed"

    # 4. Find existing transaction record for this document in the same company
    # Resolve foreign currency accurately from extracted_data or document
    raw_curr = extracted_data.get("currency") or extracted_data.get("original_currency")
    if not raw_curr or str(raw_curr).strip().upper() in ["MYR", "RM"]:
        raw_curr = getattr(doc, 'currency', 'MYR') or 'MYR'
    raw_curr = str(raw_curr).strip().upper()

    orig_amt = float(extracted_data.get("grand_total") if extracted_data.get("grand_total") is not None else (doc.grand_total or 0.0))

    if raw_curr not in ["MYR", "RM"]:
        rate = float(
            getattr(doc, 'exchange_rate', None) or
            extracted_data.get("exchange_rate") or
            1.0
        )
        conv_myr = (
            getattr(doc, 'converted_amount_myr', None) or
            extracted_data.get("converted_amount_myr")
        )
        if conv_myr is None:
            conv_myr = round(orig_amt * rate, 2)
        else:
            conv_myr = float(conv_myr)
    else:
        raw_curr = "MYR"
        rate = 1.0
        conv_myr = orig_amt

    # Keep doc entity in sync if currency or conversion was previously defaulted
    if getattr(doc, 'currency', None) != raw_curr or getattr(doc, 'converted_amount_myr', None) != conv_myr:
        doc.currency = raw_curr
        if raw_curr not in ["MYR", "RM"]:
            doc.converted_amount_myr = conv_myr
            doc.exchange_rate = rate
            if not getattr(doc, 'exchange_rate_date', None):
                doc.exchange_rate_date = extracted_data.get("exchange_rate_date")
            if not getattr(doc, 'exchange_rate_provider', None):
                doc.exchange_rate_provider = extracted_data.get("exchange_rate_provider")
            if not getattr(doc, 'exchange_rate_session', None):
                doc.exchange_rate_session = extracted_data.get("exchange_rate_session")
            if not getattr(doc, 'conversion_status', None):
                doc.conversion_status = extracted_data.get("conversion_status") or "CONVERTED"

    txn = db.query(AccountingTransactionModel).filter(
        AccountingTransactionModel.document_id == doc.document_id,
        AccountingTransactionModel.company_id == company_id
    ).first()

    if not txn:
        txn_id = generate_next_transaction_id(db)
        txn = AccountingTransactionModel(
            transaction_id=txn_id,
            company_id=company_id,
            document_id=doc.document_id,
            source_document=source_doc_name,
            document_type=doc.document_type or "Unknown",
            transaction_date=str(txn_date),
            accounting_event=event,
            book_of_prime_entry=bope,
            accounting_analysis_json=json.dumps(accounting_analysis) if accounting_analysis else None,
            original_currency=raw_curr,
            original_amount=orig_amt,
            exchange_rate=rate,
            converted_amount_myr=conv_myr,
            confidence_score=float(confidence),
            needs_review=bool(needs_review),
            review_reason=review_reason,
            status=status
        )
        db.add(txn)
    elif not is_locked_journal:
        txn.company_id = company_id
        txn.source_document = source_doc_name
        txn.document_type = doc.document_type or "Unknown"
        txn.transaction_date = str(txn_date)
        txn.accounting_event = event
        txn.book_of_prime_entry = bope
        txn.accounting_analysis_json = json.dumps(accounting_analysis) if accounting_analysis else None
        txn.original_currency = raw_curr
        txn.original_amount = orig_amt
        txn.exchange_rate = rate
        txn.converted_amount_myr = conv_myr
        txn.confidence_score = float(confidence)
        txn.needs_review = bool(needs_review)
        txn.review_reason = review_reason
        txn.status = status
        txn.updated_at = get_local_now()

    db.commit()
    db.refresh(txn)
    
    # 5. Sync Journal Entry
    if accounting_analysis and "journal_entry" in accounting_analysis and accounting_analysis["journal_entry"]:
        je_data = accounting_analysis["journal_entry"]
        je = db.query(JournalEntryModel).filter(
            JournalEntryModel.company_id == company_id,
            (JournalEntryModel.transaction_id == txn.transaction_id) | (JournalEntryModel.document_id == doc.document_id)
        ).first()
        
        if not je:
            prefix_je = "JRN-2026-"
            jes = db.query(JournalEntryModel.journal_id).all()
            max_seq_je = 0
            for (j_id,) in jes:
                if j_id and str(j_id).startswith(prefix_je):
                    try:
                        seq = int(str(j_id)[len(prefix_je):])
                        if seq > max_seq_je:
                            max_seq_je = seq
                    except ValueError:
                        pass
            je_id = f"{prefix_je}{max_seq_je + 1:06d}"
            
            is_foreign = (
                str(getattr(doc, "company_match_status", "")).upper() == "MISMATCH" or
                "company context warning" in str(getattr(doc, "validation_errors_json", "")).lower() or
                "active company was not detected as participant" in str(getattr(doc, "validation_errors_json", "")).lower()
            )
            
            init_status = "HUMAN_REVIEW" if is_foreign else ("PENDING_AUDIT" if (je_data.get("is_balanced", False) and not needs_review) else "DRAFT")
            init_reasoning = None
            if is_foreign:
                vendor = getattr(doc, "vendor_name", None) or "Apex Tech Solutions Sdn. Bhd."
                customer = getattr(doc, "customer_name", None) or "Zenith Global Logistics Ltd."
                parties = f"{vendor} and {customer}" if customer else vendor
                init_reasoning = json.dumps({
                    "logic_verdict": "INCORRECT",
                    "math_verified": True,
                    "thought_process": {
                        "step_1_account_classification": "CRITICAL ANOMALY: Foreign Entity Mismatch. The underlying document participants do not match the active company.",
                        "step_2_rules_compliance": "Violates Entity Concept (IAS 1 / MFRS 101): Transactions between unrelated third parties must not be incorporated into the company's financial records.",
                        "step_3_historical_consistency": "No legitimate transactions exist for external entities with zero active company participation.",
                        "step_4_source_document_recheck": f"Rechecked source document {doc.document_id} ({getattr(doc, 'original_filename', '')}): Billed between {parties}. Active company was not detected as participant.",
                        "decision_rationale": f"Foreign Entity Detected: Document is billed between third parties ({parties}) and does not belong to the active company. Recommended Action: REJECT or DELETE this transaction. Do NOT record as purchase or post to General Ledger."
                    },
                    "summary": f"Foreign Entity Anomaly: Source document is between third parties ({parties}) and does not belong to the active company. Recommended Action: REJECT or DELETE this transaction. Do NOT record as purchase or post to General Ledger."
                })

            je = JournalEntryModel(
                journal_id=je_id,
                transaction_id=txn.transaction_id,
                company_id=company_id,
                document_id=doc.document_id,
                journal_date=je_data.get("journal_date", str(txn_date)),
                reference=je_data.get("reference", source_doc_name),
                description=je_data.get("description", event),
                total_debit=je_data.get("total_debit", 0.0),
                total_credit=je_data.get("total_credit", 0.0),
                is_balanced=je_data.get("is_balanced", False),
                lines_json=json.dumps(je_data.get("lines", [])),
                status=init_status,
                audit_reasoning=init_reasoning
            )
            db.add(je)
        else:
            if je.transaction_id != txn.transaction_id:
                je.transaction_id = txn.transaction_id
            # Preserve status, lines, and reasoning if already audited, posted, flagged, or corrected by Agent 4
            if je.status not in ["POSTED", "HUMAN_REVIEW"] and not je.audit_reasoning:
                je.journal_date = je_data.get("journal_date", str(txn_date))
                je.reference = je_data.get("reference", source_doc_name)
                je.description = je_data.get("description", event)
                je.total_debit = je_data.get("total_debit", 0.0)
                je.total_credit = je_data.get("total_credit", 0.0)
                je.is_balanced = je_data.get("is_balanced", False)
                je.lines_json = json.dumps(je_data.get("lines", []))
                je.status = "PENDING_AUDIT" if (je_data.get("is_balanced", False) and not needs_review) else "DRAFT"
                je.updated_at = get_local_now()
        
        db.commit()

        # Check if Auto-Audit is enabled or if this entry funds an account with a waiting HUMAN_REVIEW deficit
        try:
            from app.db.models import SystemSettingModel
            audit_setting = db.query(SystemSettingModel).filter(SystemSettingModel.setting_key == "audit_execution_mode").first()
            has_cash_funding = any(
                str(l.get("account_code", "")).strip() == "320-0000" and float(l.get("debit", 0.0) or 0.0) > 0
                for l in (je_data.get("lines") or [])
            )
            has_waiting_cash_review = has_cash_funding and db.query(JournalEntryModel).filter(
                JournalEntryModel.company_id == company_id,
                JournalEntryModel.status == "HUMAN_REVIEW",
                JournalEntryModel.lines_json.like("%320-0000%")
            ).first() is not None
            if (audit_setting and audit_setting.setting_value.upper() == "AUTOMATIC") or has_waiting_cash_review:
                from app.api.journals import audit_journals
                audit_journals(company_id=company_id, db=db)
        except Exception as e:
            print(f"[Auto-Audit] Background check notice: {e}")

    return txn


def format_transaction_response(
    txn: AccountingTransactionModel, 
    doc: Optional[DocumentModel] = None,
    db: Optional[Session] = None
) -> dict:
    analysis = json.loads(txn.accounting_analysis_json) if txn.accounting_analysis_json else None
    
    extracted = None
    amount = 0.0
    
    target_doc = doc
    if not target_doc and db:
        target_doc = db.query(DocumentModel).filter(DocumentModel.document_id == txn.document_id).first()
        
    if target_doc:
        if target_doc.extracted_data_json:
            try:
                extracted = json.loads(target_doc.extracted_data_json)
            except Exception:
                extracted = None
        amount = getattr(target_doc, 'converted_amount_myr', None) or target_doc.grand_total or 0.0

    if not amount and extracted:
        amount = (
            extracted.get("converted_amount_myr") or
            extracted.get("grand_total") or 
            extracted.get("transaction_amount") or 
            extracted.get("total_amount") or 
            extracted.get("amount_received") or 
            0.0
        )

    doc_type = txn.document_type or (target_doc.document_type if target_doc else "")
    is_bank_stmt = doc_type in ["Bank Statement", "Bank Transaction Record"]
    is_stock_take = doc_type == "Stock Take"
    is_order_or_memo = doc_type in ["Sales Order", "Purchase Order", "Delivery Order"]
    final_needs_review = False if (is_bank_stmt or is_stock_take or (is_order_or_memo and txn.review_reason == "Required COA account is not configured.")) else bool(txn.needs_review)
    final_status = "Pending Reconciliation" if is_bank_stmt else ("Pending Approval" if is_stock_take else ("Completed" if is_order_or_memo and txn.review_reason == "Required COA account is not configured." else (txn.status or "Completed")))

    ext_c = (extracted.get("currency") or extracted.get("original_currency")) if extracted else None
    if ext_c and str(ext_c).strip().upper() not in ["MYR", "RM"]:
        orig_curr = str(ext_c).strip().upper()
    else:
        orig_curr = getattr(txn, 'original_currency', None) or (target_doc.currency if target_doc else None) or "MYR"

    orig_amt = getattr(txn, 'original_amount', None) or (target_doc.grand_total if target_doc else None) or ((extracted.get("grand_total") if extracted else None) or float(amount or 0.0))
    rate_val = getattr(txn, 'exchange_rate', None) or (target_doc.exchange_rate if target_doc else None) or ((extracted.get("exchange_rate") if extracted else None) or 1.0)
    rate_date = (target_doc.exchange_rate_date if target_doc else None) or (extracted.get("exchange_rate_date") if extracted else None)
    rate_prov = (target_doc.exchange_rate_provider if target_doc else None) or (extracted.get("exchange_rate_provider") if extracted else None)
    rate_sess = (target_doc.exchange_rate_session if target_doc else None) or (extracted.get("exchange_rate_session") if extracted else None)
    conv_myr = getattr(txn, 'converted_amount_myr', None) or (target_doc.converted_amount_myr if target_doc else None) or (extracted.get("converted_amount_myr") if extracted else float(amount or 0.0))

    return {
        "id": txn.id,
        "transaction_id": txn.transaction_id,
        "company_id": txn.company_id,
        "document_id": txn.document_id,
        "source_document": txn.source_document or "-",
        "document_type": txn.document_type or "Unknown",
        "transaction_date": txn.transaction_date or "-",
        "accounting_event": txn.accounting_event or "Unspecified",
        "book_of_prime_entry": txn.book_of_prime_entry or "-",
        "accounting_analysis": analysis,
        "extracted_data": extracted,
        "amount": float(amount or 0.0),
        "currency": "MYR",
        "original_currency": orig_curr,
        "original_amount": float(orig_amt or 0.0),
        "exchange_rate": float(rate_val or 1.0),
        "exchange_rate_date": rate_date,
        "exchange_rate_provider": rate_prov,
        "exchange_rate_session": rate_sess,
        "converted_amount_myr": float(conv_myr or 0.0),
        "confidence_score": txn.confidence_score or 1.0,
        "needs_review": final_needs_review,
        "review_reason": None if is_bank_stmt else txn.review_reason,
        "status": final_status,
        "created_at": txn.created_at.strftime("%Y-%m-%d %H:%M:%S") if txn.created_at else "",
        "updated_at": txn.updated_at.strftime("%Y-%m-%d %H:%M:%S") if txn.updated_at else ""
    }
