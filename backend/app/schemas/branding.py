from pydantic import BaseModel, ConfigDict, Field


class BrandingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    brand_name: str | None
    brand_logo_base64: str | None


class BrandingUpdate(BaseModel):
    brand_name: str | None = Field(None, max_length=120)
    brand_logo_base64: str | None = Field(None, max_length=1_000_000)
    logo_set: bool = False
