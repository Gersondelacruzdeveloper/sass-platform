from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from organisations.models import Organisation, Membership
from training.models import Standard, EvaluationTemplate, EvaluationQuestion, TrainingResource
from training.import_center.models import TrainingImportJob
from .helpers import make_workbook

User = get_user_model()


class ImportCenterApiTests(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name="Hotel A", slug="hotel-a", business_type="hotel", is_active=True)
        self.other = Organisation.objects.create(name="Hotel B", slug="hotel-b", business_type="hotel", is_active=True)
        self.user = User.objects.create_user(email="manager@example.com", username="manager", password="secret123")
        Membership.objects.create(user=self.user, organisation=self.org, role="manager", is_active=True)
        self.client = APIClient(); self.client.force_authenticate(self.user)

    def upload(self, workbook=None):
        workbook = workbook or make_workbook()
        f = SimpleUploadedFile("training.xlsx", workbook.getvalue(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        return self.client.post("/api/training/import-center/preview/", {"file": f}, format="multipart")

    def test_preview_does_not_change_training_data(self):
        response = self.upload()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Standard.objects.filter(organisation=self.org).count(), 0)
        self.assertEqual(response.data["preview"]["counts"]["questions"], 1)

    def test_apply_creates_all_training_objects(self):
        preview = self.upload()
        job_id = preview.data["id"]
        response = self.client.post(f"/api/training/import-center/jobs/{job_id}/apply/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Standard.objects.filter(organisation=self.org).count(), 1)
        self.assertEqual(TrainingResource.objects.filter(organisation=self.org).count(), 1)
        self.assertEqual(EvaluationTemplate.objects.filter(organisation=self.org).count(), 1)
        self.assertEqual(EvaluationQuestion.objects.filter(organisation=self.org).count(), 1)

    def test_second_import_updates_instead_of_duplicates(self):
        p1 = self.upload(); self.client.post(f"/api/training/import-center/jobs/{p1.data['id']}/apply/")
        p2 = self.upload(); self.client.post(f"/api/training/import-center/jobs/{p2.data['id']}/apply/")
        self.assertEqual(Standard.objects.filter(organisation=self.org).count(), 1)
        self.assertEqual(EvaluationTemplate.objects.filter(organisation=self.org).count(), 1)
        self.assertEqual(EvaluationQuestion.objects.filter(organisation=self.org).count(), 1)

    def test_lower_priority_source_cannot_overwrite_master_standard(self):
        p1 = self.upload(make_workbook(standard_priority=1, standard_title="Master title"))
        self.client.post(f"/api/training/import-center/jobs/{p1.data['id']}/apply/")
        p2 = self.upload(make_workbook(standard_priority=3, standard_title="Old manual title"))
        applied = self.client.post(f"/api/training/import-center/jobs/{p2.data['id']}/apply/")
        self.assertEqual(applied.status_code, 200)
        standard = Standard.objects.get(organisation=self.org)
        self.assertEqual(standard.title, "Master title")
        self.assertEqual(applied.data["result"]["summary"]["standards"]["protected"], 1)

    def test_job_is_tenant_scoped(self):
        job = TrainingImportJob.objects.create(organisation=self.other, created_by=None, file_name="x.xlsx", file_sha256="x")
        response = self.client.get(f"/api/training/import-center/jobs/{job.pk}/")
        self.assertEqual(response.status_code, 404)

    def test_non_management_cannot_import(self):
        staff = User.objects.create_user(email="staff@example.com", username="staff", password="secret123")
        Membership.objects.create(user=staff, organisation=self.org, role="staff", is_active=True)
        self.client.force_authenticate(staff)
        response = self.upload()
        self.assertEqual(response.status_code, 403)
