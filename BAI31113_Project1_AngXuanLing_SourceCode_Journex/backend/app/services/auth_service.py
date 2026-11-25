import os
import datetime
import bcrypt
import jwt
from typing import Optional, List
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import UserModel, UserCompanyModel, CompanyModel, get_local_now
from app.schemas.auth import UserRegisterRequest, UserLoginRequest, UserResponse, CompanyMembershipInfo

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "agentic-accounting-jwt-secret-key-2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.datetime.now(datetime.timezone.utc) + expires_delta
    else:
        expire = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_user_companies_info(db: Session, user_id: int) -> List[CompanyMembershipInfo]:
    memberships = db.query(UserCompanyModel).filter(UserCompanyModel.user_id == user_id).all()
    results = []
    for m in memberships:
        comp = db.query(CompanyModel).filter(CompanyModel.company_id == m.company_id).first()
        if comp:
            results.append(CompanyMembershipInfo(
                company_id=comp.company_id,
                company_name=comp.company_name,
                role=m.role or "OWNER",
                is_default=bool(m.is_default),
                onboarding_status=comp.onboarding_status or "ACTIVE"
            ))
    return results


def register_user(db: Session, req: UserRegisterRequest) -> UserModel:
    existing = db.query(UserModel).filter(UserModel.email == req.email.lower().strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists."
        )

    hashed = hash_password(req.password)
    user = UserModel(
        email=req.email.lower().strip(),
        password_hash=hashed,
        full_name=req.full_name.strip(),
        role="USER",
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, req: UserLoginRequest) -> UserModel:
    raw_email = req.email.lower().strip()
    if raw_email in ["admin", "administrator", "director tan"]:
        user = db.query(UserModel).filter(UserModel.email == "admin@nexttech.com").first()
    else:
        user = db.query(UserModel).filter(UserModel.email == raw_email).first()

    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated."
        )
    return user


def get_current_user_optional(
    auth_header: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> Optional[UserModel]:
    """Returns the current user if token is present, else None."""
    if not auth_header:
        return None
    token = auth_header.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            return None
        user = db.query(UserModel).filter(UserModel.id == int(user_id)).first()
        return user
    except Exception:
        return None


def get_current_user(
    auth_header: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> UserModel:
    """Enforces authentication; raises 401 if missing or invalid."""
    user = get_current_user_optional(auth_header, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in."
        )
    return user


def check_company_membership(
    db: Session,
    company_id: str,
    user: Optional[UserModel],
    required_roles: Optional[List[str]] = None
) -> Optional[UserCompanyModel]:
    """
    Verifies that the user has permission to access the specified company.
    Prevents cross-company data access.
    """
    if not company_id:
        return None
    
    # Check if the company exists
    comp = db.query(CompanyModel).filter(CompanyModel.company_id == company_id).first()
    if not comp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company with ID '{company_id}' not found."
        )

    # Check if this company has registered users in user_companies
    has_members = db.query(UserCompanyModel).filter(UserCompanyModel.company_id == company_id).count() > 0

    if has_members:
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required to access this company's records."
            )
        membership = db.query(UserCompanyModel).filter(
            UserCompanyModel.user_id == user.id,
            UserCompanyModel.company_id == company_id
        ).first()
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You are not authorized to access this company's records."
            )
        if required_roles and membership.role not in required_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Action requires one of the following roles: {', '.join(required_roles)}. Current role: {membership.role}"
            )
        return membership

    return None
