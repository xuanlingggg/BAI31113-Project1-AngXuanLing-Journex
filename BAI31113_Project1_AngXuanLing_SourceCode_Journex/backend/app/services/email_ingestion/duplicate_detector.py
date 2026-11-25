"""
Duplicate Detection Module for Email Ingestion.
Performs:
1. Gmail Message ID duplicate checks (to prevent reprocessing the same email).
2. Cryptographic SHA-256 attachment content hash checks (to detect duplicate files across emails).
"""

import hashlib
from typing import Dict, Any, Optional, Set, Callable
from dataclasses import dataclass, field


@dataclass
class MessageDuplicateResult:
    is_duplicate: bool
    message_id: str
    reason: str
    existing_record: Optional[Dict[str, Any]] = None


@dataclass
class AttachmentDuplicateResult:
    is_duplicate: bool
    file_hash: str
    filename: str
    is_empty: bool
    reason: str
    existing_document_id: Optional[str] = None
    original_message_id: Optional[str] = None
    existing_record: Optional[Dict[str, Any]] = None


def compute_content_hash(content_bytes: bytes) -> str:
    """Computes standard SHA-256 cryptographic hex digest of raw binary bytes."""
    if not isinstance(content_bytes, (bytes, bytearray)):
        raise TypeError(f"Expected bytes-like object, got {type(content_bytes).__name__}")
    return hashlib.sha256(content_bytes).hexdigest()


class DuplicateDetector:
    """
    Modular duplicate detector for emails and attachment files.
    Can operate with in-memory sets/dictionaries or persistent database lookup callbacks.
    """

    def __init__(
        self,
        known_message_ids: Optional[Set[str]] = None,
        known_hashes: Optional[Dict[str, Dict[str, Any]]] = None,
        message_lookup_fn: Optional[Callable[[str], Optional[Dict[str, Any]]]] = None,
        hash_lookup_fn: Optional[Callable[[str], Optional[Dict[str, Any]]]] = None
    ):
        self._known_message_ids: Set[str] = set(known_message_ids or [])
        self._known_hashes: Dict[str, Dict[str, Any]] = dict(known_hashes or {})
        self._message_lookup_fn = message_lookup_fn
        self._hash_lookup_fn = hash_lookup_fn

    def register_message(self, message_id: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Records a message ID as seen/processed."""
        if message_id:
            self._known_message_ids.add(message_id)

    def register_attachment_hash(
        self,
        file_hash: str,
        document_id: Optional[str] = None,
        message_id: Optional[str] = None,
        filename: Optional[str] = None
    ) -> None:
        """Records an attachment hash as seen/processed."""
        if file_hash:
            self._known_hashes[file_hash] = {
                "file_hash": file_hash,
                "document_id": document_id,
                "message_id": message_id,
                "filename": filename
            }

    def check_message(self, message_id: str) -> MessageDuplicateResult:
        """
        Checks whether a Gmail message ID has already been ingested.
        """
        if not message_id or not str(message_id).strip():
            return MessageDuplicateResult(
                is_duplicate=False,
                message_id="",
                reason="Invalid or empty message ID."
            )

        clean_id = str(message_id).strip()

        # Check in-memory registry
        if clean_id in self._known_message_ids:
            return MessageDuplicateResult(
                is_duplicate=True,
                message_id=clean_id,
                reason=f"Message ID '{clean_id}' has already been processed."
            )

        # Check external/database lookup callback if configured
        if self._message_lookup_fn:
            existing = self._message_lookup_fn(clean_id)
            if existing:
                return MessageDuplicateResult(
                    is_duplicate=True,
                    message_id=clean_id,
                    reason=f"Message ID '{clean_id}' found in existing records.",
                    existing_record=existing
                )

        return MessageDuplicateResult(
            is_duplicate=False,
            message_id=clean_id,
            reason=f"Message ID '{clean_id}' is new and eligible for ingestion."
        )

    def check_attachment(
        self,
        content_bytes: bytes,
        filename: str = "",
        current_message_id: Optional[str] = None
    ) -> AttachmentDuplicateResult:
        """
        Checks whether an attachment's binary content is a duplicate based on SHA-256 hash.
        Does NOT rely on filenames.
        """
        if not content_bytes or len(content_bytes) == 0:
            return AttachmentDuplicateResult(
                is_duplicate=False,
                file_hash="",
                filename=filename,
                is_empty=True,
                reason="Attachment content is empty (0 bytes). Cannot process."
            )

        file_hash = compute_content_hash(content_bytes)

        # 1. Check in-memory registry
        if file_hash in self._known_hashes:
            rec = self._known_hashes[file_hash]
            orig_msg = rec.get("message_id")
            orig_doc = rec.get("document_id")
            orig_fname = rec.get("filename")

            same_email = (orig_msg and current_message_id and orig_msg == current_message_id)
            if same_email:
                reason = (
                    f"Duplicate attachment content detected within the same email "
                    f"('{filename}' matches previously processed '{orig_fname}' with SHA-256: {file_hash[:12]}...)."
                )
            else:
                reason = (
                    f"Duplicate attachment content detected across emails. File '{filename}' has "
                    f"identical SHA-256 hash ({file_hash[:12]}...) to attachment in message '{orig_msg}'."
                )

            return AttachmentDuplicateResult(
                is_duplicate=True,
                file_hash=file_hash,
                filename=filename,
                is_empty=False,
                reason=reason,
                existing_document_id=orig_doc,
                original_message_id=orig_msg,
                existing_record=rec
            )

        # 2. Check external/database lookup callback if configured
        if self._hash_lookup_fn:
            existing = self._hash_lookup_fn(file_hash)
            if existing:
                orig_msg = existing.get("message_id")
                orig_doc = existing.get("document_id")
                reason = (
                    f"Attachment content already exists in system database "
                    f"(Linked Document ID: {orig_doc}, SHA-256: {file_hash[:12]}...)."
                )
                return AttachmentDuplicateResult(
                    is_duplicate=True,
                    file_hash=file_hash,
                    filename=filename,
                    is_empty=False,
                    reason=reason,
                    existing_document_id=orig_doc,
                    original_message_id=orig_msg,
                    existing_record=existing
                )

        return AttachmentDuplicateResult(
            is_duplicate=False,
            file_hash=file_hash,
            filename=filename,
            is_empty=False,
            reason=f"Attachment '{filename}' is unique (SHA-256: {file_hash[:12]}...)."
        )
