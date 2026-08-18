"""persist 4D bed data and waveform review state

Revision ID: 20260817_0014
Revises: 20260817_0013
Create Date: 2026-08-17
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260817_0014"
down_revision: Union[str, None] = "20260817_0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("scan_session_fourd_results") as batch_op:
        batch_op.add_column(sa.Column("data_review_json", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("scan_session_fourd_results") as batch_op:
        batch_op.drop_column("data_review_json")
