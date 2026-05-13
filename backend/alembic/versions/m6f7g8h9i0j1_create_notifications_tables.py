"""create notifications + notification_preferences tables

Revision ID: m6f7g8h9i0j1
Revises: l6f7g8h9i0j1
Create Date: 2026-05-05
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "m6f7g8h9i0j1"
down_revision = "l6f7g8h9i0j1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("recipient_subject", sa.String(length=255), nullable=False),
        sa.Column("recipient_role", sa.String(length=20), nullable=False),
        sa.Column("kind", sa.String(length=50), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("link", sa.String(length=500), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("dedup_key", sa.String(length=255), nullable=True),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_notifications_recipient_unread",
        "notifications",
        ["recipient_subject", "recipient_role", "read_at", "created_at"],
    )
    # Partial unique index — guarantees the lazy scanner cannot create
    # duplicate derived notifications inside the same dedup bucket
    # (e.g. one debtor_overdue per (student, ISO-week)).
    op.create_index(
        "uq_notifications_dedup",
        "notifications",
        ["recipient_subject", "recipient_role", "dedup_key"],
        unique=True,
        postgresql_where=sa.text("dedup_key IS NOT NULL"),
    )

    op.create_table(
        "notification_preferences",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_subject", sa.String(length=255), nullable=False),
        sa.Column("user_role", sa.String(length=20), nullable=False),
        sa.Column("prefs", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "user_subject", "user_role", name="uq_notif_prefs_user"
        ),
    )


def downgrade() -> None:
    op.drop_table("notification_preferences")
    op.drop_index("uq_notifications_dedup", table_name="notifications")
    op.drop_index(
        "ix_notifications_recipient_unread", table_name="notifications"
    )
    op.drop_table("notifications")
