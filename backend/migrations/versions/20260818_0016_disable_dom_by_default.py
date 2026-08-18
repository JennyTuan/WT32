"""disable DOM by default

Revision ID: 20260818_0016
Revises: 20260818_0015
Create Date: 2026-08-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20260818_0016"
down_revision: Union[str, None] = "20260818_0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("dose_settings") as batch_op:
        batch_op.alter_column("aec_enabled", server_default=sa.false())
    op.execute(sa.text("UPDATE dose_settings SET aec_enabled = false WHERE id = 1"))


def downgrade() -> None:
    with op.batch_alter_table("dose_settings") as batch_op:
        batch_op.alter_column("aec_enabled", server_default=sa.true())
