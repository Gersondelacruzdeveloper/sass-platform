"""Partner portal and settlement API coverage for ticketing.

These tests focus on partner/business-entity tenant isolation, portal access,
settlement visibility, settlement-payment permissions, and admin-only ledger /
settlement-generation boundaries.
"""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    BusinessEntityUserAccess,
    PartnerSettlementPayment,
    PartnerSettlementPeriod,
    TicketingBusinessEntity,
    TicketingLedgerEntry,
)


class PartnerAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Partner API Organisation A",
            slug="partner-api-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Partner API Organisation B",
            slug="partner-api-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.inactive_org = Organisation.objects.create(
            name="Partner API Inactive Organisation",
            slug="partner-api-inactive",
            business_type="ticketing",
            is_active=False,
        )

        User = get_user_model()
        cls.partner_user_a = User.objects.create_user(
            username="partner-api-a",
            email="partner-api-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.partner_user_a2 = User.objects.create_user(
            username="partner-api-a2",
            email="partner-api-a2@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.partner_user_b = User.objects.create_user(
            username="partner-api-b",
            email="partner-api-b@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_b,
        )
        cls.inactive_partner_user = User.objects.create_user(
            username="partner-api-inactive",
            email="partner-api-inactive@example.test",
            password="Strong-test-password-123",
            organisation=cls.inactive_org,
        )

        cls.entity_a = TicketingBusinessEntity.objects.create(
            organisation=cls.org_a,
            name="Partner Entity A",
            slug="partner-entity-a",
            entity_type="partner",
            is_active=True,
        )
        cls.entity_a2 = TicketingBusinessEntity.objects.create(
            organisation=cls.org_a,
            name="Partner Entity A2",
            slug="partner-entity-a2",
            entity_type="partner",
            is_active=True,
        )
        cls.entity_b = TicketingBusinessEntity.objects.create(
            organisation=cls.org_b,
            name="Partner Entity B",
            slug="partner-entity-b",
            entity_type="partner",
            is_active=True,
        )
        cls.inactive_entity = TicketingBusinessEntity.objects.create(
            organisation=cls.inactive_org,
            name="Inactive Partner Entity",
            slug="inactive-partner-entity",
            entity_type="partner",
            is_active=True,
        )

        cls.access_a = BusinessEntityUserAccess.objects.create(
            organisation=cls.org_a,
            business_entity=cls.entity_a,
            user=cls.partner_user_a,
            role="administrator",
            is_active=True,
            can_access_dashboard=True,
            can_view_today_bookings=True,
            can_view_financials=True,
            can_view_settlements=True,
            can_record_payments=True,
        )
        cls.access_a2 = BusinessEntityUserAccess.objects.create(
            organisation=cls.org_a,
            business_entity=cls.entity_a2,
            user=cls.partner_user_a2,
            role="finance",
            is_active=True,
            can_access_dashboard=True,
            can_view_today_bookings=True,
            can_view_financials=True,
            can_view_settlements=True,
            can_record_payments=False,
        )
        cls.access_b = BusinessEntityUserAccess.objects.create(
            organisation=cls.org_b,
            business_entity=cls.entity_b,
            user=cls.partner_user_b,
            role="administrator",
            is_active=True,
            can_access_dashboard=True,
            can_view_today_bookings=True,
            can_view_financials=True,
            can_view_settlements=True,
            can_record_payments=True,
        )
        cls.inactive_access = BusinessEntityUserAccess.objects.create(
            organisation=cls.inactive_org,
            business_entity=cls.inactive_entity,
            user=cls.inactive_partner_user,
            role="administrator",
            is_active=True,
            can_access_dashboard=True,
            can_view_financials=True,
            can_view_settlements=True,
            can_record_payments=True,
        )

        cls.settlement_a = PartnerSettlementPeriod.objects.create(
            organisation=cls.org_a,
            business_entity=cls.entity_a,
            period_start="2026-08-01",
            period_end="2026-08-07",
            currency="USD",
            gross_sales=Decimal("1000.00"),
            partner_entitlement=Decimal("700.00"),
            platform_entitlement=Decimal("300.00"),
            net_settlement_amount=Decimal("-700.00"),
            status="draft",
        )
        cls.settlement_a2 = PartnerSettlementPeriod.objects.create(
            organisation=cls.org_a,
            business_entity=cls.entity_a2,
            period_start="2026-08-01",
            period_end="2026-08-07",
            currency="USD",
            gross_sales=Decimal("500.00"),
            partner_entitlement=Decimal("350.00"),
            platform_entitlement=Decimal("150.00"),
            net_settlement_amount=Decimal("-350.00"),
            status="draft",
        )
        cls.settlement_b = PartnerSettlementPeriod.objects.create(
            organisation=cls.org_b,
            business_entity=cls.entity_b,
            period_start="2026-08-01",
            period_end="2026-08-07",
            currency="USD",
            gross_sales=Decimal("2000.00"),
            partner_entitlement=Decimal("1500.00"),
            platform_entitlement=Decimal("500.00"),
            net_settlement_amount=Decimal("-1500.00"),
            status="draft",
        )

        cls.payment_a = PartnerSettlementPayment.objects.create(
            settlement=cls.settlement_a,
            payer_type="owner",
            payee_type="partner",
            amount=Decimal("100.00"),
            payment_method="bank_transfer",
            reference="PAY-A",
        )
        cls.payment_a2 = PartnerSettlementPayment.objects.create(
            settlement=cls.settlement_a2,
            payer_type="owner",
            payee_type="partner",
            amount=Decimal("50.00"),
            payment_method="bank_transfer",
            reference="PAY-A2",
        )
        cls.payment_b = PartnerSettlementPayment.objects.create(
            settlement=cls.settlement_b,
            payer_type="owner",
            payee_type="partner",
            amount=Decimal("200.00"),
            payment_method="bank_transfer",
            reference="PAY-B",
        )

        cls.ledger_a = TicketingLedgerEntry.objects.create(
            organisation=cls.org_a,
            business_entity=cls.entity_a,
            entry_type="settlement",
            direction="credit",
            party_type="partner",
            amount=Decimal("100.00"),
            currency="USD",
            reference="LEDGER-A",
        )
        cls.ledger_b = TicketingLedgerEntry.objects.create(
            organisation=cls.org_b,
            business_entity=cls.entity_b,
            entry_type="settlement",
            direction="credit",
            party_type="partner",
            amount=Decimal("200.00"),
            currency="USD",
            reference="LEDGER-B",
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    @staticmethod
    def rows(response):
        data = response.data
        if isinstance(data, dict) and "results" in data:
            return data["results"]
        return data

    @classmethod
    def ids(cls, response):
        return {row["id"] for row in cls.rows(response)}

    def test_partner_url_names_reverse(self):
        self.assertEqual(
            reverse("ticketing-partner-bootstrap"),
            "/api/ticketing/partner/bootstrap/",
        )
        self.assertEqual(
            reverse("ticketing-partner-login"),
            "/api/ticketing/partner/login/",
        )
        self.assertEqual(
            reverse("ticketing-partner-settlements-list"),
            "/api/ticketing/partner-settlements/",
        )
        self.assertEqual(
            reverse("ticketing-partner-settlement-payments-list"),
            "/api/ticketing/partner-settlement-payments/",
        )
        self.assertEqual(
            reverse("ticketing-ledger-list"),
            "/api/ticketing/ledger/",
        )
        self.assertEqual(
            reverse(
                "ticketing-partner-settlements-record-payment",
                args=[self.settlement_a.pk],
            ),
            f"/api/ticketing/partner-settlements/{self.settlement_a.pk}/record-payment/",
        )

    def test_partner_private_endpoints_require_authentication(self):
        for url in (
            reverse("ticketing-partner-bootstrap"),
            reverse("ticketing-partner-settlements-list"),
            reverse("ticketing-partner-settlement-payments-list"),
            reverse("ticketing-ledger-list"),
        ):
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertIn(
                    response.status_code,
                    (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
                )

    def test_partner_bootstrap_returns_only_assigned_access(self):
        self.authenticate(self.partner_user_a)

        response = self.client.get(reverse("ticketing-partner-bootstrap"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        self.assertIn(self.entity_a.name, payload)
        self.assertNotIn(self.entity_a2.name, payload)
        self.assertNotIn(self.entity_b.name, payload)

    def test_partner_bootstrap_rejects_inactive_access(self):
        self.access_a.is_active = False
        self.access_a.save(update_fields=["is_active"])
        self.authenticate(self.partner_user_a)

        response = self.client.get(reverse("ticketing-partner-bootstrap"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_partner_bootstrap_rejects_inactive_organisation(self):
        self.authenticate(self.inactive_partner_user)

        response = self.client.get(reverse("ticketing-partner-bootstrap"))

        self.assertIn(
            response.status_code,
            (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND),
        )

    def test_settlement_list_is_scoped_to_partner_entity(self):
        self.authenticate(self.partner_user_a)

        response = self.client.get(
            reverse("ticketing-partner-settlements-list")
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self.ids(response)
        self.assertEqual(ids, {self.settlement_a.pk})

    def test_partner_cannot_retrieve_same_tenant_other_entity_settlement(self):
        self.authenticate(self.partner_user_a)

        response = self.client.get(
            reverse(
                "ticketing-partner-settlements-detail",
                args=[self.settlement_a2.pk],
            )
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_partner_cannot_retrieve_foreign_tenant_settlement(self):
        self.authenticate(self.partner_user_a)

        response = self.client.get(
            reverse(
                "ticketing-partner-settlements-detail",
                args=[self.settlement_b.pk],
            )
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_partner_without_view_settlement_permission_is_rejected(self):
        self.access_a.can_view_settlements = False
        self.access_a.save(update_fields=["can_view_settlements"])
        self.authenticate(self.partner_user_a)

        response = self.client.get(
            reverse("ticketing-partner-settlements-list")
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_partner_payment_list_is_scoped_to_assigned_entity(self):
        self.authenticate(self.partner_user_a)

        response = self.client.get(
            reverse("ticketing-partner-settlement-payments-list")
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self.ids(response)
        self.assertIn(self.payment_a.pk, ids)
        self.assertNotIn(self.payment_a2.pk, ids)
        self.assertNotIn(self.payment_b.pk, ids)

    def test_partner_cannot_retrieve_same_tenant_other_entity_payment(self):
        self.authenticate(self.partner_user_a)

        response = self.client.get(
            reverse(
                "ticketing-partner-settlement-payments-detail",
                args=[self.payment_a2.pk],
            )
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn("PAY-A2", str(getattr(response, "data", "")))

    def test_partner_cannot_retrieve_foreign_tenant_payment(self):
        self.authenticate(self.partner_user_a)

        response = self.client.get(
            reverse(
                "ticketing-partner-settlement-payments-detail",
                args=[self.payment_b.pk],
            )
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn("PAY-B", str(getattr(response, "data", "")))

    def test_partner_user_is_denied_admin_only_ledger(self):
        self.authenticate(self.partner_user_a)

        response = self.client.get(reverse("ticketing-ledger-list"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertNotIn("LEDGER-A", str(getattr(response, "data", "")))
        self.assertNotIn("LEDGER-B", str(getattr(response, "data", "")))

    def test_partner_user_is_denied_admin_only_settlement_generation(self):
        self.authenticate(self.partner_user_a)

        response = self.client.post(
            reverse("ticketing-partner-settlements-generate"),
            {
                "business_entity_id": self.entity_a.pk,
                "period_start": "2026-08-08",
                "period_end": "2026-08-14",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_partner_can_record_positive_payment_for_own_settlement(self):
        approved = PartnerSettlementPeriod.objects.create(
            organisation=self.org_a,
            business_entity=self.entity_a,
            period_start="2026-08-15",
            period_end="2026-08-21",
            currency="USD",
            gross_sales=Decimal("300.00"),
            partner_entitlement=Decimal("200.00"),
            platform_entitlement=Decimal("100.00"),
            net_settlement_amount=Decimal("-200.00"),
            status="approved",
        )
        self.authenticate(self.partner_user_a)

        response = self.client.post(
            reverse(
                "ticketing-partner-settlements-record-payment",
                args=[approved.pk],
            ),
            {
                "business_entity_id": self.entity_a.pk,
                "payer_type": "platform",
                "payee_type": "partner",
                "amount": "25.00",
                "payment_method": "bank_transfer",
                "reference": "PARTNER-RECORDED-A",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            PartnerSettlementPayment.objects.filter(
                settlement=approved,
                amount=Decimal("25.00"),
            ).exists()
        )

    def test_partner_record_payment_rejects_negative_amount(self):
        self.authenticate(self.partner_user_a)

        response = self.client.post(
            reverse(
                "ticketing-partner-settlements-record-payment",
                args=[self.settlement_a.pk],
            ),
            {
                "business_entity_id": self.entity_a.pk,
                "payer_type": "owner",
                "payee_type": "partner",
                "amount": "-1.00",
                "payment_method": "bank_transfer",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_partner_without_record_payment_permission_is_denied(self):
        self.access_a.can_record_payments = False
        self.access_a.save(update_fields=["can_record_payments"])
        self.authenticate(self.partner_user_a)

        response = self.client.post(
            reverse(
                "ticketing-partner-settlements-record-payment",
                args=[self.settlement_a.pk],
            ),
            {
                "business_entity_id": self.entity_a.pk,
                "payer_type": "owner",
                "payee_type": "partner",
                "amount": "25.00",
                "payment_method": "bank_transfer",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_partner_cannot_record_payment_for_other_same_tenant_entity(self):
        self.authenticate(self.partner_user_a)

        response = self.client.post(
            reverse(
                "ticketing-partner-settlements-record-payment",
                args=[self.settlement_a2.pk],
            ),
            {
                "business_entity_id": self.entity_a2.pk,
                "payer_type": "owner",
                "payee_type": "partner",
                "amount": "25.00",
                "payment_method": "bank_transfer",
            },
            format="json",
        )

        self.assertIn(
            response.status_code,
            (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND),
        )

    def test_partner_cannot_record_payment_for_foreign_tenant_settlement(self):
        self.authenticate(self.partner_user_a)

        response = self.client.post(
            reverse(
                "ticketing-partner-settlements-record-payment",
                args=[self.settlement_b.pk],
            ),
            {
                "business_entity_id": self.entity_b.pk,
                "payer_type": "owner",
                "payee_type": "partner",
                "amount": "25.00",
                "payment_method": "bank_transfer",
            },
            format="json",
        )

        self.assertIn(
            response.status_code,
            (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND),
        )

    def test_partner_login_failure_does_not_expose_password(self):
        secret = "partner-login-secret-must-not-leak"

        response = self.client.post(
            reverse("ticketing-partner-login"),
            {
                "organisation_slug": self.org_a.slug,
                "email": "missing@example.test",
                "password": secret,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn(secret, str(getattr(response, "data", "")))

    def test_partner_login_rejects_access_for_other_organisation(self):
        response = self.client.post(
            reverse("ticketing-partner-login"),
            {
                "organisation_slug": self.org_b.slug,
                "email": self.partner_user_a.email,
                "password": "Strong-test-password-123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertNotIn(self.entity_a.name, str(response.data))
