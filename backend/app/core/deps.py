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


async def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> AuthUser:
    """Resolve the authenticated user from JWT — admin or teacher."""
    payload = decode_token(token)
    sub = payload.get("sub")
    jti = payload.get("jti")
    # Missing role is treated as invalid (no implicit admin elevation).
    role = payload.get("role")

    if not sub or not jti or not role:
        raise _unauthorized("Invalid credentials")

    session = await get_active_session_by_jti(db, jti)
    if not session:
        raise _unauthorized("Session revoked or expired")

    if role == "admin":
        if sub != settings.ADMIN_LOGIN:
            raise _unauthorized("Invalid credentials")
        await touch_session(db, session)
        request.state.current_jti = jti
        request.state.user_role = "admin"
        request.state.user_id = None
        return AuthUser(login=settings.ADMIN_LOGIN, role="admin")

    if role == "teacher":
        tid_raw = payload.get("tid")
        if tid_raw is None:
            raise _unauthorized("Invalid credentials")
        try:
            tid_int = int(tid_raw)
        except (TypeError, ValueError):
            raise _unauthorized("Invalid credentials")
        teacher = await db.get(Teacher, tid_int)
        if not teacher or not teacher.is_active or not teacher.username:
            raise _unauthorized("Account disabled")
        if teacher.username != sub:
            raise _unauthorized("Invalid credentials")
        await touch_session(db, session)
        request.state.current_jti = jti
        request.state.user_role = "teacher"
        request.state.user_id = teacher.id
        full_name = " ".join(
            p for p in (teacher.last_name, teacher.first_name, teacher.middle_name) if p
        )
        return AuthUser(
            login=teacher.username,
            role="teacher",
            id=teacher.id,
            name=full_name or teacher.username,
        )

    if role == "student":
        sid_raw = payload.get("sid")
        if sid_raw is None:
            raise _unauthorized("Invalid credentials")
        try:
            sid_int = int(sid_raw)
        except (TypeError, ValueError):
            raise _unauthorized("Invalid credentials")
        student = await db.get(Student, sid_int)
        if (
            not student
            or not student.is_active
            or not student.phone
            or not student.password_hash
        ):
            raise _unauthorized("Account disabled")
        if student.phone != sub:
            raise _unauthorized("Invalid credentials")
        await touch_session(db, session)
        request.state.current_jti = jti
        request.state.user_role = "student"
        request.state.user_id = student.id
        return AuthUser(
            login=student.phone,
            role="student",
            id=student.id,
            name=student.full_name,
        )

    if role == "manager":
        mid_raw = payload.get("mid")
        if mid_raw is None:
            raise _unauthorized("Invalid credentials")
        try:
            mid_int = int(mid_raw)
        except (TypeError, ValueError):
            raise _unauthorized("Invalid credentials")
        manager = await db.get(Manager, mid_int)
        if not manager or not manager.is_active or not manager.username:
            raise _unauthorized("Account disabled")
        if manager.username != sub:
            raise _unauthorized("Invalid credentials")
        await touch_session(db, session)
        request.state.current_jti = jti
        request.state.user_role = "manager"
        request.state.user_id = manager.id
        full_name = " ".join(
            p for p in (manager.last_name, manager.first_name, manager.middle_name) if p
        )
        return AuthUser(
            login=manager.username,
            role="manager",
            id=manager.id,
            name=full_name or manager.username,
        )

    raise _unauthorized("Invalid credentials")


async def get_current_admin(
    user: AuthUser = Depends(get_current_user),
) -> AuthUser:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user


async def get_current_teacher(
    user: AuthUser = Depends(get_current_user),
) -> AuthUser:
    if user.role != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teacher access required",
        )
    return user


async def get_current_student(
    user: AuthUser = Depends(get_current_user),
) -> AuthUser:
    if user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student access required",
        )
    return user


async def get_current_manager(
    user: AuthUser = Depends(get_current_user),
) -> AuthUser:
    if user.role != "manager":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Manager access required",
        )
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
