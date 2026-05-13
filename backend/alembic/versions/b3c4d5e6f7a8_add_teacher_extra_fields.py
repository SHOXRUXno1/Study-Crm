"""add teacher birth_date, hire_date, gender

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f6
Create Date: 2026-05-01 19:30:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, None] = "a9d3f5b1c2e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("teachers", sa.Column("birth_date", sa.Date(), nullable=True))
    op.add_column("teachers", sa.Column("hire_date",  sa.Date(), nullable=True))
    op.add_column("teachers", sa.Column("gender",     sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column("teachers", "gender")
    op.drop_column("teachers", "hire_date")
    op.drop_column("teachers", "birth_date")
