import shutil
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import DOCUMENTS_DIR
from app.db.database import get_db
from app.db.models import (
    UserModel,
    UserCompanyModel,
    CompanyModel,
    DocumentModel,
    AccountingTransactionModel,
    JournalEntryModel,
    CustomerModel,
    SupplierModel,
    InventoryItemModel,
    FixedAssetModel,
    AccrualPrepaymentModel,
    AccrualAdjustmentRecordModel,
    ChartOfAccountModel,
    BankTransactionModel,
    EmailSourceModel,
    EmailAttachmentModel,
    OpeningBalanceDocumentModel,
    OpeningBalanceBatchModel,
    OpeningBalanceDraftRecordModel,
    RegistrationSessionModel,
)
from app.schemas.auth import (
    UserRegisterRequest,
    UserLoginRequest,
    UserResponse,
    TokenResponse,
    UserAccountDeleteRequest,
    UserAccountDeleteResponse
)
from app.services.auth_service import (
    register_user,
    authenticate_user,
    create_access_token,
    get_user_companies_info,
    get_current_user,
    verify_password
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
logger = logging.getLogger(__name__)

UPLOAD_BASE_DIR = Path("documents/onboarding")
TEMP_ONBOARDING_DIR = Path("documents/temp_onboarding")


@router.post("/register", response_model=TokenResponse)
def register(req: UserRegisterRequest, db: Session = Depends(get_db)):
    user = register_user(db, req)
    token = create_access_token(data={"sub": str(user.id), "email": user.email})
    companies = get_user_companies_info(db, user.id)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            is_active=user.is_active,
            companies=companies
        )
    )


@router.post("/login", response_model=TokenResponse)
def login(req: UserLoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, req)
    token = create_access_token(data={"sub": str(user.id), "email": user.email})
    companies = get_user_companies_info(db, user.id)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            is_active=user.is_active,
            companies=companies
        )
    )


@router.get("/me", response_model=UserResponse)
def get_me(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    companies = get_user_companies_info(db, user.id)
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        companies=companies
    )


@router.post("/delete-account", response_model=UserAccountDeleteResponse)
@router.delete("/account", response_model=UserAccountDeleteResponse)
def delete_user_account(
    req: UserAccountDeleteRequest,
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Permanently deletes the registered account and all associated data:
    1. Authenticate user credentials and confirm explicit 'DELETE' string.
    2. Identify all companies associated with this user:
       - Companies exclusively owned/belonging to this user (excluding protected COMP-000001)
         are completely wiped: company profile, setup documents, accounting documents,
         transactions, journals, ledger, bank integrations, inventory, customers, suppliers,
         fixed assets, accruals/prepayments, chart of accounts, and file storage.
       - Shared companies preserve other users' accounting data; only this user's membership
         is removed (reassigning OWNER role if needed).
       - COMP-000001 is protected and its system templates are preserved.
    3. Purge temporary registration sessions and isolated draft folders.
    4. Delete user credentials and authentication profile.
    5. Clean up application file storage post-commit.
    """
    # 1. Require typing DELETE
    if req.confirmation_text.strip() != "DELETE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirmation failed. You must type 'DELETE' to confirm account deletion."
        )

    # 2. Re-verify password
    if not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password. Account deletion authorization failed."
        )

    user_email = user.email.lower().strip()
    user_id = user.id

    # 3. Inspect memberships and company associations
    memberships = db.query(UserCompanyModel).filter(UserCompanyModel.user_id == user_id).all()
    user_comp_ids = [m.company_id for m in memberships]

    sole_owned_companies = []
    shared_companies = []

    for comp_id in user_comp_ids:
        # Never destroy protected system company COMP-000001
        if comp_id == "COMP-000001":
            continue

        other_members = db.query(UserCompanyModel).filter(
            UserCompanyModel.company_id == comp_id,
            UserCompanyModel.user_id != user_id
        ).all()

        if len(other_members) == 0:
            sole_owned_companies.append(comp_id)
        else:
            shared_companies.append((comp_id, other_members))

    # 4. Pre-collect all physical files & directories to delete for exclusively owned companies
    dirs_to_delete = set()
    files_to_delete = set()

    for comp_id in sole_owned_companies:
        # Onboarding directory
        onboarding_dir = (UPLOAD_BASE_DIR / comp_id).resolve()
        dirs_to_delete.add(onboarding_dir)

        # Permanent company directory
        comp_dir = (DOCUMENTS_DIR / comp_id).resolve()
        dirs_to_delete.add(comp_dir)

        # Document files and folders
        docs = db.query(DocumentModel).filter(DocumentModel.company_id == comp_id).all()
        for d in docs:
            if d.document_id:
                doc_dir = (DOCUMENTS_DIR / d.document_id).resolve()
                dirs_to_delete.add(doc_dir)
            if d.file_path:
                files_to_delete.add(Path(d.file_path).resolve())

        # Opening balance documents
        ob_docs = db.query(OpeningBalanceDocumentModel).filter(OpeningBalanceDocumentModel.company_id == comp_id).all()
        for ob in ob_docs:
            if ob.file_path:
                files_to_delete.add(Path(ob.file_path).resolve())

        # Bank transaction PDFs
        bank_txs = db.query(BankTransactionModel).filter(BankTransactionModel.company_id == comp_id).all()
        for bt in bank_txs:
            b_path = getattr(bt, "pdf_file_path", None) or getattr(bt, "pdf_path", None)
            if b_path:
                files_to_delete.add(Path(b_path).resolve())

    # Pre-collect temporary onboarding session folders for this user's email
    temp_sessions = db.query(RegistrationSessionModel).filter(
        RegistrationSessionModel.email == user_email
    ).all()
    for s in temp_sessions:
        session_dir = (TEMP_ONBOARDING_DIR / s.session_id).resolve()
        dirs_to_delete.add(session_dir)

    # 5. Perform atomic database deletion in strict dependency order
    deleted_comp_labels = []
    try:
        # A. Exclusively owned companies: delete all child records and the company itself
        for comp_id in sole_owned_companies:
            comp_obj = db.query(CompanyModel).filter(CompanyModel.company_id == comp_id).first()
            if comp_obj:
                deleted_comp_labels.append(f"{comp_obj.company_name} ({comp_id})")

            # Opening balance drafts, batches, documents
            db.query(OpeningBalanceDraftRecordModel).filter(OpeningBalanceDraftRecordModel.company_id == comp_id).delete(synchronize_session=False)
            db.query(OpeningBalanceBatchModel).filter(OpeningBalanceBatchModel.company_id == comp_id).delete(synchronize_session=False)
            db.query(OpeningBalanceDocumentModel).filter(OpeningBalanceDocumentModel.company_id == comp_id).delete(synchronize_session=False)

            # Subledgers: customers, suppliers, inventory, fixed assets
            db.query(CustomerModel).filter(CustomerModel.company_id == comp_id).delete(synchronize_session=False)
            db.query(SupplierModel).filter(SupplierModel.company_id == comp_id).delete(synchronize_session=False)
            db.query(InventoryItemModel).filter(InventoryItemModel.company_id == comp_id).delete(synchronize_session=False)
            db.query(FixedAssetModel).filter(FixedAssetModel.company_id == comp_id).delete(synchronize_session=False)

            # Ingestion: Source emails and email attachments
            src_emails = db.query(EmailSourceModel).filter(EmailSourceModel.company_id == comp_id).all()
            src_email_ids = [e.id for e in src_emails]
            if src_email_ids:
                db.query(EmailAttachmentModel).filter(EmailAttachmentModel.email_source_id.in_(src_email_ids)).delete(synchronize_session=False)
            db.query(EmailSourceModel).filter(EmailSourceModel.company_id == comp_id).delete(synchronize_session=False)

            # Bank transactions
            db.query(BankTransactionModel).filter(BankTransactionModel.company_id == comp_id).delete(synchronize_session=False)

            # Accruals & prepayments
            db.query(AccrualAdjustmentRecordModel).filter(AccrualAdjustmentRecordModel.company_id == comp_id).delete(synchronize_session=False)
            db.query(AccrualPrepaymentModel).filter(AccrualPrepaymentModel.company_id == comp_id).delete(synchronize_session=False)

            # Accounting transactions and journals
            db.query(JournalEntryModel).filter(JournalEntryModel.company_id == comp_id).delete(synchronize_session=False)
            db.query(AccountingTransactionModel).filter(AccountingTransactionModel.company_id == comp_id).delete(synchronize_session=False)

            # Documents & Chart of accounts
            db.query(DocumentModel).filter(DocumentModel.company_id == comp_id).delete(synchronize_session=False)
            db.query(ChartOfAccountModel).filter(ChartOfAccountModel.company_id == comp_id).delete(synchronize_session=False)

            # User company memberships for this company
            db.query(UserCompanyModel).filter(UserCompanyModel.company_id == comp_id).delete(synchronize_session=False)

            # Delete the company profile record
            if comp_obj:
                db.delete(comp_obj)
            else:
                db.query(CompanyModel).filter(CompanyModel.company_id == comp_id).delete(synchronize_session=False)

        # B. Shared companies: remove this user's membership and maintain owner continuity
        for comp_id, other_members in shared_companies:
            db.query(UserCompanyModel).filter(
                UserCompanyModel.user_id == user_id,
                UserCompanyModel.company_id == comp_id
            ).delete(synchronize_session=False)

            remaining_owners = [m for m in other_members if m.role == "OWNER"]
            if not remaining_owners and other_members:
                other_members[0].role = "OWNER"

        # C. Remove any remaining user company links for this user (e.g. COMP-000001)
        db.query(UserCompanyModel).filter(UserCompanyModel.user_id == user_id).delete(synchronize_session=False)

        # D. Purge all registration sessions for this email
        db.query(RegistrationSessionModel).filter(
            RegistrationSessionModel.email == user_email
        ).delete(synchronize_session=False)

        # E. Ensure at least one remaining company is active
        active_comp = db.query(CompanyModel).filter(CompanyModel.is_active == True).first()
        if not active_comp:
            other_comp = db.query(CompanyModel).first()
            if other_comp:
                other_comp.is_active = True

        # F. Delete the UserModel record
        db.delete(user)

        # Commit the transaction atomically
        db.commit()

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete registered account {user_email}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete registered account database records: {str(e)}"
        )

    # 6. Post-commit file storage cleanup (Never invalidate committed DB on cleanup error)
    base_docs_dir = DOCUMENTS_DIR.resolve()

    for d in dirs_to_delete:
        try:
            d_path = Path(d).resolve()
            if d_path.exists() and d_path.is_dir() and d_path != base_docs_dir:
                shutil.rmtree(d_path, ignore_errors=True)
        except Exception as cleanup_err:
            logger.warning(f"Failed to delete directory {d}: {cleanup_err}")

    for f in files_to_delete:
        try:
            f_path = Path(f).resolve()
            if f_path.exists() and f_path.is_file():
                f_path.unlink(missing_ok=True)
        except Exception as cleanup_err:
            logger.warning(f"Failed to delete file {f}: {cleanup_err}")

    return UserAccountDeleteResponse(
        message=f"Registered account '{user_email}' and all associated company and accounting data have been permanently deleted.",
        deleted_user_email=user_email,
        deleted_companies=deleted_comp_labels
    )
