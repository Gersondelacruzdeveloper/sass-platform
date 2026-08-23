from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from ticketing.views_ai import SellerAIChatView


@dataclass
class FakeAgentResponse:
    payload: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return dict(self.payload)


class StatefulSellerAIAgent:
    """
    Small stateful fake used only to test the HTTP chat contract.

    The workflow itself is tested separately in
    test_seller_ai_workflow_fast_collection.py. Here we verify that the
    endpoint carries conversation_id correctly from one request to the next,
    exposes the expected response shape, and does not create a booking before
    explicit confirmation.
    """

    def __init__(self) -> None:
        self.conversation_id = "seller-ai-conversation-1"
        self.messages: list[dict[str, Any]] = []
        self.confirmed = False
        self.create_count = 0

    def handle_message(
        self,
        *,
        text: str,
        conversation_id: str | None = None,
        language: str | None = None,
        message_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> FakeAgentResponse:
        incoming_conversation_id = str(conversation_id or "").strip()

        if incoming_conversation_id and incoming_conversation_id != self.conversation_id:
            raise ValueError("Unexpected conversation_id")

        self.messages.append(
            {
                "text": text,
                "conversation_id": incoming_conversation_id,
                "language": language,
                "message_id": message_id,
                "metadata": dict(metadata or {}),
            }
        )

        normalised = " ".join(text.lower().split())

        if normalised in {"yes", "confirm", "confirmed", "create booking"}:
            self.confirmed = True
            self.create_count += 1

            return FakeAgentResponse(
                {
                    "conversation_id": self.conversation_id,
                    "status": "completed",
                    "message": "The booking was created successfully.",
                    "requires_reply": False,
                    "requires_confirmation": False,
                    "booking_created": True,
                    "choices": [],
                    "booking_preview": {
                        "product": {
                            "id": 10,
                            "name": "Coco Bongo",
                        },
                        "service_date": "2026-08-24",
                        "guests": {
                            "adults": 2,
                            "children": 0,
                            "infants": 0,
                        },
                        "customer": {
                            "name": "John Smith",
                            "whatsapp": "8295551234",
                        },
                        "payment": {
                            "action": "pending_payment",
                        },
                        "total_amount": "180.00",
                        "currency": "USD",
                    },
                    "booking": {
                        "id": 77,
                        "booking_code": "AI-TEST-77",
                    },
                }
            )

        if len(self.messages) == 1:
            return FakeAgentResponse(
                {
                    "conversation_id": self.conversation_id,
                    "status": "collecting",
                    "message": (
                        "Got it: Coco Bongo, Premium, 2026-08-24, 2 guests.\n"
                        "I still need:\n"
                        "• hotel or pickup location\n"
                        "• customer name\n"
                        "• customer WhatsApp or email\n"
                        "• payment choice\n"
                        "Send everything together in one message or voice note."
                    ),
                    "requires_reply": True,
                    "requires_confirmation": False,
                    "booking_created": False,
                    "choices": [],
                    "booking_preview": {
                        "product": {
                            "id": 10,
                            "name": "Coco Bongo",
                        },
                        "live_option": {
                            "name": "Premium",
                        },
                        "service_date": "2026-08-24",
                        "guests": {
                            "adults": 2,
                            "children": 0,
                            "infants": 0,
                        },
                    },
                    "booking": {},
                }
            )

        return FakeAgentResponse(
            {
                "conversation_id": self.conversation_id,
                "status": "awaiting_confirmation",
                "message": (
                    "Perfect. Here is the booking I have:\n"
                    "• Experience: Coco Bongo\n"
                    "• Option: Premium\n"
                    "• Date: 2026-08-24\n"
                    "• Adults: 2\n"
                    "• Customer: John Smith\n"
                    "• Pickup: Barceló Bávaro Palace\n"
                    "• Payment: payment pending\n"
                    "• Total: USD 180.00\n"
                    "Should I create the booking?"
                ),
                "requires_reply": True,
                "requires_confirmation": True,
                "booking_created": False,
                "choices": [],
                "booking_preview": {
                    "product": {
                        "id": 10,
                        "name": "Coco Bongo",
                    },
                    "live_option": {
                        "name": "Premium",
                    },
                    "service_date": "2026-08-24",
                    "guests": {
                        "adults": 2,
                        "children": 0,
                        "infants": 0,
                    },
                    "customer": {
                        "name": "John Smith",
                        "whatsapp": "8295551234",
                        "hotel": "Barceló Bávaro Palace",
                    },
                    "pickup": {
                        "location": "Barceló Bávaro Palace",
                    },
                    "payment": {
                        "action": "pending_payment",
                    },
                    "total_amount": "180.00",
                    "currency": "USD",
                },
                "booking": {},
            }
        )


class SellerAIChatEndpointFastFlowTests(SimpleTestCase):
    def setUp(self) -> None:
        self.factory = APIRequestFactory()
        self.user = SimpleNamespace(
            id=101,
            is_authenticated=True,
            is_active=True,
        )
        self.organisation = SimpleNamespace(
            id=55,
            slug="punta-cana-discovery",
            name="Punta Cana Discovery",
        )
        self.ai_settings = SimpleNamespace(id=1)
        self.agent = StatefulSellerAIAgent()

    def post(self, payload: dict[str, Any]):
        request = self.factory.post(
            "/api/ticketing/seller/ai/chat/",
            payload,
            format="json",
        )
        force_authenticate(request, user=self.user)

        with (
            patch.object(
                SellerAIChatView,
                "_resolve_organisation",
                return_value=self.organisation,
            ),
            patch.object(
                SellerAIChatView,
                "_user_can_access_organisation",
                return_value=True,
            ),
            patch.object(
                SellerAIChatView,
                "_resolve_ai_settings",
                return_value=self.ai_settings,
            ),
            patch(
                "ticketing.views_ai.SellerBookingAgentFactory.create_from_request",
                return_value=self.agent,
            ),
            patch.object(
                SellerAIChatView,
                "_response_status",
                return_value=200,
            ),
        ):
            return SellerAIChatView.as_view()(request)

    def test_first_message_returns_grouped_missing_requirements(self):
        response = self.post(
            {
                "action": "message",
                "organisation_slug": "punta-cana-discovery",
                "text": "Give me 2 Premium Coco Bongo for tomorrow",
            }
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["conversation_id"],
            "seller-ai-conversation-1",
        )
        self.assertEqual(response.data["status"], "collecting")
        self.assertFalse(response.data["requires_confirmation"])
        self.assertFalse(response.data["booking_created"])

        message = response.data["message"].lower()

        self.assertIn("hotel or pickup location", message)
        self.assertIn("customer name", message)
        self.assertIn("customer whatsapp or email", message)
        self.assertIn("payment choice", message)
        self.assertIn("send everything together", message)

        self.assertNotEqual(
            response.data["message"],
            "What is the customer's name?",
        )
        self.assertNotEqual(
            response.data["message"],
            "How should the customer pay?",
        )

    def test_second_message_reuses_conversation_id_and_reaches_confirmation(self):
        first = self.post(
            {
                "action": "message",
                "organisation_slug": "punta-cana-discovery",
                "text": "Give me 2 Premium Coco Bongo for tomorrow",
            }
        )

        conversation_id = first.data["conversation_id"]

        second = self.post(
            {
                "action": "message",
                "organisation_slug": "punta-cana-discovery",
                "conversation_id": conversation_id,
                "text": (
                    "John Smith, 8295551234, Barceló Bávaro Palace, "
                    "payment pending"
                ),
            }
        )

        self.assertEqual(second.status_code, 200)
        self.assertEqual(
            second.data["conversation_id"],
            conversation_id,
        )
        self.assertEqual(
            second.data["status"],
            "awaiting_confirmation",
        )
        self.assertTrue(second.data["requires_confirmation"])
        self.assertFalse(second.data["booking_created"])

        preview = second.data["booking_preview"]

        self.assertEqual(
            preview["customer"]["name"],
            "John Smith",
        )
        self.assertEqual(
            preview["customer"]["whatsapp"],
            "8295551234",
        )
        self.assertEqual(
            preview["pickup"]["location"],
            "Barceló Bávaro Palace",
        )
        self.assertEqual(
            preview["payment"]["action"],
            "pending_payment",
        )

        self.assertEqual(len(self.agent.messages), 2)
        self.assertEqual(
            self.agent.messages[1]["conversation_id"],
            conversation_id,
        )

    def test_booking_is_not_created_before_explicit_confirmation(self):
        first = self.post(
            {
                "action": "message",
                "organisation_slug": "punta-cana-discovery",
                "text": "Give me 2 Premium Coco Bongo for tomorrow",
            }
        )

        second = self.post(
            {
                "action": "message",
                "organisation_slug": "punta-cana-discovery",
                "conversation_id": first.data["conversation_id"],
                "text": (
                    "John Smith, 8295551234, Barceló Bávaro Palace, "
                    "payment pending"
                ),
            }
        )

        self.assertEqual(
            second.data["status"],
            "awaiting_confirmation",
        )
        self.assertTrue(second.data["requires_confirmation"])
        self.assertFalse(second.data["booking_created"])
        self.assertEqual(self.agent.create_count, 0)

    def test_confirmation_creates_exactly_one_booking(self):
        first = self.post(
            {
                "action": "message",
                "organisation_slug": "punta-cana-discovery",
                "text": "Give me 2 Premium Coco Bongo for tomorrow",
            }
        )

        conversation_id = first.data["conversation_id"]

        self.post(
            {
                "action": "message",
                "organisation_slug": "punta-cana-discovery",
                "conversation_id": conversation_id,
                "text": (
                    "John Smith, 8295551234, Barceló Bávaro Palace, "
                    "payment pending"
                ),
            }
        )

        confirmed = self.post(
            {
                "action": "message",
                "organisation_slug": "punta-cana-discovery",
                "conversation_id": conversation_id,
                "text": "yes",
            }
        )

        self.assertEqual(confirmed.status_code, 200)
        self.assertEqual(
            confirmed.data["status"],
            "completed",
        )
        self.assertTrue(confirmed.data["booking_created"])
        self.assertFalse(confirmed.data["requires_confirmation"])
        self.assertEqual(
            confirmed.data["booking"]["booking_code"],
            "AI-TEST-77",
        )
        self.assertEqual(self.agent.create_count, 1)

    def test_chat_endpoint_passes_message_metadata_to_agent(self):
        response = self.post(
            {
                "action": "message",
                "organisation_slug": "punta-cana-discovery",
                "text": "2 Premium Coco Bongo tomorrow",
                "language": "en",
                "message_id": "voice-message-1",
                "metadata": {
                    "source": "voice",
                    "confidence": 0.98,
                },
            }
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.agent.messages), 1)

        recorded = self.agent.messages[0]

        self.assertEqual(recorded["language"], "en")
        self.assertEqual(
            recorded["message_id"],
            "voice-message-1",
        )
        self.assertEqual(
            recorded["metadata"]["source"],
            "voice",
        )
        self.assertEqual(
            recorded["metadata"]["confidence"],
            0.98,
        )


if __name__ == "__main__":
    import unittest

    unittest.main()
