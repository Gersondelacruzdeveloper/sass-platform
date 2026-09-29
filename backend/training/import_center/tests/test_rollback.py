from django.contrib.auth import get_user_model
from django.test import TestCase
from organisations.models import Organisation, Membership
from training.models import Standard
from training.import_center.models import TrainingImportJob
from training.import_center.parser import parse_training_workbook, validate_payload
from training.import_center.service import apply_job, rollback_job
from .helpers import make_workbook

User = get_user_model()


class TrainingImportRollbackTests(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name="Hotel", slug="hotel", business_type="hotel", is_active=True)
        self.user = User.objects.create_user(email="owner@example.com", username="owner", password="secret123")
        Membership.objects.create(user=self.user, organisation=self.org, role="owner", is_active=True)

    def test_rollback_removes_objects_created_by_job(self):
        payload = parse_training_workbook(make_workbook().getvalue())
        job = TrainingImportJob.objects.create(
            organisation=self.org, created_by=self.user, file_name="x.xlsx", file_sha256=payload["sha256"],
            payload=payload, preview=validate_payload(payload),
        )
        apply_job(job)
        self.assertEqual(Standard.objects.filter(organisation=self.org).count(), 1)
        rollback_job(job)
        self.assertEqual(Standard.objects.filter(organisation=self.org).count(), 0)
