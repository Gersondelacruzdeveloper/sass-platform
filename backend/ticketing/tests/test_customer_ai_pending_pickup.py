from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock

from django.test import SimpleTestCase

from ticketing.ai.customer.django_tool_adapters import (
    DjangoCustomerItineraryRepository,
)


class CustomerAIPendingPickupTests(SimpleTestCase):
    def setUp(self):
        self.organisation = SimpleNamespace(pk=7)
        self.conversation = SimpleNamespace(organisation_id=7)
        self.product = SimpleNamespace(
            pk=11,
            model=SimpleNamespace(),
            name="Saona Island",
            requires_pickup_location=True,
            adult_price=Decimal("65.00"),
            child_price=Decimal("40.00"),
            infant_price=Decimal("0.00"),
            currency="USD",
            start_time=None,
            end_time=None,
            public_url="https://tenant.example/excursions/saona",
        )
        self.item = SimpleNamespace(
            position=1,
            product_id=11,
            service_date=date(2026, 8, 27),
            adults=1,
            children=0,
            infants=0,
            package_id=None,
            event_ticket_type_id=None,
            selected_external_option_id="",
            pickup_location_id=263,
        )
        self.repository = DjangoCustomerItineraryRepository()
        self.repository.availability = Mock()
        self.repository.pickup = Mock()
        self.repository.availability.get_public_product.return_value = self.product
        self.repository.availability.check_availability.return_value = {
            "status": "available",
            "price_total": Decimal("65.00"),
        }

    def test_confirmed_location_with_pending_time_remains_cart_valid(self):
        self.repository.pickup.get_active_pickup_location.return_value = (
            SimpleNamespace(name="Be Live Hamaca")
        )
        self.repository.pickup.resolve_pickup_schedule.return_value = None

        result = self.repository.validate_item(
            organisation=self.organisation,
            conversation=self.conversation,
            item=self.item,
            language="es",
        )

        self.assertEqual(result["status"], "valid")
        self.assertTrue(result["pickup_confirmed"])
        self.assertFalse(result["pickup_time_confirmed"])
        self.assertIsNone(result["pickup_time"])
        self.assertIn("pending manual confirmation", result["warnings"][0])

    def test_missing_required_pickup_location_is_still_invalid(self):
        self.repository.pickup.get_active_pickup_location.return_value = None

        result = self.repository.validate_item(
            organisation=self.organisation,
            conversation=self.conversation,
            item=self.item,
            language="es",
        )

        self.assertEqual(result["status"], "invalid")
        self.assertFalse(result["pickup_confirmed"])
        self.assertIn("configured pickup location", result["issues"][0])
