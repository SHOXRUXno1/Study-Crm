from __future__ import annotations

import hashlib
from pathlib import Path
from uuid import uuid4

import aiofiles
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import RECEIPT_ALLOWED_MIMES, settings
from app.models.payment_receipt import PaymentReceipt
from app.services.finance_service import FinanceError

CHUNK_SIZE = 1024 * 1024  # 1 MB

_MIME_TO_EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "text/csv": ".csv",
}


def _matches_magic(content_type: str, head: bytes) -> bool:
    if content_type == "application/pdf":
        return head.startswith(b"%PDF")
    if content_type == "image/png":
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/jpeg":
        return head.startswith(b"\xff\xd8\xff")
    if content_type == "image/gif":
        return head.startswith((b"GIF87a", b"GIF89a"))
    if content_type == "image/webp":
        return len(head) >= 12 and head.startswith(b"RIFF") and head[8:12] == b"WEBP"
    if content_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        return head.startswith(b"PK\x03\x04")
    if content_type == "application/vnd.ms-excel":
        return head.startswith(b"\xd0\xcf\x11\xe0")
    # text/csv and image/heic are validated by MIME/type and size only.
    return True


async def validate_upload(upload: UploadFile) -> None:
    content_type = (upload.content_type or "").lower().strip()
    if content_type not in RECEIPT_ALLOWED_MIMES:
        raise FinanceError("receipt_unsupported_type")
    await upload.seek(0)
    head = await upload.read(32)
    await upload.seek(0)
    if not _matches_magic(content_type, head):
        raise FinanceError("receipt_unsupported_type")


def _receipt_dir(payment_id: int) -> Path:
    return Path(settings.UPLOAD_DIR) / "payments" / str(payment_id)


def get_receipt_path(*, payment_id: int, stored_name: str) -> Path:
    return _receipt_dir(payment_id) / stored_name


async def save_payment_receipt(
    db: AsyncSession,
    *,
    payment_id: int,
    upload: UploadFile,
) -> PaymentReceipt:
    await validate_upload(upload)

    content_type = (upload.content_type or "").lower().strip()
    ext = _MIME_TO_EXT.get(content_type, "")
    stored_name = f"{uuid4().hex}{ext}"
    target_dir = _receipt_dir(payment_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / stored_name

    sha256 = hashlib.sha256()
    size_bytes = 0

    await upload.seek(0)
    try:
        async with aiofiles.open(target_path, "wb") as out:
            while True:
                chunk = await upload.read(CHUNK_SIZE)
                if not chunk:
                    break
                size_bytes += len(chunk)
                if size_bytes > settings.RECEIPT_MAX_SIZE_MB * 1024 * 1024:
                    raise FinanceError("receipt_too_large")
                sha256.update(chunk)
                await out.write(chunk)
    except Exception:
        try:
            if target_path.exists():
                target_path.unlink()
        except OSError:
            pass
        raise
    finally:
        await upload.close()

    receipt = PaymentReceipt(
        payment_id=payment_id,
        original_name=upload.filename or stored_name,
        stored_name=stored_name,
        mime_type=content_type,
        size_bytes=size_bytes,
        sha256=sha256.hexdigest(),
    )
    db.add(receipt)
    await db.flush()
    return receipt


async def delete_payment_receipt(db: AsyncSession, *, receipt: PaymentReceipt) -> None:
    path = get_receipt_path(payment_id=receipt.payment_id, stored_name=receipt.stored_name)
    await db.delete(receipt)
    await db.flush()

    try:
        if path.exists():
            path.unlink()
        parent = path.parent
        if parent.exists() and not any(parent.iterdir()):
            parent.rmdir()
    except OSError:
        pass
