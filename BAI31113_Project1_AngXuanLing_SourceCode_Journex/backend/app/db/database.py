import sqlite3
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import DATABASE_URL, DATABASE_PATH

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 30}
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA synchronous=NORMAL;")
    cursor.execute("PRAGMA busy_timeout=30000;")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Master Chart of Accounts mirroring standard Malaysian Accounting Systems (SQL Account / AutoCount / UBS format)
DEFAULT_CHART_OF_ACCOUNTS = [
    # 1. CAPITAL
    {"code": "GRP-100", "name": "CAPITAL", "type": "Equity", "desc": "Capital Category Group", "special": None, "is_group": True, "parent_code": None, "order": 10},
    {"code": "100-0000", "name": "CAPITAL", "type": "Equity", "desc": "Owner Capital", "special": None, "is_group": False, "parent_code": "GRP-100", "order": 11},

    # 2. RETAINED EARNING
    {"code": "GRP-150", "name": "RETAINED EARNING", "type": "Equity", "desc": "Retained Earning Category Group", "special": None, "is_group": True, "parent_code": None, "order": 20},
    {"code": "150-0000", "name": "RETAINED EARNING", "type": "Equity", "desc": "Retained Earnings", "special": "SRE", "is_group": False, "parent_code": "GRP-150", "order": 21},
    {"code": "151-0000", "name": "RESERVES", "type": "Equity", "desc": "Reserves", "special": None, "is_group": False, "parent_code": "GRP-150", "order": 22},

    # 3. FIXED ASSETS
    {"code": "GRP-200", "name": "FIXED ASSETS", "type": "Asset", "desc": "Fixed Assets Category Group", "special": None, "is_group": True, "parent_code": None, "order": 30},
    {"code": "200-2000", "name": "FURNITURES & FITTINGS", "type": "Asset", "desc": "Furnitures and fittings", "special": "SFA", "is_group": False, "parent_code": "GRP-200", "order": 31},
    {"code": "200-2005", "name": "ACCUM. DEPRN. - FURNITURES & FITTINGS", "type": "Asset", "desc": "Accumulated depreciation - furnitures & fittings", "special": None, "is_group": False, "parent_code": "GRP-200", "order": 32},
    {"code": "200-3000", "name": "OFFICE EQUIPMENT", "type": "Asset", "desc": "Office and IT equipment", "special": "SFA", "is_group": False, "parent_code": "GRP-200", "order": 33},
    {"code": "200-3005", "name": "ACCUM. DEPRN. - OFFICE EQUIPMENT", "type": "Asset", "desc": "Accumulated depreciation - office equipment", "special": None, "is_group": False, "parent_code": "GRP-200", "order": 34},
    {"code": "200-4000", "name": "MOTOR VEHICLES", "type": "Asset", "desc": "Motor vehicles", "special": "SFA", "is_group": False, "parent_code": "GRP-200", "order": 35},
    {"code": "200-4005", "name": "ACCUM. DEPRN. - MOTOR VEHICLES", "type": "Asset", "desc": "Accumulated depreciation - motor vehicles", "special": None, "is_group": False, "parent_code": "GRP-200", "order": 36},

    # 4. OTHER ASSETS
    {"code": "GRP-210", "name": "OTHER ASSETS", "type": "Asset", "desc": "Other Assets Category Group", "special": None, "is_group": True, "parent_code": None, "order": 40},
    {"code": "210-0000", "name": "GOODWILL", "type": "Asset", "desc": "Goodwill", "special": None, "is_group": False, "parent_code": "GRP-210", "order": 41},
    {"code": "220-0000", "name": "NON-CURRENT PREPAYMENTS", "type": "Asset", "desc": "Prepayments exceeding 12 months", "special": None, "is_group": False, "parent_code": "GRP-210", "order": 42},

    # 5. CURRENT ASSETS
    {"code": "GRP-300", "name": "CURRENT ASSETS", "type": "Asset", "desc": "Current Assets Category Group", "special": None, "is_group": True, "parent_code": None, "order": 50},
    {"code": "300-0000", "name": "TRADE DEBTORS", "type": "Asset", "desc": "Customer / Buyer Receivables", "special": "SDC", "is_group": False, "parent_code": "GRP-300", "order": 51},
    {"code": "305-0000", "name": "OTHER DEBTORS", "type": "Asset", "desc": "Other non-trade debtors", "special": None, "is_group": False, "parent_code": "GRP-300", "order": 52},
    {"code": "305-1000", "name": "ACCRUED INCOME", "type": "Asset", "desc": "Accrued income earned but unbilled", "special": None, "is_group": False, "parent_code": "GRP-300", "order": 52},
    {"code": "310-1000", "name": "CASH AT BANK", "type": "Asset", "desc": "Main business bank account", "special": "SBK", "is_group": False, "parent_code": "GRP-300", "order": 53},
    {"code": "320-0000", "name": "CASH IN HAND", "type": "Asset", "desc": "Cash in hand / petty cash", "special": "SCH", "is_group": False, "parent_code": "GRP-300", "order": 54},
    {"code": "330-0000", "name": "STOCK", "type": "Asset", "desc": "Inventory stock control account", "special": "SBS", "is_group": False, "parent_code": "GRP-300", "order": 55},
    {"code": "330-1000", "name": "FINISHED GOODS", "type": "Asset", "desc": "Finished goods stock", "special": None, "is_group": False, "parent_code": "GRP-300", "order": 56},
    {"code": "330-2000", "name": "RAW MATERIALS", "type": "Asset", "desc": "Raw materials stock", "special": None, "is_group": False, "parent_code": "GRP-300", "order": 57},
    {"code": "340-0000", "name": "DEPOSIT & PREPAYMENT", "type": "Asset", "desc": "Deposit & prepayment", "special": None, "is_group": False, "parent_code": "GRP-300", "order": 58},
    {"code": "340-1000", "name": "PREPAID EXPENSES", "type": "Asset", "desc": "Prepaid expenses and advance payments", "special": None, "is_group": False, "parent_code": "GRP-300", "order": 59},
    {"code": "340-2000", "name": "PREPAID RENT", "type": "Asset", "desc": "Prepaid rent expense", "special": None, "is_group": False, "parent_code": "GRP-300", "order": 60},

    # 6. CURRENT LIABILITIES
    {"code": "GRP-400", "name": "CURRENT LIABILITIES", "type": "Liability", "desc": "Current Liabilities Category Group", "special": None, "is_group": True, "parent_code": None, "order": 60},
    {"code": "400-0000", "name": "TRADE CREDITORS", "type": "Liability", "desc": "Vendor / Supplier Payables", "special": "SCC", "is_group": False, "parent_code": "GRP-400", "order": 61},
    {"code": "405-0000", "name": "OTHER CREDITORS", "type": "Liability", "desc": "Other non-trade creditors", "special": None, "is_group": False, "parent_code": "GRP-400", "order": 62},
    {"code": "410-0000", "name": "ACCRUALS", "type": "Liability", "desc": "Accrued expenses", "special": None, "is_group": False, "parent_code": "GRP-400", "order": 63},
    {"code": "420-0000", "name": "HIRE PURCHASE CREDITOR", "type": "Liability", "desc": "Hire purchase creditor", "special": None, "is_group": False, "parent_code": "GRP-400", "order": 64},
    {"code": "420-1000", "name": "HIRE PURCHASE INTEREST SUSPENSE", "type": "Liability", "desc": "Hire purchase interest suspense", "special": None, "is_group": False, "parent_code": "GRP-400", "order": 65},
    {"code": "425-0000", "name": "BANK LOAN", "type": "Liability", "desc": "Bank loans and term facilities", "special": None, "is_group": False, "parent_code": "GRP-400", "order": 65},
    {"code": "430-0000", "name": "SALES TAX", "type": "Liability", "desc": "Sales tax / SST payable", "special": None, "is_group": False, "parent_code": "GRP-400", "order": 66},
    {"code": "440-0000", "name": "DEPOSIT RECEIVED", "type": "Liability", "desc": "Deposit received", "special": None, "is_group": False, "parent_code": "GRP-400", "order": 67},
    {"code": "440-1000", "name": "DEFERRED INCOME", "type": "Liability", "desc": "Income received in advance / unearned revenue", "special": None, "is_group": False, "parent_code": "GRP-400", "order": 67},
    {"code": "450-0000", "name": "NON-CURRENT DEFERRED INCOME", "type": "Liability", "desc": "Deferred income exceeding 12 months", "special": None, "is_group": False, "parent_code": "GRP-400", "order": 69},
    {"code": "490-0000", "name": "TEMPORARY ACCOUNT FOR CONTRA", "type": "Liability", "desc": "Temporary contra account", "special": None, "is_group": False, "parent_code": "GRP-400", "order": 68},

    # 7. SALES
    {"code": "GRP-500", "name": "SALES", "type": "Revenue", "desc": "Sales Revenue Category Group", "special": None, "is_group": True, "parent_code": None, "order": 70},
    {"code": "500-0000", "name": "SALES", "type": "Revenue", "desc": "Sales and service revenue", "special": None, "is_group": False, "parent_code": "GRP-500", "order": 71},
    {"code": "500-1000", "name": "CASH SALES", "type": "Revenue", "desc": "Cash sales revenue", "special": None, "is_group": False, "parent_code": "GRP-500", "order": 72},

    # 8. SALES ADJUSTMENTS
    {"code": "GRP-510", "name": "SALES ADJUSTMENTS", "type": "Sales Adjustment", "desc": "Sales Adjustments Category Group", "special": None, "is_group": True, "parent_code": None, "order": 80},
    {"code": "510-0000", "name": "RETURN INWARDS", "type": "Sales Adjustment", "desc": "Sales returns", "special": None, "is_group": False, "parent_code": "GRP-510", "order": 81},
    {"code": "520-0000", "name": "DISCOUNT ALLOWED", "type": "Sales Adjustment", "desc": "Discount allowed to customers", "special": None, "is_group": False, "parent_code": "GRP-510", "order": 82},

    # 9. OTHER INCOMES
    {"code": "GRP-530", "name": "OTHER INCOMES", "type": "Revenue", "desc": "Other Incomes Category Group", "special": None, "is_group": True, "parent_code": None, "order": 90},
    {"code": "530-0000", "name": "GAIN ON FOREIGN EXCHANGE", "type": "Revenue", "desc": "Gain on foreign exchange", "special": None, "is_group": False, "parent_code": "GRP-530", "order": 91},
    {"code": "540-0000", "name": "DISCOUNT RECEIVED", "type": "Revenue", "desc": "Discount received from suppliers", "special": None, "is_group": False, "parent_code": "GRP-530", "order": 92},
    {"code": "550-0000", "name": "GAIN ON DISPOSAL OF FIXED ASSETS", "type": "Revenue", "desc": "Gain on disposal of fixed assets", "special": None, "is_group": False, "parent_code": "GRP-530", "order": 93},

    # 10. COST OF GOODS SOLD
    {"code": "GRP-600", "name": "COST OF GOODS SOLD", "type": "Cost of Sales", "desc": "Cost of Goods Sold Category Group", "special": None, "is_group": True, "parent_code": None, "order": 100},
    {"code": "600-0000", "name": "STOCKS AT THE BEGINNING OF YEAR", "type": "Cost of Sales", "desc": "Opening Stock", "special": "SOS", "is_group": False, "parent_code": "GRP-600", "order": 101},
    {"code": "610-0000", "name": "PURCHASES", "type": "Cost of Sales", "desc": "Merchandise and inventory purchases", "special": None, "is_group": False, "parent_code": "GRP-600", "order": 102},
    {"code": "612-0000", "name": "PURCHASES RETURN", "type": "Cost of Sales", "desc": "Purchase returns", "special": None, "is_group": False, "parent_code": "GRP-600", "order": 103},
    {"code": "615-0000", "name": "CARRIAGE INWARDS", "type": "Cost of Sales", "desc": "Carriage inwards freight", "special": None, "is_group": False, "parent_code": "GRP-600", "order": 104},
    {"code": "620-0000", "name": "STOCKS AT THE END OF YEAR", "type": "Cost of Sales", "desc": "Closing Stock", "special": "SCS", "is_group": False, "parent_code": "GRP-600", "order": 105},

    # 11. EXPENSES
    {"code": "GRP-900", "name": "EXPENSES", "type": "Expense", "desc": "Expenses Category Group", "special": None, "is_group": True, "parent_code": None, "order": 110},
    {"code": "901-0000", "name": "ADVERTISEMENT", "type": "Expense", "desc": "Advertising expenses", "special": None, "is_group": False, "parent_code": "GRP-900", "order": 111},
    {"code": "902-0000", "name": "BANK CHARGES", "type": "Expense", "desc": "Bank fees and charges", "special": None, "is_group": False, "parent_code": "GRP-900", "order": 112},
    {"code": "903-0000", "name": "DEPRECIATION OF FIXED ASSETS", "type": "Expense", "desc": "Depreciation expense", "special": None, "is_group": False, "parent_code": "GRP-900", "order": 113},
    {"code": "904-0000", "name": "SALARIES", "type": "Expense", "desc": "Employee salaries and wages", "special": None, "is_group": False, "parent_code": "GRP-900", "order": 114},
    {"code": "905-0000", "name": "TRAVELLING EXPENSES", "type": "Expense", "desc": "Travel and transport expenses", "special": None, "is_group": False, "parent_code": "GRP-900", "order": 115},
    {"code": "906-0000", "name": "UPKEEP OF MOTOR VEHICLE", "type": "Expense", "desc": "Motor vehicle maintenance", "special": None, "is_group": False, "parent_code": "GRP-900", "order": 116},
    {"code": "907-0000", "name": "WATER & ELECTRICITY", "type": "Expense", "desc": "Utilities expenses", "special": None, "is_group": False, "parent_code": "GRP-900", "order": 117},
    {"code": "908-0000", "name": "LOSS ON FOREIGN EXCHANGE", "type": "Expense", "desc": "Loss on foreign exchange", "special": None, "is_group": False, "parent_code": "GRP-900", "order": 118},
    {"code": "909-0000", "name": "TELEPHONE CHARGES", "type": "Expense", "desc": "Telephone and internet charges", "special": None, "is_group": False, "parent_code": "GRP-900", "order": 119},
    {"code": "910-0000", "name": "PRINTING & STATIONERY", "type": "Expense", "desc": "Office printing and stationery", "special": None, "is_group": False, "parent_code": "GRP-900", "order": 120},
    {"code": "911-0000", "name": "INTEREST EXPENSE", "type": "Expense", "desc": "Interest expenses", "special": None, "is_group": False, "parent_code": "GRP-900", "order": 121},
    {"code": "912-0000", "name": "POSTAGES & STAMPS", "type": "Expense", "desc": "Postages and stamps", "special": None, "is_group": False, "parent_code": "GRP-900", "order": 122},
    {"code": "913-0000", "name": "COMMISSION & ALLOWANCES", "type": "Expense", "desc": "Commission and allowances", "special": None, "is_group": False, "parent_code": "GRP-900", "order": 123},
    {"code": "914-0000", "name": "OFFICE RENTAL", "type": "Expense", "desc": "Office rental expense", "special": None, "is_group": False, "parent_code": "GRP-900", "order": 124},
    {"code": "915-0000", "name": "GENERAL EXPENSES", "type": "Expense", "desc": "General and dining expenses", "special": None, "is_group": False, "parent_code": "GRP-900", "order": 125},
    {"code": "916-0000", "name": "LOSS ON DISPOSAL OF FIXED ASSETS", "type": "Expense", "desc": "Loss on disposal of fixed assets", "special": None, "is_group": False, "parent_code": "GRP-900", "order": 126},
    {"code": "917-0000", "name": "FIXED ASSET DISPOSAL EXPENSES", "type": "Expense", "desc": "Direct expenses incurred in fixed asset disposal", "special": None, "is_group": False, "parent_code": "GRP-900", "order": 127},

    # 12. TAXATION
    {"code": "GRP-950", "name": "TAXATION", "type": "Taxation", "desc": "Taxation Category Group", "special": None, "is_group": True, "parent_code": None, "order": 130},
    {"code": "950-0000", "name": "TAXATION", "type": "Taxation", "desc": "Corporate taxation", "special": None, "is_group": False, "parent_code": "GRP-950", "order": 131}
]


def seed_default_chart_of_accounts(db_session, company_id: str = "COMP-000001", force_reset: bool = False):
    from app.db.models import ChartOfAccountModel
    if force_reset:
        db_session.query(ChartOfAccountModel).filter(ChartOfAccountModel.company_id == company_id).delete()
        db_session.commit()

    all_rows = db_session.query(ChartOfAccountModel).filter(ChartOfAccountModel.company_id == company_id).all()
    
    # Remove obsolete or duplicate 310-0000 if 310-1000 is present
    has_310_1000 = any(r.account_code == "310-1000" for r in all_rows)
    for r in list(all_rows):
        if r.account_code == "310-0000" and has_310_1000:
            db_session.delete(r)
            all_rows.remove(r)
    
    # Deduplicate: Keep only the first record per account_code, delete any extra duplicate records
    seen = {}
    duplicates = []
    for r in all_rows:
        if r.account_code not in seen:
            seen[r.account_code] = r
        else:
            duplicates.append(r)
            
    if duplicates:
        for d in duplicates:
            db_session.delete(d)
        db_session.commit()

    existing_map = seen

    # First pass: Seed group headers to establish IDs
    group_id_map = {}
    for item in DEFAULT_CHART_OF_ACCOUNTS:
        if item.get("is_group"):
            code = item["code"]
            if code not in existing_map:
                acc = ChartOfAccountModel(
                    company_id=company_id,
                    account_code=code,
                    account_name=item["name"],
                    account_type=item["type"],
                    special_code=item.get("special"),
                    description=item["desc"],
                    is_group=True,
                    display_order=item.get("order", 0),
                    is_active=True
                )
                db_session.add(acc)
                db_session.flush()
                existing_map[code] = acc
            else:
                acc = existing_map[code]
                acc.account_name = item["name"]
                acc.account_type = item["type"]
                acc.special_code = item.get("special")
                acc.description = item["desc"]
                acc.is_group = True
                acc.display_order = item.get("order", 0)
                acc.is_active = True
                db_session.flush()
            group_id_map[code] = existing_map[code].id

    # Second pass: Seed sub-accounts and link parent_id
    for item in DEFAULT_CHART_OF_ACCOUNTS:
        if not item.get("is_group"):
            code = item["code"]
            parent_code = item.get("parent_code")
            parent_id = group_id_map.get(parent_code) if parent_code else None

            if code not in existing_map:
                acc = ChartOfAccountModel(
                    company_id=company_id,
                    account_code=code,
                    account_name=item["name"],
                    account_type=item["type"],
                    special_code=item.get("special"),
                    description=item["desc"],
                    parent_id=parent_id,
                    is_group=False,
                    display_order=item.get("order", 0),
                    is_active=True
                )
                db_session.add(acc)
                existing_map[code] = acc
            else:
                acc = existing_map[code]
                acc.account_name = item["name"]
                acc.account_type = item["type"]
                acc.special_code = item.get("special")
                acc.description = item["desc"]
                acc.parent_id = parent_id
                acc.is_group = False
                acc.display_order = item.get("order", 0)
                acc.is_active = True

    db_session.commit()


def ensure_db_schema():
    """
    Auto-migrates existing SQLite tables if new columns are added.
    """
    from app.db.models import Base
    Base.metadata.create_all(bind=engine)

    if not DATABASE_PATH.exists():
        return

    try:
        conn = sqlite3.connect(DATABASE_PATH)
        cursor = conn.cursor()
        
        # Check documents table columns
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='documents';")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(documents);")
            columns = [col[1] for col in cursor.fetchall()]
            if 'company_id' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN company_id VARCHAR DEFAULT "COMP-000001";')
                conn.commit()
            if 'file_hash' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN file_hash VARCHAR;')
                conn.commit()
            if 'duplicate_key' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN duplicate_key VARCHAR;')
                conn.commit()
            if 'source_email_id' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN source_email_id INTEGER;')
                conn.commit()
            if 'source_type' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN source_type VARCHAR DEFAULT "MANUAL_UPLOAD";')
                conn.commit()
            if 'original_source_path' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN original_source_path VARCHAR;')
                conn.commit()
            if 'vendor_address' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN vendor_address VARCHAR;')
                conn.commit()
            if 'currency' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN currency VARCHAR DEFAULT "MYR";')
                conn.commit()
            if 'subtotal' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN subtotal FLOAT;')
                conn.commit()
            if 'discount' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN discount FLOAT;')
                conn.commit()
            if 'shipping' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN shipping FLOAT;')
                conn.commit()
            if 'tax_amount' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN tax_amount FLOAT;')
                conn.commit()
            if 'converted_amount_myr' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN converted_amount_myr FLOAT;')
                conn.commit()
            if 'subtotal_myr' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN subtotal_myr FLOAT;')
                conn.commit()
            if 'discount_myr' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN discount_myr FLOAT;')
                conn.commit()
            if 'shipping_myr' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN shipping_myr FLOAT;')
                conn.commit()
            if 'tax_amount_myr' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN tax_amount_myr FLOAT;')
                conn.commit()
            if 'exchange_rate' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN exchange_rate FLOAT;')
                conn.commit()
            if 'exchange_rate_date' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN exchange_rate_date VARCHAR;')
                conn.commit()
            if 'exchange_rate_provider' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN exchange_rate_provider VARCHAR;')
                conn.commit()
            if 'exchange_rate_session' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN exchange_rate_session VARCHAR;')
                conn.commit()
            if 'conversion_status' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN conversion_status VARCHAR;')
                conn.commit()
            if 'conversion_error' not in columns:
                cursor.execute('ALTER TABLE documents ADD COLUMN conversion_error TEXT;')
                conn.commit()

        # Check accounting_transactions table columns
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='accounting_transactions';")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(accounting_transactions);")
            txn_cols = [col[1] for col in cursor.fetchall()]
            if 'original_currency' not in txn_cols:
                cursor.execute('ALTER TABLE accounting_transactions ADD COLUMN original_currency VARCHAR DEFAULT "MYR";')
                conn.commit()
            if 'original_amount' not in txn_cols:
                cursor.execute('ALTER TABLE accounting_transactions ADD COLUMN original_amount FLOAT;')
                conn.commit()
            if 'exchange_rate' not in txn_cols:
                cursor.execute('ALTER TABLE accounting_transactions ADD COLUMN exchange_rate FLOAT;')
                conn.commit()
            if 'converted_amount_myr' not in txn_cols:
                cursor.execute('ALTER TABLE accounting_transactions ADD COLUMN converted_amount_myr FLOAT;')
                conn.commit()

        # Check exchange_rates_cache table
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='exchange_rates_cache';")
        if not cursor.fetchone():
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS exchange_rates_cache (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    currency VARCHAR NOT NULL,
                    target_currency VARCHAR NOT NULL DEFAULT 'MYR',
                    rate_date VARCHAR NOT NULL,
                    rate_publication_date VARCHAR NOT NULL,
                    rate FLOAT NOT NULL,
                    raw_rate FLOAT,
                    unit INTEGER DEFAULT 1,
                    session VARCHAR DEFAULT '1700',
                    provider VARCHAR NOT NULL,
                    is_fallback BOOLEAN DEFAULT 0,
                    created_at DATETIME,
                    CONSTRAINT uix_currency_rate_date_session UNIQUE (currency, target_currency, rate_date, session)
                );
            ''')
            conn.commit()

        # Check companies table columns
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='companies';")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(companies);")
            comp_cols = [col[1] for col in cursor.fetchall()]
            if 'is_active' not in comp_cols:
                cursor.execute('ALTER TABLE companies ADD COLUMN is_active BOOLEAN DEFAULT 1;')
                conn.commit()
            if 'address' not in comp_cols:
                cursor.execute('ALTER TABLE companies ADD COLUMN address TEXT;')
                conn.commit()
            if 'tax_number' not in comp_cols:
                cursor.execute('ALTER TABLE companies ADD COLUMN tax_number VARCHAR;')
                conn.commit()
            if 'onboarding_status' not in comp_cols:
                cursor.execute("ALTER TABLE companies ADD COLUMN onboarding_status VARCHAR DEFAULT 'ACTIVE';")
                conn.commit()
            if 'onboarding_step' not in comp_cols:
                cursor.execute("ALTER TABLE companies ADD COLUMN onboarding_step INTEGER DEFAULT 1;")
                conn.commit()
            if 'financial_year_start' not in comp_cols:
                cursor.execute("ALTER TABLE companies ADD COLUMN financial_year_start VARCHAR;")
                conn.commit()
            if 'financial_year_end' not in comp_cols:
                cursor.execute("ALTER TABLE companies ADD COLUMN financial_year_end VARCHAR;")
                conn.commit()
            if 'email' not in comp_cols:
                cursor.execute("ALTER TABLE companies ADD COLUMN email VARCHAR;")
                conn.commit()
            if 'phone' not in comp_cols:
                cursor.execute("ALTER TABLE companies ADD COLUMN phone VARCHAR;")
                conn.commit()
            if 'logo_path' not in comp_cols:
                cursor.execute("ALTER TABLE companies ADD COLUMN logo_path VARCHAR;")
                conn.commit()

        # Check chart_of_accounts table columns
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='chart_of_accounts';")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(chart_of_accounts);")
            coa_cols = [col[1] for col in cursor.fetchall()]
            if 'special_code' not in coa_cols:
                cursor.execute('ALTER TABLE chart_of_accounts ADD COLUMN special_code VARCHAR;')
                conn.commit()
            if 'parent_id' not in coa_cols:
                cursor.execute('ALTER TABLE chart_of_accounts ADD COLUMN parent_id INTEGER;')
                conn.commit()
            if 'is_group' not in coa_cols:
                cursor.execute('ALTER TABLE chart_of_accounts ADD COLUMN is_group BOOLEAN DEFAULT 0;')
                conn.commit()
            if 'display_order' not in coa_cols:
                cursor.execute('ALTER TABLE chart_of_accounts ADD COLUMN display_order INTEGER DEFAULT 0;')
                conn.commit()

        # Check bank_transactions table columns
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='bank_transactions';")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(bank_transactions);")
            bank_cols = [col[1] for col in cursor.fetchall()]
            bank_new_columns = [
                ("suggested_category", "VARCHAR"),
                ("suggested_account_code", "VARCHAR"),
                ("suggested_account_name", "VARCHAR"),
                ("classification_confidence", "FLOAT DEFAULT 0.0"),
                ("classification_explanation", "TEXT"),
                ("classification_status", "VARCHAR DEFAULT 'PENDING'"),
                ("review_status", "VARCHAR DEFAULT 'NEEDS_REVIEW'"),
                ("classification_timestamp", "DATETIME"),
                ("matched_document_id", "VARCHAR"),
                ("match_status", "VARCHAR DEFAULT 'UNMATCHED'"),
                ("match_confidence", "FLOAT DEFAULT 0.0"),
                ("match_explanation", "TEXT"),
                ("match_timestamp", "DATETIME"),
                ("reconciliation_status", "VARCHAR DEFAULT 'UNRECONCILED'"),
                ("reconciliation_notes", "TEXT"),
                ("audit_trail_json", "TEXT"),
                ("pdf_file_path", "VARCHAR"),
                ("file_hash", "VARCHAR"),
            ]
            for col_name, col_type in bank_new_columns:
                if col_name not in bank_cols:
                    cursor.execute(f"ALTER TABLE bank_transactions ADD COLUMN {col_name} {col_type};")
                    conn.commit()

        # Check fixed_assets table columns
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='fixed_assets';")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(fixed_assets);")
            fa_cols = [col[1] for col in cursor.fetchall()]
            if 'expenses_paid' not in fa_cols:
                cursor.execute('ALTER TABLE fixed_assets ADD COLUMN expenses_paid BOOLEAN DEFAULT 1;')
                conn.commit()
            if 'expense_liability_account_code' not in fa_cols:
                cursor.execute('ALTER TABLE fixed_assets ADD COLUMN expense_liability_account_code VARCHAR;')
                conn.commit()

        # Check customers table columns
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='customers';")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(customers);")
            cust_cols = [col[1] for col in cursor.fetchall()]
            for c_name in ['invoice_no', 'invoice_date', 'due_date', 'opening_balance_date', 'source_doc_id']:
                if c_name not in cust_cols:
                    cursor.execute(f"ALTER TABLE customers ADD COLUMN {c_name} VARCHAR;")
                    conn.commit()

        # Check suppliers table columns
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='suppliers';")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(suppliers);")
            supp_cols = [col[1] for col in cursor.fetchall()]
            for c_name in ['invoice_no', 'invoice_date', 'due_date', 'opening_balance_date', 'source_doc_id']:
                if c_name not in supp_cols:
                    cursor.execute(f"ALTER TABLE suppliers ADD COLUMN {c_name} VARCHAR;")
                    conn.commit()

        # Check inventory_items table columns
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_items';")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(inventory_items);")
            inv_cols = [col[1] for col in cursor.fetchall()]
            for c_name in ['opening_balance_date', 'source_doc_id']:
                if c_name not in inv_cols:
                    cursor.execute(f"ALTER TABLE inventory_items ADD COLUMN {c_name} VARCHAR;")
                    conn.commit()

        # Check opening_balance_documents table columns
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='opening_balance_documents';")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(opening_balance_documents);")
            ob_cols = [col[1] for col in cursor.fetchall()]
            for c_name, c_type in [('source_doc_id', 'VARCHAR'), ('document_id', 'VARCHAR'), ('confirmation_status', 'VARCHAR DEFAULT "CONFIRMED"'), ('confirmed_at', 'DATETIME')]:
                if c_name not in ob_cols:
                    cursor.execute(f"ALTER TABLE opening_balance_documents ADD COLUMN {c_name} {c_type};")
                    conn.commit()

        # Check source_emails table columns
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='source_emails';")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(source_emails);")
            se_cols = [col[1] for col in cursor.fetchall()]
            for c_name, c_type in [
                ('source_doc_id', 'VARCHAR'),
                ('document_id', 'VARCHAR'),
                ('confirmation_status', 'VARCHAR DEFAULT "CONFIRMED"'),
                ('confirmed_at', 'DATETIME')
            ]:
                if c_name not in se_cols:
                    cursor.execute(f"ALTER TABLE source_emails ADD COLUMN {c_name} {c_type};")
                    conn.commit()

        # Check email_attachments table columns
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='email_attachments';")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(email_attachments);")
            ea_cols = [col[1] for col in cursor.fetchall()]
            for c_name, c_type in [
                ('source_doc_id', 'VARCHAR'),
                ('confirmation_status', 'VARCHAR DEFAULT "CONFIRMED"'),
                ('confirmed_at', 'DATETIME')
            ]:
                if c_name not in ea_cols:
                    cursor.execute(f"ALTER TABLE email_attachments ADD COLUMN {c_name} {c_type};")
                    conn.commit()

        conn.close()

        # Seed/Update COA for default company
        db = SessionLocal()
        try:
            seed_default_chart_of_accounts(db, "COMP-000001")
            sync_default_test_documents(db)
        finally:
            db.close()

    except Exception as e:
        print(f"Database schema auto-migration notice: {e}")


def sync_default_test_documents(db):
    """
    Auto-migrates/synchronizes test documents and transactions for COMP-000001
    to ensure data consistency across app restarts.
    """
    from app.db.models import DocumentModel, AccountingTransactionModel
    from app.services.transaction_service import sync_document_transaction
    from app.agents.accounting_agent import AccountingAgent
    import json
    from pathlib import Path

    company_id = "COMP-000001"

    # 1. DOC-2026-000002 (test_sales_invoice_0003.pdf -> INV-2026-0003) -> Date: "15 Sep 2026"
    doc2 = db.query(DocumentModel).filter(
        DocumentModel.company_id == company_id,
        DocumentModel.document_id == "DOC-2026-000002"
    ).first()
    if doc2:
        ext2 = json.loads(doc2.extracted_data_json) if doc2.extracted_data_json else {}
        ext2["transaction_date"] = "15 Sep 2026"
        if "field_confidence" in ext2 and "transaction_date" in ext2["field_confidence"]:
            ext2["field_confidence"]["transaction_date"]["value"] = "15 Sep 2026"
        doc2.extracted_data_json = json.dumps(ext2)

        txn2 = db.query(AccountingTransactionModel).filter(
            AccountingTransactionModel.company_id == company_id,
            AccountingTransactionModel.document_id == "DOC-2026-000002"
        ).first()
        if txn2:
            txn2.transaction_date = "15 Sep 2026"

        json_file2 = Path("backend/documents/DOC-2026-000002/DOC-2026-000002_extracted.json")
        if json_file2.exists():
            try:
                json_file2.write_text(json.dumps(ext2, indent=2), encoding="utf-8")
            except Exception:
                pass

    # 2. DOC-2026-000008 (test_BankStatement_SEP.pdf -> Bank Statement) -> selected_accounts = []
    doc8 = db.query(DocumentModel).filter(
        DocumentModel.company_id == company_id,
        DocumentModel.document_id == "DOC-2026-000008"
    ).first()
    if doc8:
        ext8 = json.loads(doc8.extracted_data_json) if doc8.extracted_data_json else {}
        analysis8 = ext8.get("accounting_analysis", {})
        analysis8["accounting_event"] = "Bank account statement for bank reconciliation"
        analysis8["book_of_prime_entry"] = "Bank Statement Record"
        analysis8["selected_accounts"] = []
        ext8["accounting_analysis"] = analysis8
        doc8.extracted_data_json = json.dumps(ext8)

        txn8 = db.query(AccountingTransactionModel).filter(
            AccountingTransactionModel.company_id == company_id,
            AccountingTransactionModel.document_id == "DOC-2026-000008"
        ).first()
        if txn8:
            txn8.accounting_analysis_json = json.dumps(analysis8)
            txn8.book_of_prime_entry = "Bank Statement Record"

        json_file8 = Path("backend/documents/DOC-2026-000008/DOC-2026-000008_extracted.json")
        if json_file8.exists():
            try:
                json_file8.write_text(json.dumps(ext8, indent=2), encoding="utf-8")
            except Exception:
                pass

    # 3. DOC-2026-000012 (test_CreditNote_0001.pdf -> CN-2026-0001) -> Customer Credit Note
    doc12 = db.query(DocumentModel).filter(
        DocumentModel.company_id == company_id,
        DocumentModel.document_id == "DOC-2026-000012"
    ).first()
    if doc12:
        doc12.original_filename = "test_CreditNote_0001.pdf"
        doc12.document_type = "Credit Note"
        doc12.vendor_name = "TechCore Solutions Sdn Bhd"
        doc12.grand_total = 530.0

        acct_agent = AccountingAgent(db=db, company_id=company_id)
        cn_input = {
            "document_type": "Credit Note",
            "credit_note_number": "CN-2026-0001",
            "related_invoice_number": "INV-2026-0001",
            "transaction_date": "30 September 2026",
            "buyer_name": "TechCore Solutions Sdn Bhd",
            "vendor_name": "NEXTTECH SOLUTIONS SDN BHD",
            "business_roles": {
                "our_company": "NextTech Solutions Sdn Bhd",
                "customer": "TechCore Solutions Sdn Bhd"
            },
            "subtotal": 500.0,
            "tax_amount": 30.0,
            "grand_total": 530.0
        }
        analysis12_schema = acct_agent.analyze(cn_input)
        analysis12 = analysis12_schema.model_dump() if hasattr(analysis12_schema, "model_dump") else analysis12_schema.dict()

        ext12 = cn_input.copy()
        ext12.update({
            "company_id": company_id,
            "active_company_name": "NextTech Solutions Sdn Bhd",
            "company_match_status": "MATCHED",
            "display_summary": {
                "party_label": "Customer",
                "party": "TechCore Solutions Sdn Bhd",
                "amount_label": "Grand Total",
                "amount": 530.0
            },
            "accounting_analysis": analysis12,
            "validation_passed": True,
            "needs_review": False
        })

        doc12.extracted_data_json = json.dumps(ext12)
        json12_path = Path("backend/documents/DOC-2026-000012/DOC-2026-000012_extracted.json")
        if json12_path.exists():
            try:
                json12_path.write_text(json.dumps(ext12, indent=2), encoding="utf-8")
            except Exception:
                pass

        txn12 = db.query(AccountingTransactionModel).filter(
            AccountingTransactionModel.company_id == company_id,
            AccountingTransactionModel.document_id == "DOC-2026-000012"
        ).first()
        if txn12:
            txn12.source_document = "CN-2026-0001"
            txn12.document_type = "Credit Note"
            txn12.transaction_date = "30 September 2026"
            txn12.accounting_event = "Sales return / customer return"
            txn12.book_of_prime_entry = "Sales Returns Day Book"
            txn12.accounting_analysis_json = json.dumps(analysis12)

    # Re-sync all documents to update AccountingTransactionModel records
    all_docs = db.query(DocumentModel).filter(DocumentModel.company_id == company_id).all()
    for d in all_docs:
        sync_document_transaction(db, d)

    # Classify any unclassified bank transactions for active company
    try:
        from app.services.bank_ingestion.bank_classifier import classify_all_pending_transactions
        classify_all_pending_transactions(db, company_id=company_id)
    except Exception as e:
        print(f"Bank transactions sync notice: {e}")

    db.commit()

    # Seed default admin user (admin@nexttech.com / password123)
    try:
        from app.db.models import UserModel, UserCompanyModel
        from app.services.auth_service import hash_password

        admin_user = db.query(UserModel).filter(UserModel.email == "admin@nexttech.com").first()
        if not admin_user:
            admin_user = UserModel(
                email="admin@nexttech.com",
                password_hash=hash_password("password123"),
                full_name="Admin Director Tan",
                role="ADMIN",
                is_active=True
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)

        membership = db.query(UserCompanyModel).filter(
            UserCompanyModel.user_id == admin_user.id,
            UserCompanyModel.company_id == "COMP-000001"
        ).first()
        if not membership:
            membership = UserCompanyModel(
                user_id=admin_user.id,
                company_id="COMP-000001",
                role="OWNER",
                is_default=True
            )
            db.add(membership)
            db.commit()
    except Exception as e:
        print(f"Admin user seeding notice: {e}")


