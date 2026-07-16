"""add scan workflow actions and series attempt ledger

Revision ID: 20260716_0004
Revises: 20260716_0003
Create Date: 2026-07-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260716_0004"
down_revision: Union[str, None] = "20260716_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scan_session_workflow_actions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("action_id", sa.String(length=100), nullable=False),
        sa.Column("scan_session_id", sa.Integer(), nullable=False),
        sa.Column("target_series_id", sa.Integer(), nullable=True),
        sa.Column("action_type", sa.String(length=40), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("resulting_session_status", sa.String(length=20), nullable=False),
        sa.Column("resulting_series_status", sa.String(length=20), nullable=True),
        sa.Column("next_entry", sa.String(length=40), nullable=False),
        sa.Column(
            "dose_log_disposition",
            sa.String(length=30),
            server_default="not_emitted",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["scan_session_id"],
            ["scan_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "scan_session_id",
            "action_id",
            name="uq_scan_session_workflow_actions_session_action_id",
        ),
    )
    op.create_index(
        op.f("ix_scan_session_workflow_actions_id"),
        "scan_session_workflow_actions",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_scan_session_workflow_actions_scan_session_id"),
        "scan_session_workflow_actions",
        ["scan_session_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_scan_session_workflow_actions_target_series_id"),
        "scan_session_workflow_actions",
        ["target_series_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_scan_session_workflow_actions_action_type"),
        "scan_session_workflow_actions",
        ["action_type"],
        unique=False,
    )

    op.create_table(
        "scan_session_series_attempts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scan_session_id", sa.Integer(), nullable=False),
        sa.Column("scan_session_series_id", sa.Integer(), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("outcome", sa.String(length=30), nullable=True),
        sa.Column("end_reason", sa.Text(), nullable=True),
        sa.Column("ended_by_action_id", sa.Integer(), nullable=True),
        sa.CheckConstraint(
            "attempt_number >= 1",
            name="ck_scan_session_series_attempts_number_positive",
        ),
        sa.ForeignKeyConstraint(
            ["ended_by_action_id"],
            ["scan_session_workflow_actions.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["scan_session_id"],
            ["scan_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["scan_session_series_id"],
            ["scan_session_series.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "scan_session_series_id",
            "attempt_number",
            name="uq_scan_session_series_attempts_series_number",
        ),
    )
    op.create_index(
        op.f("ix_scan_session_series_attempts_id"),
        "scan_session_series_attempts",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_scan_session_series_attempts_scan_session_id"),
        "scan_session_series_attempts",
        ["scan_session_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_scan_session_series_attempts_scan_session_series_id"),
        "scan_session_series_attempts",
        ["scan_session_series_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_scan_session_series_attempts_outcome"),
        "scan_session_series_attempts",
        ["outcome"],
        unique=False,
    )
    op.create_index(
        op.f("ix_scan_session_series_attempts_ended_by_action_id"),
        "scan_session_series_attempts",
        ["ended_by_action_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_scan_session_series_attempts_ended_by_action_id"),
        table_name="scan_session_series_attempts",
    )
    op.drop_index(
        op.f("ix_scan_session_series_attempts_outcome"),
        table_name="scan_session_series_attempts",
    )
    op.drop_index(
        op.f("ix_scan_session_series_attempts_scan_session_series_id"),
        table_name="scan_session_series_attempts",
    )
    op.drop_index(
        op.f("ix_scan_session_series_attempts_scan_session_id"),
        table_name="scan_session_series_attempts",
    )
    op.drop_index(
        op.f("ix_scan_session_series_attempts_id"),
        table_name="scan_session_series_attempts",
    )
    op.drop_table("scan_session_series_attempts")

    op.drop_index(
        op.f("ix_scan_session_workflow_actions_action_type"),
        table_name="scan_session_workflow_actions",
    )
    op.drop_index(
        op.f("ix_scan_session_workflow_actions_target_series_id"),
        table_name="scan_session_workflow_actions",
    )
    op.drop_index(
        op.f("ix_scan_session_workflow_actions_scan_session_id"),
        table_name="scan_session_workflow_actions",
    )
    op.drop_index(
        op.f("ix_scan_session_workflow_actions_id"),
        table_name="scan_session_workflow_actions",
    )
    op.drop_table("scan_session_workflow_actions")
