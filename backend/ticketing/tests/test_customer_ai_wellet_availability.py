from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from ticketing.ai.customer.availability_tools import AvailabilityRequest
from ticketing.ai.customer.django_tool_adapters import (
    DjangoCustomerAvailabilityRepository,
)
from ticketing.services import normalize_wellet_availability


class CustomerAIWelletAvailabilityTests(SimpleTestCase):
    service_date = date(2026, 9, 5)

    @staticmethod
    def current_wellet_payload():
        return {
            "meta": {
                "venue": {
                    "id": "venue-punta-cana",
                    "name": "Coco Bongo Punta Cana",
                },
                "date_queried": "2026-09-05",
            },
            "data": {
                "regular_products": [
                    {
                        "id": "regular-id",
                        "venue_product_id": "regular-variant",
                        "code": "REG",
                        "name": "Regular",
                        "display_name": "Regular",
                        "available": True,
                        "pricing": {
                            "currency": "USD",
                            "final_price": "99.00",
                        },
                        "availability": {
                            "available": True,
                            "remaining": 20,
                        },
                        "restrictions": {"age_restriction": 18},
                    },
                    {
                        "id": "drink-pack-id",
                        "venue_product_id": "drink-pack-variant",
                        "code": "DRINK",
                        "name": "Drink Pack",
                        "display_name": "Drink Pack",
                        "available": True,
                        "pricing": {
                            "currency": "USD",
                            "final_price": "88.50",
                        },
                        "availability": {
                            "available": True,
                            "remaining": 10,
                        },
                    },
                ],
                "mesas": [
                    {
                        "id": "mesa-promo-id",
                        "venue_product_id": "mesa-promo-variant",
                        "code": "MESA5",
                        "name": "Mesa - Promo - 5 personas",
                        "display_name": "Mesa - Promo - 5 personas",
                        "available": True,
                        "pricing": {
                            "currency": "USD",
                            "final_price": "676.35",
                        },
                        "availability": {
                            "available": True,
                            "remaining": 2,
                        },
                    },
                    {
                        "id": "mesa-zona-id",
                        "venue_product_id": "mesa-zona-variant",
                        "code": "MESA8",
                        "name": "Mesa - Zona Uno - 8 personas",
                        "display_name": "Mesa - Zona Uno - 8 personas",
                        "available": True,
                        "pricing": {
                            "currency": "USD",
                            "final_price": "1043.20",
                        },
                        "availability": {
                            "available": True,
                            "remaining": 2,
                        },
                    },
                ],
                "extras": [],
            },
        }

    def test_normalizer_excludes_tables_and_drink_pack(self):
        product = SimpleNamespace(name="Coco Bongo Punta Cana")

        options = normalize_wellet_availability(
            self.current_wellet_payload(),
            service_date=self.service_date,
            product=product,
        )

        self.assertEqual([option["option_name"] for option in options], ["Regular"])
        self.assertEqual(options[0]["product_group"], "regular_products")
        self.assertEqual(options[0]["external_product_id"], "regular-id")

    @patch(
        "ticketing.ai.customer.django_tool_adapters.get_live_product_availability"
    )
    def test_customer_ai_receives_compact_live_ticket_options(self, live):
        live.return_value = {
            "ok": True,
            "provider": "wellet",
            "options": [
                {
                    "external_product_id": "regular-id",
                    "external_variant_id": "regular-variant",
                    "external_availability_id": "venue-punta-cana:regular-id",
                    "option_name": "Regular",
                    "description": "General access and domestic drinks.",
                    "price": "99.00",
                    "currency": "USD",
                    "available": True,
                    "available_quantity": 20,
                    "start_time": "8:00 pm",
                    "checkin_time": "7:45 pm",
                    "age_restriction": 18,
                    "product_group": "regular_products",
                },
                {
                    "external_product_id": "premium-id",
                    "external_variant_id": "premium-variant",
                    "external_availability_id": "venue-punta-cana:premium-id",
                    "option_name": "Premium",
                    "description": "General access and premium drinks.",
                    "price": "135.00",
                    "currency": "USD",
                    "available": True,
                    "available_quantity": 15,
                    "start_time": "8:00 pm",
                    "checkin_time": "7:45 pm",
                    "age_restriction": 18,
                    "product_group": "regular_products",
                },
            ],
            "error": "",
        }
        product_model = SimpleNamespace()
        product = SimpleNamespace(
            pk=7,
            model=product_model,
            currency="USD",
            external_provider="wellet",
        )
        request = AvailabilityRequest(
            product_id=7,
            service_date=self.service_date,
            adults=2,
            children=0,
            infants=0,
            selected_external_option_id=None,
        )

        result = DjangoCustomerAvailabilityRepository().check_availability(
            organisation=SimpleNamespace(pk=18),
            product=product,
            request=request,
        )

        self.assertEqual(result["status"], "available")
        self.assertEqual(result["price_total"], Decimal("198.00"))
        self.assertEqual(
            [option["option_name"] for option in result["options"]],
            ["Regular", "Premium"],
        )
        self.assertEqual(
            result["options"][0]["external_option_id"],
            "venue-punta-cana:regular-id",
        )
        self.assertNotIn("raw", result["options"][0])

    @patch(
        "ticketing.ai.customer.django_tool_adapters.get_live_product_availability"
    )
    def test_selected_external_availability_id_controls_price(self, live):
        live.return_value = {
            "ok": True,
            "provider": "wellet",
            "options": [
                {
                    "external_product_id": "regular-id",
                    "external_availability_id": "venue-punta-cana:regular-id",
                    "option_name": "Regular",
                    "price": "99.00",
                    "currency": "USD",
                    "available": True,
                    "available_quantity": 20,
                },
                {
                    "external_product_id": "premium-id",
                    "external_availability_id": "venue-punta-cana:premium-id",
                    "option_name": "Premium",
                    "price": "135.00",
                    "currency": "USD",
                    "available": True,
                    "available_quantity": 15,
                },
            ],
            "error": "",
        }
        product = SimpleNamespace(
            pk=7,
            model=SimpleNamespace(),
            currency="USD",
            external_provider="wellet",
        )
        request = AvailabilityRequest(
            product_id=7,
            service_date=self.service_date,
            adults=2,
            children=0,
            infants=0,
            selected_external_option_id="venue-punta-cana:premium-id",
        )

        result = DjangoCustomerAvailabilityRepository().check_availability(
            organisation=SimpleNamespace(pk=18),
            product=product,
            request=request,
        )

        self.assertEqual(result["status"], "available")
        self.assertEqual(result["price_total"], Decimal("270.00"))
        self.assertEqual(len(result["options"]), 1)
        self.assertEqual(result["options"][0]["option_name"], "Premium")
