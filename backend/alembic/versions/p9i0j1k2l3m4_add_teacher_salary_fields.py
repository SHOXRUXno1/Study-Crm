"""add teacher salary fields

Revision ID: p9i0j1k2l3m4
Revises: o8h9i0j1k2l3
Create Date: 2026-05-12 12:55:00.000000

Adds 4 independent salary rate columns to the ``teachers`` table. Any
component may be 0 — in that case the corresponding amount in the salary
breakdown will be 0 as well. The full monthly payout is the sum of all
four components (see :mod:`app.services.salary_service`).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "p9i0j1k2l3m4"
down_revision: Union[str, None] = "o8h9i0j1k2l3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "teachers",
        sa.Column(
            "salary_monthly",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "teachers",
        sa.Column(
            "salary_percent",
            sa.Numeric(5, 2),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "teachers",
        sa.Column(
            "salary_per_lesson",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "teachers",
        sa.Column(
            "salary_per_student",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )

    op.create_check_constraint(
        "ck_teachers_salary_monthly_nonneg",
        "teachers",
        "salary_monthly >= 0",
    )
    op.create_check_constraint(
        "ck_teachers_salary_percent_range",
        "teachers",
        "salary_percent >= 0 AND salary_percent <= 100",
    )
    op.create_check_constraint(
        "ck_teachers_salary_per_lesson_nonneg",
        "teachers",
        "salary_per_lesson >= 0",
    )
    op.create_check_constraint(
        "ck_teachers_salary_per_student_nonneg",
        "teachers",
        "salary_per_student >= 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_teachers_salary_per_student_nonneg", "teachers", type_="check"
    )
    op.drop_constraint(
        "ck_teachers_salary_per_lesson_nonneg", "teachers", type_="check"
    )
    op.drop_constraint(
        "ck_teachers_salary_percent_range", "teachers", type_="check"
    )
    op.drop_constraint(
        "ck_teachers_salary_monthly_nonneg", "teachers", type_="check"
    )
    op.drop_column("teachers", "salary_per_student")
    op.drop_column("teachers", "salary_per_lesson")
    op.drop_column("teachers", "salary_percent")
    op.drop_column("teachers", "salary_monthly")
