"""add scan session 4d result persistence

Revision ID: 20260716_0003
Revises: 20260713_0002
Create Date: 2026-07-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260716_0003"
down_revision: Union[str, None] = "20260713_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scan_session_fourd_results",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scan_session_id", sa.Integer(), nullable=False),
        sa.Column("target_series_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("workflow_stage", sa.String(length=30), nullable=False),
        sa.Column("source_kind", sa.String(length=20), server_default="simulation", nullable=False),
        sa.Column("scan_result_json", sa.Text(), nullable=False),
        sa.Column("rescan_choices_json", sa.Text(), nullable=True),
        sa.Column("phase_selections_json", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "source_kind = 'simulation'",
            name="ck_scan_session_fourd_results_source_simulation",
        ),
        sa.CheckConstraint(
            "version >= 1",
            name="ck_scan_session_fourd_results_version_positive",
        ),
        sa.ForeignKeyConstraint(
            ["scan_session_id"],
            ["scan_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["target_series_id"],
            ["scan_session_series.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "scan_session_id",
            name="uq_scan_session_fourd_results_scan_session",
        ),
        sa.UniqueConstraint(
            "target_series_id",
            name="uq_scan_session_fourd_results_target_series",
        ),
    )
    op.create_index(
        op.f("ix_scan_session_fourd_results_id"),
        "scan_session_fourd_results",
        ["id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_scan_session_fourd_results_id"),
        table_name="scan_session_fourd_results",
    )
    op.drop_table("scan_session_fourd_results")
