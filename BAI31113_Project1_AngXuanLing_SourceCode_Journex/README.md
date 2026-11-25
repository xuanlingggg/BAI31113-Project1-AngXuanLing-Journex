# Journex – AI Agentic Accounting System for Automated Accounting Document Processing

## 1. Project Purpose & System Overview

Journex is an AI Agentic Accounting System designed to automate accounting document processing and reduce manual accounting work. It processes financial documents such as invoices, receipts, payment vouchers and bank statements, then helps convert the extracted information into accounting records.

---

## 2. Four Main AI Agents

### 1. Document Processing Agent
- Collects financial documents from different sources, such as file uploads, Gmail and local folders.
- Extracts important information from documents.
- Checks for duplicate and unrelated documents.

### 2. Verification Agent
- Checks whether the extracted information is complete and correct.
- Verifies calculations, including subtotal, tax and grand total.

### 3. Accounting Agent
- Classifies transactions into suitable accounting categories.
- Maps transactions to the Chart of Accounts.
- Prepares balanced debit and credit journal entries.

### 4. Error Detection Agent
- Reviews prepared journal entries to identify possible accounting errors.
- Detects issues such as duplicate entries and incorrect account classification.
- Provides suggestions for correcting identified errors.

---

## 3. Overall System Workflow

1. Collect financial documents.
2. Extract document information.
3. Verify the extracted information and calculations.
4. Classify transactions and prepare journal entries.
5. Audit journal entries and identify possible errors.
6. Allow user review before proceeding with accounting records.

---

## 4. Project Directory Structure

```text
BAI31113_Project1_AngXuanLing_SourceCode_Journex/
├── backend/                               # Backend service (FastAPI)
│   ├── app/                               # Application source code
│   │   ├── agents/                        # AI agent implementations
│   │   ├── api/                           # REST API routes
│   │   ├── db/                            # Database models & Chart of Accounts
│   │   ├── schemas/                       # Pydantic data schemas
│   │   ├── services/                      # Ingestion services & business logic
│   │   │   ├── bank_ingestion/            # Bank simulator ingestion
│   │   │   ├── email_ingestion/           # Gmail OAuth 2.0 ingestion
│   │   │   └── folder_ingestion/          # Local folder watcher
│   │   ├── utils/                         # Helper utilities
│   │   ├── config.py                      # App configuration
│   │   └── main.py                        # FastAPI entry point
│   ├── .env.example                       # Environment template
│   ├── requirements.txt                   # Python dependencies
│   ├── mock_bank_server.py                # Standalone bank simulator server
│   ├── streamlit_app.py                   # Prototype inspection viewer
│   └── check_db.py                        # Database check script
├── frontend/                              # Frontend application (React + Vite)
│   ├── src/                               # UI source code
│   │   ├── components/                    # Reusable UI components
│   │   ├── pages/                         # Application pages
│   │   ├── utils/                         # API client & formatters
│   │   ├── App.jsx                        # Root router
│   │   ├── main.jsx                       # React entry point
│   │   └── index.css                      # Global styles
│   ├── index.html                         # HTML template
│   ├── package.json                       # Node dependencies & scripts
│   ├── package-lock.json                  # Locked dependencies
│   └── vite.config.js                     # Vite build configuration
├── Sample Scenario - Ms Wani/             # Academic case study documents
│   ├── Upload/                            # Sample test documents for upload
│   └── *.pdf                              # Reference statements & assignment guide
├── .gitignore                             # Git ignore rules
└── README.md                              # Project documentation
```

---

## 5. System Prerequisites

Ensure the following tools are installed on your environment before starting:

1. **Python:** Version 3.10, 3.11, 3.12, or 3.13  
   *Verify with:* `python --version`
2. **Node.js & npm:** Node.js v18.x or v20.x  
   *Verify with:* `node --version` and `npm --version`
3. **Supported OS:** Windows 10/11, macOS, or Linux

---

## 6. Setup & Running Instructions

### Step 1: Backend Setup (FastAPI)

1. Open a terminal and enter the `backend/` directory:
   ```powershell
   cd backend
   ```

2. Create and activate a Python virtual environment:
   * **Windows (PowerShell):**
     ```powershell
     python -m venv .venv
     .\.venv\Scripts\Activate.ps1
     ```
   * **Windows (Command Prompt):**
     ```cmd
     python -m venv .venv
     .\.venv\Scripts\activate.bat
     ```
   * **macOS / Linux:**
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```

3. Install required Python packages:
   ```powershell
   pip install -r requirements.txt
   ```

4. Configure environment variables:
   * Create `.env` from the provided template:
     ```powershell
     copy .env.example .env     # Windows
     # or: cp .env.example .env # macOS / Linux
     ```
   * *(Optional)* Add your `GROQ_API_KEY` into `.env` for LLM semantic features. Core accounting rules, math checks, and ledger functions operate by default even without an API key.

5. Start the backend server:
   ```powershell
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```
   * Backend API: `http://127.0.0.1:8000`
   * Interactive API Documentation (Swagger UI): `http://127.0.0.1:8000/docs`
   * *Note:* The SQLite database (`accounting.db`) and standard Malaysian Chart of Accounts are created automatically on the first launch.

---

### Step 2: Frontend Setup (React + Vite)

1. Open a new terminal window and navigate to the `frontend/` directory:
   ```powershell
   cd frontend
   ```

2. Install Node.js package dependencies:
   ```powershell
   npm install
   ```

3. Start the development server:
   ```powershell
   npm run dev
   ```

4. Open your browser and navigate to:
   ```text
   http://localhost:5173
   ```
