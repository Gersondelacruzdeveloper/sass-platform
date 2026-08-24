from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest import TestCase
from unittest.mock import patch

from ticketing.ai.seller.workflow import SellerBookingWorkflow


LIVE_OPTIONS = [
    {
        "external_product_id": "general",
        "external_variant_id": "general-v1",
        "external_availability_id": "general-a1",
        "option_name": "ENTRADA GENERAL + OPEN BAR REGULAR + SNACK.",
        "name": "ENTRADA GENERAL + OPEN BAR REGULAR + SNACK.",
        "description": "General admission with regular open bar and snack.",
        "price": "90.00",
        "currency": "USD",
        "available": True,
        "sold_out": False,
    },
    {
        "external_product_id": "premium",
        "external_variant_id": "premium-v1",
        "external_availability_id": "premium-a1",
        "option_name": "ENTRADA PREMIUM + OPEN BAR PREMIUM + SNACK.",
        "name": "ENTRADA PREMIUM + OPEN BAR PREMIUM + SNACK.",
        "description": "Premium admission with premium open bar and snack.",
        "price": "125.00",
        "currency": "USD",
        "available": True,
        "sold_out": False,
    },
    {
        "external_product_id": "gold",
        "external_variant_id": "gold-v1",
        "external_availability_id": "gold-a1",
        "option_name": "ENTRADA GOLD MEMBER VIP + OPEN BAR PREMIUM + SNACK.",
        "name": "ENTRADA GOLD MEMBER VIP + OPEN BAR PREMIUM + SNACK.",
        "description": "Gold Member VIP admission with premium open bar.",
        "price": "170.00",
        "currency": "USD",
        "available": True,
        "sold_out": False,
    },
    {
        "external_product_id": "front-row",
        "external_variant_id": "front-row-v1",
        "external_availability_id": "front-row-a1",
        "option_name": "ENTRADA FRONT ROW VIP + OPEN BAR PREMIUM + SNACK.",
        "name": "ENTRADA FRONT ROW VIP + OPEN BAR PREMIUM + SNACK.",
        "description": "Front Row VIP admission with premium open bar.",
        "price": "190.00",
        "currency": "USD",
        "available": True,
        "sold_out": False,
    },
    {
        "external_product_id": "table-promo",
        "external_variant_id": "table-promo-v1",
        "external_availability_id": "table-promo-a1",
        "option_name": "Mesa - Promo - 5 personas",
        "name": "Mesa - Promo - 5 personas",
        "description": "Promotional table for five guests.",
        "price": "676.35",
        "currency": "USD",
        "available": True,
        "sold_out": False,
    },
    {
        "external_product_id": "table-zone-one",
        "external_variant_id": "table-zone-one-v1",
        "external_availability_id": "table-zone-one-a1",
        "option_name": "Mesa - Zona Uno - 8 personas",
        "name": "Mesa - Zona Uno - 8 personas",
        "description": "Zone One table for eight guests.",
        "price": "1043.20",
        "currency": "USD",
        "available": True,
        "sold_out": False,
    },
]


class FakeState:
    def __init__(self, *, option_phrase: str) -> None:
        self.product = SimpleNamespace(
            name="Coco Bongo Punta Cana",
            slug="coco-bongo-punta-cana",
        )
        self.service_date = "2026-08-24"
        self.option_phrase = option_phrase
        self.live_option = None
        self.pending_selection = None
        self.booking_preview = {"old": True}
        self.awaiting_confirmation = True
        self.changed_count = 0

    def mark_changed(self) -> None:
        self.changed_count += 1


class FakeApiClient:
    def get_live_availability(
        self,
        *,
        product_slug: str,
        service_date: str,
    ) -> dict[str, Any]:
        return {
            "ok": True,
            "options": LIVE_OPTIONS,
        }


class SellerAILiveOptionFastResolutionTests(TestCase):
    def setUp(self) -> None:
        self.workflow = SellerBookingWorkflow()

    def assert_match(self, phrase: str, expected_external_product_id: str) -> None:
        matched = self.workflow._match_live_option_phrase(
            phrase=phrase,
            options=LIVE_OPTIONS,
        )

        self.assertIsNotNone(
            matched,
            msg=f"Expected phrase {phrase!r} to resolve automatically.",
        )
        self.assertEqual(
            matched["external_product_id"],
            expected_external_product_id,
        )

    def test_premium_phrase_resolves_exact_premium_option(self):
        self.assert_match("Premium", "premium")

    def test_spanish_entrada_premium_resolves_exact_premium_option(self):
        self.assert_match("entrada premium", "premium")

    def test_regular_phrase_resolves_general_regular_option(self):
        self.assert_match("regular", "general")

    def test_general_phrase_resolves_general_regular_option(self):
        self.assert_match("entrada general", "general")

    def test_gold_member_phrase_resolves_gold_member_option(self):
        self.assert_match("Gold Member", "gold")

    def test_front_row_phrase_resolves_front_row_option(self):
        self.assert_match("Front Row", "front-row")

    def test_generic_vip_is_not_silently_guessed(self):
        matched = self.workflow._match_live_option_phrase(
            phrase="VIP",
            options=LIVE_OPTIONS,
        )

        self.assertIsNone(
            matched,
            msg=(
                "Generic VIP is ambiguous because both Gold Member VIP and "
                "Front Row VIP exist. The seller should be asked to choose."
            ),
        )

    @patch(
        "ticketing.ai.seller.workflow."
        "TrustedLiveOptionSelection.from_api_option"
    )
    def test_ensure_live_option_does_not_return_choices_for_premium(
        self,
        from_api_option,
    ):
        selected = SimpleNamespace(
            option_name="ENTRADA PREMIUM + OPEN BAR PREMIUM + SNACK.",
            external_product_id="premium",
        )
        from_api_option.return_value = selected

        state = FakeState(option_phrase="Premium")

        response = self.workflow._ensure_live_option(
            state,
            interpretation={},
            api_client=FakeApiClient(),
        )

        self.assertIsNone(response)
        self.assertIs(state.live_option, selected)
        self.assertIsNone(state.pending_selection)
        self.assertEqual(state.booking_preview, {})
        self.assertFalse(state.awaiting_confirmation)
        self.assertEqual(state.changed_count, 1)

        from_api_option.assert_called_once()
        chosen_api_option = from_api_option.call_args.args[0]

        self.assertEqual(
            chosen_api_option["external_product_id"],
            "premium",
        )

    @patch(
        "ticketing.ai.seller.workflow."
        "TrustedLiveOptionSelection.from_api_option"
    )
    def test_full_spanish_booking_phrase_can_still_resolve_premium_word(
        self,
        from_api_option,
    ):
        """
        This mirrors the real browser failure: the seller already said Premium,
        so live-option resolution must not ask them to choose it again.
        """
        selected = SimpleNamespace(
            option_name="ENTRADA PREMIUM + OPEN BAR PREMIUM + SNACK.",
            external_product_id="premium",
        )
        from_api_option.return_value = selected

        state = FakeState(option_phrase="Premium")

        interpretation = {
            "intent": "provide_information",
            "changes": {
                "option_phrase": "Premium",
                "discount_amount": "150.00",
                "customer": {
                    "name": "John Smith",
                    "whatsapp": "8295551234",
                    "hotel": "Barceló Bávaro Palace",
                },
                "payment_action": "pending_payment",
            },
        }

        response = self.workflow._ensure_live_option(
            state,
            interpretation=interpretation,
            api_client=FakeApiClient(),
        )

        self.assertIsNone(response)
        self.assertEqual(
            state.live_option.external_product_id,
            "premium",
        )
        self.assertIsNone(state.pending_selection)


if __name__ == "__main__":
    import unittest

    unittest.main()
