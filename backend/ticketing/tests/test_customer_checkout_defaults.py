from datetime import timedelta
from types import SimpleNamespace

from django.test import TestCase

from organisations.models import Organisation
from ticketing.customer_ai_views import (
    _can_resume_converted_cart,
)
from ticketing.customer_cart_service import (
    DEFAULT_CART_LIFETIME,
    MAX_CART_LIFETIME,
)
from ticketing.models import TicketingPaymentProviderSettings, TicketingSettings
from ticketing.payment_choices import (
    allowed_payment_choices,
    preferred_payment_choice,
)


class CustomerCheckoutDefaultsTests(TestCase):
    def setUp(self):
        self.organisation = Organisation.objects.create(
            name="Checkout defaults tenant",
            slug="checkout-defaults-tenant",
            is_active=True,
        )
        self.ticketing_settings, _ = TicketingSettings.objects.update_or_create(
            organisation=self.organisation,
            defaults={
                "allow_full_payment": True,
                "allow_deposit_payment": True,
                "allow_pending_payment": False,
                "allow_cash_to_seller": False,
                "default_deposit_percentage": "20.00",
            },
        )

    def test_new_provider_settings_default_to_full_payment(self):
        provider = TicketingPaymentProviderSettings.objects.create(
            organisation=self.organisation,
        )

        self.assertEqual(provider.default_customer_payment_choice, "full")

    def test_configured_payment_choice_is_tenant_scoped(self):
        TicketingPaymentProviderSettings.objects.create(
            organisation=self.organisation,
            is_active=True,
            default_customer_payment_choice="deposit",
        )
        other = Organisation.objects.create(
            name="Other checkout tenant",
            slug="other-checkout-tenant",
            is_active=True,
        )
        TicketingPaymentProviderSettings.objects.create(
            organisation=other,
            is_active=True,
            default_customer_payment_choice="cash",
        )

        allowed = ["full", "deposit"]
        provider = TicketingPaymentProviderSettings.objects.get(
            organisation=self.organisation
        )
        self.assertEqual(
            preferred_payment_choice(provider_settings=provider, allowed=allowed),
            "deposit",
        )

    def test_product_and_tenant_flags_are_intersected(self):
        product = SimpleNamespace(
            allow_full_payment=True,
            allow_deposit_payment=False,
            allow_pending_payment=True,
            allow_cash_payment=True,
            deposit_amount=0,
            deposit_percentage=0,
        )
        self.assertEqual(
            allowed_payment_choices(
                organisation=self.organisation,
                products=[product],
            ),
            ["full"],
        )

    def test_cart_lifetime_is_exactly_twenty_four_hours(self):
        self.assertEqual(DEFAULT_CART_LIFETIME, timedelta(hours=24))
        self.assertEqual(MAX_CART_LIFETIME, timedelta(hours=24))

    def test_only_unpaid_pending_booking_can_resume(self):
        cart = SimpleNamespace(
            status="converted",
            converted_booking=SimpleNamespace(
                status="pending_payment",
                payment_status="unpaid",
            ),
        )
        self.assertTrue(_can_resume_converted_cart(cart))

        cart.converted_booking.payment_status = "paid"
        self.assertFalse(_can_resume_converted_cart(cart))
