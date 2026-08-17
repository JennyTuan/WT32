"""allow body-part simulated reference DICOM sources

Revision ID: 20260817_0013
Revises: 20260814_0012
Create Date: 2026-08-17
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20260817_0013"
down_revision: Union[str, None] = "20260814_0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


LEGACY_SOURCES = (
    "'head-stroke-topogram', 'head-dual-scout-demo', 'brain-helical-demo', "
    "'limbs-helical-demo', 'qin-lung-topogram', 'fourd-scout-demo', 'qin-lung-helical-demo'"
)
REFERENCE_SOURCES = (
    "'head-topogram-demo', 'head-diagnostic-demo', 'neck-topogram-demo', 'neck-diagnostic-demo', "
    "'chest-topogram-demo', 'chest-diagnostic-demo', 'abdomen-topogram-demo', 'abdomen-diagnostic-demo', "
    "'spine-topogram-demo', 'spine-diagnostic-demo', 'extremity-topogram-demo', 'extremity-diagnostic-demo'"
)
TOPOGRAM_SOURCES = (
    "'head-stroke-topogram', 'head-dual-scout-demo', 'limbs-helical-demo', 'qin-lung-topogram', "
    "'fourd-scout-demo', 'head-topogram-demo', 'neck-topogram-demo', 'chest-topogram-demo', "
    "'abdomen-topogram-demo', 'spine-topogram-demo', 'extremity-topogram-demo'"
)
HELICAL_SOURCES = (
    "'brain-helical-demo', 'limbs-helical-demo', 'qin-lung-helical-demo', "
    "'head-diagnostic-demo', 'neck-diagnostic-demo', 'chest-diagnostic-demo', "
    "'abdomen-diagnostic-demo', 'spine-diagnostic-demo', 'extremity-diagnostic-demo'"
)
AXIAL_SOURCES = (
    "'head-diagnostic-demo', 'neck-diagnostic-demo', 'chest-diagnostic-demo', "
    "'abdomen-diagnostic-demo', 'spine-diagnostic-demo', 'extremity-diagnostic-demo'"
)


def upgrade() -> None:
    with op.batch_alter_table("scan_session_series") as batch_op:
        batch_op.drop_constraint("ck_scan_session_series_image_source_allowlist", type_="check")
        batch_op.drop_constraint("ck_scan_session_series_image_source_type", type_="check")
        batch_op.create_check_constraint(
            "ck_scan_session_series_image_source_allowlist",
            f"image_source_id IS NULL OR image_source_id IN ({LEGACY_SOURCES}, {REFERENCE_SOURCES})",
        )
        batch_op.create_check_constraint(
            "ck_scan_session_series_image_source_type",
            "image_source_id IS NULL OR ("
            f"(series_type = 'topogram' AND image_source_id IN ({TOPOGRAM_SOURCES})) OR "
            f"(series_type = 'helical' AND image_source_id IN ({HELICAL_SOURCES})) OR "
            f"(series_type = 'axial' AND image_source_id IN ({AXIAL_SOURCES}))"
            ")",
        )


def downgrade() -> None:
    with op.batch_alter_table("scan_session_series") as batch_op:
        batch_op.drop_constraint("ck_scan_session_series_image_source_allowlist", type_="check")
        batch_op.drop_constraint("ck_scan_session_series_image_source_type", type_="check")
        batch_op.create_check_constraint(
            "ck_scan_session_series_image_source_allowlist",
            f"image_source_id IS NULL OR image_source_id IN ({LEGACY_SOURCES})",
        )
        batch_op.create_check_constraint(
            "ck_scan_session_series_image_source_type",
            "image_source_id IS NULL OR ("
            "(series_type = 'topogram' AND image_source_id IN ("
            "'head-stroke-topogram', 'head-dual-scout-demo', 'limbs-helical-demo', "
            "'qin-lung-topogram', 'fourd-scout-demo')) OR "
            "(series_type = 'helical' AND image_source_id IN ("
            "'brain-helical-demo', 'limbs-helical-demo', 'qin-lung-helical-demo'))"
            ")",
        )
