"""Administrative ticketing API permission and tenant-isolation coverage.

This suite focuses on owner/manager-only financial and operations endpoints:
business entities, agreements, financial snapshots, settlements, and ledger.
External providers are not used.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from organisations.models import Membership, Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    Booking,
    BookingFinancialSnapshot,
    BookingItem,
    BusinessEntityUserAccess,
    ExperienceProduct,
    PartnerSettlementPeriod,
    ProductBusinessAgreement,
    Seller,
    TicketingBusinessEntity,
    TicketingLedgerEntry,
)


class TicketingAdminAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Admin API Organisation A",
            slug="admin-api-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Admin API Organisation B",
            slug="admin-api-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.inactive_org = Organisation.objects.create(
            name="Admin API Inactive Organisation",
            slug="admin-api-inactive",
            business_type="ticketing",
            is_active=False,
        )

        User = get_user_model()

        def create_user(username, organisation):
            return User.objects.create_user(
                username=username,
                email=f"{username}@example.test",
                password="Strong-test-password-123",
                organisation=organisation,
            )

        cls.owner_a = create_user("admin-api-owner-a", cls.org_a)
        cls.manager_a = create_user("admin-api-manager-a", cls.org_a)
        cls.viewer_a = create_user("admin-api-viewer-a", cls.org_a)
        cls.inactive_member_a = create_user(
            "admin-api-inactive-member",
            cls.org_a,
        )
        cls.owner_b = create_user("admin-api-owner-b", cls.org_b)
        cls.inactive_owner = create_user(
            "admin-api-inactive-owner",
            cls.inactive_org,
        )
        cls.seller_user = create_user("admin-api-seller", cls.org_a)
        cls.partner_user = create_user("admin-api-partner", cls.org_a)

        for user, organisation, role, is_active in (
            (cls.owner_a, cls.org_a, "owner", True),
            (cls.manager_a, cls.org_a, "manager", True),
            (cls.viewer_a, cls.org_a, "viewer", True),
            (cls.inactive_member_a, cls.org_a, "owner", False),
            (cls.owner_b, cls.org_b, "owner", True),
            (cls.inactive_owner, cls.inactive_org, "owner", True),
        ):
            Membership.objects.create(
                user=user,
                organisation=organisation,
                role=role,
                is_active=is_active,
            )

        cls.seller = Seller.objects.create(
            organisation=cls.org_a,
            user=cls.seller_user,
            full_name="Admin API Seller",
            seller_slug="admin-api-seller",
            application_status="approved",
            is_active=True,
            can_access_dashboard=True,
            can_view_reports=True,
            can_manage_settings=True,
            can_manage_integrations=True,
        )

        cls.entity_a = TicketingBusinessEntity.objects.create(
            organisation=cls.org_a,
            name="Admin Entity A",
            slug="admin-entity-a",
            entity_type="partner",
            is_active=True,
        )
        cls.entity_a2 = TicketingBusinessEntity.objects.create(
            organisation=cls.org_a,
            name="Admin Entity A2",
            slug="admin-entity-a2",
            entity_type="partner",
            is_active=True,
        )
        cls.entity_b = TicketingBusinessEntity.objects.create(
            organisation=cls.org_b,
            name="Admin Entity B",
            slug="admin-entity-b",
            entity_type="partner",
            is_active=True,
        )

        cls.partner_access = BusinessEntityUserAccess.objects.create(
            organisation=cls.org_a,
            business_entity=cls.entity_a,
            user=cls.partner_user,
            role="administrator",
            is_active=True,
            can_access_dashboard=True,
            can_view_financials=True,
            can_view_settlements=True,
            can_record_payments=True,
            can_manage_users=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Admin Product A",
            slug="admin-product-a",
            sku="ADMIN-A",
            product_type="excursion",
            status="active",
            is_active=True,
            adult_price=Decimal("100.00"),
            base_price=Decimal("100.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Admin Product B",
            slug="admin-product-b",
            sku="ADMIN-B",
            product_type="excursion",
            status="active",
            is_active=True,
            adult_price=Decimal("200.00"),
            base_price=Decimal("200.00"),
        )

        cls.agreement_a = ProductBusinessAgreement.objects.create(
            organisation=cls.org_a,
            business_entity=cls.entity_a,
            product=cls.product_a,
            name="Agreement A",
            version=1,
            agreement_type="fixed_partner_net",
            settlement_basis="checked_in",
            collection_mode="platform",
            partner_fixed_amount=Decimal("60.00"),
            platform_fixed_amount=Decimal("40.00"),
            created_by=cls.owner_a,
        )
        cls.agreement_b = ProductBusinessAgreement.objects.create(
            organisation=cls.org_b,
            business_entity=cls.entity_b,
            product=cls.product_b,
            name="Agreement B",
            version=1,
            agreement_type="fixed_partner_net",
            settlement_basis="checked_in",
            collection_mode="platform",
            partner_fixed_amount=Decimal("120.00"),
            platform_fixed_amount=Decimal("80.00"),
            created_by=cls.owner_b,
        )

        cls.booking_a = Booking.objects.create(
            organisation=cls.org_a,
            primary_product=cls.product_a,
            customer_name="Admin Customer A",
            status="confirmed",
            total_amount=Decimal("100.00"),
            balance_due=Decimal("100.00"),
            created_by=cls.owner_a,
        )
        cls.item_a = BookingItem.objects.create(
            booking=cls.booking_a,
            product=cls.product_a,
            business_entity=cls.entity_a,
            agreement=cls.agreement_a,
            product_name=cls.product_a.name,
            product_type="excursion",
            quantity=1,
            unit_price=Decimal("100.00"),
            unit_cost=Decimal("60.00"),
            total=Decimal("100.00"),
            service_date=date(2026, 8, 20),
        )
        cls.snapshot_a = BookingFinancialSnapshot.objects.create(
            organisation=cls.org_a,
            booking=cls.booking_a,
            booking_item=cls.item_a,
            business_entity=cls.entity_a,
            agreement=cls.agreement_a,
            agreement_version=1,
            settlement_basis="checked_in",
            quantity=1,
            gross_amount=Decimal("100.00"),
            net_customer_amount=Decimal("100.00"),
            partner_entitlement=Decimal("60.00"),
            platform_entitlement=Decimal("40.00"),
        )

        cls.booking_b = Booking.objects.create(
            organisation=cls.org_b,
            primary_product=cls.product_b,
            customer_name="Admin Customer B",
            status="confirmed",
            total_amount=Decimal("200.00"),
            balance_due=Decimal("200.00"),
            created_by=cls.owner_b,
        )
        cls.item_b = BookingItem.objects.create(
            booking=cls.booking_b,
            product=cls.product_b,
            business_entity=cls.entity_b,
            agreement=cls.agreement_b,
            product_name=cls.product_b.name,
            product_type="excursion",
            quantity=1,
            unit_price=Decimal("200.00"),
            unit_cost=Decimal("120.00"),
            total=Decimal("200.00"),
            service_date=date(2026, 8, 20),
        )
        cls.snapshot_b = BookingFinancialSnapshot.objects.create(
            organisation=cls.org_b,
            booking=cls.booking_b,
            booking_item=cls.item_b,
            business_entity=cls.entity_b,
            agreement=cls.agreement_b,
            agreement_version=1,
            settlement_basis="checked_in",
            quantity=1,
            gross_amount=Decimal("200.00"),
            net_customer_amount=Decimal("200.00"),
            partner_entitlement=Decimal("120.00"),
            platform_entitlement=Decimal("80.00"),
        )

        cls.settlement_a = PartnerSettlementPeriod.objects.create(
            organisation=cls.org_a,
            business_entity=cls.entity_a,
            period_start=date(2026, 8, 1),
            period_end=date(2026, 8, 7),
            gross_sales=Decimal("100.00"),
            partner_entitlement=Decimal("60.00"),
            platform_entitlement=Decimal("40.00"),
            net_settlement_amount=Decimal("-60.00"),
            status="draft",
        )
        cls.settlement_b = PartnerSettlementPeriod.objects.create(
            organisation=cls.org_b,
            business_entity=cls.entity_b,
            period_start=date(2026, 8, 1),
            period_end=date(2026, 8, 7),
            gross_sales=Decimal("200.00"),
            partner_entitlement=Decimal("120.00"),
            platform_entitlement=Decimal("80.00"),
            net_settlement_amount=Decimal("-120.00"),
            status="draft",
        )

        cls.ledger_a = TicketingLedgerEntry.objects.create(
            organisation=cls.org_a,
            business_entity=cls.entity_a,
            entry_type="partner_entitlement",
            direction="credit",
            party_type="partner",
            amount=Decimal("60.00"),
            reference="ADMIN-LEDGER-A",
        )
        cls.ledger_b = TicketingLedgerEntry.objects.create(
            organisation=cls.org_b,
            business_entity=cls.entity_b,
            entry_type="partner_entitlement",
            direction="credit",
            party_type="partner",
            amount=Decimal("120.00"),
            reference="ADMIN-LEDGER-B",
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    @staticmethod
    def rows(response):
        if isinstance(response.data, dict) and "results" in response.data:
            return response.data["results"]
        return response.data

    @classmethod
    def ids(cls, response):
        return {row["id"] for row in cls.rows(response)}

    def assert_admin_denied(self, response):
        self.assertIn(
            response.status_code,
            (
                status.HTTP_401_UNAUTHORIZED,
                status.HTTP_403_FORBIDDEN,
                status.HTTP_404_NOT_FOUND,
            ),
        )

    # ------------------------------------------------------------------
    # URL contracts
    # ------------------------------------------------------------------

    def test_admin_url_names_reverse(self):
        self.assertEqual(
            reverse("ticketing-business-entities-list"),
            "/api/ticketing/business-entities/",
        )
        self.assertEqual(
            reverse("ticketing-business-agreements-list"),
            "/api/ticketing/business-agreements/",
        )
        self.assertEqual(
            reverse("ticketing-financial-snapshots-list"),
            "/api/ticketing/financial-snapshots/",
        )
        self.assertEqual(
            reverse("ticketing-financial-snapshots-capture-booking"),
            "/api/ticketing/financial-snapshots/capture-booking/",
        )
        self.assertEqual(
            reverse("ticketing-partner-settlements-generate"),
            "/api/ticketing/partner-settlements/generate/",
        )
        self.assertEqual(
            reverse("ticketing-ledger-summary"),
            "/api/ticketing/ledger/summary/",
        )

    # ------------------------------------------------------------------
    # Authentication / role boundary
    # ------------------------------------------------------------------

    def test_admin_financial_endpoints_require_authentication(self):
        for url in (
            reverse("ticketing-business-entities-list"),
            reverse("ticketing-business-agreements-list"),
            reverse("ticketing-financial-snapshots-list"),
            reverse("ticketing-partner-settlements-generate"),
            reverse("ticketing-ledger-list"),
        ):
            with self.subTest(url=url):
                self.assert_admin_denied(self.client.get(url))

    def test_viewer_cannot_access_admin_operations(self):
        self.authenticate(self.viewer_a)

        for url in (
            reverse("ticketing-business-entities-list"),
            reverse("ticketing-business-agreements-list"),
            reverse("ticketing-financial-snapshots-list"),
            reverse("ticketing-ledger-list"),
        ):
            with self.subTest(url=url):
                self.assertEqual(
                    self.client.get(url).status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_seller_business_entity_read_is_scoped_but_admin_financial_operations_are_denied(self):
        self.authenticate(self.seller_user)

        entities = self.client.get(
            reverse("ticketing-business-entities-list")
        )
        self.assertEqual(entities.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(entities), [])
        self.assertNotIn(self.entity_a.pk, self.ids(entities))
        self.assertNotIn(self.entity_b.pk, self.ids(entities))

        for url in (
            reverse("ticketing-business-agreements-list"),
            reverse("ticketing-financial-snapshots-list"),
            reverse("ticketing-ledger-list"),
        ):
            with self.subTest(url=url):
                self.assertEqual(
                    self.client.get(url).status_code,
                    status.HTTP_403_FORBIDDEN,
                )

        create_entity = self.client.post(
            reverse("ticketing-business-entities-list"),
            {
                "name": "Seller Escalation Attempt",
                "slug": "seller-escalation-attempt",
                "entity_type": "partner",
            },
            format="json",
        )
        self.assertEqual(
            create_entity.status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_partner_cannot_escalate_to_admin_financial_operations(self):
        self.authenticate(self.partner_user)

        self.assertEqual(
            self.client.get(reverse("ticketing-ledger-list")).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(
                reverse("ticketing-partner-settlements-generate"),
                {
                    "business_entity_id": self.entity_a.pk,
                    "period_start": "2026-08-08",
                    "period_end": "2026-08-14",
                },
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_inactive_membership_and_inactive_organisation_are_rejected(self):
        for user in (self.inactive_member_a, self.inactive_owner):
            self.authenticate(user)
            response = self.client.get(reverse("ticketing-ledger-list"))
            self.assert_admin_denied(response)
            self.client.force_authenticate(user=None)

    # ------------------------------------------------------------------
    # Owner / manager positive boundary
    # ------------------------------------------------------------------

    def test_owner_can_access_admin_lists(self):
        self.authenticate(self.owner_a)

        for url in (
            reverse("ticketing-business-entities-list"),
            reverse("ticketing-business-agreements-list"),
            reverse("ticketing-financial-snapshots-list"),
            reverse("ticketing-ledger-list"),
        ):
            with self.subTest(url=url):
                self.assertEqual(
                    self.client.get(url).status_code,
                    status.HTTP_200_OK,
                )

    def test_manager_can_access_admin_financial_lists(self):
        self.authenticate(self.manager_a)

        self.assertEqual(
            self.client.get(reverse("ticketing-financial-snapshots-list")).status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.get(reverse("ticketing-ledger-list")).status_code,
            status.HTTP_200_OK,
        )

    # ------------------------------------------------------------------
    # Tenant isolation
    # ------------------------------------------------------------------

    def test_business_entity_list_and_detail_are_tenant_scoped(self):
        self.authenticate(self.owner_a)

        listed = self.client.get(reverse("ticketing-business-entities-list"))
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertIn(self.entity_a.pk, self.ids(listed))
        self.assertNotIn(self.entity_b.pk, self.ids(listed))

        foreign = self.client.get(
            reverse(
                "ticketing-business-entities-detail",
                args=[self.entity_b.pk],
            )
        )
        self.assertEqual(foreign.status_code, status.HTTP_404_NOT_FOUND)

    def test_business_agreement_list_and_detail_are_tenant_scoped(self):
        self.authenticate(self.owner_a)

        listed = self.client.get(reverse("ticketing-business-agreements-list"))
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertIn(self.agreement_a.pk, self.ids(listed))
        self.assertNotIn(self.agreement_b.pk, self.ids(listed))

        foreign = self.client.get(
            reverse(
                "ticketing-business-agreements-detail",
                args=[self.agreement_b.pk],
            )
        )
        self.assertEqual(foreign.status_code, status.HTTP_404_NOT_FOUND)

    def test_financial_snapshot_list_and_detail_are_tenant_scoped(self):
        self.authenticate(self.owner_a)

        listed = self.client.get(reverse("ticketing-financial-snapshots-list"))
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertIn(self.snapshot_a.pk, self.ids(listed))
        self.assertNotIn(self.snapshot_b.pk, self.ids(listed))

        foreign = self.client.get(
            reverse(
                "ticketing-financial-snapshots-detail",
                args=[self.snapshot_b.pk],
            )
        )
        self.assertEqual(foreign.status_code, status.HTTP_404_NOT_FOUND)

    def test_ledger_list_is_tenant_scoped(self):
        self.authenticate(self.owner_a)

        response = self.client.get(reverse("ticketing-ledger-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self.ids(response)
        self.assertIn(self.ledger_a.pk, ids)
        self.assertNotIn(self.ledger_b.pk, ids)
        self.assertNotIn("ADMIN-LEDGER-B", str(response.data))

    def test_owner_cannot_borrow_other_tenant_via_slug(self):
        self.authenticate(self.owner_a)

        response = self.client.get(
            reverse("ticketing-ledger-list"),
            {"organisation_slug": self.org_b.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertNotIn("ADMIN-LEDGER-B", str(getattr(response, "data", "")))

    # ------------------------------------------------------------------
    # Cross-tenant writes
    # ------------------------------------------------------------------

    def test_admin_cannot_create_agreement_with_foreign_product_and_entity(self):
        self.authenticate(self.owner_a)

        response = self.client.post(
            reverse("ticketing-business-agreements-list"),
            {
                "business_entity_id": self.entity_b.pk,
                "product_id": self.product_b.pk,
                "name": "Cross Tenant Agreement",
                "agreement_type": "fixed_partner_net",
                "settlement_basis": "checked_in",
                "collection_mode": "platform",
                "partner_fixed_amount": "100.00",
                "platform_fixed_amount": "100.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            ProductBusinessAgreement.objects.filter(
                organisation=self.org_a,
                name="Cross Tenant Agreement",
            ).exists()
        )

    def test_capture_booking_cannot_capture_foreign_tenant_booking(self):
        self.authenticate(self.owner_a)

        with patch("ticketing.views.create_snapshots_for_booking") as capture:
            response = self.client.post(
                reverse("ticketing-financial-snapshots-capture-booking"),
                {"booking_id": self.booking_b.pk},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        capture.assert_not_called()

    # ------------------------------------------------------------------
    # Admin-only actions
    # ------------------------------------------------------------------

    @patch("ticketing.views.settlement_preview")
    def test_owner_can_preview_settlement_for_own_entity(self, preview):
        preview.return_value = {
            "business_entity_id": self.entity_a.pk,
            "gross_sales": "100.00",
        }
        self.authenticate(self.owner_a)

        response = self.client.post(
            reverse("ticketing-partner-settlements-preview"),
            {
                "business_entity_id": self.entity_a.pk,
                "period_start": "2026-08-08",
                "period_end": "2026-08-14",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        preview.assert_called_once()

    @patch("ticketing.views.settlement_preview")
    def test_owner_cannot_preview_foreign_entity(self, preview):
        self.authenticate(self.owner_a)

        response = self.client.post(
            reverse("ticketing-partner-settlements-preview"),
            {
                "business_entity_id": self.entity_b.pk,
                "period_start": "2026-08-08",
                "period_end": "2026-08-14",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        preview.assert_not_called()

    @patch("ticketing.views.ensure_snapshots_and_generate")
    def test_owner_can_generate_settlement_for_own_entity(self, generate):
        generated = PartnerSettlementPeriod.objects.create(
            organisation=self.org_a,
            business_entity=self.entity_a2,
            period_start=date(2026, 8, 8),
            period_end=date(2026, 8, 14),
            gross_sales=Decimal("50.00"),
            partner_entitlement=Decimal("30.00"),
            platform_entitlement=Decimal("20.00"),
            net_settlement_amount=Decimal("-30.00"),
            status="draft",
        )
        generate.return_value = generated
        self.authenticate(self.owner_a)

        response = self.client.post(
            reverse("ticketing-partner-settlements-generate"),
            {
                "business_entity_id": self.entity_a2.pk,
                "period_start": "2026-08-08",
                "period_end": "2026-08-14",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        generate.assert_called_once()

    def test_partner_cannot_approve_or_reconcile_settlement(self):
        self.authenticate(self.partner_user)

        approve = self.client.post(
            reverse(
                "ticketing-partner-settlements-approve",
                args=[self.settlement_a.pk],
            ),
            {},
            format="json",
        )
        reconcile = self.client.get(
            reverse(
                "ticketing-partner-settlements-reconcile",
                args=[self.settlement_a.pk],
            )
        )

        self.assertEqual(approve.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(reconcile.status_code, status.HTTP_403_FORBIDDEN)

    @patch("ticketing.views.ledger_summary")
    def test_owner_ledger_summary_cannot_select_foreign_entity(self, summary):
        self.authenticate(self.owner_a)

        response = self.client.get(
            reverse("ticketing-ledger-summary"),
            {"business_entity": self.entity_b.pk},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        summary.assert_not_called()
