"""add scan session series execution state

Revision ID: 20260713_0002
Revises: 20260710_0001
Create Date: 2026-07-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260713_0002"
down_revision: Union[str, None] = "20260710_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "scan_session_series",
        sa.Column("execution_status", sa.String(length=20), server_default="pending", nullable=False),
    )
    op.add_column("scan_session_series", sa.Column("failure_reason", sa.Text(), nullable=True))
    op.add_column(
        "scan_session_series",
        sa.Column("range_confirmed", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.create_index(
        op.f("ix_scan_session_series_execution_status"),
        "scan_session_series",
        ["execution_status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_scan_session_series_execution_status"), table_name="scan_session_series")
    op.drop_column("scan_session_series", "range_confirmed")
    op.drop_column("scan_session_series", "failure_reason")
    op.drop_column("scan_session_series", "execution_status")
