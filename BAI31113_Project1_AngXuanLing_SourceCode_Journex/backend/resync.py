import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db.database import SessionLocal
from app.db.models import DocumentModel, JournalEntryModel
from app.services.transaction_service import sync_document_transaction

db = SessionLocal()
docs = db.query(DocumentModel).all()
print(f"Found {len(docs)} documents. Re-syncing...")

for doc in docs:
    sync_document_transaction(db, doc)

journals = db.query(JournalEntryModel).all()
print(f"Generated {len(journals)} journal entries.")

for je in journals:
    print(f"{je.journal_id} - {je.journal_date} - {je.description} | Dr {je.total_debit} Cr {je.total_credit} | Balanced: {je.is_balanced} | Status: {je.status}")

db.close()
