"""
Gmail Client Module using Google OAuth 2.0 with minimal read-only permissions.
Target company inbox: shriley.ling@gmail.com
"""

import os
import base64
import email.utils
import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build, Resource
from googleapiclient.errors import HttpError

from app.config import BASE_DIR

# Minimum required read-only permission scope
GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

# Target company inbox for document ingestion
DEFAULT_COMPANY_INBOX = os.getenv("GMAIL_COMPANY_INBOX", "shriley.ling@gmail.com")

# Default credential paths (in backend/credentials/ which is gitignored)
DEFAULT_CREDENTIALS_PATH = os.getenv(
    "GMAIL_CREDENTIALS_FILE", 
    str(BASE_DIR / "credentials" / "credentials.json")
)
DEFAULT_TOKEN_PATH = os.getenv(
    "GMAIL_TOKEN_FILE", 
    str(BASE_DIR / "credentials" / "token.json")
)


class GmailAuthError(Exception):
    """Raised when Gmail authorization is missing, invalid, or expired."""
    pass


class GmailClient:
    """
    Gmail Client for securely retrieving email metadata and attachments
    using Google OAuth 2.0 with read-only permissions.
    """

    def __init__(
        self,
        credentials_path: Optional[str] = None,
        token_path: Optional[str] = None,
        company_inbox: Optional[str] = None,
        service: Optional[Resource] = None
    ):
        self.credentials_path = Path(credentials_path or DEFAULT_CREDENTIALS_PATH)
        self.token_path = Path(token_path or DEFAULT_TOKEN_PATH)
        self.company_inbox = company_inbox or DEFAULT_COMPANY_INBOX
        self._service = service  # Can be injected directly for mocking

    def _get_or_refresh_credentials(self) -> Tuple[Optional[Credentials], Optional[str]]:
        """
        Loads credentials from token_path, refreshes them if expired using refresh_token,
        and saves the refreshed token back to disk.
        Returns (creds, error_message).
        """
        if not self.token_path.exists():
            return None, "Token file does not exist."

        try:
            creds = Credentials.from_authorized_user_file(str(self.token_path), GMAIL_SCOPES)
        except Exception as e:
            return None, f"Failed to load OAuth token: {e}"

        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                self.token_path.parent.mkdir(parents=True, exist_ok=True)
                with open(self.token_path, "w", encoding="utf-8") as token_file:
                    token_file.write(creds.to_json())
            except Exception as e:
                err_str = str(e)
                if "invalid_grant" in err_str.lower() or "revoked" in err_str.lower():
                    clean_err = "OAuth token has expired or been revoked by Google. Re-authorization is required."
                else:
                    clean_err = f"Failed to refresh OAuth token: {err_str}"
                return creds, clean_err

        return creds, None

    def get_status(self) -> Dict[str, Any]:
        """
        Returns authorization and configuration status without exposing sensitive credentials.
        """
        credentials_configured = self.credentials_path.exists()
        token_exists = self.token_path.exists()
        authorized = False
        expired = False
        needs_reauth = False
        status_message = "Gmail OAuth is not configured."

        if self._service is not None:
            return {
                "configured": True,
                "authorized": True,
                "needs_reauthorization": False,
                "company_inbox": self.company_inbox,
                "token_expired": False,
                "scopes": GMAIL_SCOPES,
                "status_message": "Authorized (Mock/Direct Service)"
            }

        if token_exists:
            creds, err = self._get_or_refresh_credentials()
            if creds and creds.valid:
                authorized = True
                expired = False
                needs_reauth = False
                status_message = f"Authorized for {self.company_inbox}."
            elif creds and creds.expired and creds.refresh_token:
                expired = True
                needs_reauth = True
                if err and "invalid_grant" in str(err).lower():
                    status_message = "OAuth token has expired or been revoked by Google. Please re-authorize Gmail."
                else:
                    status_message = f"OAuth token is expired and could not be refreshed ({err or 'refresh failed'})."
            elif err:
                needs_reauth = True
                status_message = f"OAuth token error: {err}"
            else:
                needs_reauth = True
                status_message = "OAuth token is invalid or missing required permissions. Re-authorization required."
        elif credentials_configured:
            needs_reauth = True
            status_message = "OAuth client credentials found, but user has not authorized yet. Authorization required."

        return {
            "configured": credentials_configured,
            "authorized": authorized,
            "needs_reauthorization": needs_reauth,
            "token_exists": token_exists,
            "token_expired": expired,
            "company_inbox": self.company_inbox,
            "scopes": GMAIL_SCOPES,
            "status_message": status_message
        }

    def authorize(
        self,
        open_browser: bool = True,
        port: int = 0,
        timeout_seconds: Optional[int] = 120
    ) -> Tuple[bool, str]:
        """
        Executes interactive OAuth 2.0 InstalledAppFlow.
        Requests offline access and forces consent prompt to guarantee a fresh refresh token.
        Saves the resulting token to token_path and resets active service instance.
        Returns (success, message).
        """
        if not self.credentials_path.exists():
            return False, f"OAuth client credentials file not found at: {self.credentials_path}"

        try:
            flow = InstalledAppFlow.from_client_secrets_file(
                str(self.credentials_path),
                scopes=GMAIL_SCOPES
            )
            creds = flow.run_local_server(
                port=port,
                access_type="offline",
                prompt="consent",
                open_browser=open_browser,
                timeout_seconds=timeout_seconds,
                authorization_prompt_message="Please visit this URL to authorize Gmail: {url}",
                success_message="Google OAuth authorization successful! You may return to the accounting system."
            )

            if not creds:
                return False, "Authorization was cancelled or did not return valid credentials."

            # Persist fresh token
            self.token_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.token_path, "w", encoding="utf-8") as f:
                f.write(creds.to_json())

            # Reset cached service so next API call uses new credentials
            self._service = None
            return True, f"Gmail successfully authorized for {self.company_inbox}."
        except Exception as e:
            return False, f"Google OAuth authorization failed: {e}"

    def is_authorized(self) -> bool:
        """Checks if the client is currently authorized to make Gmail API calls."""
        if self._service is not None:
            return True
        status = self.get_status()
        return status["authorized"]

    def get_service(self) -> Resource:
        """
        Returns an authorized Gmail API service resource.
        Refreshes expired credentials if refresh_token is present.
        """
        if self._service is not None:
            return self._service

        creds, err = self._get_or_refresh_credentials()

        if not creds or not creds.valid:
            detail = f": {err}" if err else "."
            raise GmailAuthError(
                f"Gmail is not authorized. Please complete OAuth authorization for {self.company_inbox}{detail}"
            )

        try:
            self._service = build("gmail", "v1", credentials=creds, cache_discovery=False)
            return self._service
        except Exception as e:
            raise GmailAuthError(f"Failed to build Gmail service: {e}")

    def list_message_ids(self, query: Optional[str] = None, max_results: int = 50) -> List[str]:
        """
        Lists Gmail message IDs matching query from the company inbox.
        Defaults to query: 'has:attachment' if no query is specified.
        """
        service = self.get_service()
        search_query = query if query is not None else "has:attachment"

        try:
            results = service.users().messages().list(
                userId="me",
                q=search_query,
                maxResults=max_results
            ).execute()
            messages = results.get("messages", [])
            return [m["id"] for m in messages if "id" in m]
        except HttpError as error:
            raise RuntimeError(f"Gmail API error listing messages: {error}")

    def get_message_detail(self, message_id: str) -> Dict[str, Any]:
        """
        Retrieves full message details, parsed headers, body snippet,
        and attachment metadata for a given message ID.
        """
        service = self.get_service()
        try:
            msg = service.users().messages().get(
                userId="me",
                id=message_id,
                format="full"
            ).execute()
        except HttpError as error:
            raise RuntimeError(f"Gmail API error fetching message {message_id}: {error}")

        payload = msg.get("payload", {})
        headers = payload.get("headers", [])
        header_map = {h.get("name", "").lower(): h.get("value", "") for h in headers}

        # Parse sender
        raw_from = header_map.get("from", "")
        sender_name, sender_email = email.utils.parseaddr(raw_from)
        if not sender_email and raw_from:
            sender_email = raw_from

        # Parse subject
        subject = header_map.get("subject", "(No Subject)")

        # Parse received date
        raw_date = header_map.get("date", "")
        received_at = None
        if raw_date:
            try:
                parsed_tuple = email.utils.parsedate_to_datetime(raw_date)
                received_at = parsed_tuple.isoformat()
            except Exception:
                received_at = raw_date

        # Extract internal date timestamp (fallback)
        internal_date_ms = msg.get("internalDate")
        if not received_at and internal_date_ms:
            try:
                dt = datetime.datetime.fromtimestamp(int(internal_date_ms) / 1000.0, tz=datetime.timezone.utc)
                received_at = dt.isoformat()
            except Exception:
                pass

        # Parse body and attachments recursively
        body_text = msg.get("snippet", "")
        attachments = []
        self._extract_parts(payload, attachments)

        return {
            "message_id": message_id,
            "thread_id": msg.get("threadId"),
            "sender_name": sender_name or "",
            "sender_email": sender_email or "",
            "subject": subject,
            "received_at": received_at,
            "snippet": body_text,
            "attachment_count": len(attachments),
            "attachments": attachments
        }

    def _extract_parts(self, part: Dict[str, Any], attachments: List[Dict[str, Any]]) -> None:
        """Recursively inspects message payload parts to find attachments."""
        filename = part.get("filename", "")
        body = part.get("body", {})
        attachment_id = body.get("attachmentId")
        mime_type = part.get("mimeType", "")
        size = body.get("size", 0)

        if filename and (attachment_id or "data" in body):
            ext = Path(filename).suffix.lower()
            is_supported = ext in [".pdf", ".jpg", ".jpeg", ".png"]
            attachments.append({
                "attachment_id": attachment_id or "",
                "filename": filename,
                "mime_type": mime_type,
                "size_bytes": size,
                "extension": ext,
                "is_supported": is_supported,
                "has_inline_data": "data" in body
            })

        for sub_part in part.get("parts", []):
            self._extract_parts(sub_part, attachments)

    def download_attachment_bytes(self, message_id: str, attachment_id: str) -> bytes:
        """
        Downloads and base64-decodes the raw bytes of a message attachment.
        """
        service = self.get_service()
        try:
            attachment = service.users().messages().attachments().get(
                userId="me",
                messageId=message_id,
                id=attachment_id
            ).execute()
            data = attachment.get("data", "")
            if not data:
                return b""
            return base64.urlsafe_b64decode(data.encode("UTF-8"))
        except HttpError as error:
            raise RuntimeError(f"Gmail API error downloading attachment {attachment_id}: {error}")
