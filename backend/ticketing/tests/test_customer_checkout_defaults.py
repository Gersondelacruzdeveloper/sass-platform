from datetime import timedelta
from types import SimpleNamespace

from django.test import TestCase

from organisations.models import Organisation
from ticketing.customer_ai_views import (
    _can_resume_converted_cart,
    _configured_customer_payment_choice,
)
from ticketing.customer_cart_service import (
    DEFAULT_CART_LIFETIME,
    MAX_CART_LIFETIME,
)
from ticketing.models import TicketingPaymentProviderSettings


class CustomerCheckoutDefaultsTests(TestCase):
    def setUp(self):
        self.organisation = Organisation.objects.create(
            name="Checkout defaults tenant",
            slug="checkout-defaults-tenant",
            is_active=True,
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

        self.assertEqual(
            _configured_customer_payment_choice(self.organisation),
            "deposit",
        )

    def test_missing_active_settings_fail_closed_to_pending(self):
        self.assertEqual(
            _configured_customer_payment_choice(self.organisation),
            "pending",
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

