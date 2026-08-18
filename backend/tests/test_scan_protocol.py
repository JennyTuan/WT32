import unittest

from backend.scan_protocol import validate_scan_plan


class ScanPlanValidationTests(unittest.TestCase):
    def test_scan_start_allows_one_ma_increments(self):
        validate_scan_plan({
            "kv": 120,
            "ma": 215,
            "focus_size": "small",
            "bowtie_type": "medium",
        })

    def test_scan_start_rejects_current_above_selected_focus_limit(self):
        with self.assertRaisesRegex(ValueError, "exceeds"):
            validate_scan_plan({
                "kv": 120,
                "ma": 241,
                "focus_size": "small",
                "bowtie_type": "medium",
            })

    def test_scan_start_allows_current_after_focus_changes_to_large(self):
        validate_scan_plan({
            "kv": 120,
            "ma": 294,
            "focus_size": "large",
            "bowtie_type": "medium",
        })

    def test_scan_start_rejects_confirmation_values_outside_supported_ranges(self):
        base_plan = {
            "kv": 120,
            "ma": 215,
            "focus_size": "small",
            "bowtie_type": "medium",
        }
        for patch, field in (
            ({"scan_length": 2001}, "scan_length"),
            ({"pitch": 2.1}, "pitch"),
            ({"rotation_time": 2.1}, "rotation_time"),
            ({"step_count": 0}, "step_count"),
        ):
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, field):
                validate_scan_plan({**base_plan, **patch})
