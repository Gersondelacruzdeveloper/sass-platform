from types import SimpleNamespace

from django.test import SimpleTestCase

from ticketing.ai.customer.prompts import DefaultCustomerAgentPromptBuilder


class CustomerAIPromptTests(SimpleTestCase):
    def _organisation(self, **overrides):
        values = {
            "agent_display_name": "Jennifer",
            "company_description": "A trusted local excursion company.",
            "selling_points": ["Friendly local service"],
            "sales_instructions": "Represent a team with three years of service.",
            "tone": "professional first, then friendly and adaptive",
            "max_reply_characters": 600,
            "supported_languages": ["es", "en"],
            "human_handoff_enabled": True,
            "allow_itinerary_recommendations": True,
            "allow_cart_session_creation": True,
        }
        values.update(overrides)
        return SimpleNamespace(
            name="Punta Cana Discovery",
            branding=None,
            ticketing_customer_ai_settings=SimpleNamespace(**values),
        )

    def _conversation(self, **overrides):
        values = {
            "customer_name": "Gerson",
            "language": "es",
            "travel_start_date": None,
            "travel_end_date": None,
            "hotel_name": "Be Live Hamaca",
            "adults": 1,
            "children": 0,
            "infants": 0,
            "interests": ["Isla Saona"],
            "status": "active",
        }
        values.update(overrides)
        return SimpleNamespace(**values)

    def test_uses_tenant_persona_and_customer_name_context(self):
        prompt = DefaultCustomerAgentPromptBuilder().build_instructions(
            organisation=self._organisation(),
            conversation=self._conversation(),
            language="es",
            metadata={"channel": "whatsapp"},
        )

        self.assertIn("You are Jennifer", prompt)
        self.assertIn("Punta Cana Discovery", prompt)
        self.assertIn('"customer_name": "Gerson"', prompt)
        self.assertIn("three years of service", prompt)

    def test_explicit_checkout_request_requires_cart_tool_same_turn(self):
        prompt = DefaultCustomerAgentPromptBuilder().build_instructions(
            organisation=self._organisation(),
            conversation=self._conversation(),
            language="es",
            metadata={},
        )

        self.assertIn("call the cart tool immediately in that same turn", prompt)
        self.assertIn("Never promise to send a checkout link later", prompt)
        self.assertIn("include its exact secure checkout URL", prompt)

    def test_pending_pickup_time_does_not_block_cart(self):
        prompt = DefaultCustomerAgentPromptBuilder().build_instructions(
            organisation=self._organisation(),
            conversation=self._conversation(),
            language="es",
            metadata={},
        )

        self.assertIn(
            "An exact pickup time is not a prerequisite for cart creation",
            prompt,
        )
        self.assertIn(
            "do not delay cart creation solely because the precise pickup time is pending",
            prompt,
        )

    def test_personal_details_do_not_block_cart_creation(self):
        prompt = DefaultCustomerAgentPromptBuilder().build_instructions(
            organisation=self._organisation(),
            conversation=self._conversation(customer_name=""),
            language="es",
            metadata={},
        )

        self.assertIn("A missing name must not block", prompt)
        self.assertIn(
            "Do not ask for name or email first unless the cart tool explicitly requires it",
            prompt,
        )

    def test_settings_remain_tenant_scoped(self):
        builder = DefaultCustomerAgentPromptBuilder()
        jennifer = builder.resolve_settings(self._organisation())
        other = builder.resolve_settings(
            self._organisation(agent_display_name="Other Tenant Assistant")
        )

        self.assertEqual(jennifer.agent_name, "Jennifer")
        self.assertEqual(other.agent_name, "Other Tenant Assistant")
