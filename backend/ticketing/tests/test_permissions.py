"""Security tests for ticketing permission and tenant-resolution helpers."""

from __future__ import annotations

from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.test import TestCase
from organisations.models import Membership, Organisation
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, force_authenticate

from ticketing.models import (
    BusinessEntityUserAccess,
    Seller,
    TicketingBusinessEntity,
)
from ticketing.permissions import (
    CanManageTicketingSettings,
    HasBusinessEntityAccess,
    HasTicketingOrganisationAccess,
    HasTicketingPermission,
    HasTicketingSellerPermission,
    IsTicketingAdminOrManager,
    business_entity_has_permission,
    get_business_entity_from_view,
    get_organisation_from_view,
    get_user_business_entity_accesses,
    get_user_membership,
    get_user_seller,
    is_organisation_admin,
    is_platform_admin,
    is_same_organisation_user,
    user_has_ticketing_permission,
)


class DummyView:
    """Minimal DRF-compatible view object used by permission unit tests."""

    def __init__(self, *, organisation=None, kwargs=None, action=None, **attrs):
        self.organisation = organisation
        self.kwargs = kwargs or {}
        self.action = action
        for name, value in attrs.items():
            setattr(self, name, value)

    def get_organisation(self):
        return self.organisation


class TicketingPermissionTests(TestCase):
    @classmethod
    def create_user(cls, username, organisation=None, **extra_fields):
        return get_user_model().objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="Strong-test-password-123",
            organisation=organisation,
            **extra_fields,
        )

    @classmethod
    def setUpTestData(cls):
        cls.organisation_a = Organisation.objects.create(
            name="Permission Organisation A",
            slug="permission-organisation-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.organisation_b = Organisation.objects.create(
            name="Permission Organisation B",
            slug="permission-organisation-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.inactive_organisation = Organisation.objects.create(
            name="Inactive Permission Organisation",
            slug="inactive-permission-organisation",
            business_type="ticketing",
            is_active=False,
        )

        cls.owner_a = cls.create_user("permission-owner-a", cls.organisation_a)
        cls.owner_b = cls.create_user("permission-owner-b", cls.organisation_b)
        cls.manager_a = cls.create_user("permission-manager-a", cls.organisation_a)
        cls.viewer_a = cls.create_user("permission-viewer-a", cls.organisation_a)
        cls.inactive_member = cls.create_user(
            "permission-inactive-member", cls.organisation_a
        )
        cls.seller_user = cls.create_user("permission-seller", cls.organisation_a)
        cls.pending_seller_user = cls.create_user(
            "permission-pending-seller", cls.organisation_a
        )
        cls.partner_user = cls.create_user("permission-partner", cls.organisation_a)
        cls.superuser = cls.create_user(
            "permission-superuser", is_staff=True, is_superuser=True
        )
        cls.inactive_owner = cls.create_user(
            "permission-inactive-owner", cls.inactive_organisation
        )

        for user, organisation, role, active in (
            (cls.owner_a, cls.organisation_a, "owner", True),
            (cls.owner_b, cls.organisation_b, "owner", True),
            (cls.manager_a, cls.organisation_a, "manager", True),
            (cls.viewer_a, cls.organisation_a, "viewer", True),
            (cls.inactive_member, cls.organisation_a, "owner", False),
            (cls.inactive_owner, cls.inactive_organisation, "owner", True),
        ):
            Membership.objects.create(
                user=user,
                organisation=organisation,
                role=role,
                is_active=active,
            )

        cls.seller = Seller.objects.create(
            organisation=cls.organisation_a,
            user=cls.seller_user,
            full_name="Approved Seller",
            seller_slug="approved-seller",
            role="seller",
            application_status="approved",
            is_active=True,
            can_access_dashboard=True,
            can_create_bookings=True,
            can_manage_settings=False,
        )
        cls.pending_seller = Seller.objects.create(
            organisation=cls.organisation_a,
            user=cls.pending_seller_user,
            full_name="Pending Seller",
            seller_slug="pending-seller",
            role="seller",
            application_status="pending",
            is_active=True,
            can_access_dashboard=True,
            can_create_bookings=True,
        )

        cls.entity_a = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation_a,
            name="Partner A",
            slug="partner-a",
            entity_type="partner",
            is_active=True,
        )
        cls.entity_b = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation_b,
            name="Partner B",
            slug="partner-b",
            entity_type="partner",
            is_active=True,
        )
        cls.partner_access = BusinessEntityUserAccess.objects.create(
            organisation=cls.organisation_a,
            business_entity=cls.entity_a,
            user=cls.partner_user,
            role="scanner",
            can_access_dashboard=True,
            can_scan=True,
            can_view_financials=False,
            is_active=True,
        )

    def setUp(self):
        self.factory = APIRequestFactory()

    def request(self, user, path="/api/ticketing/test/", data=None):
        django_request = self.factory.get(path, data=data or {})
        force_authenticate(django_request, user=user)
        return Request(django_request)

    def test_organisation_resolution_prefers_view_resolver(self):
        request = self.request(
            self.owner_a,
            data={"organisation_slug": self.organisation_b.slug},
        )
        view = DummyView(organisation=self.organisation_a)

        self.assertEqual(
            get_organisation_from_view(request, view),
            self.organisation_a,
        )

    def test_organisation_resolution_uses_slug_and_does_not_fallback_on_unknown_slug(self):
        request = self.request(
            self.owner_a,
            data={"organisation_slug": self.organisation_b.slug},
        )
        view = DummyView(organisation=None)
        self.assertEqual(get_organisation_from_view(request, view), self.organisation_b)

        unknown_request = self.request(
            self.owner_a,
            data={"organisation_slug": "unknown-tenant"},
        )
        self.assertIsNone(get_organisation_from_view(unknown_request, view))

    def test_organisation_resolution_falls_back_to_authenticated_user(self):
        request = self.request(self.owner_a)
        self.assertEqual(
            get_organisation_from_view(request, DummyView(organisation=None)),
            self.organisation_a,
        )

    def test_membership_lookup_requires_active_matching_membership(self):
        self.assertEqual(
            get_user_membership(self.owner_a, self.organisation_a).role,
            "owner",
        )
        self.assertIsNone(get_user_membership(self.owner_a, self.organisation_b))
        self.assertIsNone(
            get_user_membership(self.inactive_member, self.organisation_a)
        )

    def test_seller_lookup_requires_active_approved_matching_profile(self):
        self.assertEqual(
            get_user_seller(self.seller_user, self.organisation_a),
            self.seller,
        )
        self.assertIsNone(get_user_seller(self.seller_user, self.organisation_b))
        self.assertIsNone(
            get_user_seller(self.pending_seller_user, self.organisation_a)
        )

        self.seller.is_active = False
        self.seller.save(update_fields=["is_active"])
        self.assertIsNone(get_user_seller(self.seller_user, self.organisation_a))

    def test_platform_admin_requires_authenticated_staff_or_superuser(self):
        self.assertTrue(is_platform_admin(self.superuser))
        self.assertFalse(is_platform_admin(self.owner_a))
        self.assertFalse(is_platform_admin(SimpleNamespace(is_authenticated=False)))

    def test_direct_organisation_relationship_is_not_admin_authority(self):
        self.assertTrue(is_same_organisation_user(self.viewer_a, self.organisation_a))
        self.assertFalse(is_organisation_admin(self.viewer_a, self.organisation_a))

    def test_active_owner_and_manager_memberships_are_admin_authority(self):
        self.assertTrue(is_organisation_admin(self.owner_a, self.organisation_a))
        self.assertTrue(is_organisation_admin(self.manager_a, self.organisation_a))
        self.assertFalse(is_organisation_admin(self.owner_a, self.organisation_b))
        self.assertFalse(
            is_organisation_admin(self.inactive_member, self.organisation_a)
        )

    def test_superuser_is_admin_for_each_active_tenant(self):
        self.assertTrue(is_organisation_admin(self.superuser, self.organisation_a))
        self.assertTrue(is_organisation_admin(self.superuser, self.organisation_b))

    def test_shared_access_allows_admin_approved_seller_and_partner(self):
        permission = HasTicketingOrganisationAccess()
        view = DummyView(organisation=self.organisation_a)

        for user in (self.owner_a, self.seller_user, self.partner_user):
            with self.subTest(user=user.username):
                self.assertTrue(permission.has_permission(self.request(user), view))

    def test_shared_access_rejects_viewer_pending_seller_and_cross_tenant_owner(self):
        permission = HasTicketingOrganisationAccess()
        view = DummyView(organisation=self.organisation_a)

        for user in (self.viewer_a, self.pending_seller_user, self.owner_b):
            with self.subTest(user=user.username):
                self.assertFalse(permission.has_permission(self.request(user), view))

    def test_admin_permission_rejects_seller_even_with_management_flag(self):
        self.seller.can_manage_settings = True
        self.seller.save(update_fields=["can_manage_settings"])
        request = self.request(self.seller_user)
        view = DummyView(organisation=self.organisation_a)

        self.assertFalse(IsTicketingAdminOrManager().has_permission(request, view))
        self.assertTrue(CanManageTicketingSettings().has_permission(request, view))

    def test_seller_permission_uses_action_mapping_and_fails_closed(self):
        request = self.request(self.seller_user)
        permission = HasTicketingSellerPermission()
        mapped_view = DummyView(
            organisation=self.organisation_a,
            action="create",
            ticketing_permission_by_action={"create": "can_create_bookings"},
        )
        missing_view = DummyView(organisation=self.organisation_a, action="create")

        self.assertTrue(permission.has_permission(request, mapped_view))
        self.assertFalse(permission.has_permission(request, missing_view))

    def test_seller_permission_cannot_be_borrowed_across_tenants(self):
        request = self.request(self.seller_user)
        view = DummyView(
            organisation=self.organisation_b,
            ticketing_permission_required="can_create_bookings",
        )
        self.assertFalse(
            HasTicketingSellerPermission().has_permission(request, view)
        )

    def test_business_entity_resolution_is_scoped_to_organisation(self):
        request = self.request(
            self.partner_user,
            data={"business_entity_id": self.entity_b.pk},
        )
        view = DummyView(organisation=self.organisation_a)
        self.assertIsNone(
            get_business_entity_from_view(
                request,
                view,
                organisation=self.organisation_a,
            )
        )

    def test_business_entity_access_queryset_is_tenant_scoped(self):
        accesses = get_user_business_entity_accesses(
            self.partner_user,
            self.organisation_a,
        )
        self.assertEqual(list(accesses), [self.partner_access])
        self.assertFalse(
            get_user_business_entity_accesses(
                self.partner_user,
                self.organisation_b,
            ).exists()
        )

    def test_business_entity_permissions_respect_flags_and_aliases(self):
        self.assertTrue(
            business_entity_has_permission(
                self.partner_user,
                self.organisation_a,
                "can_scan_tickets",
                self.entity_a,
            )
        )
        self.assertFalse(
            business_entity_has_permission(
                self.partner_user,
                self.organisation_a,
                "can_view_partner_financials",
                self.entity_a,
            )
        )
        self.assertFalse(
            business_entity_has_permission(
                self.partner_user,
                self.organisation_a,
                "not_a_real_permission",
                self.entity_a,
            )
        )

    def test_admin_only_operations_permission_cannot_be_granted_to_seller_or_partner(self):
        self.seller.can_manage_integrations = True
        self.seller.save(update_fields=["can_manage_integrations"])

        for user in (self.seller_user, self.partner_user):
            with self.subTest(user=user.username):
                self.assertFalse(
                    user_has_ticketing_permission(
                        user,
                        self.organisation_a,
                        "can_view_ledger",
                    )
                )

        self.assertTrue(
            user_has_ticketing_permission(
                self.owner_a,
                self.organisation_a,
                "can_view_ledger",
            )
        )

    def test_generic_permission_requires_business_entity_when_configured(self):
        request = self.request(self.partner_user)
        permission = HasTicketingPermission()
        missing_entity_view = DummyView(
            organisation=self.organisation_a,
            action="scan",
            ticketing_permission_by_action={"scan": "can_scan_tickets"},
            ticketing_business_entity_required=True,
        )
        entity_view = DummyView(
            organisation=self.organisation_a,
            action="scan",
            kwargs={"business_entity_id": self.entity_a.pk},
            ticketing_permission_by_action={"scan": "can_scan_tickets"},
            ticketing_business_entity_required=True,
        )

        self.assertFalse(permission.has_permission(request, missing_entity_view))
        self.assertTrue(permission.has_permission(request, entity_view))

    def test_business_entity_object_permission_rejects_cross_tenant_object(self):
        request = self.request(self.partner_user)
        view = DummyView(organisation=self.organisation_a)
        permission = HasBusinessEntityAccess()

        self.assertTrue(
            permission.has_object_permission(request, view, self.entity_a)
        )
        self.assertFalse(
            permission.has_object_permission(request, view, self.entity_b)
        )

    def test_inactive_business_entity_disables_partner_access(self):
        self.entity_a.is_active = False
        self.entity_a.save(update_fields=["is_active"])

        self.assertFalse(
            get_user_business_entity_accesses(
                self.partner_user,
                self.organisation_a,
            ).exists()
        )
        self.assertFalse(
            HasTicketingOrganisationAccess().has_permission(
                self.request(self.partner_user),
                DummyView(organisation=self.organisation_a),
            )
        )

    def test_inactive_organisation_rejects_private_ticketing_access(self):
        """Security invariant: inactive tenants must not use private APIs."""
        request = self.request(self.inactive_owner)
        view = DummyView(organisation=self.inactive_organisation)

        permissions = (
            HasTicketingOrganisationAccess(),
            IsTicketingAdminOrManager(),
            CanManageTicketingSettings(),
        )
        for permission in permissions:
            with self.subTest(permission=permission.__class__.__name__):
                self.assertFalse(permission.has_permission(request, view))
