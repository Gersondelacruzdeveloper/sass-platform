"""Tests for organisation tenant-resolution helpers."""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test import TestCase

from organisations.models import Membership, Organisation
from organisations.views import (
    get_active_user_organisation,
    get_user_organisation,
)


User = get_user_model()


class OrganisationTenantHelperTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.active_organisation = Organisation.objects.create(
            name="Active Tenant Helper Organisation",
            slug="active-tenant-helper-organisation",
            is_active=True,
        )
        cls.other_active_organisation = Organisation.objects.create(
            name="Other Active Tenant Helper Organisation",
            slug="other-active-tenant-helper-organisation",
            is_active=True,
        )
        cls.inactive_organisation = Organisation.objects.create(
            name="Inactive Tenant Helper Organisation",
            slug="inactive-tenant-helper-organisation",
            is_active=False,
        )

    def create_user(self, identifier, **kwargs):
        return User.objects.create_user(
            username=identifier,
            email=f"{identifier}@example.com",
            password="Strong-test-password-123",
            **kwargs,
        )

    def assert_both_helpers_return(self, user, expected):
        self.assertEqual(get_user_organisation(user), expected)
        self.assertEqual(get_active_user_organisation(user), expected)

    def test_none_user_has_no_organisation(self):
        self.assert_both_helpers_return(None, None)

    def test_anonymous_user_has_no_organisation(self):
        self.assert_both_helpers_return(AnonymousUser(), None)

    def test_authenticated_user_without_membership_has_no_organisation(self):
        user = self.create_user("no-tenant-helper-user")

        self.assert_both_helpers_return(user, None)

    def test_active_membership_in_active_organisation_is_returned(self):
        user = self.create_user("active-tenant-helper-user")
        Membership.objects.create(
            user=user,
            organisation=self.active_organisation,
            role="manager",
            is_active=True,
        )

        self.assert_both_helpers_return(user, self.active_organisation)

    def test_inactive_membership_is_rejected(self):
        user = self.create_user("inactive-membership-tenant-helper-user")
        Membership.objects.create(
            user=user,
            organisation=self.active_organisation,
            role="manager",
            is_active=False,
        )

        self.assert_both_helpers_return(user, None)

    def test_membership_in_inactive_organisation_is_rejected(self):
        user = self.create_user("inactive-organisation-helper-user")
        Membership.objects.create(
            user=user,
            organisation=self.inactive_organisation,
            role="manager",
            is_active=True,
        )

        self.assert_both_helpers_return(user, None)

    def test_valid_tenant_is_selected_when_another_membership_is_inactive(self):
        user = self.create_user("mixed-membership-helper-user")
        Membership.objects.create(
            user=user,
            organisation=self.other_active_organisation,
            role="owner",
            is_active=False,
        )
        Membership.objects.create(
            user=user,
            organisation=self.active_organisation,
            role="viewer",
            is_active=True,
        )

        self.assert_both_helpers_return(user, self.active_organisation)

    def test_valid_tenant_is_selected_when_other_organisation_is_inactive(self):
        user = self.create_user("mixed-organisation-helper-user")
        Membership.objects.create(
            user=user,
            organisation=self.inactive_organisation,
            role="owner",
            is_active=True,
        )
        Membership.objects.create(
            user=user,
            organisation=self.active_organisation,
            role="viewer",
            is_active=True,
        )

        self.assert_both_helpers_return(user, self.active_organisation)

    def test_superuser_without_membership_has_no_tenant_context(self):
        superuser = User.objects.create_superuser(
            username="tenant-helper-platform-owner",
            email="tenant-helper-platform-owner@example.com",
            password="Strong-test-password-123",
        )

        self.assert_both_helpers_return(superuser, None)
