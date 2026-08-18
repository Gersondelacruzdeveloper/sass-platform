"""Public seller-link API coverage.

The current public seller surface is the seller-linked booking endpoint and
signed seller offers. There is no separate public seller-profile endpoint.
These tests therefore protect seller attribution, tenant isolation, seller
status, seller booking settings, product eligibility, signed discounts, and
non-exposure of seller financial/permission internals.

No external provider calls are made.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import signing
from django.urls import reverse
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    Booking,
    ExperienceProduct,
    Seller,
    TicketingPublicSiteSettings,
    TicketingSettings,
)


SELLER_OFFER_SIGNING_SALT = "ticketing.seller-offer.v1"


class PublicSellerAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Public Seller Organisation A",
            slug="public-seller-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Public Seller Organisation B",
            slug="public-seller-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Seller Site A",
            custom_domain="seller-a.example.test",
            is_published=True,
            show_seller_public_pages=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Seller Site B",
            custom_domain="seller-b.example.test",
            is_published=True,
            show_seller_public_pages=True,
        )

        cls.settings_a = TicketingSettings.objects.create(
            organisation=cls.org_a,
            allow_public_bookings=True,
            allow_seller_bookings=True,
        )
        cls.settings_b = TicketingSettings.objects.create(
            organisation=cls.org_b,
            allow_public_bookings=True,
            allow_seller_bookings=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Seller Product A",
            slug="seller-product-a",
            sku="SELLER-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            seller_enabled=True,
            adult_price=Decimal("100.00"),
            base_price=Decimal("100.00"),
            cost_price=Decimal("60.00"),
            seller_allowed_discount_percent=Decimal("20.00"),
        )
        cls.product_a_seller_disabled = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Seller Disabled Product",
            slug="seller-disabled-product",
            sku="SELLER-DISABLED",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            seller_enabled=False,
            adult_price=Decimal("80.00"),
            base_price=Decimal("80.00"),
        )
        cls.product_a_public_disabled = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Public Disabled Seller Product",
            slug="public-disabled-seller-product",
            sku="SELLER-PUBLIC-DISABLED",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=False,
            seller_enabled=True,
            adult_price=Decimal("70.00"),
            base_price=Decimal("70.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Seller Product",
            slug="foreign-seller-product",
            sku="SELLER-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            seller_enabled=True,
            adult_price=Decimal("200.00"),
            base_price=Decimal("200.00"),
            cost_price=Decimal("120.00"),
            seller_allowed_discount_percent=Decimal("20.00"),
        )

        User = get_user_model()
        cls.user_a = User.objects.create_user(
            username="public-seller-a",
            email="public-seller-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.user_a2 = User.objects.create_user(
            username="public-seller-a2",
            email="public-seller-a2@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.user_b = User.objects.create_user(
            username="public-seller-b",
            email="public-seller-b@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_b,
        )

        cls.seller_a = Seller.objects.create(
            organisation=cls.org_a,
            user=cls.user_a,
            full_name="Public Seller A",
            seller_slug="seller-a",
            application_status="approved",
            is_active=True,
            commission_rate=Decimal("15.00"),
            default_margin_percent=Decimal("15.00"),
            max_customer_discount_percent=Decimal("10.00"),
            can_sell_excursions=True,
            can_create_bookings=True,
            can_apply_discounts=True,
            can_apply_customer_discount=True,
        )
        cls.inactive_seller_a = Seller.objects.create(
            organisation=cls.org_a,
            user=cls.user_a2,
            full_name="Inactive Public Seller",
            seller_slug="inactive-seller-a",
            application_status="approved",
            is_active=False,
            commission_rate=Decimal("25.00"),
            max_customer_discount_percent=Decimal("10.00"),
            can_sell_excursions=True,
            can_create_bookings=True,
            can_apply_discounts=True,
        )
        cls.seller_b = Seller.objects.create(
            organisation=cls.org_b,
            user=cls.user_b,
            full_name="Foreign Public Seller",
            seller_slug="seller-b",
            application_status="approved",
            is_active=True,
            commission_rate=Decimal("30.00"),
            max_customer_discount_percent=Decimal("10.00"),
            can_sell_excursions=True,
            can_create_bookings=True,
            can_apply_discounts=True,
        )

        cls.service_date = date.today() + timedelta(days=7)

    def seller_url(self, organisation, seller):
        return reverse(
            "ticketing-public-seller-bookings",
            kwargs={
                "organisation_slug": organisation.slug,
                "seller_slug": seller.seller_slug,
            },
        )

    def valid_payload(self, product=None, **overrides):
        product = product or self.product_a
        payload = {
            "primary_product": product.pk,
            "service_date": self.service_date.isoformat(),
            "customer_name": "Seller Link Customer",
            "customer_whatsapp": "+18095550999",
            "customer_email": "seller-link@example.test",
            "customer_hotel": "Hotel A",
            "adults": 1,
            "children": 0,
            "infants": 0,
            "payment_mode": "pending_payment",
            "payment_method": "cash",
            "items_payload": [
                {
                    "product_id": product.pk,
                    "service_date": self.service_date.isoformat(),
                    "quantity": 1,
                }
            ],
        }
        payload.update(overrides)
        return payload

    def offer_token(
        self,
        *,
        organisation=None,
        seller=None,
        product=None,
        discount_percent="5.00",
        **extra,
    ):
        organisation = organisation or self.org_a
        seller = seller or self.seller_a
        product = product or self.product_a
        payload = {
            "organisation_id": organisation.pk,
            "seller_id": seller.pk,
            "seller_slug": seller.seller_slug,
            "product_id": product.pk,
            "product_slug": product.slug,
            "discount_percent": str(discount_percent),
        }
        payload.update(extra)
        return signing.dumps(
            payload,
            salt=SELLER_OFFER_SIGNING_SALT,
            compress=True,
        )

    def test_public_seller_booking_url_reverses(self):
        self.assertEqual(
            self.seller_url(self.org_a, self.seller_a),
            (
                f"/api/ticketing/public/{self.org_a.slug}/s/"
                f"{self.seller_a.seller_slug}/bookings/"
            ),
        )

    @patch(
        "ticketing.serializers.BookingSerializer._send_booking_notification_after_commit"
    )
    def test_active_same_tenant_seller_link_assigns_seller(self, notify):
        response = self.client.post(
            self.seller_url(self.org_a, self.seller_a),
            self.valid_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        booking = Booking.objects.get(pk=response.data["id"])
        self.assertEqual(booking.organisation_id, self.org_a.pk)
        self.assertEqual(booking.seller_id, self.seller_a.pk)
        self.assertEqual(booking.source, "seller_public_link")

    @patch(
        "ticketing.serializers.BookingSerializer._send_booking_notification_after_commit"
    )
    def test_inactive_seller_slug_is_not_assigned(self, notify):
        response = self.client.post(
            self.seller_url(self.org_a, self.inactive_seller_a),
            self.valid_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        booking = Booking.objects.get(pk=response.data["id"])
        self.assertIsNone(booking.seller_id)
        self.assertEqual(booking.source, "public_site")

    @patch(
        "ticketing.serializers.BookingSerializer._send_booking_notification_after_commit"
    )
    def test_foreign_seller_slug_is_never_assigned_cross_tenant(self, notify):
        response = self.client.post(
            self.seller_url(self.org_a, self.seller_b),
            self.valid_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        booking = Booking.objects.get(pk=response.data["id"])
        self.assertEqual(booking.organisation_id, self.org_a.pk)
        self.assertIsNone(booking.seller_id)
        self.assertNotEqual(booking.seller_id, self.seller_b.pk)

    def test_seller_link_respects_public_booking_disabled_setting(self):
        self.settings_a.allow_public_bookings = False
        self.settings_a.save(update_fields=["allow_public_bookings"])

        response = self.client.post(
            self.seller_url(self.org_a, self.seller_a),
            self.valid_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(
            Booking.objects.filter(
                organisation=self.org_a,
                customer_email="seller-link@example.test",
            ).exists()
        )

    def test_seller_link_respects_seller_booking_disabled_setting(self):
        self.settings_a.allow_seller_bookings = False
        self.settings_a.save(update_fields=["allow_seller_bookings"])

        response = self.client.post(
            self.seller_url(self.org_a, self.seller_a),
            self.valid_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(
            Booking.objects.filter(
                organisation=self.org_a,
                customer_email="seller-link@example.test",
            ).exists()
        )

    def test_seller_link_hidden_when_public_site_unpublished(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.post(
            self.seller_url(self.org_a, self.seller_a),
            self.valid_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch(
        "ticketing.serializers.BookingSerializer._send_booking_notification_after_commit"
    )
    def test_browser_supplied_discount_without_signed_offer_is_ignored(self, notify):
        response = self.client.post(
            self.seller_url(self.org_a, self.seller_a),
            self.valid_payload(
                customer_discount_percent="99.00",
                customer_discount_amount="99.00",
                discount_amount="99.00",
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        booking = Booking.objects.get(pk=response.data["id"])
        self.assertEqual(booking.customer_discount_percent, Decimal("0.00"))
        self.assertEqual(booking.customer_discount_amount, Decimal("0.00"))
        self.assertEqual(booking.discount_amount, Decimal("0.00"))

    @patch(
        "ticketing.serializers.BookingSerializer._send_booking_notification_after_commit"
    )
    def test_valid_signed_discount_is_applied_only_for_matching_seller_product(
        self,
        notify,
    ):
        token = self.offer_token(discount_percent="5.00")

        response = self.client.post(
            self.seller_url(self.org_a, self.seller_a),
            self.valid_payload(offer_token=token),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        booking = Booking.objects.get(pk=response.data["id"])
        self.assertEqual(booking.seller_id, self.seller_a.pk)
        self.assertEqual(booking.customer_discount_percent, Decimal("5.00"))

    def test_tampered_offer_token_is_rejected(self):
        token = self.offer_token() + "tampered"

        response = self.client.post(
            self.seller_url(self.org_a, self.seller_a),
            self.valid_payload(offer_token=token),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("offer_token", response.data)

    def test_offer_for_foreign_tenant_is_rejected(self):
        token = self.offer_token(
            organisation=self.org_b,
            seller=self.seller_b,
            product=self.product_b,
        )

        response = self.client.post(
            self.seller_url(self.org_a, self.seller_a),
            self.valid_payload(offer_token=token),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("offer_token", response.data)

    def test_offer_for_other_seller_is_rejected(self):
        token = self.offer_token(seller=self.inactive_seller_a)

        response = self.client.post(
            self.seller_url(self.org_a, self.seller_a),
            self.valid_payload(offer_token=token),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("offer_token", response.data)

    def test_offer_for_other_product_is_rejected(self):
        token = self.offer_token(product=self.product_a_seller_disabled)

        response = self.client.post(
            self.seller_url(self.org_a, self.seller_a),
            self.valid_payload(
                product=self.product_a,
                offer_token=token,
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_signed_discount_above_current_seller_limit_is_rejected(self):
        token = self.offer_token(discount_percent="15.00")

        response = self.client.post(
            self.seller_url(self.org_a, self.seller_a),
            self.valid_payload(offer_token=token),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("offer_token", response.data)

    def test_signed_offer_rejects_seller_disabled_product(self):
        token = self.offer_token(product=self.product_a_seller_disabled)

        response = self.client.post(
            self.seller_url(self.org_a, self.seller_a),
            self.valid_payload(
                product=self.product_a_seller_disabled,
                offer_token=token,
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_signed_offer_rejects_non_public_product(self):
        token = self.offer_token(product=self.product_a_public_disabled)

        response = self.client.post(
            self.seller_url(self.org_a, self.seller_a),
            self.valid_payload(
                product=self.product_a_public_disabled,
                offer_token=token,
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch(
        "ticketing.serializers.BookingSerializer._send_booking_notification_after_commit"
    )
    def test_public_response_does_not_expose_seller_financial_or_permission_fields(
        self,
        notify,
    ):
        response = self.client.post(
            self.seller_url(self.org_a, self.seller_a),
            self.valid_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        payload = str(response.data)
        for secret_field in (
            "commission_rate",
            "fixed_commission_amount",
            "default_margin_percent",
            "max_customer_discount_percent",
            "can_manage_settings",
            "can_manage_integrations",
            "permissions",
            "total_commission_amount",
            "total_owed_to_company",
        ):
            with self.subTest(secret_field=secret_field):
                self.assertNotIn(secret_field, payload)

    @patch(
        "ticketing.serializers.BookingSerializer._send_booking_notification_after_commit"
    )
    def test_public_response_never_exposes_foreign_seller_identity(self, notify):
        response = self.client.post(
            self.seller_url(self.org_a, self.seller_b),
            self.valid_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        payload = str(response.data)
        self.assertNotIn(self.seller_b.full_name, payload)
        self.assertNotIn(self.seller_b.user.email, payload)

    def test_seller_public_pages_setting_is_exposed_only_as_site_feature_flag(self):
        response = self.client.get(
            reverse("ticketing-public-branding"),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(
            "show_seller_public_pages",
            response.data["public_site"],
        )
        self.assertTrue(
            response.data["public_site"]["show_seller_public_pages"]
        )
        payload = str(response.data)
        self.assertNotIn(str(self.seller_a.commission_rate), payload)
        self.assertNotIn(self.seller_a.user.email, payload)
