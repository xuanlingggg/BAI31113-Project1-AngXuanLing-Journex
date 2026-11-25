from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field


class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., min_length=2)


class UserLoginRequest(BaseModel):
    email: str
    password: str


class CompanyMembershipInfo(BaseModel):
    company_id: str
    company_name: str
    role: str
    is_default: bool
    onboarding_status: str


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    companies: List[CompanyMembershipInfo] = []


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class UserAccountDeleteRequest(BaseModel):
    password: str
    confirmation_text: str  # Must be "DELETE"


class UserAccountDeleteResponse(BaseModel):
    message: str
    deleted_user_email: Optional[str] = None
    deleted_companies: List[str] = []
