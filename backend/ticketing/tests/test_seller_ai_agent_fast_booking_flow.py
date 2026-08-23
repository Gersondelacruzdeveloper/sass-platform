from __future__ import annotations

from copy import deepcopy
from types import SimpleNamespace
from typing import Any
from unittest import TestCase
from unittest.mock import MagicMock, patch

from ticketing.ai.seller.agent import SellerBookingAgent
from ticketing.ai.seller.workflow import SellerBookingWorkflow


# ---------------------------------------------------------------------------
# Lightweight state objects
# ---------------------------------------------------------------------------

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
        adults: int = 1,
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


class FakeBookingConversationState:
    def __init__(
        self,
        *,
        conversation_id: str,
        seller_id: int,
        organisation_slug: str,
        preferred_language: str = "en",
    ) -> None:
        self.conversation_id = conversation_id
        self.seller_id = seller_id
        self.organisation_slug = organisation_slug

        self.status = "collecting"
        self.preferred_language = preferred_language
        self.last_user_message = ""
        self.last_assistant_message = ""
        self.error_message = ""

        self.current_intent = FakeIntent()
        self.progress = FakeProgress()
        self.conversation_history: list[dict[str, Any]] = []
        self.metadata: dict[str, Any] = {}

        self.product = None
        self.product_phrase = ""
        self.option_phrase = ""
        self.live_option = None

        self.service_date = ""
        self.service_time = ""

        self.pickup = None
        self.pickup_phrase = ""

        self.guests = FakeGuests()
        self.customer = FakeCustomer()
        self.payment = FakePayment()

        self.pending_selection = None
        self.awaiting_confirmation = False
        self.booking_preview: dict[str, Any] = {}
        self.created_booking: dict[str, Any] = {}
        self.seller_confirmed = False
        self.seller_api_data: dict[str, Any] = {}

        self.requested_discount_amount = "0.00"
        self.requested_discount_percent = ""

        self.change_count = 0

    def set_intent(
        self,
        *,
        action: str,
        question_topic: str,
        changes: dict[str, Any],
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
            {
                "role": role,
                "text": text,
                "intent": intent,
            }
        )

    def mark_changed(self) -> None:
        self.change_count += 1
        self.status = "collecting"
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

    def clear_product_dependencies(self) -> None:
        self.product = None
        self.live_option = None
        self.pickup = None
        self.pending_selection = None
        self.booking_preview = {}
        self.awaiting_confirmation = False

    def clear_live_option(self) -> None:
        self.live_option = None
        self.pending_selection = None
        self.booking_preview = {}
        self.awaiting_confirmation = False

    def clear_pickup(self) -> None:
        self.pickup = None
        self.pending_selection = None
        self.booking_preview = {}
        self.awaiting_confirmation = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "conversation_id": self.conversation_id,
            "seller_id": self.seller_id,
            "organisation_slug": self.organisation_slug,
            "status": self.status,
            "service_date": self.service_date,
            "guests": self.guests.to_dict(),
            "customer": self.customer.to_dict(),
            "payment": self.payment.to_dict(),
            "progress": {
                "complete_fields": list(self.progress.complete_fields),
                "missing_fields": list(self.progress.missing_fields),
                "ambiguous_fields": list(self.progress.ambiguous_fields),
            },
        }


# ---------------------------------------------------------------------------
# Fake trusted dependencies around the REAL SellerBookingAgent
# ---------------------------------------------------------------------------

class FakeConversationStore:
    def __init__(self) -> None:
        self.states: dict[str, FakeBookingConversationState] = {}

    # The agent's exact store adapter can evolve. These aliases intentionally
    # keep this test resilient while still storing one real conversation draft.
    def get(self, conversation_id: str, *args: Any, **kwargs: Any):
        return self.states.get(conversation_id)

    def load(self, conversation_id: str, *args: Any, **kwargs: Any):
        return self.states.get(conversation_id)

    def get_state(self, conversation_id: str, *args: Any, **kwargs: Any):
        return self.states.get(conversation_id)

    def save(self, state: Any, *args: Any, **kwargs: Any):
        self.states[state.conversation_id] = state
        return state

    def save_state(self, state: Any, *args: Any, **kwargs: Any):
        return self.save(state)

    def set(self, state: Any, *args: Any, **kwargs: Any):
        return self.save(state)


class FakeMemoryService:
    def get_interpretation_memory(
        self,
        *,
        seller_id: int,
        organisation_slug: str,
    ) -> dict[str, Any]:
        return {}

    def record_interpretation_observation(self, *args: Any, **kwargs: Any) -> None:
        return None

    def remember_interpretation(self, *args: Any, **kwargs: Any) -> None:
        return None

    def observe(self, *args: Any, **kwargs: Any) -> None:
        return None


class FakeSellerApiClient:
    organisation_slug = "punta-cana-discovery"

    def __init__(self) -> None:
        self.created_payloads: list[dict[str, Any]] = []

    def get_me(self) -> dict[str, Any]:
        return {
            "id": 7,
            "full_name": "Test Seller",
            "can_apply_discounts": True,
            "allowed_payment_actions": [
                "pending_payment",
                "cash_full",
            ],
        }

    def get_products(self, **kwargs: Any) -> list[dict[str, Any]]:
        return [
            {
                "id": 10,
                "name": "Coco Bongo",
                "slug": "coco-bongo",
                "product_type": "excursion",
                "is_active": True,
                "seller_enabled": True,
                "requires_pickup_location": True,
                "supports_pickup": True,
                "base_price": "90.00",
                "cost_price": "70.00",
            }
        ]

    def get_pickup_locations(self, **kwargs: Any) -> list[dict[str, Any]]:
        return [
            {
                "id": 501,
                "name": "Barceló Bávaro Palace",
                "zone_name": "Bávaro",
                "is_active": True,
                "default_pickup_point": "Lobby",
            }
        ]

    def resolve_pickup(self, **kwargs: Any) -> dict[str, Any]:
        return {
            "found": True,
            "pickup_time": "19:10",
            "pickup_point": "Lobby",
            "resolved_pickup_point": "Main lobby",
            "instructions": "Please be ready 10 minutes early.",
        }

    def create_booking(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.created_payloads.append(deepcopy(payload))
        return {
            "id": 99,
            "booking_code": "AI-REAL-99",
        }


class TwoTurnInterpreter:
    """
    Deterministic substitute for OpenAI.

    It returns the exact structured JSON we expect OpenAI to extract from the
    seller's natural language. No external provider is called.
    """

    def __init__(self) -> None:
        self.calls: list[str] = []

    def interpret(
        self,
        *,
        message: Any,
        state: Any,
        seller: dict[str, Any],
        products: list[dict[str, Any]],
        trusted_pickup_locations: list[dict[str, Any]],
        memory: dict[str, Any],
    ) -> dict[str, Any]:
        self.calls.append(message.text)

        text = " ".join(message.text.lower().split())

        if text in {"yes", "confirm", "create booking"}:
            return {
                "intent": "confirm",
                "confidence": 1.0,
                "changes": {},
                "ambiguous_fields": [],
                "missing_fields": [],
            }

        if "john" in text or "barcel" in text:
            return {
                "intent": "provide_information",
                "confidence": 0.99,
                "changes": {},
                "customer": {
                    "name": "John Smith",
                    "whatsapp": "8295551234",
                    "hotel": "Barceló Bávaro Palace",
                },
                "pickup_phrase": "Barceló Bávaro Palace",
                "pickup_location_id": 501,
                "payment_action": "pending_payment",
                "ambiguous_fields": [],
                "missing_fields": [],
            }

        return {
            "intent": "provide_information",
            "confidence": 0.99,
            "changes": {},
            "product_phrase": "Coco Bongo",
            "product_id": 10,
            "option_phrase": "Premium",
            "service_date": "2026-08-24",
            "guests": {
                "adults": 2,
                "children": 0,
                "infants": 0,
            },
            "ambiguous_fields": [],
            "missing_fields": [
                "pickup",
                "customer_name",
                "customer_contact",
                "payment",
            ],
        }


class AgentIntegrationWorkflow(SellerBookingWorkflow):
    """
    Use the real collection/state-machine behavior, but keep this test focused
    on conversation state instead of the separate pricing test suite.
    """

    def _validate_discount_request(
        self,
        *,
        state: Any,
        seller: dict[str, Any],
        products: list[dict[str, Any]],
    ):
        return None

    def _build_preview(
        self,
        state: Any,
        *,
        seller: dict[str, Any],
        products: list[dict[str, Any]],
    ) -> dict[str, Any]:
        return {
            "product": (
                {
                    "id": state.product.product_id,
                    "name": state.product.name,
                }
                if state.product
                else None
            ),
            "live_option": (
                {
                    "name": state.live_option.option_name,
                }
                if state.live_option
                else None
            ),
            "service_date": state.service_date,
            "guests": state.guests.to_dict(),
            "customer": state.customer.to_dict(),
            "pickup": (
                {
                    "location": state.pickup.name,
                    "time": state.pickup.resolved_pickup_time,
                }
                if state.pickup
                else None
            ),
            "payment": state.payment.to_dict(),
            "subtotal_amount": "180.00",
            "discount_amount": "0.00",
            "total_amount": "180.00",
            "currency": "USD",
        }

    def _create_booking(
        self,
        state: Any,
        api_client: Any,
        *,
        seller: dict[str, Any],
        products: list[dict[str, Any]],
    ):
        booking = api_client.create_booking(
            {
                "product_id": state.product.product_id if state.product else None,
                "service_date": state.service_date,
                "customer_name": state.customer.name,
                "customer_whatsapp": state.customer.whatsapp,
                "pickup_location_id": (
                    state.pickup.pickup_location_id if state.pickup else None
                ),
                "payment_action": state.payment.action,
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


class SellerAIAgentFastBookingFlowTests(TestCase):
    def setUp(self) -> None:
        self.api = FakeSellerApiClient()
        self.store = FakeConversationStore()
        self.memory = FakeMemoryService()
        self.interpreter = TwoTurnInterpreter()
        self.workflow = AgentIntegrationWorkflow()

        self.agent = SellerBookingAgent(
            api_client=self.api,
            conversation_store=self.store,
            memory_service=self.memory,
            interpreter=self.interpreter,
            workflow=self.workflow,
        )

        self.state = FakeBookingConversationState(
            conversation_id="agent-fast-flow-1",
            seller_id=7,
            organisation_slug="punta-cana-discovery",
        )

        # Keep the test focused on the public agent behavior while using the
        # real handle_message orchestration.
        self.load_state_patcher = patch.object(
            self.agent,
            "_load_or_create_state",
            return_value=self.state,
        )
        self.assert_owner_patcher = patch.object(
            self.agent,
            "_assert_state_ownership",
            return_value=None,
        )
        self.save_state_patcher = patch.object(
            self.agent,
            "_save_state",
            side_effect=lambda state: self.store.save(state),
            create=True,
        )

        self.load_state_patcher.start()
        self.assert_owner_patcher.start()
        self.save_state_patcher.start()

        self.addCleanup(self.load_state_patcher.stop)
        self.addCleanup(self.assert_owner_patcher.stop)
        self.addCleanup(self.save_state_patcher.stop)

        # Learning/memory recording is not the subject of this suite. Patch
        # common internal observation hooks if the installed agent exposes them.
        for method_name in (
            "_record_memory_observation",
            "_record_interpretation_memory",
            "_record_safe_observation",
            "_learn_from_interpretation",
        ):
            if hasattr(self.agent, method_name):
                patcher = patch.object(
                    self.agent,
                    method_name,
                    return_value=None,
                )
                patcher.start()
                self.addCleanup(patcher.stop)

    def test_first_natural_message_populates_multiple_slots_and_groups_missing_fields(self):
        response = self.agent.handle_message(
            text="Give me 2 Premium Coco Bongo for tomorrow",
            conversation_id="agent-fast-flow-1",
        )

        self.assertEqual(self.state.product.product_id, 10)
        self.assertEqual(self.state.product.name, "Coco Bongo")
        self.assertEqual(self.state.service_date, "2026-08-24")
        self.assertEqual(self.state.guests.adults, 2)
        self.assertEqual(self.state.option_phrase, "Premium")

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

    def test_second_message_keeps_first_turn_and_completes_remaining_slots(self):
        first = self.agent.handle_message(
            text="Give me 2 Premium Coco Bongo for tomorrow",
            conversation_id="agent-fast-flow-1",
        )

        second = self.agent.handle_message(
            text=(
                "John Smith, 8295551234, Barceló Bávaro Palace, "
                "payment pending"
            ),
            conversation_id=first.conversation_id,
        )

        self.assertEqual(self.state.product.name, "Coco Bongo")
        self.assertEqual(self.state.service_date, "2026-08-24")
        self.assertEqual(self.state.guests.adults, 2)

        self.assertEqual(self.state.customer.name, "John Smith")
        self.assertEqual(self.state.customer.whatsapp, "8295551234")
        self.assertEqual(self.state.payment.action, "pending_payment")

        self.assertIsNotNone(self.state.pickup)
        self.assertEqual(
            self.state.pickup.pickup_location_id,
            501,
        )
        self.assertEqual(
            self.state.pickup.name,
            "Barceló Bávaro Palace",
        )

        self.assertEqual(second.status, "awaiting_confirmation")
        self.assertTrue(second.requires_confirmation)
        self.assertFalse(second.booking_created)
        self.assertIn(
            "Should I create the booking?",
            second.message,
        )

    def test_second_turn_does_not_lose_first_turn_draft(self):
        self.agent.handle_message(
            text="Give me 2 Premium Coco Bongo for tomorrow",
            conversation_id="agent-fast-flow-1",
        )

        self.agent.handle_message(
            text=(
                "John Smith, 8295551234, Barceló Bávaro Palace, "
                "payment pending"
            ),
            conversation_id="agent-fast-flow-1",
        )

        self.assertEqual(self.state.product.name, "Coco Bongo")
        self.assertEqual(self.state.option_phrase, "Premium")
        self.assertEqual(self.state.service_date, "2026-08-24")
        self.assertEqual(self.state.guests.adults, 2)
        self.assertEqual(self.state.customer.name, "John Smith")

    def test_booking_is_not_created_before_confirmation(self):
        first = self.agent.handle_message(
            text="Give me 2 Premium Coco Bongo for tomorrow",
            conversation_id="agent-fast-flow-1",
        )

        second = self.agent.handle_message(
            text=(
                "John Smith, 8295551234, Barceló Bávaro Palace, "
                "payment pending"
            ),
            conversation_id=first.conversation_id,
        )

        self.assertEqual(second.status, "awaiting_confirmation")
        self.assertTrue(second.requires_confirmation)
        self.assertEqual(self.api.created_payloads, [])

    def test_confirmation_creates_booking_exactly_once(self):
        first = self.agent.handle_message(
            text="Give me 2 Premium Coco Bongo for tomorrow",
            conversation_id="agent-fast-flow-1",
        )

        second = self.agent.handle_message(
            text=(
                "John Smith, 8295551234, Barceló Bávaro Palace, "
                "payment pending"
            ),
            conversation_id=first.conversation_id,
        )

        confirmed = self.agent.handle_message(
            text="yes",
            conversation_id=second.conversation_id,
        )

        self.assertEqual(confirmed.status, "completed")
        self.assertTrue(confirmed.booking_created)
        self.assertEqual(len(self.api.created_payloads), 1)

        payload = self.api.created_payloads[0]

        self.assertEqual(payload["product_id"], 10)
        self.assertEqual(payload["service_date"], "2026-08-24")
        self.assertEqual(payload["customer_name"], "John Smith")
        self.assertEqual(payload["customer_whatsapp"], "8295551234")
        self.assertEqual(payload["pickup_location_id"], 501)
        self.assertEqual(payload["payment_action"], "pending_payment")

    def test_interpreter_receives_both_messages_in_order(self):
        self.agent.handle_message(
            text="Give me 2 Premium Coco Bongo for tomorrow",
            conversation_id="agent-fast-flow-1",
        )

        self.agent.handle_message(
            text=(
                "John Smith, 8295551234, Barceló Bávaro Palace, "
                "payment pending"
            ),
            conversation_id="agent-fast-flow-1",
        )

        self.assertEqual(
            self.interpreter.calls,
            [
                "Give me 2 Premium Coco Bongo for tomorrow",
                (
                    "John Smith, 8295551234, Barceló Bávaro Palace, "
                    "payment pending"
                ),
            ],
        )


if __name__ == "__main__":
    import unittest

    unittest.main()
