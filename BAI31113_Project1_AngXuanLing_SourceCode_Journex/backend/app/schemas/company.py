from pydantic import BaseModel
from typing import Optional, List, Dict, Any


class CompanyBase(BaseModel):
    company_name: str
    registration_number: Optional[str] = None
    currency: str = "MYR"
    financial_year: int = 2026
    address: Optional[str] = None
    tax_number: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    logo_path: Optional[str] = None
    financial_year_start: Optional[str] = None
    financial_year_end: Optional[str] = None


class CompanyCreate(CompanyBase):
    pass


class CompanyUpdate(CompanyBase):
    is_active: Optional[bool] = None


class CompanyResponse(CompanyBase):
    id: int
    company_id: str
    is_active: bool = False
    onboarding_status: Optional[str] = "ACTIVE"
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class CompanyListResponse(BaseModel):
    active_company: Optional[CompanyResponse] = None
    companies: List[CompanyResponse] = []


class CompanyDeleteRequest(BaseModel):
    password: str
    confirmation_text: str  # Must be "DELETE"


class CompanyDeleteResponse(BaseModel):
    message: str
    deleted_company_id: str
    remaining_companies: List[Dict[str, Any]] = []
    next_active_company_id: Optional[str] = None
