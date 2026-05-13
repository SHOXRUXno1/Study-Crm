"""
seed_append.py — Append demo rows without wiping existing data.

Run from ``backend/``::
    py seed_append.py

Creates:
  - 2 extra rooms (unique names),
  - 2 teachers (unique usernames d<tag>_t1 / d<tag>_t2, password Teacher@123),
  - 4 groups on new teachers + rooms only (minimal schedule conflicts),
  - students / payments / attendance for new active groups,
  - optionally one manager ``demo_manager`` / Manager@123 if missing.

If ``courses`` is empty, inserts the six canonical catalog names (same as Alembic).
"""

from __future__ import annotations

import asyncio
import random
import uuid
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.attendance import Attendance
from app.models.course import Course
from app.models.group import Group
from app.models.lesson import Lesson
from app.models.manager import Manager
from app.models.payment import Payment
from app.models.room import Room
from app.models.student import Student
from app.models.teacher import Teacher
from app.services.conflict_service import find_group_conflicts
from app.services.group_status import derived_group_status
from app.services.schedule_service import sync_future_lessons, WEEKDAY_MAP

TODAY = date.today()

rng = random.Random(84)

FIRST_NAMES = [
    "Amir", "Bobur", "Dilnoza", "Eldor", "Farida", "Gulnora",
    "Hamza", "Iroda", "Jasur", "Kamola", "Laziz", "Malika",
    "Nodir", "Ozoda", "Parviz", "Qodir", "Rano", "Sarvar",
]
LAST_NAMES = [
    "Aliyev", "Baxtiyorov", "Choriyev", "Do'stov", "Eshmatov",
    "Fayzullayev", "G'aniyev", "Holiqov", "Ismoilov", "Jurayev",
    "Karimov", "Latipov", "Mirzayev", "Nazarov", "Ortiqov",
]

# Sequential student phones (+99890…) — avoids ix_students_phone_unique collisions across runs.
_phone_suffix_base: int = 1_234_567

CANONICAL_COURSES = (
    ("English", "General English programme."),
    ("Grammar", "Grammar skills and usage."),
    ("Pre-IELTS", "Foundation before IELTS preparation."),
    ("KIDS' English", "English for young learners."),
    ("IELTS", "IELTS exam preparation (all skills)."),
    ("CEFR", "Levels aligned with the CEFR framework."),
)

PAY_WEIGHTS = ["paid"] * 7 + ["debt"] * 3
ATTEND_WEIGHTS = ["present"] * 7 + ["absent"] * 1 + ["late"] * 1 + ["excused"] * 1


def t(s: str) -> time:
    h, m = s.split(":")
    return time(int(h), int(m))


def next_student_phone(counter: list[int]) -> str:
    counter[0] += 1
    return f"+99890{_phone_suffix_base + counter[0]:07d}"


def rand_student_name() -> tuple[str, str]:
    return rng.choice(FIRST_NAMES), rng.choice(LAST_NAMES)


def rand_birth() -> date:
    days_back = rng.randint(365 * 14, 365 * 28)
    return TODAY - timedelta(days=days_back)


async def load_or_seed_courses(db: AsyncSession) -> list[Course]:
    q = (
        await db.execute(select(Course).where(Course.is_active == True).order_by(Course.id))  # noqa: E712
    )
    rows = list(q.scalars().all())
    if rows:
        return rows

    print("No active courses — inserting canonical catalog …")
    for name, descr in CANONICAL_COURSES:
        db.add(Course(name=name, description=descr, is_active=True))
    await db.flush()
    q2 = await db.execute(select(Course).where(Course.is_active == True).order_by(Course.id))  # noqa: E712
    return list(q2.scalars().all())


def append_room_defs(tag: str) -> list[tuple[str, int]]:
    return [(f"Demo {tag}-A", 14), (f"Demo {tag}-B", 14)]


async def append_rooms(db: AsyncSession, tag: str) -> list[Room]:
    defs = append_room_defs(tag)
    rooms = [
        Room(name=n, capacity=c, current_occupancy=0, status="active")
        for n, c in defs
    ]
    db.add_all(rooms)
    await db.flush()
    return rooms


async def append_teachers(db: AsyncSession, tag: str) -> list[Teacher]:
    slot_base = int(tag[:6], 16) % 800_001 + 100_000
    teacher_phones = (f"+998907{slot_base:06d}", f"+998907{slot_base + 1:06d}")

    creds = [
        (f"d{tag}_t1", "DemoAlpha", "Surname", teacher_phones[0]),
        (f"d{tag}_t2", "DemoBeta", "Surname", teacher_phones[1]),
    ]
    teachers: list[Teacher] = []
    for username, first, last, tp in creds:
        teachers.append(
            Teacher(
                first_name=first,
                last_name=last,
                middle_name=None,
                phone=tp,
                is_active=True,
                username=username,
                password_hash=hash_password("Teacher@123"),
            )
        )
    db.add_all(teachers)
    await db.flush()
    return teachers


# (code_suffix, relative_course_index, teacher_idx, room_idx, days, start, end,
#  price, start_offset_days, duration_months)
# Times use evening slots on new-only rooms/teachers → no clash with typical office hours data.
_APPEND_GROUP_SHAPE: list[tuple[str, int, int, int, str, str, str, int, int, int]] = [
    ("1", 0, 0, 0, "odd", "18:00", "19:30", 1_100_000, -40, 3),
    ("2", 1, 1, 1, "even", "18:00", "19:30", 1_100_000, -35, 3),
    ("3", 2, 0, 1, "even", "20:00", "21:30", 1_200_000, -10, 3),
    ("4", 3, 1, 0, "odd", "20:00", "21:30", 1_200_000, -8, 3),
]


async def seed_past_lessons(db: AsyncSession, group: Group) -> None:
    weekdays = WEEKDAY_MAP.get(group.days, ())
    if not weekdays:
        return
    hist_start = group.start_date
    hist_end = TODAY - timedelta(days=1)
    if hist_end < hist_start:
        return
    cur = hist_start
    rows: list[Lesson] = []
    while cur <= hist_end:
        if cur.weekday() in weekdays:
            rows.append(
                Lesson(
                    group_id=group.id,
                    teacher_id=group.teacher_id,
                    room_id=group.room_id,
                    lesson_date=cur,
                    start_time=group.start_time,
                    end_time=group.end_time,
                    status="scheduled",
                )
            )
        cur += timedelta(days=1)
    if rows:
        db.add_all(rows)
    await db.flush()


async def append_groups(
    db: AsyncSession,
    courses: list[Course],
    teachers: list[Teacher],
    rooms: list[Room],
    tag: str,
) -> list[Group]:
    n_c = len(courses)
    if n_c == 0:
        raise RuntimeError("No courses available after ensure step.")

    groups: list[Group] = []
    for suf, cri, ti, ri, days, st, et, price, off, months in _APPEND_GROUP_SHAPE:
        code = f"D-{tag}-{suf}"
        course = courses[cri % n_c]
        start = TODAY + timedelta(days=off)
        end = start + timedelta(days=30 * months)
        status = derived_group_status(start_date=start, end_date=end, today=TODAY)
        g = Group(
            code=code,
            course_id=course.id,
            teacher_id=teachers[ti].id,
            room_id=rooms[ri].id,
            days=days,
            start_time=t(st),
            end_time=t(et),
            max_students=rooms[ri].capacity,
            price=price,
            duration_months=months,
            start_date=start,
            end_date=end,
            status=status,
            student_count=0,
        )
        db.add(g)
        groups.append(g)
    await db.flush()

    for g in groups:
        await sync_future_lessons(db, g, today=TODAY)
        await seed_past_lessons(db, g)

    for g in groups:
        if g.status != "active":
            continue
        hits = await find_group_conflicts(
            db,
            days=g.days,
            start_time=g.start_time,
            end_time=g.end_time,
            start_date=g.start_date,
            end_date=g.end_date,
            teacher_id=g.teacher_id,
            room_id=g.room_id,
            exclude_group_id=g.id,
            today=TODAY,
        )
        if hits:
            details = ", ".join(f"{h.kind}:{h.group_code}" for h in hits)
            raise RuntimeError(
                f"seed_append conflict for group {g.code}: {details}. "
                "Adjust slots or resolve existing overlaps."
            )

    return groups


async def seed_students_for_new_groups(
    db: AsyncSession,
    new_groups: list[Group],
    phone_counter: list[int],
) -> list[tuple[Student, Group]]:
    all_pairs: list[tuple[Student, Group]] = []
    eligible = [g for g in new_groups if g.status == "active"]

    for g in eligible:
        n = rng.randint(4, 8)
        for _ in range(n):
            fn, ln = rand_student_name()
            pay_status = rng.choice(PAY_WEIGHTS)
            phone = next_student_phone(phone_counter)
            parent = next_student_phone(phone_counter) if rng.random() < 0.6 else None

            s = Student(
                full_name=f"{ln} {fn}",
                phone=phone,
                parent_phone=parent,
                birth_date=rand_birth(),
                gender=rng.choice(["male", "female"]),
                group_id=g.id,
                payment_status=pay_status,
                is_active=True,
            )
            db.add(s)
            all_pairs.append((s, g))

    await db.flush()

    from collections import Counter

    cnt: Counter[int] = Counter()
    for s, g in all_pairs:
        cnt[g.id] += 1
    for g in new_groups:
        g.student_count = cnt.get(g.id, 0)

    await db.flush()
    return all_pairs


async def seed_payments_append(
    db: AsyncSession, students_with_groups: list[tuple[Student, Group]],
) -> None:
    for s, g in students_with_groups:
        if s.payment_status == "paid":
            for _ in range(rng.randint(1, 3)):
                days_back = rng.randint(0, 90)
                db.add(
                    Payment(
                        student_id=s.id,
                        amount=g.price,
                        method=rng.choice(["cash", "transfer"]),
                        paid_at=TODAY - timedelta(days=days_back),
                        note=None,
                    )
                )
        elif s.payment_status == "debt":
            db.add(
                Payment(
                    student_id=s.id,
                    amount=g.price // 2,
                    method="cash",
                    paid_at=TODAY - timedelta(days=rng.randint(30, 60)),
                    note="Частичная оплата",
                )
            )
    await db.flush()


async def seed_attendance_append(
    db: AsyncSession,
    students_with_groups: list[tuple[Student, Group]],
) -> int:
    group_ids = list({g.id for _, g in students_with_groups})
    past_lessons_stmt = select(Lesson).where(
        Lesson.group_id.in_(group_ids),
        Lesson.lesson_date < TODAY,
        Lesson.status == "scheduled",
    )
    past_lessons = list((await db.execute(past_lessons_stmt)).scalars().all())

    gmap: dict[int, list[Student]] = {}
    for s, g in students_with_groups:
        gmap.setdefault(g.id, []).append(s)

    records: list[Attendance] = []
    for lesson in past_lessons:
        for student in gmap.get(lesson.group_id, []):
            status = rng.choice(ATTEND_WEIGHTS)
            records.append(
                Attendance(
                    lesson_id=lesson.id,
                    student_id=student.id,
                    status=status,
                    late_minutes=rng.randint(5, 20) if status == "late" else None,
                    reason_code=rng.choice(["illness", "family", "other"])
                    if status in ("absent", "excused")
                    else None,
                    marked_by_role="admin",
                )
            )
        lesson.topic = rng.choice(
            [
                "Unit 3: Reading Strategies",
                "Grammar: Past Perfect",
                "Speaking: Opinion essays",
                "Listening: Academic lectures",
                "Demo append lesson",
            ]
        )

    if records:
        db.add_all(records)
    await db.flush()
    return len(records)


async def ensure_demo_manager(db: AsyncSession) -> None:
    q = await db.execute(select(Manager).where(Manager.username == "demo_manager"))
    if q.scalar_one_or_none():
        print("  Manager demo_manager already exists — skip.")
        return
    db.add(
        Manager(
            first_name="Demo",
            last_name="Manager",
            middle_name=None,
            phone="+998900000099",
            is_active=True,
            username="demo_manager",
            password_hash=hash_password("Manager@123"),
        )
    )
    await db.flush()
    print("  Manager: demo_manager / Manager@123")


async def main() -> None:
    global _phone_suffix_base

    tag = uuid.uuid4().hex[:8]
    _phone_suffix_base = rng.randint(1_111_111, 7_899_988)
    phone_counter = [0]
    print(f"Additive seed run tag: {tag}  (at {datetime.now().isoformat(timespec='seconds')})")

    async with AsyncSessionLocal() as db:
        courses = await load_or_seed_courses(db)
        print(f"  Courses in use: {len(courses)}")

        rooms = await append_rooms(db, tag)
        print(f"  New rooms: {[r.name for r in rooms]}")

        teachers = await append_teachers(db, tag)
        print(
            "  New teachers:",
            ", ".join(f"{x.username} (Teacher@123)" for x in teachers),
        )

        groups = await append_groups(db, courses, teachers, rooms, tag)
        print(f"  New groups: {[g.code for g in groups]}")

        pairs = await seed_students_for_new_groups(db, groups, phone_counter)
        print(f"  New students: {len(pairs)}")

        await seed_payments_append(db, pairs)
        n_att = await seed_attendance_append(db, pairs)
        print(f"  Attendance rows: {n_att}")

        await ensure_demo_manager(db)

        await db.commit()

    print("\nDone (existing rows were not deleted).")


if __name__ == "__main__":
    asyncio.run(main())
