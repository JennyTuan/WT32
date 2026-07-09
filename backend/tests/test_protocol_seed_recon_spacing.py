from __future__ import annotations

import unittest

from backend.database import _normalize_recon_spacing


class ProtocolSeedReconSpacingTests(unittest.TestCase):
    def test_axial_recon_spacing_snaps_to_detector_multiple(self) -> None:
        self.assertEqual(_normalize_recon_spacing("axial", 9.2, 9.2), (9.6, 9.6))
        self.assertEqual(_normalize_recon_spacing("axial", 2.4, None), (2.4, 2.4))

    def test_helical_recon_spacing_snaps_to_nearest_integer(self) -> None:
        self.assertEqual(_normalize_recon_spacing("helical", 0.6, 0.6), (1.0, 1.0))
        self.assertEqual(_normalize_recon_spacing("helical", 5.6, 5.6), (6.0, 6.0))

    def test_other_series_types_keep_existing_recon_spacing(self) -> None:
        self.assertEqual(_normalize_recon_spacing("4d", 4.8, 4.8), (4.8, 4.8))


if __name__ == "__main__":
    unittest.main()
