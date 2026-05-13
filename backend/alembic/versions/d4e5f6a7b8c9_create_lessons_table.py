"""create lessons table + seed from existing groups

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-26 06:15:00.000000

"""
from datetime import date, timedelta
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Mon=0, Tue=1, …, Sat=5, Sun=6
_WEEKDAY_MAP = {"odd": (0, 2, 4), "even": (1, 3, 5)}


def upgrade() -> None:
    op.create_table(
        'lessons',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.Column('teacher_id', sa.Integer(), nullable=True),
        sa.Column('room_id', sa.Integer(), nullable=True),
        sa.Column('lesson_date', sa.Date(), nullable=False),
        sa.Column('start_time', sa.Time(), nullable=False),
        sa.Column('end_time', sa.Time(), nullable=False),
        sa.Column(
            'status',
            sa.String(length=16),
            nullable=False,
            server_default='scheduled',
        ),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('rescheduled_from_id', sa.Integer(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['teacher_id'], ['teachers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['room_id'], ['rooms.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['rescheduled_from_id'], ['lessons.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_lessons_id'), 'lessons', ['id'], unique=False)
    op.create_index(op.f('ix_lessons_group_id'), 'lessons', ['group_id'], unique=False)
    op.create_index(op.f('ix_lessons_teacher_id'), 'lessons', ['teacher_id'], unique=False)
    op.create_index(op.f('ix_lessons_room_id'), 'lessons', ['room_id'], unique=False)
    op.create_index(op.f('ix_lessons_lesson_date'), 'lessons', ['lesson_date'], unique=False)
    op.create_index(op.f('ix_lessons_status'), 'lessons', ['status'], unique=False)
    op.create_index('ix_lessons_date_time', 'lessons', ['lesson_date', 'start_time'], unique=False)

    # ── Seed: materialise lessons for every active/upcoming group ──────────────
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT id, teacher_id, room_id, days, start_time, end_time, "
            "start_date, end_date, status FROM groups"
        )
    ).fetchall()

    for row in rows:
        gid, tid, rid, days, st, et, sd, ed, gstatus = (
            row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8]
        )
        if gstatus not in ("active", "upcoming", "ongoing"):
            continue
        weekdays = _WEEKDAY_MAP.get(days, ())
        if not weekdays or not sd or not ed or ed < sd:
            continue
        cur = sd
        while cur <= ed:
            if cur.weekday() in weekdays:
                bind.execute(
                    sa.text(
                        "INSERT INTO lessons "
                        "(group_id, teacher_id, room_id, lesson_date, "
                        " start_time, end_time, status) "
                        "VALUES (:gid, :tid, :rid, :ld, :st, :et, 'scheduled')"
                    ),
                    {
                        "gid": gid, "tid": tid, "rid": rid,
                        "ld": cur, "st": st, "et": et,
                    },
                )
            cur += timedelta(days=1)


def downgrade() -> None:
    op.drop_index('ix_lessons_date_time', table_name='lessons')
    op.drop_index(op.f('ix_lessons_status'), table_name='lessons')
    op.drop_index(op.f('ix_lessons_lesson_date'), table_name='lessons')
    op.drop_index(op.f('ix_lessons_room_id'), table_name='lessons')
    op.drop_index(op.f('ix_lessons_teacher_id'), table_name='lessons')
    op.drop_index(op.f('ix_lessons_group_id'), table_name='lessons')
    op.drop_index(op.f('ix_lessons_id'), table_name='lessons')
    op.drop_table('lessons')
