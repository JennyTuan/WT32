"""align schema indexes with SQLAlchemy models

Revision ID: 20260814_0012
Revises: 20260728_0011
Create Date: 2026-08-14
"""
from typing import Sequence, Union

from alembic import op


revision: str = "20260814_0012"
down_revision: Union[str, None] = "20260728_0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_scan_exams_id", "scan_exams", ["id"], unique=False)
    with op.batch_alter_table("scan_session_recon_series") as batch_op:
        batch_op.drop_constraint(
            "uq_scan_session_recon_series_reconstruction_job_id",
            type_="unique",
        )
        batch_op.drop_index("ix_scan_session_recon_series_reconstruction_job_id")
        batch_op.create_index(
            "ix_scan_session_recon_series_reconstruction_job_id",
            ["reconstruction_job_id"],
            unique=True,
        )


def downgrade() -> None:
    with op.batch_alter_table("scan_session_recon_series") as batch_op:
        batch_op.drop_index("ix_scan_session_recon_series_reconstruction_job_id")
        batch_op.create_unique_constraint(
            "uq_scan_session_recon_series_reconstruction_job_id",
            ["reconstruction_job_id"],
        )
        batch_op.create_index(
            "ix_scan_session_recon_series_reconstruction_job_id",
            ["reconstruction_job_id"],
            unique=False,
        )
    op.drop_index("ix_scan_exams_id", table_name="scan_exams")
