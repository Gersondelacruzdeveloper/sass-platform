from __future__ import annotations

from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from ticketing.models import Seller
from ticketing.tests.test_seller_ai_chat_fast_flow_api import (
    StatefulSellerAIAgent,
)
from ticketing.views_ai import SellerAIChatView, SellerAITranscriptionView


class SellerAIAvailabilityAPITests(SimpleTestCase):
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

    def chat_request(self):
        request = self.factory.post(
            "/api/ticketing/seller/ai/chat/",
            {
                "action": "message",
                "organisation_slug": self.organisation.slug,
                "text": "Book Saona for tomorrow",
            },
            format="json",
        )
        force_authenticate(request, user=self.user)
        return request

    def transcription_request(self):
        request = self.factory.post(
            "/api/ticketing/seller/ai/transcribe/",
            {
                "organisation_slug": self.organisation.slug,
                "audio": SimpleUploadedFile(
                    "seller-voice.webm",
                    b"valid-test-audio",
                    content_type="audio/webm",
                ),
            },
            format="multipart",
        )
        force_authenticate(request, user=self.user)
        return request

    def common_chat_patches(self, seller):
        return (
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
            patch.object(
                SellerAIChatView,
                "_resolve_request_seller",
                create=True,
                return_value=seller,
            ),
        )

    def test_seller_ai_model_flag_defaults_to_enabled(self):
        field = Seller._meta.get_field("seller_ai_enabled")

        self.assertIs(field.default, True)

    def test_disabled_seller_chat_is_forbidden_before_agent_creation(self):
        seller = SimpleNamespace(
            id=7,
            organisation_id=self.organisation.id,
            user_id=self.user.id,
            seller_ai_enabled=False,
            is_active=True,
        )

        with ExitStack() as stack:
            for patcher in self.common_chat_patches(seller):
                stack.enter_context(patcher)
            create_agent = stack.enter_context(
                patch(
                    "ticketing.views_ai.SellerBookingAgentFactory.create_from_request"
                )
            )
            response = SellerAIChatView.as_view()(self.chat_request())

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "seller_ai_disabled")
        create_agent.assert_not_called()

    def test_enabled_seller_in_same_organisation_can_use_chat(self):
        seller = SimpleNamespace(
            id=8,
            organisation_id=self.organisation.id,
            user_id=self.user.id,
            seller_ai_enabled=True,
            is_active=True,
        )
        agent = StatefulSellerAIAgent()

        with ExitStack() as stack:
            for patcher in self.common_chat_patches(seller):
                stack.enter_context(patcher)
            create_agent = stack.enter_context(
                patch(
                    "ticketing.views_ai.SellerBookingAgentFactory.create_from_request",
                    return_value=agent,
                )
            )
            stack.enter_context(
                patch.object(
                    SellerAIChatView,
                    "_response_status",
                    return_value=200,
                )
            )
            response = SellerAIChatView.as_view()(self.chat_request())

        self.assertEqual(response.status_code, 200)
        create_agent.assert_called_once()

    def test_disabling_one_seller_does_not_disable_another_seller(self):
        disabled_seller = SimpleNamespace(
            id=7,
            organisation_id=self.organisation.id,
            user_id=101,
            seller_ai_enabled=False,
            is_active=True,
        )
        enabled_seller = SimpleNamespace(
            id=8,
            organisation_id=self.organisation.id,
            user_id=102,
            seller_ai_enabled=True,
            is_active=True,
        )
        agent = StatefulSellerAIAgent()

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
            patch.object(
                SellerAIChatView,
                "_resolve_request_seller",
                create=True,
                side_effect=[disabled_seller, enabled_seller],
            ),
            patch(
                "ticketing.views_ai.SellerBookingAgentFactory.create_from_request",
                return_value=agent,
            ) as create_agent,
            patch.object(
                SellerAIChatView,
                "_response_status",
                return_value=200,
            ),
        ):
            disabled_response = SellerAIChatView.as_view()(self.chat_request())
            enabled_response = SellerAIChatView.as_view()(self.chat_request())

        self.assertEqual(disabled_response.status_code, 403)
        self.assertEqual(
            disabled_response.data["code"],
            "seller_ai_disabled",
        )
        self.assertEqual(enabled_response.status_code, 200)
        create_agent.assert_called_once()

    def test_disabled_seller_cannot_call_voice_transcription_provider(self):
        seller = SimpleNamespace(
            id=7,
            organisation_id=self.organisation.id,
            user_id=self.user.id,
            seller_ai_enabled=False,
            is_active=True,
        )
        transcription_result = SimpleNamespace(
            transcript="Saona tomorrow",
            language="en",
            duration_ms=1000,
            confidence=1.0,
        )

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
            patch.object(
                SellerAIChatView,
                "_resolve_request_seller",
                create=True,
                return_value=seller,
            ),
            patch.object(
                SellerAITranscriptionView,
                "_resolve_transcription_config",
                return_value={
                    "api_key": "test-key",
                    "model": "test-model",
                    "base_url": "",
                },
            ),
            patch(
                "ticketing.views_ai.SellerAudioTranscriber"
            ) as transcriber_class,
        ):
            transcriber_class.return_value.transcribe.return_value = (
                transcription_result
            )
            response = SellerAITranscriptionView.as_view()(
                self.transcription_request()
            )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "seller_ai_disabled")
        transcriber_class.assert_not_called()


if __name__ == "__main__":
    import unittest

    unittest.main()
