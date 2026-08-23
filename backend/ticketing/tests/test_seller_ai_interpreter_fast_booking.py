from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any
from unittest import TestCase
from unittest.mock import patch

from ticketing.ai.seller.interpreter import OpenAISellerMessageInterpreter
from ticketing.ai.seller.schemas import SellerMessage


def make_state() -> Any:
    return SimpleNamespace(
        conversation_id="seller-ai-interpreter-test-1",
        seller_id=7,
        organisation_slug="punta-cana-discovery",
        preferred_language="en",
        product=None,
        live_option=None,
        pickup=None,
        pending_selection=None,
    )


def first_turn_provider_json() -> dict[str, Any]:
    return {
        "question_topic": "",
        "changes": {
            "product_phrase": "Coco Bongo",
            "product_id": 10,
            "service_date": "2026-08-24",
            "service_time": "",
            "option_phrase": "Premium",
            "external_product_id": "",
            "external_variant_id": "",
            "external_availability_id": "",
            "selected_external_product_id": "",
            "pickup_phrase": "",
            "pickup_location_id": None,
            "guests": {
                "adults": 2,
                "children": 0,
                "infants": 0,
            },
            "customer": {
                "name": "",
                "whatsapp": "",
                "email": "",
                "hotel": "",
                "notes": "",
            },
            "payment_action": "",
            "payment_reference": "",
            "payment_note": "",
            "discount_amount": "",
            "discount_percent": "",
        },
        "intent": "provide_information",
        "ambiguous_fields": [],
        "missing_fields": [
            "pickup",
            "customer_name",
            "customer_contact",
            "payment",
        ],
        "confidence": 0.99,
        "response_hint": "",
        "language": "en",
        "selection_id": "",
        "selection_index": None,
        "selection_phrase": "",
    }


def second_turn_provider_json() -> dict[str, Any]:
    return {
        "question_topic": "",
        "changes": {
            "product_phrase": "",
            "product_id": None,
            "service_date": "",
            "service_time": "",
            "option_phrase": "",
            "external_product_id": "",
            "external_variant_id": "",
            "external_availability_id": "",
            "selected_external_product_id": "",
            "pickup_phrase": "Barceló Bávaro Palace",
            "pickup_location_id": 501,
            "guests": {
                "adults": None,
                "children": None,
                "infants": None,
            },
            "customer": {
                "name": "John Smith",
                "whatsapp": "8295551234",
                "email": "",
                "hotel": "Barceló Bávaro Palace",
                "notes": "",
            },
            "payment_action": "pending_payment",
            "payment_reference": "",
            "payment_note": "",
            "discount_amount": "",
            "discount_percent": "",
        },
        "intent": "provide_information",
        "ambiguous_fields": [],
        "missing_fields": [],
        "confidence": 0.99,
        "response_hint": "",
        "language": "en",
        "selection_id": "",
        "selection_index": None,
        "selection_phrase": "",
    }


class SellerAIInterpreterFastBookingTests(TestCase):
    def setUp(self) -> None:
        self.interpreter = OpenAISellerMessageInterpreter(
            api_key="",
            client=SimpleNamespace(),
            retry_empty_response=False,
        )

        self.state = make_state()

        self.seller = {
            "id": 7,
            "full_name": "Test Seller",
        }

        self.products = [
            {
                "id": 10,
                "name": "Coco Bongo",
                "slug": "coco-bongo",
                "seller_enabled": True,
                "is_active": True,
            },
            {
                "id": 11,
                "name": "Saona Island",
                "slug": "saona-island",
                "seller_enabled": True,
                "is_active": True,
            },
        ]

        self.pickup_locations = [
            {
                "id": 501,
                "name": "Barceló Bávaro Palace",
                "is_active": True,
            },
            {
                "id": 502,
                "name": "Hard Rock Hotel",
                "is_active": True,
            },
        ]

    def interpret_provider_payload(
        self,
        *,
        text: str,
        provider_payload: dict[str, Any],
    ) -> dict[str, Any]:
        dummy_response = SimpleNamespace(
            status="completed",
            output_text=json.dumps(provider_payload),
        )

        with (
            patch(
                "ticketing.ai.seller.interpreter.build_interpreter_messages",
                return_value=[
                    {
                        "role": "system",
                        "content": "seller booking test",
                    },
                    {
                        "role": "user",
                        "content": text,
                    },
                ],
            ),
            patch.object(
                self.interpreter,
                "_create_response",
                return_value=dummy_response,
            ),
            patch.object(
                self.interpreter,
                "_ensure_output_text",
                return_value=(
                    dummy_response,
                    json.dumps(provider_payload),
                ),
            ),
        ):
            return self.interpreter.interpret(
                message=SellerMessage(
                    text=text,
                    language="en",
                ),
                state=self.state,
                seller=self.seller,
                products=self.products,
                trusted_pickup_locations=self.pickup_locations,
                memory={},
            )

    def test_first_message_preserves_all_extracted_changes(self):
        result = self.interpret_provider_payload(
            text="Give me 2 Premium Coco Bongo for tomorrow",
            provider_payload=first_turn_provider_json(),
        )

        changes = result["changes"]

        self.assertEqual(result["intent"], "provide_information")
        self.assertEqual(changes["product_phrase"], "Coco Bongo")
        self.assertEqual(changes["product_id"], 10)
        self.assertEqual(changes["option_phrase"], "Premium")
        self.assertEqual(changes["service_date"], "2026-08-24")
        self.assertEqual(changes["guests"]["adults"], 2)
        self.assertEqual(changes["guests"]["children"], 0)
        self.assertEqual(changes["guests"]["infants"], 0)

    def test_second_message_preserves_customer_contact_hotel_and_payment(self):
        result = self.interpret_provider_payload(
            text=(
                "John Smith, 8295551234, Barceló Bávaro Palace, "
                "payment pending"
            ),
            provider_payload=second_turn_provider_json(),
        )

        changes = result["changes"]
        customer = changes["customer"]

        self.assertEqual(customer["name"], "John Smith")
        self.assertEqual(customer["whatsapp"], "8295551234")
        self.assertEqual(customer["hotel"], "Barceló Bávaro Palace")
        self.assertEqual(
            changes["pickup_phrase"],
            "Barceló Bávaro Palace",
        )
        self.assertEqual(changes["pickup_location_id"], 501)
        self.assertEqual(
            changes["payment_action"],
            "pending_payment",
        )

    def test_trusted_product_id_is_preserved_inside_changes(self):
        result = self.interpret_provider_payload(
            text="2 Coco Bongo tomorrow",
            provider_payload=first_turn_provider_json(),
        )

        self.assertEqual(result["changes"]["product_id"], 10)

    def test_trusted_pickup_location_id_is_preserved_inside_changes(self):
        result = self.interpret_provider_payload(
            text=(
                "John Smith, 8295551234, Barceló Bávaro Palace, "
                "payment pending"
            ),
            provider_payload=second_turn_provider_json(),
        )

        self.assertEqual(
            result["changes"]["pickup_location_id"],
            501,
        )

    def test_untrusted_product_id_is_removed_from_changes(self):
        payload = first_turn_provider_json()
        payload["changes"]["product_id"] = 999

        result = self.interpret_provider_payload(
            text="Give me 2 Premium Coco Bongo for tomorrow",
            provider_payload=payload,
        )

        self.assertIsNone(result["product_id"])
        self.assertIsNone(result["changes"]["product_id"])

    def test_untrusted_pickup_location_id_is_removed_from_changes(self):
        payload = second_turn_provider_json()
        payload["changes"]["pickup_location_id"] = 999

        result = self.interpret_provider_payload(
            text=(
                "John Smith, 8295551234, Unknown Hotel, "
                "payment pending"
            ),
            provider_payload=payload,
        )

        self.assertIsNone(result["pickup_location_id"])
        self.assertIsNone(
            result["changes"]["pickup_location_id"]
        )

    def test_untrusted_external_ids_are_removed_from_both_locations(self):
        payload = first_turn_provider_json()
        payload["changes"]["external_product_id"] = "evil-product"
        payload["changes"]["external_variant_id"] = "evil-variant"
        payload["changes"]["external_availability_id"] = "evil-availability"
        payload["changes"]["selected_external_product_id"] = "evil-selected"

        result = self.interpret_provider_payload(
            text="Give me 2 Premium Coco Bongo for tomorrow",
            provider_payload=payload,
        )

        for field_name in (
            "external_product_id",
            "external_variant_id",
            "external_availability_id",
            "selected_external_product_id",
        ):
            self.assertEqual(result[field_name], "")
            self.assertEqual(result["changes"][field_name], "")

    def test_no_real_openai_request_is_required(self):
        result = self.interpret_provider_payload(
            text="Give me 2 Premium Coco Bongo for tomorrow",
            provider_payload=first_turn_provider_json(),
        )

        self.assertEqual(
            result["changes"]["product_id"],
            10,
        )


if __name__ == "__main__":
    import unittest

    unittest.main()
