"""harden 4d result provenance

Revision ID: 20260716_0005
Revises: 20260716_0004
Create Date: 2026-07-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260716_0005"
down_revision: Union[str, None] = "20260716_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("scan_session_fourd_results") as batch_op:
        batch_op.add_column(
            sa.Column(
                "image_source_id",
                sa.String(length=100),
                server_default="fourd-engineer",
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column(
                "image_source_version",
                sa.Integer(),
                server_default="1",
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column("source_attempt_id", sa.Integer(), nullable=True)
        )
        batch_op.create_check_constraint(
            "ck_scan_session_fourd_results_image_source",
            "image_source_id = 'fourd-engineer'",
        )
        batch_op.create_check_constraint(
            "ck_scan_session_fourd_results_image_source_version",
            "image_source_version = 1",
        )
        batch_op.create_foreign_key(
            "fk_scan_session_fourd_results_source_attempt_id",
            "scan_session_series_attempts",
            ["source_attempt_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(
            op.f("ix_scan_session_fourd_results_source_attempt_id"),
            ["source_attempt_id"],
            unique=False,
        )

    # 旧结果若仍有同一目标序列的开放采集尝试，则补齐可验证的来源绑定；
    # 无法可靠判断时保留 NULL，不猜测历史尝试。
    op.execute(
        sa.text(
            """
            UPDATE scan_session_fourd_results
            SET source_attempt_id = (
                SELECT attempt.id
                FROM scan_session_series_attempts AS attempt
                WHERE attempt.scan_session_id = scan_session_fourd_results.scan_session_id
                  AND attempt.scan_session_series_id = scan_session_fourd_results.target_series_id
                  AND attempt.ended_at IS NULL
                ORDER BY attempt.attempt_number DESC
                LIMIT 1
            )
            WHERE source_attempt_id IS NULL
              AND EXISTS (
                SELECT 1
                FROM scan_session_series_attempts AS attempt
                WHERE attempt.scan_session_id = scan_session_fourd_results.scan_session_id
                  AND attempt.scan_session_series_id = scan_session_fourd_results.target_series_id
                  AND attempt.ended_at IS NULL
              )
            """
        )
    )


def downgrade() -> None:
    with op.batch_alter_table("scan_session_fourd_results") as batch_op:
        batch_op.drop_index(
            op.f("ix_scan_session_fourd_results_source_attempt_id")
        )
        batch_op.drop_constraint(
            "fk_scan_session_fourd_results_source_attempt_id",
            type_="foreignkey",
        )
        batch_op.drop_constraint(
            "ck_scan_session_fourd_results_image_source_version",
            type_="check",
        )
        batch_op.drop_constraint(
            "ck_scan_session_fourd_results_image_source",
            type_="check",
        )
        batch_op.drop_column("source_attempt_id")
        batch_op.drop_column("image_source_version")
        batch_op.drop_column("image_source_id")
