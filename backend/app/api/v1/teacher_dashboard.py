"""Teacher Cabinet API — teacher-only.

Single endpoint that powers the teacher's home page in one round-trip.

Returns:

* KPI block with week/month dynamics.
* Action items (pending journals + concerning students count).
* Schedule slice: current/next lesson, today's full timeline, next 7 days.
* Weekly attendance trend (last 4 ISO weeks).
* My groups with health metrics (attendance %, fill %, debtors count).
* Top-5 concerning students (by absent + late count over 30 days).

Scope: every query is constrained to ``Group.teacher_id == me`` (with a
fallback ``Lesson.teacher_id == me`` for the lesson queries, in case a single
lesson was reassigned to a different teacher).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_teacher
from app.models.attendance import Attendance
from app.models.group import Group
from app.models.lesson import Lesson
from app.models.student import Student
from app.schemas.auth import AuthUser
from app.schemas.teacher_dashboard import (
    ActionItems,
    ConcernStudent,
    PendingJournal,
    TeacherGroupRow,
    TeacherKpis,
    TeacherLessonRow,
    TeacherSummary,
    WeeklyAttendancePoint,
)
from app.services.finance_service import compute_billing_many


router = APIRouter(prefix="/teacher", tags=["teacher-cabinet"])


# ── Helpers ─────────────────────────────────────────────────────────────────
def _hhmm(t: time) -> str:
    return f"{t.hour:02d}:{t.minute:02d}"


def _time_slot(start: time, end: time) -> str:
    return f"{_hhmm(start)} \u2013 {_hhmm(end)}"


def _week_start(d: date) -> date:
    """Monday of the ISO week containing ``d``."""
    return d - timedelta(days=d.weekday())


def _week_end(d: date) -> date:
    """Sunday of the ISO week containing ``d``."""
    return _week_start(d) + timedelta(days=6)


def _promote_status(lesson: Lesson, now: datetime) -> str:
    """Auto-promote scheduled→active/completed when the slot has been entered
    or passed today. Mirrors the dashboard endpoint's behavior so the UI sees
    a consistent live status without server-side cron writes."""
    if lesson.status != "scheduled":
        return lesson.status
    if lesson.lesson_date != now.date():
        return lesson.status
    cur = now.time()
    if lesson.start_time <= cur <= lesson.end_time:
        return "active"
    if cur > lesson.end_time:
        return "completed"
    return lesson.status


def _serialise_lesson(
    lesson: Lesson,
    *,
    now: datetime,
    has_attendance: bool,
) -> TeacherLessonRow:
    g = lesson.group
    return TeacherLessonRow(
        id=lesson.id,
        group_id=lesson.group_id,
        group_code=g.code if g else "",
        course_name=g.course.name if g and g.course else None,
        room_name=lesson.room.name if lesson.room else None,
        teacher_name=None,  # the teacher viewing it is the teacher; UI hides it
        lesson_date=lesson.lesson_date,
        start_time=_hhmm(lesson.start_time),
        end_time=_hhmm(lesson.end_time),
        student_count=int(g.student_count or 0) if g else 0,
        max_students=int(g.max_students or 0) if g else 0,
        topic=lesson.topic,
        has_attendance=has_attendance,
        status=_promote_status(lesson, now),  # type: ignore[arg-type]
    )


def _classify_health(attendance_pct: int, fill_pct: int, debtors: int) -> str:
    """Group health heuristic.

    bad: attendance < 70% OR (debtors >= 3 and fill < 50%)
    warn: attendance 70-84% OR debtors >= 2 OR fill < 50%
    good: otherwise
    """
    if attendance_pct < 70 or (debtors >= 3 and fill_pct < 50):
        return "bad"
    if attendance_pct < 85 or debtors >= 2 or fill_pct < 50:
        return "warn"
    return "good"


# ── Endpoint ────────────────────────────────────────────────────────────────
@router.get("/summary", response_model=TeacherSummary)
async def get_teacher_summary(
    db: AsyncSession = Depends(get_db),
    me: AuthUser = Depends(get_current_teacher),
):
    assert me.id is not None  # enforced by get_current_teacher
    teacher_id: int = me.id
    now = datetime.now()
    today = now.date()

    week_start = _week_start(today)
    week_end = _week_end(today)
    prev_week_start = week_start - timedelta(days=7)
    prev_week_end = week_start - timedelta(days=1)
    month_ago = today - timedelta(days=30)
    week_ago = today - timedelta(days=7)
    two_weeks_ago = today - timedelta(days=14)
    upcoming_end = today + timedelta(days=7)

    # ── 1. My groups (the scope for everything else) ────────────────────────
    groups_q = await db.execute(
        select(Group)
        .options(selectinload(Group.course))
        .where(Group.teacher_id == teacher_id)
        .order_by(Group.code.asc())
    )
    my_groups: list[Group] = list(groups_q.scalars().all())
    my_group_ids: list[int] = [g.id for g in my_groups]

    # Empty-teacher early exit — return a well-formed but empty response.
    if not my_group_ids:
        return TeacherSummary(
            today=today,
            teacher_id=teacher_id,
            teacher_name=me.name,
            kpis=TeacherKpis(
                my_groups_total=0,
                my_groups_active=0,
                my_students_total=0,
                lessons_today=0,
                lessons_week_done=0,
                lessons_week_planned=0,
                lessons_month_done=0,
                attendance_rate_week_pct=0,
                attendance_rate_month_pct=0,
                attendance_delta_pct=0,
                pending_journals_count=0,
            ),
            action_items=ActionItems(
                pending_journals=[], concerning_students_count=0
            ),
            current_lesson=None,
            next_lesson=None,
            today_lessons=[],
            upcoming_week=[],
            weekly_attendance=[],
            my_groups=[],
            top_concerns=[],
        )

    teacher_lesson_filter = or_(
        Lesson.teacher_id == teacher_id,
        Lesson.group_id.in_(my_group_ids),
    )

    # ── 2. Lessons in window [month_ago, upcoming_end] ──────────────────────
    lessons_q = await db.execute(
        select(Lesson)
        .options(
            selectinload(Lesson.group).selectinload(Group.course),
            selectinload(Lesson.room),
        )
        .where(teacher_lesson_filter)
        .where(Lesson.lesson_date >= month_ago)
        .where(Lesson.lesson_date <= upcoming_end)
        .order_by(Lesson.lesson_date.asc(), Lesson.start_time.asc())
    )
    lessons_window: list[Lesson] = list(lessons_q.scalars().all())

    # Pre-compute "lesson has at least one attendance row" for the recent slice.
    recent_lesson_ids = [
        l.id for l in lessons_window if two_weeks_ago <= l.lesson_date <= today
    ]
    attendance_lesson_ids: set[int] = set()
    if recent_lesson_ids:
        att_rows = await db.execute(
            select(Attendance.lesson_id)
            .where(Attendance.lesson_id.in_(recent_lesson_ids))
            .distinct()
        )
        attendance_lesson_ids = {row[0] for row in att_rows.all()}

    # ── 3. Active student counts per group (recompute for accuracy) ─────────
    student_counts_q = await db.execute(
        select(Student.group_id, func.count(Student.id))
        .where(Student.group_id.in_(my_group_ids))
        .where(Student.is_active.is_(True))
        .group_by(Student.group_id)
    )
    student_counts: dict[int, int] = {gid: int(cnt) for gid, cnt in student_counts_q.all()}
    for g in my_groups:
        g.student_count = student_counts.get(g.id, int(g.student_count or 0))

    students_total = sum(student_counts.values())

    # ── 4. Attendance aggregates over the last 30 days ──────────────────────
    countable_lesson_filter = (
        Lesson.lesson_date.between(month_ago, today)
        & Lesson.group_id.in_(my_group_ids)
        & ~Lesson.status.in_(("cancelled", "rescheduled"))
    )

    # Per-lesson date + status for week buckets.
    att_by_period_q = await db.execute(
        select(
            Lesson.lesson_date,
            Lesson.group_id,
            Attendance.status,
            Attendance.student_id,
        )
        .select_from(Attendance)
        .join(Lesson, Attendance.lesson_id == Lesson.id)
        .where(countable_lesson_filter)
    )
    att_rows = att_by_period_q.all()

    def _is_present(status: str) -> bool:
        return status in ("present", "late")

    # Overall month + per-group rates.
    per_group_total: dict[int, int] = defaultdict(int)
    per_group_ok: dict[int, int] = defaultdict(int)
    month_total = 0
    month_ok = 0

    # Per-week (last 4 weeks).
    weeks: list[tuple[date, date]] = []
    for offset in range(3, -1, -1):  # 3,2,1,0 → oldest → newest
        ws = week_start - timedelta(days=7 * offset)
        we = ws + timedelta(days=6)
        weeks.append((ws, we))
    week_total: dict[date, int] = defaultdict(int)
    week_ok: dict[date, int] = defaultdict(int)

    # Per-student concerns.
    student_absent: dict[int, int] = defaultdict(int)
    student_late: dict[int, int] = defaultdict(int)
    student_total: dict[int, int] = defaultdict(int)
    student_last_absent: dict[int, date] = {}

    for lesson_date, group_id, status, student_id in att_rows:
        month_total += 1
        per_group_total[group_id] += 1
        if _is_present(status):
            month_ok += 1
            per_group_ok[group_id] += 1

        # Find which week bucket
        for ws, _we in weeks:
            if ws <= lesson_date <= ws + timedelta(days=6):
                week_total[ws] += 1
                if _is_present(status):
                    week_ok[ws] += 1
                break

        # Per-student
        student_total[student_id] += 1
        if status == "absent":
            student_absent[student_id] += 1
            prev = student_last_absent.get(student_id)
            if prev is None or lesson_date > prev:
                student_last_absent[student_id] = lesson_date
        elif status == "late":
            student_late[student_id] += 1

    # ── 5. Attendance for the last 7 days vs previous 7 days (for delta) ────
    week7_total = week_ok_count = 0
    prev_week_total = prev_week_ok = 0
    for lesson_date, _gid, status, _sid in att_rows:
        if week_ago <= lesson_date <= today:
            week7_total += 1
            if _is_present(status):
                week_ok_count += 1
        elif (week_ago - timedelta(days=7)) <= lesson_date < week_ago:
            prev_week_total += 1
            if _is_present(status):
                prev_week_ok += 1

    week_rate = int(round(week_ok_count * 100 / week7_total)) if week7_total else 0
    prev_week_rate = (
        int(round(prev_week_ok * 100 / prev_week_total)) if prev_week_total else 0
    )
    month_rate = int(round(month_ok * 100 / month_total)) if month_total else 0

    # ── 6. Lessons KPIs ─────────────────────────────────────────────────────
    today_lessons_raw = [l for l in lessons_window if l.lesson_date == today]
    lessons_today_count = sum(
        1 for l in today_lessons_raw if l.status not in ("cancelled", "rescheduled")
    )

    lessons_week_done = sum(
        1 for l in lessons_window
        if week_start <= l.lesson_date <= today
        and l.status == "completed"
    )
    lessons_week_planned = sum(
        1 for l in lessons_window
        if week_start <= l.lesson_date <= week_end
        and l.status in ("scheduled", "completed")
    )
    lessons_month_done = sum(
        1 for l in lessons_window
        if month_ago <= l.lesson_date <= today
        and l.status == "completed"
    )

    # ── 7. Pending journals (past 14 days) ─────────────────────────────────
    pending: list[PendingJournal] = []
    for l in lessons_window:
        if not (two_weeks_ago <= l.lesson_date <= today):
            continue
        if l.status not in ("scheduled", "completed"):
            continue
        # If the date is in the future or the slot hasn't started yet today, skip.
        if l.lesson_date == today and l.start_time > now.time():
            continue

        missing_topic = not (l.topic and l.topic.strip())
        missing_attendance = l.id not in attendance_lesson_ids
        if not (missing_topic or missing_attendance):
            continue
        g = l.group
        pending.append(PendingJournal(
            lesson_id=l.id,
            group_id=l.group_id,
            group_code=g.code if g else "",
            course_name=g.course.name if g and g.course else None,
            lesson_date=l.lesson_date,
            start_time=_hhmm(l.start_time),
            days_ago=(today - l.lesson_date).days,
            missing_topic=missing_topic,
            missing_attendance=missing_attendance,
        ))
    # Sort: oldest first (most urgent).
    pending.sort(key=lambda p: (p.lesson_date, p.start_time))

    # ── 8. Today + upcoming week serialisation ──────────────────────────────
    today_rows: list[TeacherLessonRow] = []
    for l in today_lessons_raw:
        today_rows.append(
            _serialise_lesson(
                l, now=now, has_attendance=l.id in attendance_lesson_ids
            )
        )

    # Find current / next lesson (from today's rows).
    current_lesson: Optional[TeacherLessonRow] = None
    next_lesson: Optional[TeacherLessonRow] = None
    cur_t = now.time()
    for row in today_rows:
        if row.status == "active":
            current_lesson = row
            break
    if current_lesson is None:
        # First scheduled lesson today whose start_time is in the future.
        for row, raw in zip(today_rows, today_lessons_raw):
            if row.status == "scheduled" and raw.start_time >= cur_t:
                next_lesson = row
                break
        # Or first scheduled lesson in upcoming days.
        if next_lesson is None:
            for l in lessons_window:
                if l.lesson_date <= today:
                    continue
                if l.status != "scheduled":
                    continue
                next_lesson = _serialise_lesson(
                    l, now=now, has_attendance=l.id in attendance_lesson_ids
                )
                break

    upcoming_rows: list[TeacherLessonRow] = []
    for l in lessons_window:
        if l.lesson_date <= today or l.lesson_date > upcoming_end:
            continue
        if l.status in ("cancelled", "rescheduled"):
            continue
        upcoming_rows.append(
            _serialise_lesson(
                l, now=now, has_attendance=l.id in attendance_lesson_ids
            )
        )

    # ── 9. Weekly attendance trend (4 weeks) ───────────────────────────────
    weekly_points: list[WeeklyAttendancePoint] = []
    for i, (ws, we) in enumerate(weeks, start=1):
        total = week_total.get(ws, 0)
        ok = week_ok.get(ws, 0)
        rate = int(round(ok * 100 / total)) if total else 0
        weekly_points.append(WeeklyAttendancePoint(
            week_label=f"W{i}",
            week_start=ws,
            week_end=we,
            rate_pct=rate,
            total_marks=total,
        ))

    # ── 10. Debtors per group (compute_billing_many over my students) ──────
    students_q = await db.execute(
        select(Student)
        .where(Student.group_id.in_(my_group_ids))
        .where(Student.is_active.is_(True))
    )
    students = list(students_q.scalars().all())
    groups_by_id = {g.id: g for g in my_groups}
    debtors_per_group: dict[int, int] = defaultdict(int)
    if students:
        snaps = await compute_billing_many(
            db, students=students, groups_by_id=groups_by_id
        )
        for s in students:
            snap = snaps.get(s.id)
            if snap and snap.debt_amount > 0 and s.group_id is not None:
                debtors_per_group[s.group_id] += 1

    # ── 11. Next lesson date per group ─────────────────────────────────────
    next_date_per_group: dict[int, date] = {}
    for l in lessons_window:
        if l.lesson_date < today:
            continue
        if l.status != "scheduled":
            continue
        cur = next_date_per_group.get(l.group_id)
        if cur is None or l.lesson_date < cur:
            next_date_per_group[l.group_id] = l.lesson_date

    # ── 12. Group rows ─────────────────────────────────────────────────────
    group_rows: list[TeacherGroupRow] = []
    for g in my_groups:
        gtotal = per_group_total.get(g.id, 0)
        gok = per_group_ok.get(g.id, 0)
        att_rate = int(round(gok * 100 / gtotal)) if gtotal else 0
        fill = int(round(int(g.student_count) * 100 / int(g.max_students))) if g.max_students else 0
        debtors = debtors_per_group.get(g.id, 0)
        health = _classify_health(att_rate, fill, debtors)
        group_rows.append(TeacherGroupRow(
            id=g.id,
            code=g.code,
            course_name=g.course.name if g.course else None,
            days=g.days,
            time_slot=_time_slot(g.start_time, g.end_time),
            student_count=int(g.student_count or 0),
            max_students=int(g.max_students or 0),
            fill_pct=fill,
            attendance_rate_pct=att_rate,
            debtors_count=debtors,
            next_lesson_date=next_date_per_group.get(g.id),
            health=health,  # type: ignore[arg-type]
        ))
    # Surface problem groups first.
    health_order = {"bad": 0, "warn": 1, "good": 2}
    group_rows.sort(key=lambda r: (health_order[r.health], r.attendance_rate_pct))

    # ── 13. Top concerning students ────────────────────────────────────────
    # Threshold: ≥3 absences OR ≥3 lates over 30 days.
    concerns_ids = {
        sid for sid in set(student_absent) | set(student_late)
        if student_absent.get(sid, 0) >= 3 or student_late.get(sid, 0) >= 3
    }
    top_concerns: list[ConcernStudent] = []
    if concerns_ids:
        students_map = {s.id: s for s in students}
        # Some students with marks may have left the group meanwhile; backfill.
        missing_ids = [sid for sid in concerns_ids if sid not in students_map]
        if missing_ids:
            extra_q = await db.execute(
                select(Student).where(Student.id.in_(missing_ids))
            )
            for s in extra_q.scalars().all():
                students_map[s.id] = s

        for sid in concerns_ids:
            s = students_map.get(sid)
            if not s:
                continue
            g = groups_by_id.get(s.group_id) if s.group_id else None
            stotal = student_total.get(sid, 0)
            sok = stotal - student_absent.get(sid, 0)
            rate = int(round(sok * 100 / stotal)) if stotal else 0
            top_concerns.append(ConcernStudent(
                student_id=sid,
                full_name=s.full_name,
                group_id=s.group_id or 0,
                group_code=g.code if g else "",
                absent_count=student_absent.get(sid, 0),
                late_count=student_late.get(sid, 0),
                attendance_rate_pct=rate,
                last_absent_at=student_last_absent.get(sid),
            ))
        top_concerns.sort(
            key=lambda c: (-c.absent_count, -c.late_count, c.attendance_rate_pct)
        )
        top_concerns = top_concerns[:5]

    # ── 14. KPIs ───────────────────────────────────────────────────────────
    active_groups = sum(1 for g in my_groups if g.status == "active")
    kpis = TeacherKpis(
        my_groups_total=len(my_groups),
        my_groups_active=active_groups,
        my_students_total=students_total,
        lessons_today=lessons_today_count,
        lessons_week_done=lessons_week_done,
        lessons_week_planned=lessons_week_planned,
        lessons_month_done=lessons_month_done,
        attendance_rate_week_pct=week_rate,
        attendance_rate_month_pct=month_rate,
        attendance_delta_pct=week_rate - prev_week_rate,
        pending_journals_count=len(pending),
    )

    action_items = ActionItems(
        pending_journals=pending[:8],  # cap visible list
        concerning_students_count=len(top_concerns),
    )

    return TeacherSummary(
        today=today,
        teacher_id=teacher_id,
        teacher_name=me.name,
        kpis=kpis,
        action_items=action_items,
        current_lesson=current_lesson,
        next_lesson=next_lesson,
        today_lessons=today_rows,
        upcoming_week=upcoming_rows,
        weekly_attendance=weekly_points,
        my_groups=group_rows,
        top_concerns=top_concerns,
    )
