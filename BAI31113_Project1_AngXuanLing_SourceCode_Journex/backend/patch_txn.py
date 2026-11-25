import re

with open(r'c:\Users\User\Documents\FYP - AI Agentic Accounting v3\backend\app\services\transaction_service.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
import_stmt = "from app.db.models import DocumentModel, AccountingTransactionModel, JournalEntryModel, get_local_now\n"
content = content.replace("from app.db.models import DocumentModel, AccountingTransactionModel, get_local_now\n", import_stmt)

# Add journal sync logic
journal_logic = """    db.commit()
    db.refresh(txn)
    
    # 5. Sync Journal Entry
    if accounting_analysis and "journal_entry" in accounting_analysis and accounting_analysis["journal_entry"]:
        je_data = accounting_analysis["journal_entry"]
        je = db.query(JournalEntryModel).filter(JournalEntryModel.transaction_id == txn.transaction_id).first()
        
        if not je:
            count_je = db.query(JournalEntryModel).count() + 1
            je_id = f"JRN-2026-{count_je:06d}"
            
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
                status="POSTED" if (je_data.get("is_balanced", False) and not needs_review) else "DRAFT"
            )
            db.add(je)
        else:
            je.journal_date = je_data.get("journal_date", str(txn_date))
            je.reference = je_data.get("reference", source_doc_name)
            je.description = je_data.get("description", event)
            je.total_debit = je_data.get("total_debit", 0.0)
            je.total_credit = je_data.get("total_credit", 0.0)
            je.is_balanced = je_data.get("is_balanced", False)
            je.lines_json = json.dumps(je_data.get("lines", []))
            je.status = "POSTED" if (je_data.get("is_balanced", False) and not needs_review) else "DRAFT"
            je.updated_at = get_local_now()
        
        db.commit()

    return txn"""

content = content.replace("    db.commit()\n    db.refresh(txn)\n    return txn", journal_logic)

with open(r'c:\Users\User\Documents\FYP - AI Agentic Accounting v3\backend\app\services\transaction_service.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched transaction_service.py")
