from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


UserRole = Literal["admin", "teacher", "student", "manager"]


class LoginRequest(BaseModel):
    login: str
    password: str
    remember_me: bool = False


class AuthUser(BaseModel):
    """Authenticated user — admin, teacher, student, or manager."""

    login: str
    role: UserRole
    id: int | None = None
    name: str | None = None


# Back-compat alias — keeps existing references working.
AdminUser = AuthUser


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AuthUser


class AdminProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    login: str
    first_name: str | None
    last_name: str | None
    middle_name: str | None
    phone: str | None
    avatar_base64: str | None


class AdminProfileUpdate(BaseModel):
    first_name: str | None = Field(None, max_length=80)
    last_name: str | None = Field(None, max_length=80)
    middle_name: str | None = Field(None, max_length=80)
    phone: str | None = Field(None, max_length=32)
    avatar_base64: str | None = Field(None, max_length=3_500_000)


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6, max_length=128)


class MessageResponse(BaseModel):
    message: str


class TeacherProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    login: str  # username
    first_name: str
    last_name: str
    middle_name: str | None
    phone: str | None
    is_active: bool
    avatar_base64: str | None = None


class ManagerProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    login: str  # username
    first_name: str
    last_name: str
    middle_name: str | None
    phone: str | None
    is_active: bool
    avatar_base64: str | None = None
