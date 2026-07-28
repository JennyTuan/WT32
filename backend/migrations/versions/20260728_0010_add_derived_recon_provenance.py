"""persist prototype derived reconstruction provenance per scan session

Revision ID: 20260728_0010
Revises: 20260723_0009
Create Date: 2026-07-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260728_0010"
down_revision: Union[str, None] = "20260723_0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("scan_session_recon_series") as batch_op:
        batch_op.add_column(
            sa.Column(
                "source_kind",
                sa.String(length=20),
                nullable=False,
                server_default="configured",
            )
        )
        batch_op.add_column(sa.Column("reconstruction_job_id", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("output_series_id", sa.String(length=160), nullable=True))
        batch_op.add_column(sa.Column("image_urls", sa.JSON(), nullable=True))
        batch_op.create_unique_constraint(
            "uq_scan_session_recon_series_reconstruction_job_id",
            ["reconstruction_job_id"],
        )
        batch_op.create_index(
            "ix_scan_session_recon_series_reconstruction_job_id",
            ["reconstruction_job_id"],
            unique=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("scan_session_recon_series") as batch_op:
        batch_op.drop_index("ix_scan_session_recon_series_reconstruction_job_id")
        batch_op.drop_constraint("uq_scan_session_recon_series_reconstruction_job_id", type_="unique")
        batch_op.drop_column("image_urls")
        batch_op.drop_column("output_series_id")
        batch_op.drop_column("reconstruction_job_id")
        batch_op.drop_column("source_kind")
