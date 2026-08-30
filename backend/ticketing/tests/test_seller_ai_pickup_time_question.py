from __future__ import annotations

from unittest import TestCase

from ticketing.tests.test_seller_ai_product_scoped_pickup import (
    ProductScopedPickupApi,
)
from ticketing.tests.test_seller_ai_workflow_fast_collection import (
    FakeState,
    FastCollectionWorkflow,
)


class SellerAIPickupTimeQuestionTests(TestCase):
    def test_spanish_pickup_time_question_applies_booking_data_and_resolves_schedule(self):
        workflow = FastCollectionWorkflow()
        api = ProductScopedPickupApi()
        state = FakeState()
        state.last_user_message = (
            "Quiero reservar Saona Island Full Day para el 5 de septiembre "
            "de 2026 para 2 adultos. La cliente se llama María, su WhatsApp "
            "es 8295551234 y se hospeda en Whala Bávaro. Déjalo como pago "
            "pendiente. Confirma también la hora exacta de recogida."
        )

        products = [
            {
                "id": 1,
                "name": "Saona Island Full Day",
                "slug": "saona-island-full-day",
                "product_type": "excursion",
                "base_price": "65.00",
                "requires_pickup_location": True,
                "supports_pickup": True,
                "is_live_product": False,
            }
        ]
        interpretation = {
            "intent": "question",
            "question_topic": "time",
            "language": "es",
            "changes": {
                "product_phrase": "Saona Island Full Day",
                "product_id": 1,
                "service_date": "2026-09-05",
                "service_time": "",
                "pickup_phrase": "Whala Bávaro",
                "pickup_location_id": 501,
                "guests": {
                    "adults": 2,
                    "children": None,
                    "infants": None,
                },
                "customer": {
                    "name": "María",
                    "whatsapp": "8295551234",
                    "email": "",
                    "hotel": "Whala Bávaro",
                    "notes": "",
                },
                "payment_action": "pending_payment",
            },
            "confidence": 1.0,
            "ambiguous_fields": [],
            "missing_fields": [],
        }

        response = workflow.process(
            state=state,
            interpretation=interpretation,
            seller={"allowed_payment_actions": ["pending_payment"]},
            products=products,
            api_client=api,
        )

        self.assertIsNotNone(state.product)
        self.assertEqual(state.product.product_id, 1)
        self.assertEqual(state.service_date, "2026-09-05")
        self.assertEqual(state.customer.name, "María")
        self.assertEqual(state.customer.whatsapp, "8295551234")
        self.assertEqual(state.payment.action, "pending_payment")
        self.assertEqual(state.preferred_language, "es")

        self.assertIsNotNone(state.pickup)
        self.assertEqual(state.pickup.pickup_location_id, 501)
        self.assertEqual(state.pickup.resolved_pickup_time, "19:10")
        self.assertEqual(
            api.resolve_calls,
            [
                {
                    "product_id": 1,
                    "pickup_location_id": 501,
                    "service_date": "2026-09-05",
                }
            ],
        )

        self.assertIn("19:10", response.message)
        self.assertNotIn("No service time is available yet", response.message)


if __name__ == "__main__":
    import unittest

    unittest.main()
