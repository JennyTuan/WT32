"""persist exam context across multi-plan scan sessions

Revision ID: 20260728_0011
Revises: 20260728_0010
Create Date: 2026-07-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260728_0011"
down_revision: Union[str, None] = "20260728_0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scan_exams",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="in_progress"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scan_exams_patient_id", "scan_exams", ["patient_id"], unique=False)
    op.create_index("ix_scan_exams_status", "scan_exams", ["status"], unique=False)
    with op.batch_alter_table("scan_sessions") as batch_op:
        batch_op.add_column(sa.Column("exam_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key("fk_scan_sessions_exam_id", "scan_exams", ["exam_id"], ["id"], ondelete="RESTRICT")
        batch_op.create_index("ix_scan_sessions_exam_id", ["exam_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("scan_sessions") as batch_op:
        batch_op.drop_index("ix_scan_sessions_exam_id")
        batch_op.drop_constraint("fk_scan_sessions_exam_id", type_="foreignkey")
        batch_op.drop_column("exam_id")
    op.drop_index("ix_scan_exams_status", table_name="scan_exams")
    op.drop_index("ix_scan_exams_patient_id", table_name="scan_exams")
    op.drop_table("scan_exams")
