"""Unit tests for organisation AI provider adapters."""

from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase

from organisations.ai.providers import (
    AIProviderConfigurationError,
    AIProviderRequestError,
    AITextResult,
    OpenAIProvider,
    UnsupportedAIProviderError,
    get_ai_provider,
)


class OpenAIProviderTests(SimpleTestCase):
    def create_provider(self, **overrides):
        values = {
            "api_key": "test-provider-key",
            "default_model": "gpt-test-model",
            "timeout_seconds": 12.5,
        }
        values.update(overrides)
        return OpenAIProvider(**values)

    def test_missing_api_key_is_rejected(self):
        with self.assertRaises(AIProviderConfigurationError) as context:
            self.create_provider(api_key="   ")

        self.assertIn("not configured", str(context.exception))

    def test_encrypted_api_key_is_rejected_before_client_creation(self):
        with self.assertRaises(AIProviderConfigurationError) as context:
            self.create_provider(api_key="fernet:v1:encrypted-value")

        self.assertIn("not decrypted", str(context.exception))
        self.assertNotIn("encrypted-value", str(context.exception))

    def test_missing_default_model_is_rejected(self):
        with self.assertRaises(AIProviderConfigurationError) as context:
            self.create_provider(default_model="  ")

        self.assertIn("default model", str(context.exception))

    def test_generate_text_returns_normalised_result(self):
        provider = self.create_provider()
        response = SimpleNamespace(
            id="response-test-id",
            output_text="  Generated answer  ",
        )
        client = Mock()
        client.responses.create.return_value = response

        with patch.object(provider, "_build_client", return_value=client):
            result = provider.generate_text(
                instructions="  Follow these instructions  ",
                input_text="  Translate this  ",
            )

        self.assertIsInstance(result, AITextResult)
        self.assertEqual(result.text, "Generated answer")
        self.assertEqual(result.provider, "openai")
        self.assertEqual(result.model, "gpt-test-model")
        self.assertEqual(result.response_id, "response-test-id")
        self.assertIs(result.raw_response, response)
        client.responses.create.assert_called_once_with(
            model="gpt-test-model",
            instructions="Follow these instructions",
            input="Translate this",
        )

    def test_generate_text_uses_explicit_model_override(self):
        provider = self.create_provider()
        client = Mock()
        client.responses.create.return_value = SimpleNamespace(
            id="override-response",
            output_text="Override result",
        )

        with patch.object(provider, "_build_client", return_value=client):
            result = provider.generate_text(
                instructions="instruction",
                input_text="input",
                model="  gpt-override-model  ",
            )

        self.assertEqual(result.model, "gpt-override-model")
        self.assertEqual(
            client.responses.create.call_args.kwargs["model"],
            "gpt-override-model",
        )

    def test_empty_provider_response_is_rejected(self):
        provider = self.create_provider()
        client = Mock()
        client.responses.create.return_value = SimpleNamespace(
            id="empty-response",
            output_text="   ",
        )

        with patch.object(provider, "_build_client", return_value=client):
            with self.assertRaises(AIProviderRequestError) as context:
                provider.generate_text(
                    instructions="instruction",
                    input_text="input",
                )

        self.assertEqual(
            str(context.exception),
            "OpenAI returned an empty response.",
        )

    def test_provider_exception_is_sanitized(self):
        provider = self.create_provider()
        client = Mock()
        client.responses.create.side_effect = RuntimeError(
            "upstream leaked test-provider-key and private request"
        )

        with patch.object(provider, "_build_client", return_value=client):
            with self.assertRaises(AIProviderRequestError) as context:
                provider.generate_text(
                    instructions="private instructions",
                    input_text="private input",
                )

        message = str(context.exception)
        self.assertEqual(message, "OpenAI could not complete the request.")
        self.assertNotIn("test-provider-key", message)
        self.assertNotIn("private", message)

    def test_connection_success_uses_mocked_models_boundary(self):
        provider = self.create_provider()
        client = Mock()

        with patch.object(provider, "_build_client", return_value=client):
            result = provider.test_connection()

        self.assertTrue(result)
        client.models.list.assert_called_once_with()

    def test_connection_failure_is_sanitized(self):
        provider = self.create_provider()
        client = Mock()
        client.models.list.side_effect = RuntimeError(
            "upstream leaked test-provider-key"
        )

        with patch.object(provider, "_build_client", return_value=client):
            with self.assertRaises(AIProviderRequestError) as context:
                provider.test_connection()

        message = str(context.exception)
        self.assertEqual(
            message,
            "OpenAI credentials could not be verified.",
        )
        self.assertNotIn("test-provider-key", message)


class AIProviderFactoryTests(SimpleTestCase):
    def test_openai_factory_normalises_provider_and_configuration(self):
        provider = get_ai_provider(
            provider="  OPENAI  ",
            api_key="test-factory-key",
            default_model="gpt-factory-model",
            timeout_seconds=7,
        )

        self.assertIsInstance(provider, OpenAIProvider)
        self.assertEqual(provider.api_key, "test-factory-key")
        self.assertEqual(provider.default_model, "gpt-factory-model")
        self.assertEqual(provider.timeout_seconds, 7.0)

    def test_unsupported_provider_is_rejected_without_external_call(self):
        with self.assertRaises(UnsupportedAIProviderError) as context:
            get_ai_provider(
                provider="unsupported-provider",
                api_key="must-not-be-used",
                default_model="must-not-be-used",
            )

        self.assertEqual(
            str(context.exception),
            "Unsupported AI provider: unsupported-provider.",
        )

