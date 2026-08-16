"""API tests for tenant-scoped organisation memberships."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from organisations.models import Membership, Organisation


User = get_user_model()


class MembershipAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Membership API Tenant",
            slug="membership-api-tenant",
            is_active=True,
        )
        cls.other_organisation = Organisation.objects.create(
            name="Other Membership API Tenant",
            slug="other-membership-api-tenant",
            is_active=True,
        )
        cls.inactive_organisation = Organisation.objects.create(
            name="Inactive Membership API Tenant",
            slug="inactive-membership-api-tenant",
            is_active=False,
        )

        cls.owner = cls.create_user("membership-api-owner")
        cls.admin = cls.create_user("membership-api-admin")
        cls.viewer = cls.create_user("membership-api-viewer")
        cls.staff = cls.create_user("membership-api-staff")
        cls.candidate = cls.create_user("membership-api-candidate")
        cls.other_candidate = cls.create_user(
            "membership-api-other-candidate"
        )
        cls.other_owner = cls.create_user("membership-api-other-owner")
        cls.inactive_member = cls.create_user(
            "membership-api-inactive-member"
        )
        cls.inactive_tenant_owner = cls.create_user(
            "membership-api-inactive-tenant-owner"
        )
        cls.superuser = User.objects.create_superuser(
            username="membership-api-platform-owner",
            email="membership-api-platform-owner@example.com",
            password="Strong-test-password-123",
        )

        cls.owner_membership = Membership.objects.create(
            user=cls.owner,
            organisation=cls.organisation,
            role="owner",
            is_active=True,
        )
        cls.admin_membership = Membership.objects.create(
            user=cls.admin,
            organisation=cls.organisation,
            role="admin",
            is_active=True,
        )
        cls.viewer_membership = Membership.objects.create(
            user=cls.viewer,
            organisation=cls.organisation,
            role="viewer",
            is_active=True,
        )
        cls.staff_membership = Membership.objects.create(
            user=cls.staff,
            organisation=cls.organisation,
            role="staff",
            is_active=True,
        )
        cls.other_membership = Membership.objects.create(
            user=cls.other_owner,
            organisation=cls.other_organisation,
            role="owner",
            is_active=True,
        )
        Membership.objects.create(
            user=cls.inactive_member,
            organisation=cls.organisation,
            role="owner",
            is_active=False,
        )
        Membership.objects.create(
            user=cls.inactive_tenant_owner,
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
        self.list_url = reverse("memberships-list")
        self.staff_detail_url = reverse(
            "memberships-detail",
            kwargs={"pk": self.staff_membership.pk},
        )
        self.other_detail_url = reverse(
            "memberships-detail",
            kwargs={"pk": self.other_membership.pk},
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
            "/api/organisations/memberships/",
        )
        self.assertEqual(
            self.staff_detail_url,
            f"/api/organisations/memberships/{self.staff_membership.pk}/",
        )

    def test_authentication_is_required_for_all_crud_actions(self):
        responses = (
            self.client.get(self.list_url),
            self.client.get(self.staff_detail_url),
            self.client.post(
                self.list_url,
                {
                    "user": self.candidate.pk,
                    "organisation": self.organisation.pk,
                    "role": "staff",
                },
                format="json",
            ),
            self.client.patch(
                self.staff_detail_url,
                {"role": "admin"},
                format="json",
            ),
            self.client.delete(self.staff_detail_url),
        )

        for response in responses:
            with self.subTest(status=response.status_code):
                self.assertIn(response.status_code, (401, 403))

    def test_member_lists_only_memberships_from_own_tenant(self):
        self.authenticate(self.viewer)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, 200)
        returned = self.results(response)
        returned_ids = {item["id"] for item in returned}
        self.assertTrue(
            {
                self.owner_membership.pk,
                self.admin_membership.pk,
                self.viewer_membership.pk,
                self.staff_membership.pk,
            }.issubset(returned_ids)
        )
        self.assertNotIn(self.other_membership.pk, returned_ids)
        self.assertNotIn(
            self.other_organisation.name,
            repr(response.data),
        )

    def test_member_cannot_retrieve_other_tenant_membership(self):
        self.authenticate(self.owner)

        response = self.client.get(self.other_detail_url)

        self.assertEqual(response.status_code, 404)
        self.assertNotIn(
            self.other_organisation.name,
            repr(response.data),
        )

    def test_inactive_membership_has_no_membership_access(self):
        self.authenticate(self.inactive_member)

        list_response = self.client.get(self.list_url)
        detail_response = self.client.get(self.staff_detail_url)

        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(self.results(list_response), [])
        self.assertEqual(detail_response.status_code, 404)

    def test_inactive_organisation_has_no_membership_access(self):
        self.authenticate(self.inactive_tenant_owner)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.results(response), [])

    def test_owner_can_create_membership_only_in_own_tenant(self):
        self.authenticate(self.owner)

        response = self.client.post(
            self.list_url,
            {
                "user": self.candidate.pk,
                "organisation": self.other_organisation.pk,
                "role": "manager",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        membership = Membership.objects.get(user=self.candidate)
        self.assertEqual(membership.organisation, self.organisation)
        self.assertEqual(membership.role, "manager")
        self.assertNotEqual(
            membership.organisation,
            self.other_organisation,
        )

    def test_admin_can_create_membership_in_own_tenant(self):
        self.authenticate(self.admin)

        response = self.client.post(
            self.list_url,
            {
                "user": self.candidate.pk,
                "organisation": self.other_organisation.pk,
                "role": "staff",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        membership = Membership.objects.get(user=self.candidate)
        self.assertEqual(membership.organisation, self.organisation)

    def test_viewer_cannot_create_update_or_delete_membership(self):
        self.authenticate(self.viewer)

        create_response = self.client.post(
            self.list_url,
            {
                "user": self.candidate.pk,
                "organisation": self.organisation.pk,
                "role": "owner",
            },
            format="json",
        )
        update_response = self.client.patch(
            self.staff_detail_url,
            {"role": "owner", "is_active": False},
            format="json",
        )
        delete_response = self.client.delete(self.staff_detail_url)

        self.assertEqual(create_response.status_code, 403)
        self.assertEqual(update_response.status_code, 403)
        self.assertEqual(delete_response.status_code, 403)
        self.staff_membership.refresh_from_db()
        self.assertEqual(self.staff_membership.role, "staff")
        self.assertTrue(self.staff_membership.is_active)
        self.assertFalse(
            Membership.objects.filter(user=self.candidate).exists()
        )

    def test_owner_can_update_role_and_active_state(self):
        self.authenticate(self.owner)

        response = self.client.patch(
            self.staff_detail_url,
            {"role": "manager", "is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.staff_membership.refresh_from_db()
        self.assertEqual(self.staff_membership.role, "manager")
        self.assertFalse(self.staff_membership.is_active)

    def test_non_superuser_cannot_change_membership_user_or_organisation(self):
        self.authenticate(self.owner)

        response = self.client.patch(
            self.staff_detail_url,
            {
                "user": self.other_candidate.pk,
                "organisation": self.other_organisation.pk,
                "role": "manager",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.staff_membership.refresh_from_db()
        self.assertEqual(self.staff_membership.user, self.staff)
        self.assertEqual(
            self.staff_membership.organisation,
            self.organisation,
        )
        self.assertEqual(self.staff_membership.role, "manager")

    def test_owner_can_delete_membership_from_own_tenant(self):
        self.authenticate(self.owner)
        membership_id = self.staff_membership.pk

        response = self.client.delete(self.staff_detail_url)

        self.assertEqual(response.status_code, 204)
        self.assertFalse(
            Membership.objects.filter(pk=membership_id).exists()
        )

    def test_cross_tenant_update_and_delete_return_not_found(self):
        self.authenticate(self.owner)

        update_response = self.client.patch(
            self.other_detail_url,
            {"role": "viewer"},
            format="json",
        )
        delete_response = self.client.delete(self.other_detail_url)

        self.assertEqual(update_response.status_code, 404)
        self.assertEqual(delete_response.status_code, 404)
        self.other_membership.refresh_from_db()
        self.assertEqual(self.other_membership.role, "owner")

    def test_duplicate_membership_request_is_rejected_without_duplicate(self):
        self.authenticate(self.owner)
        payload = {
            "user": self.candidate.pk,
            "organisation": self.organisation.pk,
            "role": "staff",
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
            Membership.objects.filter(
                user=self.candidate,
                organisation=self.organisation,
            ).count(),
            1,
        )

    def test_superuser_can_manage_memberships_across_tenants(self):
        self.authenticate(self.superuser)

        list_response = self.client.get(self.list_url)
        self.assertEqual(list_response.status_code, 200)
        returned_ids = {
            item["id"] for item in self.results(list_response)
        }
        self.assertIn(self.other_membership.pk, returned_ids)

        create_response = self.client.post(
            self.list_url,
            {
                "user": self.candidate.pk,
                "organisation": self.other_organisation.pk,
                "role": "admin",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        created_id = create_response.data["id"]
        detail_url = reverse(
            "memberships-detail",
            kwargs={"pk": created_id},
        )

        update_response = self.client.patch(
            detail_url,
            {"user": self.other_candidate.pk, "role": "viewer"},
            format="json",
        )
        self.assertEqual(update_response.status_code, 200)
        created = Membership.objects.get(pk=created_id)
        self.assertEqual(created.user, self.other_candidate)
        self.assertEqual(created.role, "viewer")

        delete_response = self.client.delete(detail_url)
        self.assertEqual(delete_response.status_code, 204)
        self.assertFalse(Membership.objects.filter(pk=created_id).exists())
