"""add explicit scan series image source

Revision ID: 20260716_0006
Revises: 20260716_0005
Create Date: 2026-07-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260716_0006"
down_revision: Union[str, None] = "20260716_0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("scan_session_series") as batch_op:
        batch_op.add_column(
            sa.Column("image_source_id", sa.String(length=100), nullable=True)
        )
        batch_op.add_column(
            sa.Column("image_source_version", sa.Integer(), nullable=True)
        )
        batch_op.create_check_constraint(
            "ck_scan_session_series_image_source_pair",
            "(image_source_id IS NULL AND image_source_version IS NULL) OR "
            "(image_source_id IS NOT NULL AND image_source_version IS NOT NULL)",
        )
        batch_op.create_check_constraint(
            "ck_scan_session_series_image_source_allowlist",
            "image_source_id IS NULL OR image_source_id IN ("
            "'head-stroke-topogram', "
            "'head-dual-scout-demo', "
            "'brain-helical-demo', "
            "'limbs-helical-demo', "
            "'qin-lung-topogram', "
            "'fourd-scout-demo', "
            "'qin-lung-helical-demo'"
            ")",
        )
        batch_op.create_check_constraint(
            "ck_scan_session_series_image_source_version",
            "image_source_version IS NULL OR image_source_version = 1",
        )
        batch_op.create_check_constraint(
            "ck_scan_session_series_image_source_type",
            "image_source_id IS NULL OR ("
            "(series_type = 'topogram' AND image_source_id IN ("
            "'head-stroke-topogram', 'head-dual-scout-demo', "
            "'limbs-helical-demo', 'qin-lung-topogram', 'fourd-scout-demo'"
            ")) OR "
            "(series_type = 'helical' AND image_source_id IN ("
            "'brain-helical-demo', 'limbs-helical-demo', 'qin-lung-helical-demo'"
            "))"
            ")",
        )


def downgrade() -> None:
    with op.batch_alter_table("scan_session_series") as batch_op:
        batch_op.drop_constraint(
            "ck_scan_session_series_image_source_type",
            type_="check",
        )
        batch_op.drop_constraint(
            "ck_scan_session_series_image_source_version",
            type_="check",
        )
        batch_op.drop_constraint(
            "ck_scan_session_series_image_source_allowlist",
            type_="check",
        )
        batch_op.drop_constraint(
            "ck_scan_session_series_image_source_pair",
            type_="check",
        )
        batch_op.drop_column("image_source_version")
        batch_op.drop_column("image_source_id")
