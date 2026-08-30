# ticketing/views_ai.py

from __future__ import annotations

import inspect
import logging
from pathlib import Path
from typing import Any, Mapping

from django.apps import apps
from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Model
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from organisations.ai.service import (
    OrganisationAIService,
    OrganisationAIServiceError,
)

from .ai.seller.factory import (
    SellerAgentConfigurationError,
    SellerBookingAgentFactory,
)

from .ai.seller.audio_transcriber import (
    SellerAudioTranscriber,
    SellerAudioTranscriptionError,
)


logger = logging.getLogger(__name__)


class SellerAITranscriptionView(APIView):
    """
    Authenticated seller voice-transcription endpoint.

    POST /api/ticketing/seller/ai/transcribe/

    Multipart form fields:

    - audio: recorded audio file
    - organisation_slug: current organisation
    - duration_ms: optional recording duration

    This endpoint only transcribes audio. The frontend sends the returned
    transcript to SellerAIChatView so the existing booking workflow remains
    the source of truth.
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    MAX_AUDIO_BYTES = 15 * 1024 * 1024
    ALLOWED_EXTENSIONS = {
        ".flac",
        ".m4a",
        ".mp3",
        ".mp4",
        ".mpeg",
        ".mpga",
        ".ogg",
        ".wav",
        ".webm",
    }

    def post(
        self,
        request: Request,
        *args: Any,
        **kwargs: Any,
    ) -> Response:
        audio = request.FILES.get("audio")

        if audio is None:
            return Response(
                {
                    "detail": "An audio file is required.",
                    "code": "audio_required",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if audio.size <= 0:
            return Response(
                {
                    "detail": "The audio file is empty.",
                    "code": "audio_empty",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if audio.size > self.MAX_AUDIO_BYTES:
            return Response(
                {
                    "detail": "The audio recording is too large.",
                    "code": "audio_too_large",
                    "maximum_bytes": self.MAX_AUDIO_BYTES,
                },
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        extension = Path(audio.name or "").suffix.lower()

        if extension not in self.ALLOWED_EXTENSIONS:
            return Response(
                {
                    "detail": "Unsupported audio format.",
                    "code": "unsupported_audio_format",
                    "supported_extensions": sorted(
                        self.ALLOWED_EXTENSIONS
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            duration_ms = max(
                0,
                int(request.data.get("duration_ms") or 0),
            )
        except (TypeError, ValueError):
            duration_ms = 0

        organisation_slug = SellerAIChatView()._resolve_organisation_slug(
            request=request,
            payload=request.data,
            kwargs=kwargs,
        )

        if not organisation_slug:
            return Response(
                {
                    "detail": "The organisation slug is required.",
                    "code": "organisation_slug_required",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        chat_view = SellerAIChatView()

        organisation = chat_view._resolve_organisation(
            request=request,
            organisation_slug=organisation_slug,
        )

        if organisation is None:
            return Response(
                {
                    "detail": "The organisation was not found.",
                    "code": "organisation_not_found",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if not chat_view._user_can_access_organisation(
            request=request,
            organisation=organisation,
        ):
            return Response(
                {
                    "detail": (
                        "You do not have access to this organisation."
                    ),
                    "code": "organisation_access_denied",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        seller_ai_denied = chat_view._seller_ai_denied_response(
            request=request,
            organisation=organisation,
        )

        if seller_ai_denied is not None:
            return seller_ai_denied

        vocabulary_hint = self._build_vocabulary_hint(
            organisation=organisation,
        )

        ai_settings = chat_view._resolve_ai_settings(
            organisation=organisation,
        )

        if ai_settings is None:
            return Response(
                {
                    "detail": (
                        "AI settings are not configured for this "
                        "organisation."
                    ),
                    "code": "ai_settings_not_configured",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            transcription_config = self._resolve_transcription_config(
                organisation=organisation,
                ai_settings=ai_settings,
            )
        except SellerAudioTranscriptionError as exc:
            return Response(
                {
                    "detail": str(exc),
                    "code": "transcription_provider_not_configured",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            transcriber = SellerAudioTranscriber(
                api_key=transcription_config["api_key"],
                model=transcription_config["model"],
                base_url=transcription_config.get("base_url"),
            )

            result = transcriber.transcribe(
                content=audio.read(),
                filename=audio.name or "seller-voice.webm",
                content_type=(
                    audio.content_type
                    or "application/octet-stream"
                ),
                duration_ms=duration_ms,
                vocabulary_hint=vocabulary_hint,
            )
        except SellerAudioTranscriptionError as exc:
            logger.info(
                "Seller voice transcription failed.",
                extra={
                    "organisation_slug": organisation_slug,
                    "user_id": getattr(
                        request.user,
                        "id",
                        None,
                    ),
                    "filename": audio.name,
                    "content_type": audio.content_type,
                    "audio_size": audio.size,
                    "error": str(exc),
                },
            )

            return Response(
                {
                    "detail": str(exc),
                    "code": "seller_audio_transcription_failed",
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except Exception:
            logger.exception(
                "Unexpected seller voice transcription failure.",
                extra={
                    "organisation_slug": organisation_slug,
                    "user_id": getattr(
                        request.user,
                        "id",
                        None,
                    ),
                    "filename": audio.name,
                    "content_type": audio.content_type,
                    "audio_size": audio.size,
                },
            )

            return Response(
                {
                    "detail": (
                        "The voice recording could not be transcribed."
                    ),
                    "code": "seller_audio_transcription_error",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "transcript": result.transcript,
                "language": result.language,
                "duration_ms": result.duration_ms,
                "confidence": result.confidence,
                "organisation_slug": organisation_slug,
            },
            status=status.HTTP_200_OK,
        )

    @classmethod
    def _resolve_transcription_config(
        cls,
        *,
        organisation: Any,
        ai_settings: Any,
    ) -> dict[str, str]:
        """
        Resolve organisation-specific transcription credentials.

        OrganisationAISettings stores provider_api_key encrypted. The
        OrganisationAIService is the single source of truth for decrypting
        and validating that credential.
        """

        provider = str(
            getattr(ai_settings, "provider", "") or ""
        ).strip().lower()

        if provider and provider not in {
            "openai",
            "azure_openai",
            "azure-openai",
        }:
            raise SellerAudioTranscriptionError(
                "Voice transcription currently requires an OpenAI "
                "provider configured for this organisation."
            )

        try:
            ai_service = OrganisationAIService(organisation)
            decrypt_method = ai_service.get_decrypted_api_key
            parameters = inspect.signature(
                decrypt_method
            ).parameters

            if "settings" in parameters:
                api_key = decrypt_method(
                    settings=ai_settings,
                )
            elif "ai_settings" in parameters:
                api_key = decrypt_method(
                    ai_settings=ai_settings,
                )
            else:
                api_key = decrypt_method()
        except OrganisationAIServiceError as exc:
            raise SellerAudioTranscriptionError(
                "The organisation's AI provider API key could not "
                "be decrypted."
            ) from exc
        except (TypeError, ValueError) as exc:
            logger.exception(
                "Could not resolve the organisation AI credential.",
                extra={
                    "organisation_id": getattr(
                        organisation,
                        "id",
                        None,
                    ),
                    "organisation_slug": getattr(
                        organisation,
                        "slug",
                        "",
                    ),
                },
            )
            raise SellerAudioTranscriptionError(
                "The organisation's AI provider configuration is "
                "invalid."
            ) from exc

        clean_api_key = str(api_key or "").strip()

        if not clean_api_key:
            raise SellerAudioTranscriptionError(
                "The organisation's OpenAI API key is not configured."
            )

        if clean_api_key.startswith("fernet:"):
            raise SellerAudioTranscriptionError(
                "The organisation's AI provider API key was not "
                "decrypted."
            )

        model = str(
            getattr(
                ai_settings,
                "transcription_model",
                "",
            )
            or getattr(
                ai_settings,
                "audio_transcription_model",
                "",
            )
            or "gpt-4o-transcribe"
        ).strip()

        base_url = str(
            getattr(
                ai_settings,
                "provider_base_url",
                "",
            )
            or getattr(
                ai_settings,
                "base_url",
                "",
            )
            or ""
        ).strip()

        return {
            "api_key": clean_api_key,
            "model": model,
            "base_url": base_url,
        }

    @staticmethod
    def _build_vocabulary_hint(
        *,
        organisation: Any,
    ) -> str:
        """
        Start with reliable booking vocabulary.

        Product, option, hotel, and pickup names can be added dynamically
        later through the existing Ticketing APIs. Do not trust client-sent
        vocabulary as authoritative data.
        """

        organisation_name = str(
            getattr(organisation, "name", "") or ""
        ).strip()

        values = [
            organisation_name,
            "Coco Bongo",
            "Gold Member",
            "Premium Open Bar",
            "Front Row",
            "Punta Cana",
            "Bávaro",
            "Uvero Alto",
            "Cap Cana",
            "Hard Rock Hotel",
        ]

        return ", ".join(
            value
            for value in values
            if value
        )


class SellerAIChatView(APIView):
    """
    Authenticated conversational endpoint for seller bookings.

    POST /api/ticketing/seller/ai/chat/

    Supported actions:

    - message: process a seller message
    - start: create a new conversation
    - reset: reset the current booking draft
    - cancel: cancel the current booking conversation
    - state: return the current conversation state

    This endpoint does not create booking logic itself. It delegates to:

    - SellerBookingAgent
    - SellerBookingWorkflow
    - SellerBookingApiClient
    - existing Ticketing APIs and serializers
    """

    permission_classes = [IsAuthenticated]

    def post(
        self,
        request: Request,
        *args: Any,
        **kwargs: Any,
    ) -> Response:
        payload = self._request_payload(request)

        action = str(
            payload.get("action") or "message"
        ).strip().lower()

        organisation_slug = self._resolve_organisation_slug(
            request=request,
            payload=payload,
            kwargs=kwargs,
        )

        if not organisation_slug:
            return Response(
                {
                    "detail": "The organisation slug is required.",
                    "code": "organisation_slug_required",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = self._resolve_organisation(
            request=request,
            organisation_slug=organisation_slug,
        )

        if organisation is None:
            return Response(
                {
                    "detail": "The organisation was not found.",
                    "code": "organisation_not_found",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if not self._user_can_access_organisation(
            request=request,
            organisation=organisation,
        ):
            return Response(
                {
                    "detail": (
                        "You do not have access to this organisation."
                    ),
                    "code": "organisation_access_denied",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        seller_ai_denied = self._seller_ai_denied_response(
            request=request,
            organisation=organisation,
        )

        if seller_ai_denied is not None:
            return seller_ai_denied

        ai_settings = self._resolve_ai_settings(
            organisation=organisation,
        )

        if ai_settings is None:
            return Response(
                {
                    "detail": (
                        "AI settings are not configured for this "
                        "organisation."
                    ),
                    "code": "ai_settings_not_configured",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            agent = SellerBookingAgentFactory().create_from_request(
                request=request,
                organisation_slug=organisation_slug,
                organisation=organisation,
                ai_settings=ai_settings,
            )

            if action == "start":
                return self._start_conversation(
                    agent=agent,
                    payload=payload,
                )

            if action == "message":
                return self._handle_message(
                    agent=agent,
                    payload=payload,
                )

            if action == "reset":
                return self._reset_conversation(
                    agent=agent,
                    payload=payload,
                )

            if action == "cancel":
                return self._cancel_conversation(
                    agent=agent,
                    payload=payload,
                )

            if action == "state":
                return self._get_conversation_state(
                    agent=agent,
                    payload=payload,
                )

            return Response(
                {
                    "detail": f"Unsupported action: {action}.",
                    "code": "unsupported_action",
                    "supported_actions": [
                        "message",
                        "start",
                        "reset",
                        "cancel",
                        "state",
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        except SellerAgentConfigurationError as exc:
            logger.info(
                "Seller AI configuration prevented agent creation.",
                extra={
                    "organisation_slug": organisation_slug,
                    "user_id": getattr(
                        request.user,
                        "id",
                        None,
                    ),
                    "error": str(exc),
                },
            )

            return Response(
                {
                    "detail": str(exc),
                    "code": "seller_ai_not_ready",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        except ValueError as exc:
            return Response(
                {
                    "detail": str(exc),
                    "code": "invalid_request",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        except Exception:
            logger.exception(
                "Unexpected seller AI chat endpoint failure.",
                extra={
                    "organisation_slug": organisation_slug,
                    "user_id": getattr(
                        request.user,
                        "id",
                        None,
                    ),
                    "action": action,
                },
            )

            return Response(
                {
                    "detail": (
                        "The seller assistant could not process the "
                        "request."
                    ),
                    "code": "seller_ai_error",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # ------------------------------------------------------------------
    # Actions
    # ------------------------------------------------------------------

    def _start_conversation(
        self,
        *,
        agent: Any,
        payload: Mapping[str, Any],
    ) -> Response:
        response = agent.start_conversation(
            language=self._optional_string(
                payload.get("language")
            ),
        )

        return Response(
            response.to_dict(),
            status=self._response_status(response),
        )

    def _handle_message(
        self,
        *,
        agent: Any,
        payload: Mapping[str, Any],
    ) -> Response:
        text = str(
            payload.get("text")
            or payload.get("message")
            or ""
        ).strip()

        if not text:
            return Response(
                {
                    "detail": "A seller message is required.",
                    "code": "message_required",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        metadata = payload.get("metadata")

        if not isinstance(metadata, dict):
            metadata = {}

        response = agent.handle_message(
            text=text,
            conversation_id=self._optional_string(
                payload.get("conversation_id")
            ),
            language=self._optional_string(
                payload.get("language")
            ),
            message_id=self._optional_string(
                payload.get("message_id")
            ),
            metadata=metadata,
        )

        return Response(
            response.to_dict(),
            status=self._response_status(response),
        )

    def _reset_conversation(
        self,
        *,
        agent: Any,
        payload: Mapping[str, Any],
    ) -> Response:
        conversation_id = self._required_conversation_id(
            payload
        )

        response = agent.reset_conversation(
            conversation_id=conversation_id,
        )

        return Response(
            response.to_dict(),
            status=self._response_status(response),
        )

    def _cancel_conversation(
        self,
        *,
        agent: Any,
        payload: Mapping[str, Any],
    ) -> Response:
        conversation_id = self._required_conversation_id(
            payload
        )

        response = agent.cancel_conversation(
            conversation_id=conversation_id,
        )

        return Response(
            response.to_dict(),
            status=self._response_status(response),
        )

    def _get_conversation_state(
        self,
        *,
        agent: Any,
        payload: Mapping[str, Any],
    ) -> Response:
        conversation_id = self._required_conversation_id(
            payload
        )

        conversation_state = agent.get_state(
            conversation_id=conversation_id,
        )

        if conversation_state is None:
            return Response(
                {
                    "detail": (
                        "The booking conversation was not found or has "
                        "expired."
                    ),
                    "code": "conversation_not_found",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "conversation_id": conversation_state.conversation_id,
                "status": conversation_state.status,
                "state": conversation_state.to_dict(),
            },
            status=status.HTTP_200_OK,
        )

    # ------------------------------------------------------------------
    # Organisation resolution
    # ------------------------------------------------------------------

    def _resolve_organisation_slug(
        self,
        *,
        request: Request,
        payload: Mapping[str, Any],
        kwargs: Mapping[str, Any],
    ) -> str:
        candidates = [
            payload.get("organisation_slug"),
            payload.get("slug"),
            kwargs.get("organisation_slug"),
            kwargs.get("slug"),
            request.query_params.get("organisation_slug"),
            request.query_params.get("slug"),
            request.headers.get("X-Organisation-Slug"),
            self._organisation_slug(
                getattr(request, "organisation", None)
            ),
            self._organisation_slug(
                getattr(request.user, "organisation", None)
            ),
        ]

        for candidate in candidates:
            clean_value = str(candidate or "").strip()

            if clean_value:
                return clean_value

        return ""

    def _resolve_organisation(
        self,
        *,
        request: Request,
        organisation_slug: str,
    ) -> Any:
        request_organisation = getattr(
            request,
            "organisation",
            None,
        )

        if (
            request_organisation is not None
            and self._organisation_slug(request_organisation)
            == organisation_slug
        ):
            return request_organisation

        user_organisation = getattr(
            request.user,
            "organisation",
            None,
        )

        if (
            user_organisation is not None
            and self._organisation_slug(user_organisation)
            == organisation_slug
        ):
            return user_organisation

        organisation_model = self._get_organisation_model()

        if organisation_model is None:
            logger.error(
                "The Organisation model could not be resolved."
            )
            return None

        manager = getattr(
            organisation_model,
            "objects",
            None,
        )

        if manager is None:
            return None

        try:
            return manager.get(slug=organisation_slug)
        except ObjectDoesNotExist:
            return None

    @staticmethod
    def _get_organisation_model() -> type[Model] | None:
        candidates = (
            ("organisations", "Organisation"),
            ("organizations", "Organization"),
            ("accounts", "Organisation"),
            ("core", "Organisation"),
        )

        for app_label, model_name in candidates:
            try:
                return apps.get_model(
                    app_label,
                    model_name,
                )
            except LookupError:
                continue

        return None

    # ------------------------------------------------------------------
    # AI settings resolution
    # ------------------------------------------------------------------

    def _resolve_ai_settings(
        self,
        *,
        organisation: Any,
    ) -> Any:
        relation_names = (
            "ai_settings",
            "organisation_ai_settings",
            "organisationaisettings",
        )

        for relation_name in relation_names:
            try:
                value = getattr(
                    organisation,
                    relation_name,
                )
            except (
                AttributeError,
                ObjectDoesNotExist,
            ):
                continue

            if value is not None:
                return value

        ai_settings_model = self._get_ai_settings_model()

        if ai_settings_model is None:
            return None

        organisation_id = getattr(
            organisation,
            "id",
            None,
        )

        if not organisation_id:
            return None

        manager = getattr(
            ai_settings_model,
            "objects",
            None,
        )

        if manager is None:
            return None

        try:
            return manager.get(
                organisation_id=organisation_id
            )
        except ObjectDoesNotExist:
            return None

    @staticmethod
    def _get_ai_settings_model() -> type[Model] | None:
        candidates = (
            (
                "organisations",
                "OrganisationAISettings",
            ),
            (
                "organizations",
                "OrganizationAISettings",
            ),
            (
                "core",
                "OrganisationAISettings",
            ),
        )

        for app_label, model_name in candidates:
            try:
                return apps.get_model(
                    app_label,
                    model_name,
                )
            except LookupError:
                continue

        return None

    # ------------------------------------------------------------------
    # Access control
    # ------------------------------------------------------------------

    def _resolve_request_seller(
        self,
        *,
        request: Request,
        organisation: Any,
    ) -> Any:
        """Return only the active seller owned by this user and tenant."""

        user_id = getattr(request.user, "id", None)
        organisation_id = getattr(organisation, "id", None)

        if not user_id or not organisation_id:
            return None

        try:
            seller_model = apps.get_model("ticketing", "Seller")
        except LookupError:
            return None

        return (
            seller_model.objects.filter(
                user_id=user_id,
                organisation_id=organisation_id,
                is_active=True,
            )
            .only("id", "seller_ai_enabled")
            .order_by("id")
            .first()
        )

    def _seller_ai_denied_response(
        self,
        *,
        request: Request,
        organisation: Any,
    ) -> Response | None:
        seller = self._resolve_request_seller(
            request=request,
            organisation=organisation,
        )

        if seller is None or getattr(
            seller,
            "seller_ai_enabled",
            True,
        ):
            return None

        return Response(
            {
                "detail": (
                    "The AI Booking Assistant is disabled for this seller."
                ),
                "code": "seller_ai_disabled",
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    def _user_can_access_organisation(
        self,
        *,
        request: Request,
        organisation: Any,
    ) -> bool:
        """
        Basic tenant-isolation check.

        The existing seller `/ticketing/sellers/me/` endpoint performs the
        final seller and permission validation. This check prevents a user
        from requesting another organisation's AI settings before that call.
        """

        user = request.user

        if getattr(user, "is_superuser", False):
            return True

        requested_organisation_id = getattr(
            organisation,
            "id",
            None,
        )

        user_organisation = getattr(
            user,
            "organisation",
            None,
        )

        user_organisation_id = getattr(
            user,
            "organisation_id",
            None,
        ) or getattr(
            user_organisation,
            "id",
            None,
        )

        if (
            requested_organisation_id
            and user_organisation_id
            and requested_organisation_id
            == user_organisation_id
        ):
            return True

        request_organisation = getattr(
            request,
            "organisation",
            None,
        )

        request_organisation_id = getattr(
            request_organisation,
            "id",
            None,
        )

        if (
            requested_organisation_id
            and request_organisation_id
            and requested_organisation_id
            == request_organisation_id
        ):
            return True

        organisation_users = getattr(
            organisation,
            "users",
            None,
        )

        if organisation_users is not None:
            try:
                return organisation_users.filter(
                    id=user.id
                ).exists()
            except Exception:
                logger.debug(
                    "Could not check organisation.users membership.",
                    exc_info=True,
                )

        user_organisations = getattr(
            user,
            "organisations",
            None,
        )

        if user_organisations is not None:
            try:
                return user_organisations.filter(
                    id=requested_organisation_id
                ).exists()
            except Exception:
                logger.debug(
                    "Could not check user.organisations membership.",
                    exc_info=True,
                )

        return False

    # ------------------------------------------------------------------
    # Response helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _response_status(
        agent_response: Any,
    ) -> int:
        response_status = str(
            getattr(agent_response, "status", "") or ""
        )

        if response_status == "error":
            return status.HTTP_400_BAD_REQUEST

        if (
            getattr(
                agent_response,
                "booking_created",
                False,
            )
            is True
        ):
            return status.HTTP_201_CREATED

        return status.HTTP_200_OK

    @staticmethod
    def _request_payload(
        request: Request,
    ) -> dict[str, Any]:
        if isinstance(request.data, Mapping):
            return dict(request.data)

        return {}

    @staticmethod
    def _required_conversation_id(
        payload: Mapping[str, Any],
    ) -> str:
        conversation_id = str(
            payload.get("conversation_id") or ""
        ).strip()

        if not conversation_id:
            raise ValueError(
                "conversation_id is required for this action."
            )

        return conversation_id

    @staticmethod
    def _optional_string(
        value: Any,
    ) -> str | None:
        if value is None:
            return None

        cleaned = str(value).strip()
        return cleaned or None

    @staticmethod
    def _organisation_slug(
        organisation: Any,
    ) -> str:
        if organisation is None:
            return ""

        if isinstance(organisation, Mapping):
            return str(
                organisation.get("slug")
                or organisation.get(
                    "organisation_slug"
                )
                or ""
            ).strip()

        return str(
            getattr(organisation, "slug", "")
            or getattr(
                organisation,
                "organisation_slug",
                "",
            )
            or ""
        ).strip()
    