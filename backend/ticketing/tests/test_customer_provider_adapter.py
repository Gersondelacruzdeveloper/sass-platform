from types import SimpleNamespace

from django.test import SimpleTestCase

from ticketing.ai.customer.provider_adapter import (
    CustomerProviderAdapterConfigurationError,
    OpenAICustomerProviderAdapter,
    OpenAICustomerProviderAdapterFactory,
)


class FakeOpenAIProvider:
    provider_name = "openai"

    def _build_client(self):
        return object()


class OpenAICustomerProviderAdapterFactoryTests(SimpleTestCase):
    def setUp(self):
        self.organisation = SimpleNamespace(pk=18)
        self.conversation = SimpleNamespace(organisation_id=18)
        self.provider = FakeOpenAIProvider()

    def test_factory_is_importable_and_builds_openai_adapter(self):
        adapter = OpenAICustomerProviderAdapterFactory().build_customer_provider(
            organisation=self.organisation,
            conversation=self.conversation,
            provider=self.provider,
            model="gpt-5-mini",
        )

        self.assertIsInstance(adapter, OpenAICustomerProviderAdapter)

    def test_factory_rejects_cross_organisation_conversation(self):
        foreign_conversation = SimpleNamespace(organisation_id=99)

        with self.assertRaises(CustomerProviderAdapterConfigurationError):
            OpenAICustomerProviderAdapterFactory().build_customer_provider(
                organisation=self.organisation,
                conversation=foreign_conversation,
                provider=self.provider,
                model="gpt-5-mini",
            )

    def test_factory_rejects_missing_model(self):
        with self.assertRaises(CustomerProviderAdapterConfigurationError):
            OpenAICustomerProviderAdapterFactory().build_customer_provider(
                organisation=self.organisation,
                conversation=self.conversation,
                provider=self.provider,
                model="",
            )
