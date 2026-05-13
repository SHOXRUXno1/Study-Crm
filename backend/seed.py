"""
seed.py — Wipe all user data and insert rich example data for manual testing.

Run from the `backend/` directory:
    py seed.py

What gets seeded:
  - 4 rooms (Кабинет 1-4)
  - 3 courses (IELTS, General English, TOEFL)
  - 6 teachers (with login credentials  teacher01 … teacher06 / pass: Teacher@123)
  - 12 groups  (mix of active/completed)
  - 60 students distributed across groups (mix of paid/debt)
  - payments for most paid/debt students
  - lessons are auto-created via sync_future_lessons (same as the real API)
  - attendance records for past lessons (random present/absent/late/excused)
"""

import asyncio
import random
from datetime import date, time, timedelta


def t(s: str) -> time:
    """Parse 'HH:MM' → datetime.time."""
    h, m = s.split(":")
    return time(int(h), int(m))

from sqlalchemy import delete, text

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.admin_settings import AdminSettings
from app.models.attendance import Attendance
from app.models.course import Course
from app.models.group import Group
from app.models.lesson import Lesson
from app.models.payment import Payment
from app.models.room import Room
from app.models.session import Session as DbSession
from app.models.student import Student
from app.models.teacher import Teacher
from app.services.group_status import derived_group_status
from app.services.schedule_service import sync_future_lessons

TODAY = date.today()

# ── helpers ──────────────────────────────────────────────────────────────────

rng = random.Random(42)   # deterministic seed for reproducibility

FIRST_NAMES = [
    "Amir", "Bobur", "Dilnoza", "Eldor", "Farida", "Gulnora",
    "Hamza", "Iroda", "Jasur", "Kamola", "Laziz", "Malika",
    "Nodir", "Ozoda", "Parviz", "Qodir", "Rano", "Sarvar",
    "Tursun", "Umida", "Vohid", "Xurshid", "Yulduz", "Zafar",
    "Abdulla", "Barno", "Charos", "Davron", "Ezgulik", "Feruza",
]
LAST_NAMES = [
    "Aliyev", "Baxtiyorov", "Choriyev", "Do'stov", "Eshmatov",
    "Fayzullayev", "G'aniyev", "Holiqov", "Ismoilov", "Jurayev",
    "Karimov", "Latipov", "Mirzayev", "Nazarov", "Ortiqov",
    "Po'latov", "Qosimov", "Rahimov", "Sultonov", "Tojiboyev",
]
PHONES = [f"+998{rng.randint(900000000,999999999)}" for _ in range(100)]


def rand_phone():
    return rng.choice(PHONES)


def rand_student_name():
    return rng.choice(FIRST_NAMES), rng.choice(LAST_NAMES)


def rand_birth():
    days_back = rng.randint(365 * 14, 365 * 28)
    return TODAY - timedelta(days=days_back)


# ── wipe ─────────────────────────────────────────────────────────────────────

TABLES_TO_WIPE = [
    "attendance", "payments", "lessons",
    "students", "groups", "teachers", "rooms", "courses", "sessions",
]


async def wipe(db):
    print("Wiping existing data …")
    for t in TABLES_TO_WIPE:
        await db.execute(text(f"DELETE FROM {t}"))
        await db.execute(text(f"ALTER SEQUENCE IF EXISTS {t}_id_seq RESTART WITH 1"))
    await db.commit()
    print("  done.")


# ── seed rooms ───────────────────────────────────────────────────────────────

ROOM_DEFS = [
    ("Кабинет 101", 15),
    ("Кабинет 102", 12),
    ("Кабинет 201", 20),
    ("Конференц-зал", 30),
]


async def seed_rooms(db):
    rooms = [Room(name=n, capacity=c, current_occupancy=0) for n, c in ROOM_DEFS]
    db.add_all(rooms)
    await db.flush()
    print(f"  Rooms: {len(rooms)}")
    return rooms


# ── seed courses ─────────────────────────────────────────────────────────────

COURSE_DEFS = [
    ("English", "General English programme."),
    ("Grammar", "Grammar skills and usage."),
    ("Pre-IELTS", "Foundation before IELTS preparation."),
    ("KIDS' English", "English for young learners."),
    ("IELTS", "IELTS exam preparation (all skills)."),
    ("CEFR", "Levels aligned with the CEFR framework."),
]


async def seed_courses(db):
    courses = [Course(name=n, description=d, is_active=True) for n, d in COURSE_DEFS]
    db.add_all(courses)
    await db.flush()
    print(f"  Courses: {len(courses)}")
    return courses


# ── seed teachers ─────────────────────────────────────────────────────────────

TEACHER_DEFS = [
    ("Shoxrux",   "Xasanov",   "Dilmurodovich",  "+998901234567"),
    ("Nilufar",   "Toshmatova", "Baxtiyorovna",   "+998902345678"),
    ("Jahongir",  "Umarov",    "Mansurovich",     "+998903456789"),
    ("Sarvinoz",  "Qodirov",   None,              "+998904567890"),
    ("Eldor",     "Nazarov",   "Xoliqovich",      "+998905678901"),
    ("Madina",    "Yusupova",  "Akramovna",       "+998906789012"),
]


async def seed_teachers(db):
    teachers = []
    for i, (first, last, mid, phone) in enumerate(TEACHER_DEFS, start=1):
        login = f"teacher{i:02d}"
        t = Teacher(
            first_name=first,
            last_name=last,
            middle_name=mid,
            phone=phone,
            is_active=True,
            username=login,
            password_hash=hash_password("Teacher@123"),
        )
        teachers.append(t)
        db.add(t)
    await db.flush()
    print(f"  Teachers: {len(teachers)}  (login: teacher01…teacher06 / Teacher@123)")
    return teachers


# ── seed groups ───────────────────────────────────────────────────────────────

GROUP_DEFS = [
    # code          course_idx  teacher_idx  room_idx  days    start_time  end_time   price     start_offset_days  duration_months
    # course_idx: 0 English, 1 Grammar, 2 Pre-IELTS, 3 KIDS' English, 4 IELTS, 5 CEFR
    ("IELTS-A1",    4,          0,           0,        "odd",  "09:00",    "10:30",   1_500_000,  -60,   3),   # active
    ("IELTS-A2",    4,          0,           1,        "even", "11:00",    "12:30",   1_500_000,  -30,   3),   # active
    ("IELTS-B1",    4,          1,           0,        "odd",  "14:00",    "15:30",   1_800_000,  -15,   3),   # active
    ("IELTS-B2",    4,          1,           2,        "even", "16:00",    "17:30",   2_000_000,   14,   3),   # upcoming
    ("GEN-A1",      0,          2,           1,        "odd",  "09:00",    "10:00",   1_200_000,  -45,   3),   # active
    ("GEN-A2",      0,          2,           3,        "even", "10:30",    "11:30",   1_200_000,    7,   3),   # upcoming
    ("GEN-B1",      0,          3,           0,        "odd",  "13:00",    "14:00",   1_400_000,  -90,   3),   # completed
    ("PRE-I01",     2,          4,           2,        "even", "08:00",    "09:30",   1_700_000,  -20,   3),   # active
    ("PRE-I02",     2,          4,           3,        "odd",  "17:00",    "18:30",   1_700_000,   21,   3),   # upcoming
    ("CEFR-B1",     5,          5,           2,        "even", "12:00",    "13:30",   2_200_000,  -10,   3),   # active
    ("GRAM-01",     1,          5,           2,        "odd",  "19:00",    "20:30",   2_200_000,   30,   3),   # upcoming
    ("IELTS-ADV",   4,          0,           3,        "even", "07:00",    "08:30",   2_500_000, -100,   3),   # completed
]


async def seed_groups(db, courses, teachers, rooms):
    groups = []
    for (code, ci, ti, ri, days, st, et, price, offset, months) in GROUP_DEFS:
        start = TODAY + timedelta(days=offset)
        end = start + timedelta(days=30 * months)
        status = derived_group_status(start_date=start, end_date=end, today=TODAY)
        g = Group(
            code=code,
            course_id=courses[ci].id,
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
        # Generate future lessons (today → end_date) via normal service
        await sync_future_lessons(db, g, today=TODAY)
        # Also generate PAST lessons (start_date → yesterday) for the journal
        await _seed_past_lessons(db, g)

    # Defense-in-depth: if anyone edits GROUP_DEFS later and accidentally
    # introduces a teacher/room overlap, we want to know IMMEDIATELY rather
    # than discover it as a confusing red badge on the schedule page. The
    # backend conflict-check pipeline that protects the create/update API
    # path is bypassed here (we INSERT through the ORM directly), so this
    # explicit pass is the equivalent guarantee for seed data.
    from app.services.conflict_service import find_group_conflicts

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
                f"Seed produced a conflict for {g.code}: {details}. "
                f"Fix GROUP_DEFS in seed.py."
            )

    print(f"  Groups: {len(groups)}")
    return groups


async def _seed_past_lessons(db, group: Group) -> None:
    """Insert historical lesson rows from group.start_date up to yesterday.

    These rows represent lessons that already happened — they are not created
    by ``sync_future_lessons`` (which only materialises from today forward).
    We mark them ``scheduled`` so that attendance can be recorded against them.
    """
    from app.services.schedule_service import WEEKDAY_MAP

    weekdays = WEEKDAY_MAP.get(group.days, ())
    if not weekdays:
        return

    hist_start = group.start_date
    hist_end = TODAY - timedelta(days=1)
    if hist_end < hist_start:
        return

    cur = hist_start
    rows = []
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


# ── seed students ─────────────────────────────────────────────────────────────

PAY_WEIGHTS = ["paid"] * 7 + ["debt"] * 3


async def seed_students(db, groups):
    """Distribute ~5 students per group (only active groups get students)."""
    all_students = []
    eligible = [g for g in groups if g.status == "active"]

    for g in eligible:
        n = rng.randint(4, 8)
        for _ in range(n):
            fn, ln = rand_student_name()
            pay_status = rng.choice(PAY_WEIGHTS)
            s = Student(
                full_name=f"{ln} {fn}",
                phone=rand_phone(),
                parent_phone=rand_phone() if rng.random() < 0.6 else None,
                birth_date=rand_birth(),
                gender=rng.choice(["male", "female"]),
                group_id=g.id,
                payment_status=pay_status,
                is_active=True,
            )
            db.add(s)
            all_students.append((s, g))

    await db.flush()

    # Update group.student_count
    from collections import Counter
    cnt: Counter = Counter()
    for s, g in all_students:
        cnt[g.id] += 1
    for g in groups:
        g.student_count = cnt.get(g.id, 0)

    await db.flush()
    print(f"  Students: {len(all_students)}")
    return all_students


# ── seed payments ─────────────────────────────────────────────────────────────

async def seed_payments(db, students_with_groups):
    payments = []
    for s, g in students_with_groups:
        if s.payment_status == "paid":
            # 1-3 payments in last 90 days
            for _ in range(rng.randint(1, 3)):
                days_back = rng.randint(0, 90)
                p = Payment(
                    student_id=s.id,
                    amount=g.price,
                    method=rng.choice(["cash", "transfer"]),
                    paid_at=TODAY - timedelta(days=days_back),
                    note=None,
                )
                db.add(p)
                payments.append(p)
        elif s.payment_status == "debt":
            # 1 partial payment 30-60 days ago
            p = Payment(
                student_id=s.id,
                amount=g.price // 2,
                method="cash",
                paid_at=TODAY - timedelta(days=rng.randint(30, 60)),
                note="Частичная оплата",
            )
            db.add(p)
            payments.append(p)

    await db.flush()
    print(f"  Payments: {len(payments)}")


# ── seed attendance ───────────────────────────────────────────────────────────

ATTEND_WEIGHTS = ["present"] * 7 + ["absent"] * 1 + ["late"] * 1 + ["excused"] * 1


async def seed_attendance(db, students_with_groups):
    """Mark attendance for all past scheduled lessons of groups that have students."""
    from sqlalchemy import select

    group_ids = list({g.id for _, g in students_with_groups})
    past_lessons_stmt = (
        select(Lesson)
        .where(
            Lesson.group_id.in_(group_ids),
            Lesson.lesson_date < TODAY,
            Lesson.status == "scheduled",
        )
    )
    past_lessons = list((await db.execute(past_lessons_stmt)).scalars().all())

    # group_id → list of students
    gmap: dict[int, list] = {}
    for s, g in students_with_groups:
        gmap.setdefault(g.id, []).append(s)

    records = []
    for lesson in past_lessons:
        for student in gmap.get(lesson.group_id, []):
            status = rng.choice(ATTEND_WEIGHTS)
            a = Attendance(
                lesson_id=lesson.id,
                student_id=student.id,
                status=status,
                late_minutes=rng.randint(5, 20) if status == "late" else None,
                reason_code=rng.choice(["illness", "family", "other"]) if status in ("absent", "excused") else None,
                marked_by_role="admin",
            )
            db.add(a)
            records.append(a)

        # set lesson topic for variety
        lesson.topic = rng.choice([
            "Unit 3: Reading Strategies",
            "Grammar: Past Perfect",
            "Speaking: Opinion essays",
            "Listening: Academic lectures",
            "Writing Task 1: Charts",
            "Vocabulary: Academic Word List",
            "Mock test review",
            "Writing Task 2: Discussion essay",
        ])

    await db.flush()
    print(f"  Attendance records: {len(records)}  (for {len(past_lessons)} past lessons)")


# ── main ──────────────────────────────────────────────────────────────────────

async def main():
    async with AsyncSessionLocal() as db:
        await wipe(db)

        print("Seeding …")
        rooms    = await seed_rooms(db)
        courses  = await seed_courses(db)
        teachers = await seed_teachers(db)
        groups   = await seed_groups(db, courses, teachers, rooms)
        students = await seed_students(db, groups)
        await seed_payments(db, students)
        await seed_attendance(db, students)

        await db.commit()

    print("\nDone! Summary:")
    print(f"  Rooms:    {len(rooms)}")
    print(f"  Courses:  {len(courses)}")
    print(f"  Teachers: {len(teachers)}")
    print(f"  Groups:   {len(groups)}")
    print(f"  Students: {len(students)}")
    print()
    print("Teacher logins:  teacher01 … teacher06  |  password: Teacher@123")
    print("Admin login:     admin                  |  password: admin123 (default)")


if __name__ == "__main__":
    asyncio.run(main())
