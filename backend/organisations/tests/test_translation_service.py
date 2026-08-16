"""Tests for AI-assisted product translation persistence."""

import json
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import TestCase

from organisations.ai.constants import FEATURE_TRANSLATIONS
from organisations.ai.translation_service import (
    InvalidTranslationResponseError,
    ManualTranslationProtectedError,
    ProductTranslationError,
    ProductTranslationService,
    SameLanguageTranslationError,
    UnsupportedLanguageError,
)
from organisations.models import Organisation
from ticketing.models import ExperienceProduct


class ProductTranslationServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Translation Service Tenant",
            slug="translation-service-tenant",
            business_type="ticketing",
            is_active=True,
        )
        cls.other_organisation = Organisation.objects.create(
            name="Other Translation Service Tenant",
            slug="other-translation-service-tenant",
            business_type="ticketing",
            is_active=True,
        )

    def setUp(self):
        self.product = ExperienceProduct.objects.create(
            organisation=self.organisation,
            name="Saona Island",
            slug="translation-service-saona",
            product_type="excursion",
            default_language="en",
            short_description="A full-day island tour.",
            long_description="Travel by boat and return in the evening.",
            includes=["Transport", "Lunch"],
            excludes="Optional photos",
            itinerary=[{"time": "08:00", "title": "Departure"}],
            faqs=[],
            location="Main hotel lobby",
            ticket_information="Bring your ticket.",
            instructions="Arrive 10 minutes early.",
            cancellation_policy="Cancel 24 hours before departure.",
        )

    def valid_translation(self, name="Isla Saona"):
        return {
            "name": name,
            "short_description": "Excursión de día completo.",
            "long_description": "Viaje en barco y regreso en la tarde.",
            "includes": ["Transporte", "Almuerzo"],
            "excludes": ["Fotos opcionales"],
            "itinerary": [{"time": "08:00", "title": "Salida"}],
            "faqs": [],
            "meeting_point": "Lobby principal",
            "ticket_information": "Traiga su boleto.",
            "instructions": "Llegue 10 minutos antes.",
            "cancellation_policy": "Cancele 24 horas antes.",
        }

    def provider_result(self, text):
        return SimpleNamespace(
            text=text,
            provider="openai",
            model="gpt-translation-test",
        )

    def mocked_ai(self, result):
        provider = Mock()
        provider.generate_text.return_value = result
        context = SimpleNamespace(provider=provider)
        service = Mock()
        service.build_provider.return_value = context
        service_class = patch(
            "organisations.ai.translation_service.OrganisationAIService",
            return_value=service,
        )
        return service_class, service, provider

    def test_product_is_required(self):
        with self.assertRaises(ProductTranslationError):
            ProductTranslationService(None)

    def test_unsupported_language_is_rejected_before_ai_service(self):
        with patch(
            "organisations.ai.translation_service.OrganisationAIService"
        ) as service_class:
            with self.assertRaises(UnsupportedLanguageError):
                ProductTranslationService(self.product).generate("xx")

        service_class.assert_not_called()

    def test_same_source_and_target_language_is_rejected(self):
        with patch(
            "organisations.ai.translation_service.OrganisationAIService"
        ) as service_class:
            with self.assertRaises(SameLanguageTranslationError):
                ProductTranslationService(self.product).generate("EN")

        service_class.assert_not_called()

    def test_manually_edited_translation_is_protected_before_ai_call(self):
        self.product.translations = {
            "es": {
                "name": "Manual name",
                "_meta": {"manually_edited": True},
            }
        }
        self.product.save(update_fields=["translations", "updated_at"])

        with patch(
            "organisations.ai.translation_service.OrganisationAIService"
        ) as service_class:
            with self.assertRaises(ManualTranslationProtectedError):
                ProductTranslationService(self.product).generate("es")

        service_class.assert_not_called()
        self.product.refresh_from_db()
        self.assertEqual(
            self.product.translations["es"]["name"],
            "Manual name",
        )

    def test_valid_fenced_json_is_saved_with_safe_metadata(self):
        existing_french = {
            "name": "Île Saona",
            "_meta": {"manually_edited": True},
        }
        self.product.translations = {"fr": existing_french}
        self.product.save(update_fields=["translations", "updated_at"])
        response_text = "```json\n" + json.dumps(
            self.valid_translation()
        ) + "\n```"
        service_patch, service, provider = self.mocked_ai(
            self.provider_result(response_text)
        )

        with service_patch as service_class:
            result = ProductTranslationService(self.product).generate("ES")

        service_class.assert_called_once_with(self.organisation)
        service.build_provider.assert_called_once_with(
            feature=FEATURE_TRANSLATIONS
        )
        provider.generate_text.assert_called_once()
        self.assertEqual(result.product_id, self.product.id)
        self.assertEqual(result.source_language, "en")
        self.assertEqual(result.target_language, "es")
        self.product.refresh_from_db()
        self.assertEqual(self.product.translations["fr"], existing_french)
        translated = self.product.translations["es"]
        self.assertEqual(translated["name"], "Isla Saona")
        self.assertEqual(translated["_meta"]["source"], "ai")
        self.assertFalse(translated["_meta"]["manually_edited"])
        self.assertEqual(translated["_meta"]["provider"], "openai")
        self.assertEqual(
            translated["_meta"]["model"],
            "gpt-translation-test",
        )
        self.assertIn("generated_at", translated["_meta"])

    def test_provider_receives_normalised_source_payload(self):
        service_patch, _service, provider = self.mocked_ai(
            self.provider_result(json.dumps(self.valid_translation()))
        )

        with service_patch:
            ProductTranslationService(self.product).generate("es")

        kwargs = provider.generate_text.call_args.kwargs
        source = json.loads(kwargs["input_text"])
        self.assertEqual(source["name"], "Saona Island")
        self.assertEqual(source["includes"], ["Transport", "Lunch"])
        self.assertEqual(source["excludes"], ["Optional photos"])
        self.assertEqual(source["faqs"], [])
        self.assertEqual(source["meeting_point"], "Main hotel lobby")
        self.assertIn("English to Spanish", kwargs["instructions"])

    def test_empty_response_does_not_write_translation(self):
        service_patch, _service, _provider = self.mocked_ai(
            self.provider_result("   ")
        )

        with service_patch:
            with self.assertRaises(InvalidTranslationResponseError):
                ProductTranslationService(self.product).generate("es")

        self.product.refresh_from_db()
        self.assertEqual(self.product.translations, {})

    def test_invalid_json_does_not_write_translation(self):
        service_patch, _service, _provider = self.mocked_ai(
            self.provider_result("not valid json")
        )

        with service_patch:
            with self.assertRaises(InvalidTranslationResponseError):
                ProductTranslationService(self.product).generate("es")

        self.product.refresh_from_db()
        self.assertEqual(self.product.translations, {})

    def test_non_object_json_does_not_write_translation(self):
        service_patch, _service, _provider = self.mocked_ai(
            self.provider_result('["unexpected", "list"]')
        )

        with service_patch:
            with self.assertRaises(InvalidTranslationResponseError):
                ProductTranslationService(self.product).generate("es")

        self.product.refresh_from_db()
        self.assertEqual(self.product.translations, {})

    def test_force_allows_explicit_manual_translation_replacement(self):
        self.product.translations = {
            "es": {
                "name": "Manual old name",
                "_meta": {"manually_edited": True},
            }
        }
        self.product.save(update_fields=["translations", "updated_at"])
        service_patch, _service, _provider = self.mocked_ai(
            self.provider_result(
                json.dumps(self.valid_translation("Forced AI name"))
            )
        )

        with service_patch:
            ProductTranslationService(self.product).generate(
                "es",
                force=True,
            )

        self.product.refresh_from_db()
        self.assertEqual(
            self.product.translations["es"]["name"],
            "Forced AI name",
        )
        self.assertFalse(
            self.product.translations["es"]["_meta"]["manually_edited"]
        )

    def test_concurrent_manual_edit_is_not_overwritten(self):
        provider = Mock()

        def manually_edit_while_request_runs(**_kwargs):
            current = ExperienceProduct.objects.get(pk=self.product.pk)
            current.translations = {
                "es": {
                    "name": "Concurrent manual name",
                    "_meta": {"manually_edited": True},
                }
            }
            current.save(update_fields=["translations", "updated_at"])
            return self.provider_result(json.dumps(self.valid_translation()))

        provider.generate_text.side_effect = manually_edit_while_request_runs
        service = Mock()
        service.build_provider.return_value = SimpleNamespace(
            provider=provider
        )

        with patch(
            "organisations.ai.translation_service.OrganisationAIService",
            return_value=service,
        ):
            with self.assertRaises(ManualTranslationProtectedError):
                ProductTranslationService(self.product).generate("es")

        self.product.refresh_from_db()
        self.assertEqual(
            self.product.translations["es"]["name"],
            "Concurrent manual name",
        )

    def test_provider_failure_does_not_partially_write_or_touch_other_tenant(self):
        other_product = ExperienceProduct.objects.create(
            organisation=self.other_organisation,
            name="Other Tenant Product",
            slug="other-translation-product",
            product_type="excursion",
            translations={"es": {"name": "Other tenant translation"}},
        )
        provider = Mock()
        provider.generate_text.side_effect = RuntimeError(
            "simulated mocked provider failure"
        )
        service = Mock()
        service.build_provider.return_value = SimpleNamespace(
            provider=provider
        )

        with patch(
            "organisations.ai.translation_service.OrganisationAIService",
            return_value=service,
        ):
            with self.assertRaises(RuntimeError):
                ProductTranslationService(self.product).generate("es")

        self.product.refresh_from_db()
        other_product.refresh_from_db()
        self.assertEqual(self.product.translations, {})
        self.assertEqual(
            other_product.translations,
            {"es": {"name": "Other tenant translation"}},
        )
