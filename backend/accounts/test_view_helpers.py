"""Unit tests for account view helpers and current-user payload building."""

from unittest.mock import patch

from django.test import RequestFactory, TestCase
from organisations.models import Membership, Organisation

from .models import CustomUser
from .views import (
    build_current_user_payload,
    build_file_url,
    get_active_membership,
    has_valid_tenant_access,
)


class AccountViewHelperTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.active_organisation = Organisation.objects.create(
            name="Active Helper Organisation",
            slug="active-helper-organisation",
            business_type="ticketing",
            is_active=True,
        )
        cls.inactive_organisation = Organisation.objects.create(
            name="Inactive Helper Organisation",
            slug="inactive-helper-organisation",
            business_type="ticketing",
            is_active=False,
        )

    def setUp(self):
        self.request = RequestFactory().get(
            "/api/accounts/me/",
            HTTP_HOST="testserver",
        )

    def create_user(self, identifier, **kwargs):
        return CustomUser.objects.create_user(
            username=identifier,
            email=f"{identifier}@example.com",
            password="Strong-test-password-123",
            **kwargs,
        )

    def test_get_active_membership_returns_active_membership_for_active_tenant(self):
        user = self.create_user("active-helper-user")
        membership = Membership.objects.create(
            user=user,
            organisation=self.active_organisation,
            role="manager",
            is_active=True,
        )

        result = get_active_membership(user)

        self.assertEqual(result, membership)
        self.assertEqual(result.organisation, self.active_organisation)

    def test_get_active_membership_ignores_inactive_memberships(self):
        user = self.create_user("inactive-membership-helper-user")
        Membership.objects.create(
            user=user,
            organisation=self.active_organisation,
            role="manager",
            is_active=False,
        )

        self.assertIsNone(get_active_membership(user))
        self.assertFalse(has_valid_tenant_access(user))

    def test_get_active_membership_ignores_inactive_organisations(self):
        user = self.create_user("inactive-tenant-helper-user")
        Membership.objects.create(
            user=user,
            organisation=self.inactive_organisation,
            role="manager",
            is_active=True,
        )

        self.assertIsNone(get_active_membership(user))
        self.assertFalse(has_valid_tenant_access(user))

    def test_valid_active_tenant_is_used_when_other_memberships_are_unavailable(self):
        user = self.create_user("multiple-membership-helper-user")
        Membership.objects.create(
            user=user,
            organisation=self.inactive_organisation,
            role="owner",
            is_active=True,
        )
        valid_membership = Membership.objects.create(
            user=user,
            organisation=self.active_organisation,
            role="viewer",
            is_active=True,
        )

        result = get_active_membership(user)

        self.assertEqual(result, valid_membership)
        self.assertTrue(has_valid_tenant_access(user))

    def test_user_without_memberships_preserves_existing_access_contract(self):
        user = self.create_user("no-membership-helper-user")

        self.assertIsNone(get_active_membership(user))
        self.assertTrue(has_valid_tenant_access(user))

    def test_superuser_does_not_require_tenant_membership(self):
        user = CustomUser.objects.create_superuser(
            username="helper-platform-owner",
            email="helper-platform-owner@example.com",
            password="Strong-test-password-123",
        )

        self.assertIsNone(get_active_membership(user))
        self.assertTrue(has_valid_tenant_access(user))

    def test_build_file_url_returns_none_for_empty_file(self):
        self.assertIsNone(build_file_url(self.request, None))

    def test_build_file_url_sanitizes_storage_url_failure(self):
        user = self.create_user("broken-file-helper-user")
        user.avatar.name = "avatars/broken.png"

        with patch.object(
            user.avatar.storage,
            "url",
            side_effect=RuntimeError("private storage failure"),
        ):
            result = build_file_url(self.request, user.avatar)

        self.assertIsNone(result)

    def test_current_user_payload_contains_only_active_tenant(self):
        user = self.create_user("payload-helper-user")
        membership = Membership.objects.create(
            user=user,
            organisation=self.active_organisation,
            role="viewer",
            is_active=True,
        )

        payload = build_current_user_payload(user, self.request)

        self.assertEqual(payload["role"], membership.role)
        self.assertEqual(
            payload["organisation"]["id"],
            self.active_organisation.pk,
        )
        self.assertTrue(payload["organisation"]["is_active"])
        self.assertNotIn(self.inactive_organisation.slug, repr(payload))
        for forbidden_field in (
            "password",
            "session_key",
            "token",
            "groups",
            "user_permissions",
        ):
            self.assertNotIn(forbidden_field, payload)

    def test_current_user_payload_sanitizes_avatar_storage_failure(self):
        user = self.create_user("broken-avatar-payload-user")
        Membership.objects.create(
            user=user,
            organisation=self.active_organisation,
            role="manager",
            is_active=True,
        )
        user.avatar.name = "avatars/broken-payload.png"

        with patch.object(
            user.avatar.storage,
            "url",
            side_effect=RuntimeError("private storage failure"),
        ):
            payload = build_current_user_payload(user, self.request)

        self.assertIsNone(payload["avatar"])
        self.assertIsNone(payload["avatar_url"])
        self.assertIsNone(payload["user_avatar_url"])
        self.assertIsNone(payload["profile_image_url"])
        self.assertNotIn("private storage failure", repr(payload))
