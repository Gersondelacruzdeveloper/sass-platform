from types import SimpleNamespace

from django.test import SimpleTestCase, override_settings

from ticketing.ai.customer.factory import DjangoCustomerAIRuntimeFactory
from ticketing.customer_ai_models import TicketingCustomerAISettings


class TicketingCustomerAISettingsTests(SimpleTestCase):
    def test_model_is_tenant_scoped_and_safe_by_default(self):
        field = TicketingCustomerAISettings._meta.get_field("organisation")

        self.assertTrue(field.one_to_one)
        self.assertEqual(field.remote_field.related_name, "ticketing_customer_ai_settings")
        self.assertTrue(
            TicketingCustomerAISettings._meta.get_field("shadow_mode").default
        )
        self.assertEqual(
            TicketingCustomerAISettings._meta.get_field(
                "agent_display_name"
            ).default,
            "Travel Assistant",
        )
        self.assertTrue(
            TicketingCustomerAISettings._meta.get_field(
                "allow_cart_session_creation"
            ).default
        )

    def test_shadow_mode_is_resolved_independently_per_tenant(self):
        enabled_tenant = SimpleNamespace(
            ticketing_customer_ai_settings=SimpleNamespace(shadow_mode=False)
        )
        shadow_tenant = SimpleNamespace(
            ticketing_customer_ai_settings=SimpleNamespace(shadow_mode=True)
        )

        self.assertFalse(DjangoCustomerAIRuntimeFactory._shadow_mode(enabled_tenant))
        self.assertTrue(DjangoCustomerAIRuntimeFactory._shadow_mode(shadow_tenant))

    @override_settings(CUSTOMER_AI_SHADOW_MODE=True)
    def test_missing_tenant_settings_fail_closed(self):
        self.assertTrue(
            DjangoCustomerAIRuntimeFactory._shadow_mode(SimpleNamespace())
        )
