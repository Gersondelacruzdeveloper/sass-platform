"""API tests for the authenticated current-user endpoint."""

from django.test import TestCase
from django.urls import reverse
from disco.models import DiscoEmployee
from organisations.models import Membership, Organisation
from rest_framework.test import APIClient
from training.models import Employee, Facilitator
from ticketing.models import Seller

from .models import CustomUser


class MeAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Current User Organisation",
            slug="current-user-organisation",
            business_type="ticketing",
            plan="pro",
            is_active=True,
        )
        cls.other_organisation = Organisation.objects.create(
            name="Other Tenant Organisation",
            slug="other-tenant-organisation",
            business_type="hotel",
            plan="basic",
            is_active=True,
        )
        cls.user = CustomUser.objects.create_user(
            username="current-user",
            email="current-user@example.com",
            password="Strong-test-password-123",
            first_name="Current",
            last_name="User",
            phone="8095550100",
        )
        cls.membership = Membership.objects.create(
            user=cls.user,
            organisation=cls.organisation,
            role="manager",
            is_active=True,
        )

    def setUp(self):
        self.client = APIClient()
        self.url = reverse("me")

    def authenticate(self):
        self.client.force_authenticate(self.user)

    def test_me_url_name_resolves_to_expected_path(self):
        self.assertEqual(self.url, "/api/accounts/me/")

    def test_authentication_is_required_for_get_and_patch(self):
        get_response = self.client.get(self.url)
        patch_response = self.client.patch(
            self.url,
            {"first_name": "Blocked"},
            format="json",
        )

        self.assertIn(get_response.status_code, (401, 403))
        self.assertIn(patch_response.status_code, (401, 403))
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Current")

    def test_get_returns_current_user_and_active_tenant_context(self):
        self.authenticate()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], self.user.pk)
        self.assertEqual(response.data["email"], self.user.email)
        self.assertEqual(response.data["username"], self.user.username)
        self.assertEqual(response.data["role"], "manager")
        self.assertEqual(
            response.data["organisation"],
            {
                "id": self.organisation.pk,
                "name": self.organisation.name,
                "slug": self.organisation.slug,
                "business_type": "ticketing",
                "plan": "pro",
                "is_active": True,
            },
        )
        self.assertIsNone(response.data["facilitator"])
        self.assertIsNone(response.data["disco_employee"])

    def test_get_never_exposes_authentication_or_privilege_secrets(self):
        self.authenticate()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        serialized = repr(response.data)
        self.assertNotIn(self.user.password, serialized)
        for forbidden_field in (
            "password",
            "session_key",
            "token",
            "access",
            "refresh",
            "groups",
            "user_permissions",
        ):
            self.assertNotIn(forbidden_field, response.data)

    def test_patch_updates_allowed_profile_fields(self):
        self.authenticate()

        response = self.client.patch(
            self.url,
            {
                "first_name": "Updated",
                "last_name": "Manager",
                "phone": "8495550101",
                "preferred_language": "es",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Updated")
        self.assertEqual(self.user.last_name, "Manager")
        self.assertEqual(self.user.phone, "8495550101")
        self.assertEqual(self.user.preferred_language, "es")
        self.assertEqual(response.data["role"], "manager")
        self.assertEqual(
            response.data["organisation"]["id"],
            self.organisation.pk,
        )

    def test_patch_rejects_invalid_language_without_partial_update(self):
        self.authenticate()

        response = self.client.patch(
            self.url,
            {
                "first_name": "Must Not Persist",
                "preferred_language": "fr",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("preferred_language", response.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Current")
        self.assertEqual(self.user.preferred_language, "en")

    def test_patch_cannot_change_identity_privileges_or_tenant(self):
        self.authenticate()

        response = self.client.patch(
            self.url,
            {
                "email": "attacker@example.com",
                "username": "attacker",
                "is_staff": True,
                "is_superuser": True,
                "organisation": self.other_organisation.pk,
                "role": "owner",
                "first_name": "Allowed",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.membership.refresh_from_db()
        self.assertEqual(self.user.email, "current-user@example.com")
        self.assertEqual(self.user.username, "current-user")
        self.assertFalse(self.user.is_staff)
        self.assertFalse(self.user.is_superuser)
        self.assertEqual(self.membership.organisation, self.organisation)
        self.assertEqual(self.membership.role, "manager")
        self.assertEqual(self.user.first_name, "Allowed")
        self.assertEqual(
            response.data["organisation"]["id"],
            self.organisation.pk,
        )

    def test_inactive_membership_blocks_get_and_patch(self):
        self.membership.is_active = False
        self.membership.save(update_fields=["is_active"])
        self.authenticate()

        get_response = self.client.get(self.url)
        patch_response = self.client.patch(
            self.url,
            {"first_name": "Blocked"},
            format="json",
        )

        self.assertEqual(get_response.status_code, 403)
        self.assertEqual(patch_response.status_code, 403)
        self.assertEqual(
            get_response.data,
            {"detail": "Account unavailable"},
        )
        self.assertEqual(patch_response.data, get_response.data)
        self.assertNotIn("organisation", repr(get_response.data))
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Current")

    def test_inactive_organisation_blocks_get_and_patch(self):
        self.organisation.is_active = False
        self.organisation.save(update_fields=["is_active"])
        self.authenticate()

        get_response = self.client.get(self.url)
        patch_response = self.client.patch(
            self.url,
            {"first_name": "Blocked"},
            format="json",
        )

        self.assertEqual(get_response.status_code, 403)
        self.assertEqual(patch_response.status_code, 403)
        self.assertEqual(
            get_response.data,
            {"detail": "Account unavailable"},
        )
        self.assertEqual(patch_response.data, get_response.data)
        self.assertNotIn("organisation", repr(get_response.data))
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Current")

    def test_active_disco_profile_from_current_tenant_is_returned(self):
        profile = DiscoEmployee.objects.create(
            organisation=self.organisation,
            user=self.user,
            full_name="Current Disco Employee",
            role="manager",
            phone="8295550102",
            is_active=True,
        )
        self.authenticate()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["disco_employee"]["id"], profile.pk)
        self.assertEqual(
            response.data["disco_employee"]["organisation_id"],
            self.organisation.pk,
        )
        self.assertEqual(
            response.data["disco_employee"]["full_name"],
            "Current Disco Employee",
        )

    def test_inactive_disco_profile_is_not_returned(self):
        DiscoEmployee.objects.create(
            organisation=self.organisation,
            user=self.user,
            full_name="Inactive Disco Employee",
            role="manager",
            is_active=False,
        )
        self.authenticate()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["disco_employee"])

    def test_disco_profile_from_another_tenant_is_not_exposed(self):
        DiscoEmployee.objects.create(
            organisation=self.other_organisation,
            user=self.user,
            full_name="Other Tenant Employee",
            role="manager",
            phone="8295550199",
            is_active=True,
        )
        self.authenticate()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["disco_employee"])
        self.assertNotIn("Other Tenant Employee", repr(response.data))
        self.assertNotIn(self.other_organisation.slug, repr(response.data))

    def test_facilitator_from_current_tenant_is_returned(self):
        employee = Employee.objects.create(
            organisation=self.organisation,
            user=self.user,
            name="Current Facilitator",
            position="Trainer",
        )
        facilitator = Facilitator.objects.create(
            organisation=self.organisation,
            employee=employee,
            can_create_employees=True,
            can_create_trainings=True,
            can_create_evaluations=False,
            can_view_reports=True,
            active=True,
        )
        self.authenticate()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["facilitator"]["id"], facilitator.pk)
        self.assertEqual(
            response.data["facilitator"]["employee_name"],
            "Current Facilitator",
        )
        self.assertTrue(response.data["facilitator"]["can_view_reports"])

    def test_facilitator_from_another_tenant_is_not_exposed(self):
        employee = Employee.objects.create(
            organisation=self.other_organisation,
            user=self.user,
            name="Other Tenant Facilitator",
            position="Trainer",
        )
        Facilitator.objects.create(
            organisation=self.other_organisation,
            employee=employee,
            active=True,
        )
        self.authenticate()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["facilitator"])
        self.assertNotIn("Other Tenant Facilitator", repr(response.data))
        self.assertNotIn(self.other_organisation.slug, repr(response.data))

    def test_ticketing_seller_from_current_tenant_is_returned(self):
        seller = Seller.objects.create(
            organisation=self.organisation,
            user=self.user,
            full_name="Current Ticketing Seller",
            seller_slug="current-ticketing-seller",
            role="seller",
            email=self.user.email,
            can_access_dashboard=True,
            is_active=True,
        )
        self.authenticate()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertIn("ticketing_seller", response.data)

        seller_data = response.data["ticketing_seller"]

        self.assertIsNotNone(seller_data)
        self.assertEqual(seller_data["id"], seller.pk)
        self.assertEqual(
            seller_data["full_name"],
            "Current Ticketing Seller",
        )
        self.assertEqual(seller_data["role"], "seller")
        self.assertEqual(
            seller_data["organisation_id"],
            self.organisation.pk,
        )
        self.assertEqual(
            seller_data["organisation_slug"],
            self.organisation.slug,
        )
        self.assertTrue(seller_data["can_access_dashboard"])

    def test_inactive_ticketing_seller_is_not_returned(self):
        Seller.objects.create(
            organisation=self.organisation,
            user=self.user,
            full_name="Inactive Ticketing Seller",
            seller_slug="inactive-ticketing-seller",
            role="seller",
            can_access_dashboard=True,
            is_active=False,
        )
        self.authenticate()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertIn("ticketing_seller", response.data)
        self.assertIsNone(response.data["ticketing_seller"])
        self.assertNotIn(
            "Inactive Ticketing Seller",
            repr(response.data),
        )

    def test_ticketing_seller_from_another_tenant_is_not_exposed(self):
        Seller.objects.create(
            organisation=self.other_organisation,
            user=self.user,
            full_name="Other Tenant Ticketing Seller",
            seller_slug="other-tenant-ticketing-seller",
            role="seller",
            can_access_dashboard=True,
            is_active=True,
        )
        self.authenticate()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertIn("ticketing_seller", response.data)
        self.assertIsNone(response.data["ticketing_seller"])

        serialized = repr(response.data)

        self.assertNotIn(
            "Other Tenant Ticketing Seller",
            serialized,
        )
        self.assertNotIn(
            self.other_organisation.slug,
            serialized,
        )

    def test_seller_only_user_without_membership_can_recover_ticketing_tenant(self):
        seller_only_user = CustomUser.objects.create_user(
            username="seller-only-user",
            email="seller-only@example.com",
            password="Strong-test-password-456",
            first_name="Seller",
            last_name="Only",
        )

        seller = Seller.objects.create(
            organisation=self.organisation,
            user=seller_only_user,
            full_name="Seller Only User",
            seller_slug="seller-only-user",
            role="seller",
            email=seller_only_user.email,
            can_access_dashboard=True,
            is_active=True,
        )

        self.client.force_authenticate(seller_only_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["organisation"])
        self.assertIsNone(response.data["role"])

        self.assertIn("ticketing_seller", response.data)
        self.assertIsNotNone(response.data["ticketing_seller"])

        seller_data = response.data["ticketing_seller"]

        self.assertEqual(seller_data["id"], seller.pk)
        self.assertEqual(
            seller_data["organisation_id"],
            self.organisation.pk,
        )
        self.assertEqual(
            seller_data["organisation_slug"],
            self.organisation.slug,
        )
        self.assertEqual(
            seller_data["organisation_name"],
            self.organisation.name,
        )
        self.assertEqual(seller_data["role"], "seller")
        self.assertTrue(seller_data["is_active"])
        self.assertTrue(seller_data["can_access_dashboard"])

    def test_put_and_delete_are_not_allowed(self):
        self.authenticate()

        put_response = self.client.put(
            self.url,
            {"first_name": "Blocked"},
            format="json",
        )
        delete_response = self.client.delete(self.url)

        self.assertEqual(put_response.status_code, 405)
        self.assertEqual(delete_response.status_code, 405)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Current")
