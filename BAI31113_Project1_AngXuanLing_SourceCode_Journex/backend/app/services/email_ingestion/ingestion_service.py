"""
Gmail Attachment Ingestion Service.
Orchestrates:
1. Email classification check.
2. Source email metadata tracking.
3. Attachment validation, duplicate detection, and file storage.
4. Calling the existing DocumentProcessingAgent, ID generator, and transaction synchronizer.
"""

import os
import json
import shutil
import hashlib
import tempfile
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.config import DOCUMENTS_DIR
from app.api.documents import _generate_next_doc_id
from app.db.models import (
    DocumentModel,
    CompanyModel,
    EmailSourceModel,
    EmailAttachmentModel,
    get_local_now,
)
from app.services.pdf_ocr import extract_text_from_document
from app.services.document_agent import (
    DocumentProcessingAgent,
    generate_duplicate_key,
)
from app.agents.accounting_agent import AccountingAgent
from app.services.transaction_service import sync_document_transaction
from app.services.email_ingestion.email_classifier import (
    EmailClassifier,
    EmailClassification,
)
from app.services.email_ingestion.duplicate_detector import (
    DuplicateDetector,
    compute_content_hash,
)
from app.services.email_ingestion.gmail_client import GmailClient

# Supported file extensions for document processing
SUPPORTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"]

# Default maximum attachment size: 25 MB
DEFAULT_MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024


def is_valid_file_signature(data: bytes, ext: str) -> bool:
    """Validates file magic bytes against extension."""
    if not data or len(data) == 0:
        return False
    if ext == ".pdf":
        return data.startswith(b"%PDF")
    elif ext in [".jpg", ".jpeg"]:
        return data.startswith(b"\xff\xd8\xff")
    elif ext == ".png":
        return data.startswith(b"\x89PNG")
    return False


class GmailIngestionService:
    """
    Ingests eligible email attachments from Gmail into the existing document pipeline.
    """

    def __init__(
        self,
        db: Session,
        company_id: Optional[str] = None,
        gmail_client: Optional[GmailClient] = None,
        max_attachment_size: int = DEFAULT_MAX_ATTACHMENT_SIZE,
    ):
        self.db = db
        self.gmail_client = gmail_client or GmailClient()
        self.max_attachment_size = max_attachment_size
        self.classifier = EmailClassifier()

        # Resolve active company context
        comp = None
        if company_id:
            comp = self.db.query(CompanyModel).filter(CompanyModel.company_id == company_id).first()
        if not comp:
            comp = self.db.query(CompanyModel).order_by(CompanyModel.id.desc()).first()

        self.company_context = {
            "company_id": comp.company_id if comp else "COMP-000001",
            "company_name": comp.company_name if comp else "NextTech Solutions Sdn Bhd",
        }

    def process_email(self, email_detail: Dict[str, Any]) -> Dict[str, Any]:
        """
        Processes a single email:
        1. Checks for duplicate message ID.
        2. Classifies the email.
        3. If accounting-related, inspects and ingests eligible attachments.
        4. Preserves complete audit trail in source_emails and email_attachments.
        """
        message_id = str(email_detail.get("message_id", "")).strip()
        if not message_id:
            return {
                "status": "ERROR",
                "reason": "Missing Gmail message ID",
                "attachments_processed": 0,
                "attachments_skipped": 0,
                "errors_encountered": 1,
                "documents_created": [],
            }

        # 1. Duplicate Message ID Check
        existing_source = self.db.query(EmailSourceModel).filter(
            EmailSourceModel.gmail_message_id == message_id
        ).first()

        is_reprocessing = False
        if existing_source:
            if existing_source.ingestion_status == "RESET_FOR_REPROCESSING":
                is_reprocessing = True
                source_email = existing_source
                # Clear existing attachment records so fresh attachments can be ingested
                self.db.query(EmailAttachmentModel).filter(
                    EmailAttachmentModel.email_source_id == source_email.id
                ).delete()
                self.db.commit()
            else:
                return {
                    "status": "DUPLICATE_MESSAGE_SKIPPED",
                    "message_id": message_id,
                    "source_email_id": existing_source.id,
                    "reason": f"Message ID '{message_id}' was already processed with status '{existing_source.ingestion_status}'.",
                    "attachments_processed": 0,
                    "attachments_skipped": 0,
                    "errors_encountered": 0,
                    "documents_created": [],
                }

        # 2. Rule-based Email Classification
        attachments_meta = email_detail.get("attachments", [])
        classification_res = self.classifier.classify(
            subject=email_detail.get("subject"),
            snippet=email_detail.get("snippet"),
            sender_email=email_detail.get("sender_email"),
            sender_name=email_detail.get("sender_name"),
            attachments=attachments_meta,
        )

        now_time = get_local_now()
        if not is_reprocessing:
            source_email = EmailSourceModel(
                company_id=self.company_context["company_id"],
                gmail_message_id=message_id,
                thread_id=email_detail.get("thread_id"),
                sender_email=email_detail.get("sender_email"),
                sender_name=email_detail.get("sender_name"),
                subject=email_detail.get("subject"),
                snippet=email_detail.get("snippet"),
                received_at=str(email_detail.get("received_at") or ""),
                classification=classification_res.classification.value,
                classification_reasons=json.dumps(classification_res.reasons),
                ingestion_status="PENDING",
                attachment_count=len(attachments_meta),
                created_at=now_time,
                updated_at=now_time,
            )
            self.db.add(source_email)
            self.db.commit()
            self.db.refresh(source_email)
        else:
            source_email.company_id = self.company_context["company_id"]
            source_email.thread_id = email_detail.get("thread_id")
            source_email.sender_email = email_detail.get("sender_email")
            source_email.sender_name = email_detail.get("sender_name")
            source_email.subject = email_detail.get("subject")
            source_email.snippet = email_detail.get("snippet")
            source_email.received_at = str(email_detail.get("received_at") or "")
            source_email.classification = classification_res.classification.value
            source_email.classification_reasons = json.dumps(classification_res.reasons)
            source_email.ingestion_status = "PENDING"
            source_email.attachment_count = len(attachments_meta)
            source_email.updated_at = now_time
            self.db.commit()

        # 3. Handle UNRELATED
        if classification_res.classification == EmailClassification.UNRELATED:
            source_email.ingestion_status = "SKIPPED_UNRELATED"
            source_email.updated_at = get_local_now()
            self.db.commit()
            return {
                "status": "SKIPPED_UNRELATED",
                "message_id": message_id,
                "source_email_id": source_email.id,
                "classification": classification_res.classification.value,
                "reasons": classification_res.reasons,
                "attachments_processed": 0,
                "attachments_skipped": len(attachments_meta),
                "errors_encountered": 0,
                "documents_created": [],
            }

        # 4. Handle UNCERTAIN
        if classification_res.classification == EmailClassification.UNCERTAIN:
            source_email.ingestion_status = "DEFERRED_UNCERTAIN"
            source_email.updated_at = get_local_now()
            self.db.commit()
            return {
                "status": "DEFERRED_UNCERTAIN",
                "message_id": message_id,
                "source_email_id": source_email.id,
                "classification": classification_res.classification.value,
                "reasons": classification_res.reasons,
                "attachments_processed": 0,
                "attachments_skipped": len(attachments_meta),
                "errors_encountered": 0,
                "documents_created": [],
            }

        # 5. Process Attachments for ACCOUNTING_RELATED Email
        if not attachments_meta:
            source_email.ingestion_status = "NO_ATTACHMENTS"
            source_email.updated_at = get_local_now()
            self.db.commit()
            return {
                "status": "NO_ATTACHMENTS",
                "message_id": message_id,
                "source_email_id": source_email.id,
                "attachments_processed": 0,
                "attachments_skipped": 0,
                "errors_encountered": 0,
                "documents_created": [],
            }

        documents_created = []
        attachments_processed = 0
        attachments_skipped = 0
        errors_encountered = 0

        for att in attachments_meta:
            raw_filename = att.get("filename", "attachment")
            clean_filename = Path(raw_filename).name  # Prevent path traversal
            ext = Path(clean_filename).suffix.lower()
            mime_type = att.get("mime_type", "application/octet-stream")
            att_id = att.get("attachment_id", "")

            # A. Check Extension
            if ext not in SUPPORTED_EXTENSIONS:
                email_att = EmailAttachmentModel(
                    email_source_id=source_email.id,
                    gmail_message_id=message_id,
                    attachment_id=att_id,
                    filename=clean_filename,
                    file_type=ext.replace(".", ""),
                    mime_type=mime_type,
                    size_bytes=att.get("size_bytes", 0),
                    file_hash="",
                    status="UNSUPPORTED_SKIPPED",
                    error_message=f"Unsupported attachment extension '{ext}'. Only PDF, JPG, and PNG are allowed.",
                    created_at=get_local_now(),
                )
                self.db.add(email_att)
                self.db.commit()
                attachments_skipped += 1
                continue

            # B. Obtain Binary Data
            try:
                if "raw_bytes" in att and att["raw_bytes"] is not None:
                    file_bytes = att["raw_bytes"]
                else:
                    file_bytes = self.gmail_client.download_attachment_bytes(message_id, att_id)
            except Exception as e:
                email_att = EmailAttachmentModel(
                    email_source_id=source_email.id,
                    gmail_message_id=message_id,
                    attachment_id=att_id,
                    filename=clean_filename,
                    file_type=ext.replace(".", ""),
                    mime_type=mime_type,
                    size_bytes=0,
                    file_hash="",
                    status="DOWNLOAD_ERROR",
                    error_message=f"Failed to download attachment: {str(e)}",
                    created_at=get_local_now(),
                )
                self.db.add(email_att)
                self.db.commit()
                errors_encountered += 1
                continue

            # C. Check Empty Content
            if not file_bytes or len(file_bytes) == 0:
                email_att = EmailAttachmentModel(
                    email_source_id=source_email.id,
                    gmail_message_id=message_id,
                    attachment_id=att_id,
                    filename=clean_filename,
                    file_type=ext.replace(".", ""),
                    mime_type=mime_type,
                    size_bytes=0,
                    file_hash="",
                    status="EMPTY_SKIPPED",
                    error_message="Attachment is empty (0 bytes).",
                    created_at=get_local_now(),
                )
                self.db.add(email_att)
                self.db.commit()
                attachments_skipped += 1
                continue

            # D. Check Size Limit
            if len(file_bytes) > self.max_attachment_size:
                email_att = EmailAttachmentModel(
                    email_source_id=source_email.id,
                    gmail_message_id=message_id,
                    attachment_id=att_id,
                    filename=clean_filename,
                    file_type=ext.replace(".", ""),
                    mime_type=mime_type,
                    size_bytes=len(file_bytes),
                    file_hash="",
                    status="SIZE_EXCEEDED_SKIPPED",
                    error_message=f"Attachment size ({len(file_bytes)} bytes) exceeds maximum limit ({self.max_attachment_size} bytes).",
                    created_at=get_local_now(),
                )
                self.db.add(email_att)
                self.db.commit()
                attachments_skipped += 1
                continue

            # E. Content / Signature Validation
            if not is_valid_file_signature(file_bytes, ext):
                email_att = EmailAttachmentModel(
                    email_source_id=source_email.id,
                    gmail_message_id=message_id,
                    attachment_id=att_id,
                    filename=clean_filename,
                    file_type=ext.replace(".", ""),
                    mime_type=mime_type,
                    size_bytes=len(file_bytes),
                    file_hash="",
                    status="INVALID_CONTENT_SKIPPED",
                    error_message=f"File content does not match expected {ext.upper()} magic byte signature.",
                    created_at=get_local_now(),
                )
                self.db.add(email_att)
                self.db.commit()
                attachments_skipped += 1
                continue

            # F. Calculate SHA-256 Hash
            file_hash = compute_content_hash(file_bytes)

            # G. Check Duplicate Hash in Persistent Database
            existing_doc = self.db.query(DocumentModel).filter(
                DocumentModel.company_id == self.company_context["company_id"],
                DocumentModel.file_hash == file_hash,
            ).first()

            if existing_doc:
                email_att = EmailAttachmentModel(
                    email_source_id=source_email.id,
                    gmail_message_id=message_id,
                    attachment_id=att_id,
                    filename=clean_filename,
                    file_type=ext.replace(".", ""),
                    mime_type=mime_type,
                    size_bytes=len(file_bytes),
                    file_hash=file_hash,
                    document_id=existing_doc.document_id,
                    status="DUPLICATE_SKIPPED",
                    error_message=f"Identical attachment content already processed as {existing_doc.document_id}.",
                    created_at=get_local_now(),
                )
                self.db.add(email_att)
                self.db.commit()
                attachments_skipped += 1
                continue

            # Check if this exact hash was already processed from another email attachment
            existing_email_att = self.db.query(EmailAttachmentModel).filter(
                EmailAttachmentModel.file_hash == file_hash,
                EmailAttachmentModel.document_id.isnot(None),
            ).first()

            if existing_email_att:
                email_att = EmailAttachmentModel(
                    email_source_id=source_email.id,
                    gmail_message_id=message_id,
                    attachment_id=att_id,
                    filename=clean_filename,
                    file_type=ext.replace(".", ""),
                    mime_type=mime_type,
                    size_bytes=len(file_bytes),
                    file_hash=file_hash,
                    document_id=existing_email_att.document_id,
                    status="DUPLICATE_SKIPPED",
                    error_message=f"Identical attachment content arrived in previous email '{existing_email_att.gmail_message_id}' (Document: {existing_email_att.document_id}).",
                    created_at=get_local_now(),
                )
                self.db.add(email_att)
                self.db.commit()
                attachments_skipped += 1
                continue

            # H. Pass Eligible Attachment to Existing Document Processing Pipeline
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            temp_file_path = temp_file.name
            try:
                temp_file.write(file_bytes)
                temp_file.close()

                # Text Extraction using existing pdf_ocr
                raw_text = extract_text_from_document(temp_file_path)

                # Processing Agent using existing DocumentProcessingAgent
                doc_agent = DocumentProcessingAgent(company_context=self.company_context)
                structured_data, passed, val_messages = doc_agent.process_document(
                    "TEMP_DOC", raw_text, clean_filename
                )

                # Duplicate Key Check within company context
                dup_key, dup_label, dup_val = generate_duplicate_key(
                    self.company_context["company_id"],
                    structured_data.document_type,
                    structured_data.dict(),
                )

                if dup_key:
                    existing_key_doc = self.db.query(DocumentModel).filter(
                        DocumentModel.company_id == self.company_context["company_id"],
                        DocumentModel.duplicate_key == dup_key,
                    ).first()

                    if existing_key_doc:
                        email_att = EmailAttachmentModel(
                            email_source_id=source_email.id,
                            gmail_message_id=message_id,
                            attachment_id=att_id,
                            filename=clean_filename,
                            file_type=ext.replace(".", ""),
                            mime_type=mime_type,
                            size_bytes=len(file_bytes),
                            file_hash=file_hash,
                            document_id=existing_key_doc.document_id,
                            status="DUPLICATE_KEY_SKIPPED",
                            error_message=f"Semantic duplicate key ({dup_key}) matched existing document {existing_key_doc.document_id}.",
                            created_at=get_local_now(),
                        )
                        self.db.add(email_att)
                        self.db.commit()
                        attachments_skipped += 1
                        continue

                # Generate permanent System Document ID using existing function
                doc_id = _generate_next_doc_id(self.db)
                doc_folder = DOCUMENTS_DIR / doc_id
                doc_folder.mkdir(parents=True, exist_ok=True)
                saved_file_path = doc_folder / clean_filename
                shutil.copyfile(temp_file_path, saved_file_path)

                structured_data.document_id = doc_id

                # Trigger Accounting Agent analysis
                acct_agent = AccountingAgent(db=self.db, company_id=self.company_context["company_id"])
                analysis_result = acct_agent.analyze(structured_data)
                structured_data.accounting_analysis = analysis_result

                # Save extracted JSON to disk
                json_path = doc_folder / f"{doc_id}_extracted.json"
                with open(json_path, "w", encoding="utf-8") as f_json:
                    json.dump(structured_data.dict(), f_json, indent=2)

                # Save DocumentModel in DB
                db_now = get_local_now()
                db_doc = DocumentModel(
                    company_id=self.company_context["company_id"],
                    document_id=doc_id,
                    original_filename=clean_filename,
                    file_path=str(saved_file_path),
                    file_type=ext.replace(".", ""),
                    mime_type=mime_type,
                    status="EXTRACTED" if passed else "COMPLETED",
                    document_type=structured_data.document_type,
                    vendor_name=structured_data.vendor_name,
                    vendor_address=getattr(structured_data, "vendor_address", None),
                    currency=structured_data.currency or "MYR",
                    subtotal=getattr(structured_data, "subtotal", None),
                    discount=getattr(structured_data, "discount", None),
                    shipping=getattr(structured_data, "shipping", None),
                    tax_amount=getattr(structured_data, "tax_amount", None),
                    grand_total=structured_data.grand_total,
                    converted_amount_myr=getattr(structured_data, "converted_amount_myr", None),
                    subtotal_myr=getattr(structured_data, "subtotal_myr", None),
                    discount_myr=getattr(structured_data, "discount_myr", None),
                    shipping_myr=getattr(structured_data, "shipping_myr", None),
                    tax_amount_myr=getattr(structured_data, "tax_amount_myr", None),
                    exchange_rate=getattr(structured_data, "exchange_rate", None),
                    exchange_rate_date=getattr(structured_data, "exchange_rate_date", None),
                    exchange_rate_provider=getattr(structured_data, "exchange_rate_provider", None),
                    exchange_rate_session=getattr(structured_data, "exchange_rate_session", None),
                    conversion_status=getattr(structured_data, "conversion_status", None),
                    conversion_error=getattr(structured_data, "conversion_error", None),
                    extracted_data_json=json.dumps(structured_data.dict()),
                    validation_errors_json=json.dumps(val_messages),
                    file_hash=file_hash,
                    duplicate_key=dup_key,
                    source_email_id=source_email.id,
                    source_type="GMAIL",
                    created_at=db_now,
                    updated_at=db_now,
                )
                self.db.add(db_doc)
                self.db.commit()
                self.db.refresh(db_doc)

                # Sync accounting transaction
                sync_document_transaction(self.db, db_doc)

                # Record successful EmailAttachmentModel
                email_att = EmailAttachmentModel(
                    email_source_id=source_email.id,
                    gmail_message_id=message_id,
                    attachment_id=att_id,
                    filename=clean_filename,
                    file_type=ext.replace(".", ""),
                    mime_type=mime_type,
                    size_bytes=len(file_bytes),
                    file_hash=file_hash,
                    document_id=doc_id,
                    status="PROCESSED",
                    created_at=db_now,
                )
                self.db.add(email_att)
                self.db.commit()

                documents_created.append({
                    "document_id": doc_id,
                    "filename": clean_filename,
                    "document_type": structured_data.document_type,
                    "file_hash": file_hash,
                })
                attachments_processed += 1

            except Exception as e:
                self.db.rollback()
                email_att = EmailAttachmentModel(
                    email_source_id=source_email.id,
                    gmail_message_id=message_id,
                    attachment_id=att_id,
                    filename=clean_filename,
                    file_type=ext.replace(".", ""),
                    mime_type=mime_type,
                    size_bytes=len(file_bytes),
                    file_hash=file_hash,
                    status="PROCESSING_ERROR",
                    error_message=f"Pipeline processing failed: {str(e)}",
                    created_at=get_local_now(),
                )
                self.db.add(email_att)
                self.db.commit()
                errors_encountered += 1

            finally:
                if os.path.exists(temp_file_path):
                    try:
                        os.remove(temp_file_path)
                    except Exception:
                        pass

        # Update final source email status
        if documents_created:
            source_email.ingestion_status = "PROCESSED" if errors_encountered == 0 else "PARTIAL"
        elif errors_encountered > 0:
            source_email.ingestion_status = "ERROR"
        else:
            source_email.ingestion_status = "SKIPPED"

        source_email.updated_at = get_local_now()
        self.db.commit()

        return {
            "status": source_email.ingestion_status,
            "message_id": message_id,
            "source_email_id": source_email.id,
            "attachments_processed": attachments_processed,
            "attachments_skipped": attachments_skipped,
            "errors_encountered": errors_encountered,
            "documents_created": documents_created,
        }
