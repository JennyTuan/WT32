"""add device scan-plan fields

Revision ID: 20260818_0015
Revises: 20260817_0014
Create Date: 2026-08-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260818_0015"
down_revision: Union[str, None] = "20260817_0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = (
    "topogram_params", "helical_params", "axial_params",
    "scan_session_topogram_params", "scan_session_helical_params", "scan_session_axial_params",
)


def upgrade() -> None:
    for table in TABLES:
        with op.batch_alter_table(table) as batch_op:
            batch_op.add_column(sa.Column("focus_size", sa.String(length=10), nullable=False, server_default="small"))
            batch_op.add_column(sa.Column("bowtie_type", sa.String(length=10), nullable=False, server_default="medium"))


def downgrade() -> None:
    for table in reversed(TABLES):
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_column("bowtie_type")
            batch_op.drop_column("focus_size")
