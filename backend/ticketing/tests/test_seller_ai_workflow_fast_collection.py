from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Mapping
from unittest import TestCase

from ticketing.ai.seller.schemas import AgentResponse
from ticketing.ai.seller.workflow import SellerBookingWorkflow


class FakeCustomer:
    def __init__(
        self,
        *,
        name: str = "",
        whatsapp: str = "",
        email: str = "",
        hotel: str = "",
        notes: str = "",
    ) -> None:
        self.name = name
        self.whatsapp = whatsapp
        self.email = email
        self.hotel = hotel
        self.notes = notes

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "whatsapp": self.whatsapp,
            "email": self.email,
            "hotel": self.hotel,
            "notes": self.notes,
        }


class FakeGuests:
    def __init__(
        self,
        *,
        adults: int = 2,
        children: int = 0,
        infants: int = 0,
    ) -> None:
        self.adults = adults
        self.children = children
        self.infants = infants

    @property
    def total(self) -> int:
        return self.adults + self.children + self.infants

    def normalise(self) -> None:
        self.adults = max(1, int(self.adults or 0))
        self.children = max(0, int(self.children or 0))
        self.infants = max(0, int(self.infants or 0))

    def to_dict(self) -> dict[str, int]:
        return {
            "adults": self.adults,
            "children": self.children,
            "infants": self.infants,
        }


class FakePayment:
    def __init__(
        self,
        *,
        action: str = "",
        reference: str = "",
        note: str = "",
    ) -> None:
        self.action = action
        self.reference = reference
        self.note = note

    def to_dict(self) -> dict[str, str]:
        return {
            "action": self.action,
            "reference": self.reference,
            "note": self.note,
        }


class FakeProgress:
    def __init__(self) -> None:
        self.complete_fields: list[str] = []
        self.missing_fields: list[str] = []
        self.ambiguous_fields: list[str] = []


class FakeIntent:
    def __init__(self) -> None:
        self.action = "unknown"
        self.question_topic = ""
        self.changes: dict[str, Any] = {}
        self.ambiguous_fields: list[str] = []
        self.missing_fields: list[str] = []
        self.confidence = 0.0
        self.response_hint = ""


class FakeState:
    def __init__(
        self,
        *,
        product: Any = None,
        service_date: str = "",
        pickup: Any = None,
        pickup_phrase: str = "",
        customer: FakeCustomer | None = None,
        payment: FakePayment | None = None,
        guests: FakeGuests | None = None,
        preferred_language: str = "en",
    ) -> None:
        self.conversation_id = "conversation-test-1"
        self.status = "collecting"
        self.last_user_message = "test message"
        self.last_assistant_message = ""
        self.current_intent = FakeIntent()
        self.progress = FakeProgress()
        self.conversation_history: list[dict[str, Any]] = []
        self.metadata: dict[str, Any] = {}

        self.product = product
        self.product_phrase = ""
        self.option_phrase = ""
        self.service_date = service_date
        self.service_time = ""
        self.live_option = None

        self.pickup = pickup
        self.pickup_phrase = pickup_phrase

        self.customer = customer or FakeCustomer()
        self.payment = payment or FakePayment()
        self.guests = guests or FakeGuests()

        self.pending_selection = None
        self.awaiting_confirmation = False
        self.booking_preview: dict[str, Any] = {}
        self.created_booking: dict[str, Any] = {}
        self.seller_confirmed = False
        self.seller_api_data: dict[str, Any] = {}

        self.requested_discount_amount = "0.00"
        self.requested_discount_percent = ""
        self.preferred_language = preferred_language
        self.changed_count = 0

    def set_intent(
        self,
        *,
        action: str,
        question_topic: str,
        changes: Mapping[str, Any],
        ambiguous_fields: list[str],
        missing_fields: list[str],
        confidence: float,
        response_hint: str,
    ) -> None:
        self.current_intent.action = action
        self.current_intent.question_topic = question_topic
        self.current_intent.changes = dict(changes)
        self.current_intent.ambiguous_fields = list(ambiguous_fields)
        self.current_intent.missing_fields = list(missing_fields)
        self.current_intent.confidence = confidence
        self.current_intent.response_hint = response_hint

    def append_turn(self, *, role: str, text: str, intent: str) -> None:
        self.conversation_history.append(
            {"role": role, "text": text, "intent": intent}
        )

    def mark_changed(self) -> None:
        self.changed_count += 1
        self.awaiting_confirmation = False
        self.booking_preview = {}

    def update_progress(
        self,
        *,
        complete_fields: list[str],
        missing_fields: list[str],
        ambiguous_fields: list[str],
    ) -> None:
        self.progress.complete_fields = list(complete_fields)
        self.progress.missing_fields = list(missing_fields)
        self.progress.ambiguous_fields = list(ambiguous_fields)

    def clear_live_option(self) -> None:
        self.live_option = None

    def clear_pickup(self) -> None:
        self.pickup = None

    def clear_product_dependencies(self) -> None:
        self.product = None
        self.live_option = None
        self.pickup = None


class FakeApiClient:
    def __init__(self) -> None:
        self.pickup_locations: list[dict[str, Any]] = []
        self.resolve_pickup_result: dict[str, Any] = {"found": True}
        self.created_payloads: list[dict[str, Any]] = []

    def get_pickup_locations(self, **kwargs: Any) -> list[dict[str, Any]]:
        return list(self.pickup_locations)

    def resolve_pickup(self, **kwargs: Any) -> dict[str, Any]:
        return dict(self.resolve_pickup_result)

    def create_booking(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.created_payloads.append(payload)
        return {"id": 77, "booking_code": "AI-TEST-77"}


class FastCollectionWorkflow(SellerBookingWorkflow):
    """
    Keep the tests focused on conversation collection rather than pricing.
    Trusted product/pickup/payment validation still runs through workflow.py.
    """

    def _validate_discount_request(
        self,
        *,
        state: Any,
        seller: Mapping[str, Any],
        products: list[dict[str, Any]],
    ) -> AgentResponse | None:
        return None

    def _build_preview(
        self,
        state: Any,
        *,
        seller: Mapping[str, Any],
        products: list[dict[str, Any]],
    ) -> dict[str, Any]:
        return {
            "product": {
                "id": state.product.product_id,
                "name": state.product.name,
            }
            if state.product
            else None,
            "service_date": state.service_date,
            "guests": state.guests.to_dict(),
            "customer": state.customer.to_dict(),
            "payment": state.payment.to_dict(),
            "total_amount": "180.00",
            "discount_amount": "0.00",
            "currency": "USD",
        }

    def _create_booking(
        self,
        state: Any,
        api_client: Any,
        *,
        seller: Mapping[str, Any],
        products: list[dict[str, Any]],
    ) -> AgentResponse:
        booking = api_client.create_booking(
            {
                "customer_name": state.customer.name,
                "service_date": state.service_date,
            }
        )
        state.created_booking = booking
        state.status = "completed"
        state.awaiting_confirmation = False
        state.seller_confirmed = True
        return self._response(
            state,
            "The booking was created successfully.",
            status="completed",
            requires_reply=False,
            booking_created=True,
            booking=booking,
        )


def make_product(
    *,
    product_id: int = 10,
    name: str = "Coco Bongo",
    is_live_product: bool = False,
    requires_pickup_location: bool = True,
    supports_pickup: bool = True,
) -> Any:
    return SimpleNamespace(
        product_id=product_id,
        name=name,
        slug="coco-bongo",
        is_live_product=is_live_product,
        requires_pickup_location=requires_pickup_location,
        supports_pickup=supports_pickup,
    )


def interpretation(**values: Any) -> dict[str, Any]:
    result: dict[str, Any] = {
        "intent": "provide_information",
        "confidence": 0.99,
        "changes": {},
        "ambiguous_fields": [],
        "missing_fields": [],
    }
    result.update(values)
    return result


class SellerAIWorkflowFastCollectionTests(TestCase):
    def setUp(self) -> None:
        self.workflow = FastCollectionWorkflow()
        self.api = FakeApiClient()
        self.product = make_product()

        self.products = [
            {
                "id": 10,
                "name": "Coco Bongo",
                "slug": "coco-bongo",
                "base_price": "90.00",
                "cost_price": "70.00",
            }
        ]

        self.multi_payment_seller = {
            "allowed_payment_actions": [
                "pending_payment",
                "cash_full",
            ],
        }

    def test_groups_all_missing_details_in_one_reply(self):
        state = FakeState(
            product=self.product,
            service_date="2026-08-24",
            guests=FakeGuests(adults=2),
        )

        response = self.workflow.process(
            state=state,
            interpretation=interpretation(),
            seller=self.multi_payment_seller,
            products=self.products,
            api_client=self.api,
        )

        self.assertEqual(response.status, "collecting")
        self.assertFalse(response.requires_confirmation)

        message = response.message.lower()

        self.assertIn("hotel or pickup location", message)
        self.assertIn("customer name", message)
        self.assertIn("customer whatsapp or email", message)
        self.assertIn("payment choice", message)
        self.assertIn("send everything together", message)

        self.assertNotEqual(
            response.message,
            "What is the customer's name?",
        )
        self.assertNotEqual(
            response.message,
            "How should the customer pay?",
        )

        self.assertEqual(
            state.progress.missing_fields,
            [
                "pickup",
                "customer_name",
                "customer_contact",
                "payment",
            ],
        )

    def test_second_message_can_complete_customer_contact_and_payment_together(self):
        state = FakeState(
            product=make_product(
                requires_pickup_location=False,
                supports_pickup=False,
            ),
            service_date="2026-08-24",
            guests=FakeGuests(adults=2),
        )

        response = self.workflow.process(
            state=state,
            interpretation=interpretation(
                customer={
                    "name": "John Smith",
                    "whatsapp": "8295551234",
                },
                payment_action="pending_payment",
            ),
            seller=self.multi_payment_seller,
            products=self.products,
            api_client=self.api,
        )

        self.assertEqual(state.customer.name, "John Smith")
        self.assertEqual(state.customer.whatsapp, "8295551234")
        self.assertEqual(state.payment.action, "pending_payment")

        self.assertEqual(response.status, "awaiting_confirmation")
        self.assertTrue(response.requires_confirmation)
        self.assertIn("John Smith", response.message)
        self.assertIn("Should I create the booking?", response.message)

    def test_single_allowed_payment_action_is_selected_automatically(self):
        state = FakeState(
            product=make_product(
                requires_pickup_location=False,
                supports_pickup=False,
            ),
            service_date="2026-08-24",
            customer=FakeCustomer(
                name="Maria",
                whatsapp="8095559999",
            ),
        )

        response = self.workflow.process(
            state=state,
            interpretation=interpretation(),
            seller={
                "allowed_payment_actions": ["pending_payment"],
            },
            products=self.products,
            api_client=self.api,
        )

        self.assertEqual(state.payment.action, "pending_payment")
        self.assertEqual(response.status, "awaiting_confirmation")
        self.assertTrue(response.requires_confirmation)
        self.assertNotIn(
            "payment choice",
            response.message.lower(),
        )

    def test_product_without_pickup_does_not_ask_for_hotel(self):
        state = FakeState(
            product=make_product(
                requires_pickup_location=False,
                supports_pickup=False,
            ),
            service_date="2026-08-24",
        )

        response = self.workflow.process(
            state=state,
            interpretation=interpretation(),
            seller=self.multi_payment_seller,
            products=self.products,
            api_client=self.api,
        )

        message = response.message.lower()

        self.assertNotIn("hotel or pickup location", message)
        self.assertIn("customer name", message)
        self.assertIn("customer whatsapp or email", message)
        self.assertIn("payment choice", message)
        self.assertNotIn("pickup", state.progress.missing_fields)

    def test_missing_product_keeps_explicit_product_choice_flow(self):
        state = FakeState(
            product=None,
            service_date="2026-08-24",
        )

        products = [
            {"id": 10, "name": "Coco Bongo"},
            {"id": 11, "name": "Saona Island"},
        ]

        response = self.workflow.process(
            state=state,
            interpretation=interpretation(),
            seller=self.multi_payment_seller,
            products=products,
            api_client=self.api,
        )

        self.assertEqual(response.status, "collecting")
        self.assertIn(
            "Which product would you like to book?",
            response.message,
        )
        self.assertEqual(len(response.choices), 2)

    def test_complete_draft_requires_confirmation_before_creation(self):
        state = FakeState(
            product=make_product(
                requires_pickup_location=False,
                supports_pickup=False,
            ),
            service_date="2026-08-24",
            customer=FakeCustomer(
                name="John Smith",
                whatsapp="8295551234",
            ),
            payment=FakePayment(action="pending_payment"),
        )

        first = self.workflow.process(
            state=state,
            interpretation=interpretation(),
            seller=self.multi_payment_seller,
            products=self.products,
            api_client=self.api,
        )

        self.assertEqual(first.status, "awaiting_confirmation")
        self.assertTrue(first.requires_confirmation)
        self.assertEqual(self.api.created_payloads, [])

        state.last_user_message = "yes"

        second = self.workflow.process(
            state=state,
            interpretation={
                "intent": "confirm",
                "confidence": 1.0,
                "changes": {},
                "ambiguous_fields": [],
                "missing_fields": [],
            },
            seller=self.multi_payment_seller,
            products=self.products,
            api_client=self.api,
        )

        self.assertEqual(second.status, "completed")
        self.assertTrue(second.booking_created)
        self.assertEqual(len(self.api.created_payloads), 1)
        self.assertEqual(
            self.api.created_payloads[0]["customer_name"],
            "John Smith",
        )


if __name__ == "__main__":
    import unittest

    unittest.main()
