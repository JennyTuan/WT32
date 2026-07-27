"""store metal artifact suppression per scan-session reconstruction

Revision ID: 20260723_0009
Revises: 20260723_0008
Create Date: 2026-07-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260723_0009"
down_revision: Union[str, None] = "20260723_0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 该原型设置仅附着于本次扫描会话的重建序列，历史会话默认保持关闭。
    with op.batch_alter_table("scan_session_recon_series") as batch_op:
        batch_op.add_column(
            sa.Column(
                "metal_artifact_suppression",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("scan_session_recon_series") as batch_op:
        batch_op.drop_column("metal_artifact_suppression")
