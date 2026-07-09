from __future__ import annotations

import unittest

from pydantic import ValidationError

from backend import schemas


class FovValidationTests(unittest.TestCase):
    def test_scan_fov_accepts_range_edges(self) -> None:
        self.assertEqual(schemas.HelicalParamUpdate(fov=schemas.FOV_MIN_MM).fov, schemas.FOV_MIN_MM)
        self.assertEqual(schemas.AxialParamUpdate(fov=schemas.FOV_MAX_MM).fov, schemas.FOV_MAX_MM)
        self.assertEqual(schemas.ScanSessionTopogramParamUpdate(fov=250).fov, 250)

    def test_create_models_enforce_fov_range(self) -> None:
        with self.assertRaises(ValidationError):
            schemas.TopogramParamCreate(series_id=1, fov=schemas.FOV_MAX_MM + 1)
        with self.assertRaises(ValidationError):
            schemas.HelicalParamCreate(
                series_id=1,
                kv=120,
                ma=100,
                slice_thickness=1,
                pitch=1,
                rotation_time=1,
                scan_length=100,
                fov=schemas.FOV_MIN_MM - 1,
            )
        with self.assertRaises(ValidationError):
            schemas.AxialParamCreate(
                series_id=1,
                kv=120,
                ma=100,
                slice_thickness=1,
                slice_interval=1,
                rotation_time=1,
                scan_length=100,
                fov=schemas.FOV_MAX_MM + 1,
            )
        with self.assertRaises(ValidationError):
            schemas.ReconSeriesCreate(
                series_id=1,
                recon_name="Recon",
                recon_type="soft",
                kernel="Brain",
                matrix=512,
                window_width=400,
                window_level=40,
                slice_thickness=1,
                recon_fov=schemas.FOV_MIN_MM - 1,
            )

    def test_scan_fov_rejects_values_outside_range(self) -> None:
        for model in (
            schemas.TopogramParamUpdate,
            schemas.HelicalParamUpdate,
            schemas.AxialParamUpdate,
            schemas.ScanSessionTopogramParamUpdate,
            schemas.ScanSessionHelicalParamUpdate,
            schemas.ScanSessionAxialParamUpdate,
        ):
            with self.subTest(model=model.__name__, value=schemas.FOV_MIN_MM - 1):
                with self.assertRaises(ValidationError):
                    model(fov=schemas.FOV_MIN_MM - 1)
            with self.subTest(model=model.__name__, value=schemas.FOV_MAX_MM + 1):
                with self.assertRaises(ValidationError):
                    model(fov=schemas.FOV_MAX_MM + 1)

    def test_recon_fov_rejects_values_outside_range(self) -> None:
        for model in (
            schemas.ReconSeriesUpdate,
            schemas.ScanSessionReconSeriesCreate,
            schemas.ScanSessionReconSeriesUpdate,
        ):
            with self.subTest(model=model.__name__):
                with self.assertRaises(ValidationError):
                    model(recon_fov=schemas.FOV_MAX_MM + 1)


if __name__ == "__main__":
    unittest.main()
