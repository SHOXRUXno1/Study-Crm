"""add start_time / end_time to groups; drop time_slot

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-04-26 06:10:00.000000

"""
import re
from datetime import time
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Accepts: "09:00 – 10:30", "9:00-10:30", "09:00 - 10:30", "09:00—10:30", etc.
_TIME_RE = re.compile(r"^\s*(\d{1,2}):(\d{2})\s*[\u2013\u2014\-]\s*(\d{1,2}):(\d{2})\s*$")


def _parse_slot(slot: str | None) -> tuple[time, time]:
    if slot:
        m = _TIME_RE.match(slot)
        if m:
            sh, sm, eh, em = m.groups()
            try:
                return (
                    time(int(sh) % 24, int(sm) % 60),
                    time(int(eh) % 24, int(em) % 60),
                )
            except ValueError:
                pass
    return time(9, 0), time(10, 30)


def upgrade() -> None:
    # 1. Add as nullable so we can backfill safely.
    op.add_column('groups', sa.Column('start_time', sa.Time(), nullable=True))
    op.add_column('groups', sa.Column('end_time', sa.Time(), nullable=True))

    # 2. Backfill from the legacy `time_slot` string.
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, time_slot FROM groups")).fetchall()
    for row in rows:
        gid, slot = row[0], row[1]
        st, et = _parse_slot(slot)
        bind.execute(
            sa.text(
                "UPDATE groups SET start_time = :st, end_time = :et WHERE id = :id"
            ),
            {"st": st, "et": et, "id": gid},
        )

    # 3. Lock down NOT NULL.
    op.alter_column('groups', 'start_time', nullable=False)
    op.alter_column('groups', 'end_time', nullable=False)

    # 4. Drop legacy column.
    op.drop_column('groups', 'time_slot')


def downgrade() -> None:
    op.add_column(
        'groups',
        sa.Column('time_slot', sa.String(length=30), nullable=True),
    )
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "UPDATE groups SET time_slot = "
            "to_char(start_time, 'HH24:MI') || ' \u2013 ' || to_char(end_time, 'HH24:MI')"
        )
    )
    op.alter_column('groups', 'time_slot', nullable=False)
    op.drop_column('groups', 'end_time')
    op.drop_column('groups', 'start_time')
