from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest import TestCase
from unittest.mock import MagicMock, patch

from ticketing.ai.seller.agent import SellerBookingAgent
from ticketing.ai.seller.api_client import SellerBookingApiClient
from ticketing.ai.seller.schemas import AgentResponse
from ticketing.ai.seller.workflow import SellerBookingWorkflow
from ticketing.tests.test_seller_ai_workflow_fast_collection import (
    FakeState,
    make_product,
)


class ProductScopedPickupApi:
    """Workflow fake that fails if the global hotel catalogue is requested."""

    def __init__(self) -> None:
        self.requested_product_ids: list[int] = []
        self.resolve_calls: list[dict[str, Any]] = []

    def get_pickup_locations(self, **kwargs: Any) -> list[dict[str, Any]]:
        raise AssertionError("The seller AI requested the global hotel catalogue.")

    def get_pickup_locations_for_product(
        self,
        *,
        product_id: int,
    ) -> list[dict[str, Any]]:
        self.requested_product_ids.append(product_id)
        return [
            {
                "id": 501,
                "name": "Whala Bavaro",
                "zone_name": "Zona Bavaro 2A",
                "is_active": True,
                "default_pickup_point": "Lobby",
            },
            {
                "id": 502,
                "name": "Whala Urban Punta Cana",
                "zone_name": "D2",
                "is_active": True,
                "default_pickup_point": "Main entrance",
            },
            {
                "id": 503,
                "name": "Barcelo Bavaro Palace",
                "zone_name": "Bavaro",
                "is_active": True,
                "default_pickup_point": "Lobby",
            },
        ]

    def resolve_pickup(self, **kwargs: Any) -> dict[str, Any]:
        self.resolve_calls.append(dict(kwargs))
        return {
            "found": True,
            "schedule": {
                "pickup_time": "19:10",
                "resolved_pickup_point": "Main lobby",
                "instructions": "Be ready 10 minutes early.",
            },
        }


class SellerAIProductScopedPickupTests(TestCase):
    def test_api_client_returns_only_active_locations_scheduled_for_product(self):
        client = object.__new__(SellerBookingApiClient)
        client.get_pickup_schedules = MagicMock(
            return_value=[
                {
                    "id": 1,
                    "product": 10,
                    "pickup_location": 501,
                    "is_active": True,
                },
                {
                    "id": 2,
                    "product": 10,
                    "pickup_location": 502,
                    "is_active": True,
                },
                {
                    "id": 3,
                    "product": 10,
                    "pickup_location": 501,
                    "is_active": True,
                },
                {
                    "id": 4,
                    "product": 11,
                    "pickup_location": 601,
                    "is_active": True,
                },
                {
                    "id": 5,
                    "product": 10,
                    "pickup_location": 503,
                    "is_active": False,
                },
            ]
        )
        client.get_pickup_locations = MagicMock(
            return_value=[
                {"id": 501, "name": "Whala Bavaro", "is_active": True},
                {"id": 502, "name": "Whala Urban", "is_active": True},
                {"id": 503, "name": "Inactive Whala", "is_active": False},
                {"id": 601, "name": "Saona-only Hotel", "is_active": True},
            ]
        )

        locations = client.get_pickup_locations_for_product(product_id=10)

        self.assertEqual([item["id"] for item in locations], [501, 502])
        self.assertNotIn(601, [item["id"] for item in locations])

    def test_agent_never_sends_global_hotels_when_product_is_selected(self):
        api = MagicMock()
        api.organisation_slug = "punta-cana-discovery"
        api.get_me.return_value = {"id": 7}
        api.get_products.return_value = [{"id": 10, "name": "Coco Bongo"}]
        api.get_pickup_locations.return_value = [
            {"id": 601, "name": "Saona-only Hotel", "is_active": True}
        ]
        api.get_pickup_locations_for_product.return_value = [
            {"id": 501, "name": "Whala Bavaro", "is_active": True}
        ]

        state = MagicMock()
        state.conversation_id = "seller-product-scope"
        state.seller_id = 7
        state.organisation_slug = "punta-cana-discovery"
        state.product = SimpleNamespace(product_id=10)
        state.preferred_language = "es"
        state.pending_selection = None

        interpreter = MagicMock()
        interpreter.interpret.return_value = {
            "intent": "provide_information",
            "confidence": 1.0,
            "changes": {},
            "ambiguous_fields": [],
            "missing_fields": [],
        }
        workflow = MagicMock()
        workflow.process.return_value = AgentResponse(
            conversation_id=state.conversation_id,
            message="Continuar",
            status="collecting",
            requires_reply=True,
        )
        memory = MagicMock()
        memory.get_interpretation_memory.return_value = {}
        store = MagicMock()

        agent = SellerBookingAgent(
            api_client=api,
            conversation_store=store,
            memory_service=memory,
            interpreter=interpreter,
            workflow=workflow,
        )

        with (
            patch.object(agent, "_load_or_create_state", return_value=state),
            patch.object(agent, "_assert_state_ownership", return_value=None),
            patch.object(agent, "_record_memory_observations", return_value=None),
        ):
            agent.handle_message(
                text="El cliente esta en Whala",
                conversation_id=state.conversation_id,
            )

        api.get_pickup_locations_for_product.assert_called_once_with(product_id=10)
        api.get_pickup_locations.assert_not_called()
        trusted = interpreter.interpret.call_args.kwargs[
            "trusted_pickup_locations"
        ]
        self.assertEqual([item["id"] for item in trusted], [501])

    def test_workflow_shows_only_matching_hotels_from_selected_product(self):
        workflow = SellerBookingWorkflow()
        api = ProductScopedPickupApi()
        state = FakeState(
            product=make_product(product_id=10, name="Coco Bongo"),
            service_date="2026-09-05",
            pickup_phrase="Whala",
        )

        response = workflow._ensure_pickup(
            state,
            {"pickup_location_id": None},
            api,
        )

        self.assertIsNotNone(response)
        self.assertEqual(response.status, "awaiting_selection")
        self.assertEqual(api.requested_product_ids, [10])
        self.assertEqual(
            [int(choice["id"]) for choice in response.choices],
            [501, 502],
        )
        self.assertNotIn(503, [int(choice["id"]) for choice in response.choices])

    def test_exact_scoped_hotel_id_resolves_time_for_same_product_and_date(self):
        workflow = SellerBookingWorkflow()
        api = ProductScopedPickupApi()
        state = FakeState(
            product=make_product(product_id=10, name="Coco Bongo"),
            service_date="2026-09-05",
            pickup_phrase="Whala Bavaro",
        )

        response = workflow._ensure_pickup(
            state,
            {"pickup_location_id": 501},
            api,
        )

        self.assertIsNone(response)
        self.assertEqual(state.pickup.pickup_location_id, 501)
        self.assertEqual(
            api.resolve_calls,
            [
                {
                    "product_id": 10,
                    "pickup_location_id": 501,
                    "service_date": "2026-09-05",
                }
            ],
        )


if __name__ == "__main__":
    import unittest

    unittest.main()
