from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_admin, get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.models.session import Session
from app.models.manager import Manager
from app.models.student import Student
from app.models.teacher import Teacher
from app.schemas.auth import (
    AdminProfileRead,
    AdminProfileUpdate,
    AuthUser,
    ChangePasswordRequest,
    LoginRequest,
    ManagerProfileRead,
    MessageResponse,
    TeacherProfileRead,
    TokenResponse,
)
from app.schemas.student import StudentSelfProfile, normalise_phone
from app.schemas.session import SessionListResponse, SessionRead
from app.services.admin_settings_service import (
    get_or_create_settings,
    update_password,
    update_profile,
)
from app.services.session_service import (
    create_session,
    generate_jti,
    get_active_session_by_jti,
    list_active_sessions,
    revoke_all_except,
    revoke_session,
)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Login ──────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(
    credentials: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    raw_login = credentials.login.strip()
    lowered = raw_login.lower()

    user_agent = request.headers.get("user-agent")
    xff = request.headers.get("x-forwarded-for")
    ip = (
        xff.split(",")[0].strip() if xff else (request.client.host if request.client else None)
    )

    # 1) Try admin
    if lowered == settings.ADMIN_LOGIN.lower():
        admin_row = await get_or_create_settings(db, settings.ADMIN_PASSWORD)
        if not verify_password(credentials.password, admin_row.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid login or password",
            )

        jti = generate_jti()
        await create_session(
            db,
            jti=jti,
            user_agent=user_agent,
            ip_address=ip,
            subject=settings.ADMIN_LOGIN,
            role="admin",
        )
        expires = timedelta(days=50) if credentials.remember_me else None
        token = create_access_token(
            subject=settings.ADMIN_LOGIN,
            jti=jti,
            expires_delta=expires,
            extra_claims={"role": "admin"},
        )
        return TokenResponse(
            access_token=token,
            token_type="bearer",
            user=AuthUser(login=settings.ADMIN_LOGIN, role="admin"),
        )

    # 2) Try teacher
    res = await db.execute(select(Teacher).where(Teacher.username == lowered))
    teacher = res.scalar_one_or_none()
    if (
        teacher is not None
        and teacher.is_active
        and teacher.password_hash
        and verify_password(credentials.password, teacher.password_hash)
    ):
        jti = generate_jti()
        await create_session(
            db,
            jti=jti,
            user_agent=user_agent,
            ip_address=ip,
            subject=teacher.username,
            role="teacher",
        )
        full_name = " ".join(
            p for p in (teacher.last_name, teacher.first_name, teacher.middle_name) if p
        )
        expires = timedelta(days=50) if credentials.remember_me else None
        token = create_access_token(
            subject=teacher.username,
            jti=jti,
            expires_delta=expires,
            extra_claims={"role": "teacher", "tid": teacher.id},
        )
        return TokenResponse(
            access_token=token,
            token_type="bearer",
            user=AuthUser(
                login=teacher.username,
                role="teacher",
                id=teacher.id,
                name=full_name or teacher.username,
            ),
        )

    # 3) Try student — login is the (normalised) phone.
    student_login = normalise_phone(raw_login)
    if student_login:
        res = await db.execute(
            select(Student).where(Student.phone == student_login)
        )
        student = res.scalar_one_or_none()
        if (
            student is not None
            and student.is_active
            and student.password_hash
            and verify_password(credentials.password, student.password_hash)
        ):
            jti = generate_jti()
            await create_session(
                db,
                jti=jti,
                user_agent=user_agent,
                ip_address=ip,
                subject=student.phone,
                role="student",
            )
            expires = timedelta(days=50) if credentials.remember_me else None
            token = create_access_token(
                subject=student.phone,
                jti=jti,
                expires_delta=expires,
                extra_claims={"role": "student", "sid": student.id},
            )
            return TokenResponse(
                access_token=token,
                token_type="bearer",
                user=AuthUser(
                    login=student.phone,
                    role="student",
                    id=student.id,
                    name=student.full_name,
                ),
            )

    # 4) Try manager
    res = await db.execute(select(Manager).where(Manager.username == lowered))
    manager = res.scalar_one_or_none()
    if (
        manager is not None
        and manager.is_active
        and manager.password_hash
        and verify_password(credentials.password, manager.password_hash)
    ):
        jti = generate_jti()
        await create_session(
            db,
            jti=jti,
            user_agent=user_agent,
            ip_address=ip,
            subject=manager.username,
            role="manager",
        )
        full_name = " ".join(
            p for p in (manager.last_name, manager.first_name, manager.middle_name) if p
        )
        expires = timedelta(days=50) if credentials.remember_me else None
        token = create_access_token(
            subject=manager.username,
            jti=jti,
            expires_delta=expires,
            extra_claims={"role": "manager", "mid": manager.id},
        )
        return TokenResponse(
            access_token=token,
            token_type="bearer",
            user=AuthUser(
                login=manager.username,
                role="manager",
                id=manager.id,
                name=full_name or manager.username,
            ),
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid login or password",
    )


# ── Me ─────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=AuthUser)
async def me(current: AuthUser = Depends(get_current_user)):
    return current


# ── Profile ────────────────────────────────────────────────────────────────


@router.get("/profile")
async def get_profile(
    db: AsyncSession = Depends(get_db),
    current: AuthUser = Depends(get_current_user),
):
    if current.role == "admin":
        row = await get_or_create_settings(db, settings.ADMIN_PASSWORD)
        return AdminProfileRead(
            login=settings.ADMIN_LOGIN,
            first_name=row.first_name,
            last_name=row.last_name,
            middle_name=row.middle_name,
            phone=row.phone,
            avatar_base64=row.avatar_base64,
        )

    if current.role == "student":
        student = await db.get(Student, current.id)
        if not student:
            raise HTTPException(status_code=404, detail="Ученик не найден")
        return StudentSelfProfile(
            id=student.id,
            full_name=student.full_name,
            phone=student.phone,
            parent_phone=student.parent_phone,
            gender=student.gender,
            birth_date=student.birth_date,
            source=student.source,
            group_id=student.group_id,
            group_code=student.group_code,
            course_name=student.course_name,
            payment_status=student.payment_status,
            is_active=student.is_active,
            created_at=student.created_at,
        )

    if current.role == "manager":
        manager = await db.get(Manager, current.id)
        if not manager:
            raise HTTPException(status_code=404, detail="Менеджер не найден")
        return ManagerProfileRead(
            id=manager.id,
            login=manager.username,
            first_name=manager.first_name,
            last_name=manager.last_name,
            middle_name=manager.middle_name,
            phone=manager.phone,
            is_active=manager.is_active,
            avatar_base64=manager.avatar_base64,
        )

    # teacher
    teacher = await db.get(Teacher, current.id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Преподаватель не найден")
    return TeacherProfileRead(
        id=teacher.id,
        login=teacher.username or "",
        first_name=teacher.first_name,
        last_name=teacher.last_name,
        middle_name=teacher.middle_name,
        phone=teacher.phone,
        is_active=teacher.is_active,
        avatar_base64=teacher.avatar_base64,
    )


@router.patch("/profile")
async def patch_profile(
    data: AdminProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current: AuthUser = Depends(get_current_user),
):
    if data.avatar_base64 is not None:
        val = data.avatar_base64.strip()
        if val and not val.startswith("data:image/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Аватар должен быть data URL (data:image/...)",
            )

    if current.role == "admin":
        avatar_set = "avatar_base64" in data.model_fields_set

        row = await update_profile(
            db,
            first_name=data.first_name,
            last_name=data.last_name,
            middle_name=data.middle_name,
            phone=data.phone,
            avatar_base64=data.avatar_base64,
            avatar_set=avatar_set,
        )
        return AdminProfileRead(
            login=settings.ADMIN_LOGIN,
            first_name=row.first_name,
            last_name=row.last_name,
            middle_name=row.middle_name,
            phone=row.phone,
            avatar_base64=row.avatar_base64,
        )

    if current.role == "student":
        # Students cannot edit their own profile through this endpoint.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Профиль ученика редактирует администратор",
        )

    if current.role == "manager":
        set_fields = data.model_fields_set
        forbidden = set_fields - {"avatar_base64"}
        if forbidden:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Менеджер может изменять только аватар.",
            )
        manager = await db.get(Manager, current.id)
        if not manager:
            raise HTTPException(status_code=404, detail="Менеджер не найден")
        if "avatar_base64" in set_fields:
            manager.avatar_base64 = data.avatar_base64
            await db.commit()
            await db.refresh(manager)
        return ManagerProfileRead(
            id=manager.id,
            login=manager.username,
            first_name=manager.first_name,
            last_name=manager.last_name,
            middle_name=manager.middle_name,
            phone=manager.phone,
            is_active=manager.is_active,
            avatar_base64=manager.avatar_base64,
        )

    # teacher: only `avatar_base64` may change
    set_fields = data.model_fields_set
    forbidden = set_fields - {"avatar_base64"}
    if forbidden:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Преподаватель может изменять только аватар. "
                "Остальные поля заполняет администратор."
            ),
        )

    teacher = await db.get(Teacher, current.id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Преподаватель не найден")

    if "avatar_base64" in set_fields:
        teacher.avatar_base64 = data.avatar_base64
        await db.commit()
        await db.refresh(teacher)

    return TeacherProfileRead(
        id=teacher.id,
        login=teacher.username or "",
        first_name=teacher.first_name,
        last_name=teacher.last_name,
        middle_name=teacher.middle_name,
        phone=teacher.phone,
        is_active=teacher.is_active,
        avatar_base64=teacher.avatar_base64,
    )


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    data: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current: AuthUser = Depends(get_current_user),
):
    if current.role == "admin":
        row = await get_or_create_settings(db, settings.ADMIN_PASSWORD)
        if not verify_password(data.old_password, row.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Неверный текущий пароль"
            )
        if data.old_password == data.new_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Новый пароль должен отличаться от старого",
            )
        await update_password(db, data.new_password)
        return MessageResponse(message="Пароль успешно изменён")

    if current.role == "student":
        # Students cannot self-manage credentials. Password is set/reset by an
        # admin from the student's profile screen.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Смену пароля производит администратор",
        )

    if current.role == "manager":
        manager = await db.get(Manager, current.id)
        if not manager or not manager.password_hash:
            raise HTTPException(status_code=404, detail="Учётная запись не найдена")
        if not verify_password(data.old_password, manager.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Неверный текущий пароль"
            )
        if data.old_password == data.new_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Новый пароль должен отличаться от старого",
            )
        manager.password_hash = hash_password(data.new_password)
        await db.commit()
        return MessageResponse(message="Пароль успешно изменён")

    # teacher
    teacher = await db.get(Teacher, current.id)
    if not teacher or not teacher.password_hash:
        raise HTTPException(status_code=404, detail="Учётная запись не найдена")
    if not verify_password(data.old_password, teacher.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Неверный текущий пароль"
        )
    if data.old_password == data.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Новый пароль должен отличаться от старого",
        )
    teacher.password_hash = hash_password(data.new_password)
    await db.commit()
    return MessageResponse(message="Пароль успешно изменён")


# ── Sessions ───────────────────────────────────────────────────────────────


@router.get("/sessions", response_model=SessionListResponse)
async def get_sessions(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: AuthUser = Depends(get_current_user),
):
    current_jti = request.state.current_jti
    sessions = await list_active_sessions(
        db, subject=current.login, role=current.role
    )
    items = []
    for s in sessions:
        item = SessionRead.model_validate(s)
        item.is_current = (s.jti == current_jti)
        items.append(item)
    return SessionListResponse(items=items)


@router.post("/logout", response_model=MessageResponse)
async def logout(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: AuthUser = Depends(get_current_user),
):
    """Отзывает текущую сессию."""
    current_jti = request.state.current_jti
    session = await get_active_session_by_jti(db, current_jti)
    if session:
        await revoke_session(
            db, session.id, subject=current.login, role=current.role
        )
    return MessageResponse(message="Вы вышли из аккаунта")


@router.delete("/sessions/{session_id}", response_model=MessageResponse)
async def delete_session(
    session_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: AuthUser = Depends(get_current_user),
):
    """Отзывает конкретную (чужую) сессию того же пользователя."""
    current_jti = request.state.current_jti

    target = await db.get(Session, session_id)
    # Hide cross-user sessions: respond 404 instead of 403/400
    if (
        not target
        or target.subject != current.login
        or target.role != current.role
    ):
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    if target.jti == current_jti:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Используйте /logout для выхода с текущего устройства",
        )
    if target.revoked_at is not None:
        raise HTTPException(status_code=404, detail="Сессия уже отозвана")

    await revoke_session(
        db, session_id, subject=current.login, role=current.role
    )
    return MessageResponse(message="Устройство отключено")


@router.post("/sessions/logout-all", response_model=MessageResponse)
async def logout_all(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: AuthUser = Depends(get_current_user),
):
    """Отзывает все сессии текущего пользователя кроме текущей."""
    current_jti = request.state.current_jti
    count = await revoke_all_except(
        db, current_jti, subject=current.login, role=current.role
    )
    return MessageResponse(message=f"Отключено устройств: {count}")
