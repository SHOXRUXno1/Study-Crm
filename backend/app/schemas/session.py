from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_type: str | None
    os_name: str | None
    browser_name: str | None
    ip_address: str | None
    city: str | None
    country: str | None
    created_at: datetime
    last_active_at: datetime
    is_current: bool = False


class SessionListResponse(BaseModel):
    items: list[SessionRead]
