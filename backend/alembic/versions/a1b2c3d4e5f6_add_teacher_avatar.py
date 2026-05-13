"""add teacher avatar_base64

Revision ID: a1b2c3d4e5f6
Revises: 9b3c4d5e6f7a
Create Date: 2026-04-26 01:13:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '9b3c4d5e6f7a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'teachers',
        sa.Column('avatar_base64', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('teachers', 'avatar_base64')
