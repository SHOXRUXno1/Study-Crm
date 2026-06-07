from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_token
from app.models.manager import Manager
from app.models.student import Student
from app.models.teacher import Teacher
from app.schemas.auth import AuthUser
from app.services.session_service import (
    get_active_session_by_jti,
    touch_session,
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def _resolve_admin(payload: dict, db: AsyncSession) -> AuthUser:
    sub = payload["sub"]
    if sub != settings.ADMIN_LOGIN:
        raise _unauthorized("Invalid credentials")
    return AuthUser(login=settings.ADMIN_LOGIN, role="admin")


async def _resolve_teacher(payload: dict, db: AsyncSession) -> AuthUser:
    tid_raw = payload.get("tid")
    if tid_raw is None:
        raise _unauthorized("Invalid credentials")
    try:
        tid = int(tid_raw)
    except (TypeError, ValueError):
        raise _unauthorized("Invalid credentials")
    teacher = await db.get(Teacher, tid)
    if not teacher or not teacher.is_active or not teacher.username:
        raise _unauthorized("Account disabled")
    if teacher.username != payload["sub"]:
        raise _unauthorized("Invalid credentials")
    full_name = " ".join(
        p for p in (teacher.last_name, teacher.first_name, teacher.middle_name) if p
    )
    return AuthUser(
        login=teacher.username,
        role="teacher",
        id=teacher.id,
        name=full_name or teacher.username,
    )


async def _resolve_student(payload: dict, db: AsyncSession) -> AuthUser:
    sid_raw = payload.get("sid")
    if sid_raw is None:
        raise _unauthorized("Invalid credentials")
    try:
        sid = int(sid_raw)
    except (TypeError, ValueError):
        raise _unauthorized("Invalid credentials")
    student = await db.get(Student, sid)
    if (
        not student
        or not student.is_active
        or not student.phone
        or not student.password_hash
    ):
        raise _unauthorized("Account disabled")
    if student.phone != payload["sub"]:
        raise _unauthorized("Invalid credentials")
    return AuthUser(
        login=student.phone,
        role="student",
        id=student.id,
        name=student.full_name,
    )


async def _resolve_manager(payload: dict, db: AsyncSession) -> AuthUser:
    mid_raw = payload.get("mid")
    if mid_raw is None:
        raise _unauthorized("Invalid credentials")
    try:
        mid = int(mid_raw)
    except (TypeError, ValueError):
        raise _unauthorized("Invalid credentials")
    manager = await db.get(Manager, mid)
    if not manager or not manager.is_active or not manager.username:
        raise _unauthorized("Account disabled")
    if manager.username != payload["sub"]:
        raise _unauthorized("Invalid credentials")
    full_name = " ".join(
        p for p in (manager.last_name, manager.first_name, manager.middle_name) if p
    )
    return AuthUser(
        login=manager.username,
        role="manager",
        id=manager.id,
        name=full_name or manager.username,
    )


# Dispatch table: role → resolver function
_ROLE_RESOLVERS = {
    "admin":   _resolve_admin,
    "teacher": _resolve_teacher,
    "student": _resolve_student,
    "manager": _resolve_manager,
}


async def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> AuthUser:
    payload = decode_token(token)
    sub = payload.get("sub")
    jti = payload.get("jti")
    role = payload.get("role")  # Missing role → no implicit elevation

    if not sub or not jti or not role:
        raise _unauthorized("Invalid credentials")

    session = await get_active_session_by_jti(db, jti)
    if not session:
        raise _unauthorized("Session revoked or expired")

    resolver = _ROLE_RESOLVERS.get(role)
    if resolver is None:
        raise _unauthorized("Invalid credentials")

    user = await resolver(payload, db)
    await touch_session(db, session)
    request.state.current_jti = jti
    request.state.user_role = role
    request.state.user_id = getattr(user, "id", None)
    return user


async def get_current_admin(
    user: AuthUser = Depends(get_current_user),
) -> AuthUser:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


async def get_current_teacher(
    user: AuthUser = Depends(get_current_user),
) -> AuthUser:
    if user.role != "teacher":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher access required")
    return user


async def get_current_student(
    user: AuthUser = Depends(get_current_user),
) -> AuthUser:
    if user.role != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student access required")
    return user


async def get_current_manager(
    user: AuthUser = Depends(get_current_user),
) -> AuthUser:
    if user.role != "manager":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager access required")
    return user


async def get_current_admin_or_manager(
    user: AuthUser = Depends(get_current_user),
) -> AuthUser:
    if user.role not in ("admin", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or manager access required",
        )
    return user
