"""add per-series scan planning for the sliding-gantry prototype

Revision ID: 20260723_0008
Revises: 20260720_0007
Create Date: 2026-07-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260723_0008"
down_revision: Union[str, None] = "20260720_0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SCAN_DIRECTION_TABLES = (
    "topogram_params",
    "helical_params",
    "axial_params",
    "scan_session_topogram_params",
    "scan_session_helical_params",
    "scan_session_axial_params",
)


def upgrade() -> None:
    for table_name in SCAN_DIRECTION_TABLES:
        with op.batch_alter_table(table_name) as batch_op:
            batch_op.alter_column(
                "scan_direction",
                existing_type=sa.String(length=10),
                type_=sa.String(length=20),
                existing_nullable=True,
            )
        # 旧 IN/OUT 在本原型中没有可靠的解剖方向语义；迁移为新 UI 的默认方向，
        # 不把它解释为真实设备滑轨方向或临床采集结论。
        op.execute(
            sa.text(
                f"UPDATE {table_name} SET scan_direction = 'HEAD_TO_FOOT' "
                "WHERE scan_direction IS NULL OR scan_direction IN ('IN', 'OUT')"
            )
        )

    op.create_table(
        "scan_session_scan_plannings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scan_session_series_id", sa.Integer(), nullable=False),
        sa.Column("source_topogram_series_id", sa.Integer(), nullable=True),
        sa.Column("range_min_position_mm", sa.Float(), nullable=True),
        sa.Column("range_max_position_mm", sa.Float(), nullable=True),
        sa.Column("scan_direction", sa.String(length=20), nullable=False, server_default="HEAD_TO_FOOT"),
        sa.CheckConstraint(
            "(range_min_position_mm IS NULL AND range_max_position_mm IS NULL) OR "
            "(range_min_position_mm IS NOT NULL AND range_max_position_mm IS NOT NULL "
            "AND range_min_position_mm <= range_max_position_mm)",
            name="ck_scan_session_planning_range",
        ),
        sa.ForeignKeyConstraint(["scan_session_series_id"], ["scan_session_series.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_topogram_series_id"], ["scan_session_series.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scan_session_series_id"),
    )
    op.create_index(
        op.f("ix_scan_session_scan_plannings_id"),
        "scan_session_scan_plannings",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_scan_session_scan_plannings_scan_session_series_id"),
        "scan_session_scan_plannings",
        ["scan_session_series_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_scan_session_scan_plannings_source_topogram_series_id"),
        "scan_session_scan_plannings",
        ["source_topogram_series_id"],
        unique=False,
    )

    # 新表上线前的会话保留其模板/会话方向，但没有患者本次范围，故只创建方向记录。
    op.execute(
        sa.text(
            """
            INSERT INTO scan_session_scan_plannings (scan_session_series_id, scan_direction)
            SELECT series.id,
                   COALESCE(topo.scan_direction, helical.scan_direction, axial.scan_direction, 'HEAD_TO_FOOT')
            FROM scan_session_series AS series
            LEFT JOIN scan_session_topogram_params AS topo ON topo.scan_session_series_id = series.id
            LEFT JOIN scan_session_helical_params AS helical ON helical.scan_session_series_id = series.id
            LEFT JOIN scan_session_axial_params AS axial ON axial.scan_session_series_id = series.id
            """
        )
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_scan_session_scan_plannings_source_topogram_series_id"),
        table_name="scan_session_scan_plannings",
    )
    op.drop_index(
        op.f("ix_scan_session_scan_plannings_scan_session_series_id"),
        table_name="scan_session_scan_plannings",
    )
    op.drop_index(op.f("ix_scan_session_scan_plannings_id"), table_name="scan_session_scan_plannings")
    op.drop_table("scan_session_scan_plannings")

    for table_name in SCAN_DIRECTION_TABLES:
        with op.batch_alter_table(table_name) as batch_op:
            batch_op.alter_column(
                "scan_direction",
                existing_type=sa.String(length=20),
                type_=sa.String(length=10),
                existing_nullable=True,
            )
