import shutil
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from app.config import DOCUMENTS_DIR
from app.db.database import get_db
from app.db.models import SystemSettingModel, JournalEntryModel, AccountingTransactionModel, DocumentModel

router = APIRouter(prefix="/api/settings", tags=["Settings"])

class SettingUpdateRequest(BaseModel):
    value: str

@router.post("/reset-database")
def reset_database(db: Session = Depends(get_db)):
    """
    Clears transactions, journal entries, and uploaded document records
    to start completely fresh, while preserving companies and master Chart of Accounts.
    """
    try:
        db.query(JournalEntryModel).delete()
        db.query(AccountingTransactionModel).delete()
        db.query(DocumentModel).delete()
        db.commit()

        # Re-create daily_ledger_staging view
        db.execute(text("DROP VIEW IF EXISTS daily_ledger_staging;"))
        db.execute(text("""
            CREATE VIEW daily_ledger_staging AS
            SELECT 
                j.id,
                j.journal_id,
                j.journal_date,
                j.transaction_id,
                j.reference,
                j.description,
                j.total_debit,
                j.total_credit,
                j.status,
                j.audit_reasoning,
                j.lines_json,
                j.created_at,
                t.company_id,
                t.tax_amount,
                t.gross_amount,
                t.confidence_score
            FROM journal_entries j
            LEFT JOIN accounting_transactions t ON j.transaction_id = t.transaction_id;
        """))
        db.commit()

        # Clean document subfolders
        if DOCUMENTS_DIR.exists():
            for item in DOCUMENTS_DIR.glob("DOC-*"):
                if item.is_dir():
                    shutil.rmtree(item, ignore_errors=True)

        return {
            "success": True,
            "message": "Database reset successfully! All documents, transactions, and journals have been cleared. Companies and Master Chart of Accounts preserved."
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database reset failed: {str(e)}")

class ProviderSwitchRequest(BaseModel):
    provider: str

def get_env_path():
    from app.config import BASE_DIR
    return BASE_DIR / ".env"

def set_active_provider_in_env(provider: str):
    env_path = get_env_path()
    if not env_path.exists():
        with open(env_path, "w", encoding="utf-8") as f:
            f.write(f"ACTIVE_PROVIDER={provider}\n")
        return
    
    lines = env_path.read_text(encoding="utf-8").splitlines()
    found = False
    new_lines = []
    for line in lines:
        if line.strip().startswith("ACTIVE_PROVIDER="):
            new_lines.append(f"ACTIVE_PROVIDER={provider}")
            found = True
        else:
            new_lines.append(line)
    if not found:
        new_lines.insert(0, f"ACTIVE_PROVIDER={provider}")
    
    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")

@router.get("/ai-provider")
def get_ai_provider(db: Session = Depends(get_db)):
    from dotenv import dotenv_values
    from app.config import BASE_DIR
    env_vars = dotenv_values(BASE_DIR / ".env")
    
    db_setting = db.query(SystemSettingModel).filter(SystemSettingModel.setting_key == "active_provider").first()
    active = db_setting.setting_value.upper() if db_setting and db_setting.setting_value else env_vars.get("ACTIVE_PROVIDER", "GROQ").upper()
    
    groq_key = env_vars.get("GROQ_API_KEY", "")
    
    return {
        "active_provider": "GROQ",
        "providers": {
            "GROQ": {
                "id": "GROQ",
                "name": "Groq LPU",
                "model": env_vars.get("GROQ_MODEL", "qwen/qwen3.8-27b"),
                "base_url": env_vars.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
                "is_configured": bool(groq_key and not groq_key.startswith("your_")),
                "badge": "Dedicated Engine (Hardware LPU)",
                "description": "Ultra-high-speed inference engine powered by Groq LPUs. Ideal for near-instant semantic audits."
            }
        }
    }

@router.post("/ai-provider")
def set_ai_provider(req: ProviderSwitchRequest, db: Session = Depends(get_db)):
    import os
    provider = req.provider.strip().upper()
    if provider != "GROQ":
        raise HTTPException(status_code=400, detail="Invalid provider. Groq is the dedicated AI provider.")
    
    # 1. Update .env file
    set_active_provider_in_env(provider)
    
    # 2. Update process environment variable
    os.environ["ACTIVE_PROVIDER"] = provider
    
    # 3. Update database setting
    setting = db.query(SystemSettingModel).filter(SystemSettingModel.setting_key == "active_provider").first()
    if not setting:
        setting = SystemSettingModel(setting_key="active_provider", setting_value=provider)
        db.add(setting)
    else:
        setting.setting_value = provider
    db.commit()
    
    return {
        "success": True,
        "active_provider": provider,
        "message": f"Active AI provider successfully switched to {provider}."
    }

class AuditModeRequest(BaseModel):
    audit_mode: str

@router.get("/audit-mode")
def get_audit_mode(db: Session = Depends(get_db)):
    setting = db.query(SystemSettingModel).filter(SystemSettingModel.setting_key == "audit_execution_mode").first()
    mode = setting.setting_value.upper() if setting and setting.setting_value else "MANUAL"
    return {"audit_mode": mode}

@router.post("/audit-mode")
def set_audit_mode(req: AuditModeRequest, db: Session = Depends(get_db)):
    mode = req.audit_mode.strip().upper()
    if mode not in ("MANUAL", "AUTOMATIC"):
        raise HTTPException(status_code=400, detail="Invalid audit mode. Must be 'MANUAL' or 'AUTOMATIC'.")
    setting = db.query(SystemSettingModel).filter(SystemSettingModel.setting_key == "audit_execution_mode").first()
    if not setting:
        setting = SystemSettingModel(setting_key="audit_execution_mode", setting_value=mode)
        db.add(setting)
    else:
        setting.setting_value = mode
    db.commit()
    return {
        "success": True,
        "audit_mode": mode,
        "message": f"Audit execution mode set to {mode}."
    }

@router.get("/{key}")
def get_setting(key: str, db: Session = Depends(get_db)):
    setting = db.query(SystemSettingModel).filter(SystemSettingModel.setting_key == key).first()
    if not setting:
        return {"key": key, "value": None}
    return {"key": key, "value": setting.setting_value}

@router.post("/{key}")
def update_setting(key: str, req: SettingUpdateRequest, db: Session = Depends(get_db)):
    setting = db.query(SystemSettingModel).filter(SystemSettingModel.setting_key == key).first()
    if not setting:
        setting = SystemSettingModel(setting_key=key, setting_value=req.value)
        db.add(setting)
    else:
        setting.setting_value = req.value
    db.commit()
    return {"message": f"Setting {key} updated successfully."}
