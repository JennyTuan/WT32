from __future__ import annotations

import unittest

from backend import models, schemas
from backend.routers.scan_sessions import _clone_session_from_protocol, _clone_session_series


class ScanSessionSnapshotTests(unittest.TestCase):
    def test_clone_from_protocol_keeps_all_scan_param_snapshot_fields(self) -> None:
        patient = models.Patient(id=101, name="Test Patient", patient_id="P001", gender="M", birth_date="1980-01-01")
        protocol = models.Protocol(
            id=202,
            name="Snapshot Protocol",
            body_part="HEAD",
            age_group="adult",
            patient_weight="50-90kg",
            patient_position="HFS",
            table_direction="in",
            acquisition_type="regular",
            scan_mode="plain",
            description="seeded protocol",
        )

        topogram_series = models.Series(
            id=301,
            protocol_id=protocol.id,
            series_order=1,
            series_type="topogram",
            series_label="Scout",
        )
        topogram_series.topogram_param = models.TopogramParam(
            id=401,
            series_id=topogram_series.id,
            kv=100,
            ma=35,
            scan_length=180.5,
            tube_angle=90.0,
            fov=480.0,
            collimator="64x0.6",
            scan_direction="IN",
            dom="0",
            ctdi_vol=1.2,
            dlp=9.6,
        )

        helical_series = models.Series(
            id=302,
            protocol_id=protocol.id,
            series_order=2,
            series_type="helical",
            series_label="Helical",
        )
        helical_series.helical_param = models.HelicalParam(
            id=402,
            series_id=helical_series.id,
            kv=120,
            ma=210,
            slice_thickness=1.0,
            pitch=0.8,
            rotation_time=0.5,
            scan_length=220.0,
            fov=260.0,
            collimator="128x0.6",
            scan_direction="OUT",
            dom="1",
            ctdi_vol=12.5,
            dlp=275.0,
            auto_ma=True,
            ma_min=80.0,
            ma_max=360.0,
        )
        helical_series.recon_series.append(
            models.ReconSeries(
                id=501,
                series_id=helical_series.id,
                recon_name="Soft Tissue",
                recon_type="soft",
                kernel="B30",
                matrix=512,
                window_width=400,
                window_level=40,
                slice_thickness=1.0,
                increment=0.7,
                recon_fov=220.0,
                center_x=3.5,
                center_y=-4.5,
            )
        )

        axial_series = models.Series(
            id=303,
            protocol_id=protocol.id,
            series_order=3,
            series_type="axial",
            series_label="Axial",
        )
        axial_series.axial_param = models.AxialParam(
            id=403,
            series_id=axial_series.id,
            kv=100,
            ma=180,
            slice_thickness=2.0,
            slice_interval=19.2,
            rotation_time=1.0,
            scan_length=96.0,
            fov=240.0,
            collimator="32x1.2",
            scan_direction="IN",
            dom="1",
            ctdi_vol=8.0,
            dlp=76.8,
            auto_ma=True,
            ma_min=70.0,
            ma_max=250.0,
            step_count=5,
        )

        protocol.series.extend([topogram_series, helical_series, axial_series])

        scan_session = _clone_session_from_protocol(
            patient,
            protocol,
            schemas.ScanSessionCreate(patient_id=patient.id, protocol_id=protocol.id, session_name="Exam"),
        )

        cloned_topogram = scan_session.series[0].topogram_param
        self.assertIsNotNone(cloned_topogram)
        self.assertEqual(cloned_topogram.template_param_id, topogram_series.topogram_param.id)
        self.assertEqual(cloned_topogram.collimator, "64x0.6")
        self.assertEqual(cloned_topogram.scan_direction, "IN")
        self.assertEqual(cloned_topogram.dom, "0")

        cloned_helical = scan_session.series[1].helical_param
        self.assertIsNotNone(cloned_helical)
        self.assertEqual(cloned_helical.template_param_id, helical_series.helical_param.id)
        self.assertEqual(cloned_helical.collimator, "128x0.6")
        self.assertEqual(cloned_helical.scan_direction, "OUT")
        self.assertEqual(cloned_helical.dom, "1")
        self.assertTrue(cloned_helical.auto_ma)
        self.assertEqual(cloned_helical.ma_min, 80.0)
        self.assertEqual(cloned_helical.ma_max, 360.0)

        cloned_recon = scan_session.series[1].recon_series[0]
        self.assertEqual(cloned_recon.template_recon_series_id, helical_series.recon_series[0].id)
        self.assertEqual(cloned_recon.recon_fov, 220.0)
        self.assertEqual(cloned_recon.center_x, 3.5)
        self.assertEqual(cloned_recon.center_y, -4.5)

        cloned_axial = scan_session.series[2].axial_param
        self.assertIsNotNone(cloned_axial)
        self.assertEqual(cloned_axial.template_param_id, axial_series.axial_param.id)
        self.assertEqual(cloned_axial.collimator, "32x1.2")
        self.assertEqual(cloned_axial.scan_direction, "IN")
        self.assertEqual(cloned_axial.dom, "1")
        self.assertEqual(cloned_axial.step_count, 5)

    def test_duplicate_session_series_keeps_session_snapshot_fields(self) -> None:
        source = models.ScanSessionSeries(
            id=601,
            scan_session_id=701,
            template_series_id=801,
            series_order=2,
            series_type="helical",
            series_label="Helical",
        )
        source.helical_param = models.ScanSessionHelicalParam(
            id=602,
            scan_session_series_id=source.id,
            template_param_id=901,
            kv=120,
            ma=210,
            slice_thickness=1.0,
            pitch=0.8,
            rotation_time=0.5,
            scan_length=220.0,
            fov=260.0,
            collimator="128x0.6",
            scan_direction="OUT",
            dom="1",
            ctdi_vol=12.5,
            dlp=275.0,
            auto_ma=True,
            ma_min=80.0,
            ma_max=360.0,
        )
        source.recon_series.append(
            models.ScanSessionReconSeries(
                id=603,
                scan_session_series_id=source.id,
                template_recon_series_id=902,
                recon_name="Soft Tissue",
                recon_type="soft",
                kernel="B30",
                matrix=512,
                window_width=400,
                window_level=40,
                slice_thickness=1.0,
                increment=0.7,
                recon_fov=220.0,
                center_x=3.5,
                center_y=-4.5,
            )
        )

        cloned = _clone_session_series(source)

        self.assertEqual(cloned.scan_session_id, source.scan_session_id)
        self.assertEqual(cloned.template_series_id, source.template_series_id)
        self.assertEqual(cloned.series_label, "Helical Copy")
        self.assertIsNotNone(cloned.helical_param)
        self.assertEqual(cloned.helical_param.template_param_id, source.helical_param.template_param_id)
        self.assertEqual(cloned.helical_param.collimator, "128x0.6")
        self.assertEqual(cloned.helical_param.scan_direction, "OUT")
        self.assertEqual(cloned.helical_param.dom, "1")
        self.assertTrue(cloned.helical_param.auto_ma)

        cloned_recon = cloned.recon_series[0]
        self.assertEqual(cloned_recon.template_recon_series_id, 902)
        self.assertEqual(cloned_recon.recon_fov, 220.0)
        self.assertEqual(cloned_recon.center_x, 3.5)
        self.assertEqual(cloned_recon.center_y, -4.5)


if __name__ == "__main__":
    unittest.main()
