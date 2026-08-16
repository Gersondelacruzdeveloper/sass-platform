"""API tests for tenant-scoped organisation management."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from organisations.models import Membership, Organisation


User = get_user_model()


class OrganisationAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Organisation API Tenant",
            slug="organisation-api-tenant",
            business_type="ticketing",
            plan="pro",
            email="tenant@example.com",
            phone="8095550100",
            is_active=True,
        )
        cls.other_organisation = Organisation.objects.create(
            name="Other Organisation API Tenant",
            slug="other-organisation-api-tenant",
            business_type="hotel",
            plan="basic",
            is_active=True,
        )
        cls.inactive_organisation = Organisation.objects.create(
            name="Inactive Organisation API Tenant",
            slug="inactive-organisation-api-tenant",
            business_type="store",
            plan="basic",
            is_active=False,
        )

        cls.owner = cls.create_user("organisation-api-owner")
        cls.viewer = cls.create_user("organisation-api-viewer")
        cls.inactive_member = cls.create_user(
            "organisation-api-inactive-member"
        )
        cls.inactive_tenant_user = cls.create_user(
            "organisation-api-inactive-tenant"
        )
        cls.superuser = User.objects.create_superuser(
            username="organisation-api-platform-owner",
            email="organisation-api-platform-owner@example.com",
            password="Strong-test-password-123",
        )

        Membership.objects.create(
            user=cls.owner,
            organisation=cls.organisation,
            role="owner",
            is_active=True,
        )
        Membership.objects.create(
            user=cls.viewer,
            organisation=cls.organisation,
            role="viewer",
            is_active=True,
        )
        Membership.objects.create(
            user=cls.inactive_member,
            organisation=cls.organisation,
            role="owner",
            is_active=False,
        )
        Membership.objects.create(
            user=cls.inactive_tenant_user,
            organisation=cls.inactive_organisation,
            role="owner",
            is_active=True,
        )

    @classmethod
    def create_user(cls, identifier):
        return User.objects.create_user(
            username=identifier,
            email=f"{identifier}@example.com",
            password="Strong-test-password-123",
        )

    def setUp(self):
        self.client = APIClient()
        self.list_url = reverse("organisations-list")
        self.detail_url = reverse(
            "organisations-detail",
            kwargs={"pk": self.organisation.pk},
        )
        self.other_detail_url = reverse(
            "organisations-detail",
            kwargs={"pk": self.other_organisation.pk},
        )

    @staticmethod
    def results(response):
        if isinstance(response.data, dict):
            return response.data.get("results", response.data)

        return response.data

    def authenticate(self, user):
        self.client.force_authenticate(user)

    def test_router_url_names_resolve_to_expected_paths(self):
        self.assertEqual(
            self.list_url,
            "/api/organisations/organisations/",
        )
        self.assertEqual(
            self.detail_url,
            f"/api/organisations/organisations/{self.organisation.pk}/",
        )

    def test_authentication_is_required_for_all_crud_actions(self):
        requests = (
            self.client.get(self.list_url),
            self.client.get(self.detail_url),
            self.client.post(
                self.list_url,
                {
                    "name": "Blocked Organisation",
                    "slug": "blocked-organisation",
                },
                format="json",
            ),
            self.client.patch(
                self.detail_url,
                {"name": "Blocked Update"},
                format="json",
            ),
            self.client.delete(self.detail_url),
        )

        for response in requests:
            with self.subTest(status=response.status_code):
                self.assertIn(response.status_code, (401, 403))

        self.organisation.refresh_from_db()
        self.assertEqual(self.organisation.name, "Organisation API Tenant")
        self.assertEqual(Organisation.objects.count(), 3)

    def test_member_lists_only_own_organisation(self):
        self.authenticate(self.viewer)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, 200)
        payload = self.results(response)
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["id"], self.organisation.pk)
        self.assertNotIn(self.other_organisation.slug, repr(response.data))
        self.assertNotIn(self.inactive_organisation.slug, repr(response.data))

    def test_member_can_retrieve_only_own_organisation(self):
        self.authenticate(self.viewer)

        own_response = self.client.get(self.detail_url)
        other_response = self.client.get(self.other_detail_url)

        self.assertEqual(own_response.status_code, 200)
        self.assertEqual(own_response.data["id"], self.organisation.pk)
        self.assertEqual(other_response.status_code, 404)
        self.assertNotIn(self.other_organisation.slug, repr(other_response.data))

    def test_inactive_membership_has_no_organisation_access(self):
        self.authenticate(self.inactive_member)

        list_response = self.client.get(self.list_url)
        detail_response = self.client.get(self.detail_url)

        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(self.results(list_response), [])
        self.assertEqual(detail_response.status_code, 404)

    def test_inactive_organisation_has_no_member_access(self):
        self.authenticate(self.inactive_tenant_user)
        inactive_detail_url = reverse(
            "organisations-detail",
            kwargs={"pk": self.inactive_organisation.pk},
        )

        list_response = self.client.get(self.list_url)
        detail_response = self.client.get(inactive_detail_url)

        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(self.results(list_response), [])
        self.assertEqual(detail_response.status_code, 404)

    def test_viewer_cannot_create_update_or_delete_organisation(self):
        self.authenticate(self.viewer)

        create_response = self.client.post(
            self.list_url,
            {
                "name": "Viewer Created Organisation",
                "slug": "viewer-created-organisation",
                "business_type": "ticketing",
                "plan": "premium",
                "is_active": True,
            },
            format="json",
        )
        update_response = self.client.patch(
            self.detail_url,
            {"name": "Viewer Changed Organisation"},
            format="json",
        )
        delete_response = self.client.delete(self.detail_url)

        self.assertEqual(create_response.status_code, 403)
        self.assertEqual(update_response.status_code, 403)
        self.assertEqual(delete_response.status_code, 403)
        self.organisation.refresh_from_db()
        self.assertEqual(self.organisation.name, "Organisation API Tenant")
        self.assertEqual(Organisation.objects.count(), 3)

    def test_owner_cannot_create_additional_organisation(self):
        self.authenticate(self.owner)

        response = self.client.post(
            self.list_url,
            {
                "name": "Owner Extra Organisation",
                "slug": "owner-extra-organisation",
                "business_type": "ticketing",
                "plan": "basic",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(
            Organisation.objects.filter(
                slug="owner-extra-organisation"
            ).exists()
        )

    def test_owner_can_update_safe_organisation_profile_fields(self):
        self.authenticate(self.owner)

        response = self.client.patch(
            self.detail_url,
            {
                "name": "Updated Tenant Name",
                "email": "updated-tenant@example.com",
                "phone": "8495550101",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.organisation.refresh_from_db()
        self.assertEqual(self.organisation.name, "Updated Tenant Name")
        self.assertEqual(
            self.organisation.email,
            "updated-tenant@example.com",
        )
        self.assertEqual(self.organisation.phone, "8495550101")

    def test_owner_cannot_change_billing_activation_or_tenant_identity(self):
        self.authenticate(self.owner)

        response = self.client.patch(
            self.detail_url,
            {
                "slug": "hijacked-tenant-slug",
                "business_type": "hotel",
                "plan": "premium",
                "is_active": False,
                "name": "Allowed Name Update",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.organisation.refresh_from_db()
        self.assertEqual(self.organisation.name, "Allowed Name Update")
        self.assertEqual(self.organisation.slug, "organisation-api-tenant")
        self.assertEqual(self.organisation.business_type, "ticketing")
        self.assertEqual(self.organisation.plan, "pro")
        self.assertTrue(self.organisation.is_active)

    def test_owner_cannot_delete_organisation(self):
        self.authenticate(self.owner)

        response = self.client.delete(self.detail_url)

        self.assertEqual(response.status_code, 403)
        self.assertTrue(
            Organisation.objects.filter(pk=self.organisation.pk).exists()
        )

    def test_cross_tenant_update_and_delete_return_not_found(self):
        self.authenticate(self.owner)

        update_response = self.client.patch(
            self.other_detail_url,
            {"name": "Cross Tenant Update"},
            format="json",
        )
        delete_response = self.client.delete(self.other_detail_url)

        self.assertEqual(update_response.status_code, 404)
        self.assertEqual(delete_response.status_code, 404)
        self.other_organisation.refresh_from_db()
        self.assertEqual(
            self.other_organisation.name,
            "Other Organisation API Tenant",
        )

    def test_superuser_can_list_all_organisations(self):
        self.authenticate(self.superuser)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, 200)
        returned_ids = {
            item["id"] for item in self.results(response)
        }
        self.assertEqual(
            returned_ids,
            {
                self.organisation.pk,
                self.other_organisation.pk,
                self.inactive_organisation.pk,
            },
        )

    def test_superuser_can_create_update_and_delete_organisation(self):
        self.authenticate(self.superuser)

        create_response = self.client.post(
            self.list_url,
            {
                "name": "Platform Managed Organisation",
                "slug": "platform-managed-organisation",
                "business_type": "restaurant",
                "plan": "premium",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        created_id = create_response.data["id"]
        created_detail_url = reverse(
            "organisations-detail",
            kwargs={"pk": created_id},
        )

        update_response = self.client.patch(
            created_detail_url,
            {"plan": "pro", "is_active": False},
            format="json",
        )
        self.assertEqual(update_response.status_code, 200)
        created = Organisation.objects.get(pk=created_id)
        self.assertEqual(created.plan, "pro")
        self.assertFalse(created.is_active)

        delete_response = self.client.delete(created_detail_url)
        self.assertEqual(delete_response.status_code, 204)
        self.assertFalse(
            Organisation.objects.filter(pk=created_id).exists()
        )

    def test_duplicate_create_request_does_not_duplicate_slug(self):
        self.authenticate(self.superuser)
        payload = {
            "name": "Duplicate Request Organisation",
            "slug": "duplicate-request-organisation",
            "business_type": "ticketing",
            "plan": "basic",
            "is_active": True,
        }

        first_response = self.client.post(
            self.list_url,
            payload,
            format="json",
        )
        second_response = self.client.post(
            self.list_url,
            payload,
            format="json",
        )

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(second_response.status_code, 400)
        self.assertEqual(
            Organisation.objects.filter(
                slug="duplicate-request-organisation"
            ).count(),
            1,
        )
