from django.conf import settings
from django.test import SimpleTestCase


SCHEDULE_NAME = "colmado-sync-missing-master-product-images"


class MasterProductImageScheduleTests(SimpleTestCase):
    def setUp(self):
        self.schedule = settings.CELERY_BEAT_SCHEDULE[SCHEDULE_NAME]

    def test_registers_master_product_image_task(self):
        self.assertEqual(
            self.schedule["task"],
            "colmado.sync_master_product_images",
        )

    def test_runs_complete_catalog_review_every_six_hours(self):
        self.assertEqual(
            self.schedule["schedule"],
            60 * 60 * 6,
        )

    def test_starts_from_first_product_with_safe_batch_size(self):
        self.assertEqual(
            self.schedule["kwargs"],
            {
                "after_id": 0,
                "batch_size": 10,
            },
        )
