from pydantic import BaseModel, ConfigDict, Field


class ManagerCreate(BaseModel):
    first_name: str = Field(..., max_length=80)
    last_name: str = Field(..., max_length=80)
    middle_name: str | None = Field(None, max_length=80)
    phone: str | None = Field(None, max_length=32)
    username: str = Field(..., min_length=3, max_length=40)
    password: str = Field(..., min_length=6, max_length=128)
    is_active: bool = True


class ManagerUpdate(BaseModel):
    first_name: str | None = Field(None, max_length=80)
    last_name: str | None = Field(None, max_length=80)
    middle_name: str | None = Field(None, max_length=80)
    phone: str | None = Field(None, max_length=32)
    username: str | None = Field(None, min_length=3, max_length=40)
    password: str | None = Field(None, min_length=6, max_length=128)
    is_active: bool | None = None


class ManagerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    first_name: str
    last_name: str
    middle_name: str | None
    phone: str | None
    username: str
    is_active: bool
    avatar_base64: str | None = None


class ManagerListResponse(BaseModel):
    items: list[ManagerRead]
    total: int
