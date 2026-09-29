from django.test import SimpleTestCase
from training.import_center.parser import parse_training_workbook, validate_payload
from .helpers import make_workbook


class TrainingImportParserTests(SimpleTestCase):
    def test_valid_workbook(self):
        payload = parse_training_workbook(make_workbook().getvalue())
        report = validate_payload(payload)
        self.assertTrue(report["valid"])
        self.assertEqual(report["counts"]["standards"], 1)
        self.assertEqual(report["counts"]["procedures"], 1)
        self.assertEqual(report["counts"]["templates"], 1)
        self.assertEqual(report["counts"]["questions"], 1)

    def test_missing_template_reference_blocks_import(self):
        payload = parse_training_workbook(make_workbook(include_bad_question=True).getvalue())
        report = validate_payload(payload)
        self.assertFalse(report["valid"])
        self.assertTrue(any("does not exist" in e for e in report["errors"]))
