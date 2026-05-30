from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ManagerCreate(BaseModel):
    first_name: str = Field(..., max_length=80)
    last_name: str = Field(..., max_length=80)
    middle_name: str | None = Field(None, max_length=80)
    phone: str | None = Field(None, max_length=32)
    username: str = Field(..., min_length=3, max_length=40)
    password: str = Field(..., min_length=6, max_length=128)
    is_active: bool = True
    position: str = Field("manager", max_length=40)
    birth_date: date | None = None
    hire_date: date | None = None
    gender: str | None = None


class ManagerUpdate(BaseModel):
    first_name: str | None = Field(None, max_length=80)
    last_name: str | None = Field(None, max_length=80)
    middle_name: str | None = Field(None, max_length=80)
    phone: str | None = Field(None, max_length=32)
    username: str | None = Field(None, min_length=3, max_length=40)
    password: str | None = Field(None, min_length=6, max_length=128)
    is_active: bool | None = None
    position: str | None = Field(None, max_length=40)
    birth_date: date | None = None
    hire_date: date | None = None
    gender: str | None = None


class ManagerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    first_name: str
    last_name: str
    middle_name: str | None
    phone: str | None
    username: str
    is_active: bool
    position: str = "manager"
    birth_date: date | None = None
    hire_date: date | None = None
    gender: str | None = None
    avatar_base64: str | None = None
    has_account: bool = False
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def _derive_has_account(cls, data):
        if hasattr(data, "password_hash"):
            return {
                "id": data.id,
                "first_name": data.first_name,
                "last_name": data.last_name,
                "middle_name": data.middle_name,
                "phone": data.phone,
                "username": data.username,
                "is_active": data.is_active,
                "position": getattr(data, "position", "manager") or "manager",
                "birth_date": getattr(data, "birth_date", None),
                "hire_date": getattr(data, "hire_date", None),
                "gender": getattr(data, "gender", None),
                "avatar_base64": data.avatar_base64,
                "has_account": bool(data.password_hash),
                "created_at": data.created_at,
                "updated_at": data.updated_at,
            }
        return data


class ManagerListResponse(BaseModel):
    items: list[ManagerRead]
    total: int
