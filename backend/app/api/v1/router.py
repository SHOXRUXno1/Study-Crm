from fastapi import APIRouter

from app.api.v1 import (
    analytics,
    attendance,
    auth,
    branding,
    courses,
    dashboard,
    finance,
    groups,
    lessons,
    manager_dashboard,
    managers,
    notifications,
    rooms,
    student_dashboard,
    students,
    teacher_dashboard,
    teachers,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(branding.router)
api_router.include_router(courses.router)
api_router.include_router(rooms.router)
api_router.include_router(teachers.router)
api_router.include_router(groups.router)
api_router.include_router(students.router)
api_router.include_router(lessons.router)
api_router.include_router(attendance.router)
api_router.include_router(finance.router)
api_router.include_router(analytics.router)
api_router.include_router(notifications.router)
api_router.include_router(dashboard.router)
api_router.include_router(teacher_dashboard.router)
api_router.include_router(student_dashboard.router)
api_router.include_router(managers.router)
api_router.include_router(manager_dashboard.router)
