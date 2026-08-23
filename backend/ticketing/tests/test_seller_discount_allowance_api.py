"""Focused regression tests for seller fixed-allowance discounts."""

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import signing
from django.urls import reverse
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.finance.calculator import calculate_booking_pricing
from ticketing.models import (
    Booking,
    ExperienceProduct,
    Seller,
    SellerProductCommissionRule,
    TicketingPublicSiteSettings,
    TicketingSettings,
)

SELLER_OFFER_SIGNING_SALT = "ticketing.seller-offer.v1"


class SellerDiscountAllowanceAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Seller Allowance Organisation A",
            slug="seller-allowance-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Seller Allowance Organisation B",
            slug="seller-allowance-b",
            business_type="ticketing",
            is_active=True,
        )

        TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Seller Allowance Site A",
            custom_domain="seller-allowance-a.example.test",
            is_published=True,
            show_seller_public_pages=True,
        )
        TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Seller Allowance Site B",
            custom_domain="seller-allowance-b.example.test",
            is_published=True,
            show_seller_public_pages=True,
        )
        TicketingSettings.objects.create(
            organisation=cls.org_a,
            allow_public_bookings=True,
            allow_seller_bookings=True,
        )
        TicketingSettings.objects.create(
            organisation=cls.org_b,
            allow_public_bookings=True,
            allow_seller_bookings=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Coco Bongo Regular",
            slug="coco-bongo-regular",
            sku="COCO-REGULAR-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            seller_enabled=True,
            adult_price=Decimal("100.00"),
            base_price=Decimal("100.00"),
            cost_price=Decimal("60.00"),
            seller_allowed_discount_percent=Decimal("0.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Product",
            slug="foreign-product",
            sku="FOREIGN-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            seller_enabled=True,
            adult_price=Decimal("100.00"),
            base_price=Decimal("100.00"),
            cost_price=Decimal("60.00"),
            seller_allowed_discount_percent=Decimal("0.00"),
        )

        User = get_user_model()
        cls.user_a = User.objects.create_user(
            username="allowance-a",
            email="allowance-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.user_a2 = User.objects.create_user(
            username="allowance-a2",
            email="allowance-a2@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.user_b = User.objects.create_user(
            username="allowance-b",
            email="allowance-b@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_b,
        )

        common = dict(
            application_status="approved",
            is_active=True,
            commission_rate=Decimal("0.00"),
            default_margin_percent=Decimal("0.00"),
            max_customer_discount_percent=Decimal("0.00"),
            can_sell_excursions=True,
            can_create_bookings=True,
            can_apply_discounts=True,
            can_apply_customer_discount=True,
        )
        cls.seller_a = Seller.objects.create(
            organisation=cls.org_a,
            user=cls.user_a,
            full_name="Allowance Seller A",
            seller_slug="allowance-seller-a",
            **common,
        )
        cls.seller_a2 = Seller.objects.create(
            organisation=cls.org_a,
            user=cls.user_a2,
            full_name="Allowance Seller A2",
            seller_slug="allowance-seller-a2",
            **common,
        )
        cls.seller_b = Seller.objects.create(
            organisation=cls.org_b,
            user=cls.user_b,
            full_name="Allowance Seller B",
            seller_slug="allowance-seller-b",
            **common,
        )

        SellerProductCommissionRule.objects.create(
            organisation=cls.org_a,
            seller=cls.seller_a,
            product=cls.product_a,
            rule_type="fixed_amount",
            fixed_amount=Decimal("10.00"),
            percentage=Decimal("0.00"),
            is_per_unit=True,
            is_active=True,
        )
        SellerProductCommissionRule.objects.create(
            organisation=cls.org_a,
            seller=cls.seller_a2,
            product=cls.product_a,
            rule_type="fixed_amount",
            fixed_amount=Decimal("50.00"),
            percentage=Decimal("0.00"),
            is_per_unit=True,
            is_active=True,
        )
        SellerProductCommissionRule.objects.create(
            organisation=cls.org_b,
            seller=cls.seller_b,
            product=cls.product_b,
            rule_type="fixed_amount",
            fixed_amount=Decimal("75.00"),
            percentage=Decimal("0.00"),
            is_per_unit=True,
            is_active=True,
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
            "customer_name": "Allowance Customer",
            "customer_whatsapp": "+18095550999",
            "customer_email": "allowance-customer@example.test",
            "customer_hotel": "Hotel Test",
            "adults": 1,
            "children": 0,
            "infants": 0,
            "payment_mode": "pending_payment",
            "payment_method": "cash",
            "items_payload": [{
                "product_id": product.pk,
                "service_date": self.service_date.isoformat(),
                "quantity": 1,
            }],
        }
        payload.update(overrides)
        return payload

    def offer_token(self, discount_percent, *, organisation=None, seller=None, product=None):
        organisation = organisation or self.org_a
        seller = seller or self.seller_a
        product = product or self.product_a
        return signing.dumps(
            {
                "organisation_id": organisation.pk,
                "seller_id": seller.pk,
                "seller_slug": seller.seller_slug,
                "product_id": product.pk,
                "product_slug": product.slug,
                "discount_percent": str(discount_percent),
            },
            salt=SELLER_OFFER_SIGNING_SALT,
            compress=True,
        )

    def post_discount(self, discount_percent):
        token = self.offer_token(discount_percent)
        with patch(
            "ticketing.serializers.BookingSerializer._send_booking_notification_after_commit"
        ):
            return self.client.post(
                self.seller_url(self.org_a, self.seller_a),
                self.valid_payload(offer_token=token),
                format="json",
            )

    def assert_split(self, discount, customer_final, seller_commission):
        response = self.post_discount(discount)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        booking = Booking.objects.get(pk=response.data["id"])
        pricing = calculate_booking_pricing(booking)

        self.assertEqual(booking.customer_discount_percent, Decimal(discount))
        self.assertEqual(pricing["seller_margin_amount"], Decimal("10.00"))
        self.assertEqual(pricing["customer_final_price"], Decimal(customer_final))
        self.assertEqual(pricing["seller_commission_amount"], Decimal(seller_commission))
        self.assertEqual(pricing["owner_net_amount"], Decimal("90.00"))
        self.assertEqual(pricing["commission_rule_type"], "fixed_amount")

    def test_zero_discount_keeps_full_allowance(self):
        self.assert_split("0.00", "100.00", "10.00")

    def test_five_dollar_discount_consumes_half_allowance(self):
        self.assert_split("5.00", "95.00", "5.00")

    def test_ten_dollar_discount_consumes_full_allowance(self):
        self.assert_split("10.00", "90.00", "0.00")

    def test_eleven_dollar_discount_is_rejected_with_simple_message(self):
        response = self.post_discount("11.00")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)

        message = " ".join(str(value) for value in response.data.values())
        self.assertIn("US$10.00", message)
        self.assertNotIn("Maximum discount allowed for this booking", message)
        self.assertNotIn("Minimum selling price", message)
        self.assertNotIn("discount limit changed", message.lower())

    def test_other_seller_rule_does_not_expand_allowance(self):
        response = self.post_discount("11.00")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)

    def test_foreign_tenant_rule_does_not_expand_allowance(self):
        response = self.post_discount("11.00")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)

    def test_signed_offer_for_other_seller_is_rejected(self):
        token = self.offer_token(
            "5.00",
            organisation=self.org_a,
            seller=self.seller_a2,
            product=self.product_a,
        )
        response = self.client.post(
            self.seller_url(self.org_a, self.seller_a),
            self.valid_payload(offer_token=token),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("offer_token", response.data)

    def test_signed_offer_for_foreign_tenant_is_rejected(self):
        token = self.offer_token(
            "5.00",
            organisation=self.org_b,
            seller=self.seller_b,
            product=self.product_b,
        )
        response = self.client.post(
            self.seller_url(self.org_a, self.seller_a),
            self.valid_payload(product=self.product_a, offer_token=token),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("offer_token", response.data)
