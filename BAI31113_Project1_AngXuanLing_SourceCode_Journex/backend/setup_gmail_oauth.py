"""
Google OAuth 2.0 Setup & Re-Authorization Utility for Agentic AI Accounting System.
Run this script to authorize or re-authorize read-only access to the company's Gmail inbox:
shriley.ling@gmail.com
"""

import os
import sys
from pathlib import Path

# Add backend directory to Python path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.email_ingestion.gmail_client import (
    GmailClient,
    GMAIL_SCOPES,
    DEFAULT_COMPANY_INBOX,
)


def main():
    print("=" * 70)
    print("Agentic Accounting System - Gmail OAuth 2.0 Authorization Setup")
    print(f"Target Inbox: {DEFAULT_COMPANY_INBOX}")
    print(f"Required Scope: Read-only ({GMAIL_SCOPES[0]})")
    print("=" * 70)

    client = GmailClient()
    creds_path = client.credentials_path
    token_path = client.token_path

    if not creds_path.exists():
        print(f"\n[ERROR] Credentials file not found at: {creds_path}")
        print("\nTo set up Google OAuth 2.0:")
        print("1. Go to Google Cloud Console (https://console.cloud.google.com/)")
        print("2. Create or select your project and enable the 'Gmail API'.")
        print(f"3. In 'OAuth consent screen', set user support email to {DEFAULT_COMPANY_INBOX}.")
        print("4. Add scope: 'https://www.googleapis.com/auth/gmail.readonly'.")
        print("5. Under 'Credentials', click 'Create Credentials' -> 'OAuth client ID'.")
        print("6. Choose Application type: 'Desktop app'.")
        print(f"7. Download the JSON file and save it as:\n   {creds_path.resolve()}\n")
        sys.exit(1)

    print(f"\n[INFO] Found client secrets file at: {creds_path.resolve()}")
    status = client.get_status()
    print(f"[INFO] Current OAuth Status: {status.get('status_message')}")

    print("\nOpening local web browser for Google account sign-in...")
    print(f"Please log in as '{DEFAULT_COMPANY_INBOX}' and grant read-only permissions.\n")

    success, message = client.authorize(open_browser=True, timeout_seconds=180)

    if success:
        print("=" * 70)
        print("[SUCCESS] Google OAuth authorization completed successfully!")
        print(f"New token saved to: {token_path.resolve()}")
        new_status = client.get_status()
        print(f"Verified Status: {new_status.get('status_message')}")
        print("=" * 70)
    else:
        print("=" * 70)
        print(f"[ERROR] Authorization failed: {message}")
        print("=" * 70)
        sys.exit(1)


if __name__ == "__main__":
    main()
