"""add student credentials (password_hash, normalize phones, unique phone)

Revision ID: n7g8h9i0j1k2
Revises: m6f7g8h9i0j1
Create Date: 2026-05-08 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'n7g8h9i0j1k2'
down_revision: Union[str, None] = 'm6f7g8h9i0j1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add password_hash column.
    op.add_column(
        'students',
        sa.Column('password_hash', sa.String(length=255), nullable=True),
    )

    # 2. Normalise existing phones — keep only digits and leading '+'.
    #    Whitespace, dashes, parentheses, etc. are stripped.
    op.execute(
        """
        UPDATE students
           SET phone = regexp_replace(phone, '[^0-9+]', '', 'g')
         WHERE phone IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE students
           SET parent_phone = regexp_replace(parent_phone, '[^0-9+]', '', 'g')
         WHERE parent_phone IS NOT NULL
        """
    )

    # 3. Empty strings produced by step 2 should become NULL (no phone).
    op.execute("UPDATE students SET phone = NULL WHERE phone = ''")
    op.execute("UPDATE students SET parent_phone = NULL WHERE parent_phone = ''")

    # 4. Resolve duplicates that emerged after normalisation: keep the oldest
    #    row's phone untouched, append '_dup<id>' to younger duplicates.
    op.execute(
        sa.text(
            """
            WITH dups AS (
                SELECT id, phone,
                       ROW_NUMBER() OVER (PARTITION BY phone ORDER BY id) AS rn
                  FROM students
                 WHERE phone IS NOT NULL
            )
            UPDATE students s
               SET phone = s.phone || '_dup' || s.id::text
              FROM dups
             WHERE dups.id = s.id
               AND dups.rn > 1
            """
        )
    )

    # 5. Create the partial unique index — phone is the cabinet login.
    op.create_index(
        'ix_students_phone_unique',
        'students',
        ['phone'],
        unique=True,
        postgresql_where=sa.text('phone IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('ix_students_phone_unique', table_name='students')
    op.drop_column('students', 'password_hash')
