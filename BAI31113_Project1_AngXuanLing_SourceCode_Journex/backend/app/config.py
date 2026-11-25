import os
from pathlib import Path
from dotenv import load_dotenv

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

DOCUMENTS_DIR = BASE_DIR / "documents"
DATABASE_PATH = BASE_DIR / "accounting.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

# Ensure documents folder exists
DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)

# System ID settings
DOC_ID_PREFIX = "DOC-2026-"
COMP_ID_PREFIX = "COMP-"

# Gmail Email Ingestion Settings
GMAIL_COMPANY_INBOX = os.getenv("GMAIL_COMPANY_INBOX", "shriley.ling@gmail.com")
GMAIL_CREDENTIALS_FILE = os.getenv(
    "GMAIL_CREDENTIALS_FILE", str(BASE_DIR / "credentials" / "credentials.json")
)
GMAIL_TOKEN_FILE = os.getenv(
    "GMAIL_TOKEN_FILE", str(BASE_DIR / "credentials" / "token.json")
)
GMAIL_POLL_INTERVAL_SECONDS = int(os.getenv("GMAIL_POLL_INTERVAL_SECONDS", "300"))
GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

# Local Folder Document Collection Settings
MS_WANI_UPLOAD_FOLDER = (BASE_DIR.parent / "Sample Scenario - Ms Wani" / "Upload").resolve()
_env_folder = os.getenv("LOCAL_FOLDER_PATH")
LOCAL_FOLDER_PATH = Path(_env_folder).resolve() if _env_folder else MS_WANI_UPLOAD_FOLDER
LOCAL_FOLDER_POLL_INTERVAL_SECONDS = int(os.getenv("LOCAL_FOLDER_POLL_INTERVAL_SECONDS", "5"))

# ABC Bank Simulator Ingestion Settings
ABC_BANK_API_BASE_URL = os.getenv("ABC_BANK_API_BASE_URL", "http://localhost:8010")
ABC_BANK_POLL_INTERVAL_SECONDS = int(os.getenv("ABC_BANK_POLL_INTERVAL_SECONDS", "30"))
ABC_BANK_TIMEOUT_SECONDS = float(os.getenv("ABC_BANK_TIMEOUT_SECONDS", "10.0"))
