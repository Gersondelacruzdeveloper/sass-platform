# ticketing/ai/seller/factory.py

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Mapping

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db.models import Model
from django.http import HttpRequest

from organisations.ai.service import (
    OrganisationAICredentialError,
    OrganisationAIService,
)

from .agent import SellerBookingAgent
from .api_client import (
    SellerApiCredentials,
    SellerBookingApiClient,
)
from .conversation_store import SellerConversationStore
from .interpreter import OpenAISellerMessageInterpreter
from .memory_service import SellerMemoryService
from .workflow import SellerBookingWorkflow


logger = logging.getLogger(__name__)


class SellerAgentConfigurationError(Exception):
    """
    Raised when the seller AI agent cannot be constructed safely.
    """


@dataclass(frozen=True)
class ResolvedOrganisationAISettings:
    """
    Normalised organisation AI configuration.

    The API key must never be returned to the frontend, logs, agent responses,
    conversation state, or seller memory.
    """

    organisation_id: int | None
    provider: str
    is_enabled: bool
    default_model: str
    api_key: str
    ai_ready: bool

    def safe_dict(self) -> dict[str, Any]:
        return {
            "organisation_id": self.organisation_id,
            "provider": self.provider,
            "is_enabled": self.is_enabled,
            "default_model": self.default_model,
            "has_api_key": bool(self.api_key),
            "ai_ready": self.ai_ready,
        }


class SellerBookingAgentFactory:
    """
    Constructs the seller booking assistant and its dependencies.

    The factory:

    1. Resolves the organisation slug.
    2. Resolves organisation-specific AI settings.
    3. Extracts the authenticated seller credentials.
    4. Creates the existing Ticketing API client.
    5. Creates the interpreter.
    6. Creates conversation and language-memory stores.
    7. Creates the booking workflow.
    8. Returns the fully configured SellerBookingAgent.

    It does not run a conversation itself.
    """

    SUPPORTED_PROVIDERS = {"openai"}

    def __init__(
        self,
        *,
        conversation_store: SellerConversationStore | None = None,
        memory_service: SellerMemoryService | None = None,
        workflow: SellerBookingWorkflow | None = None,
    ) -> None:
        self.conversation_store = (
            conversation_store or SellerConversationStore()
        )
        self.memory_service = (
            memory_service or SellerMemoryService()
        )
        self.workflow = workflow or SellerBookingWorkflow()

    def create_from_request(
        self,
        *,
        request: HttpRequest,
        organisation_slug: str | None = None,
        organisation: Any = None,
        ai_settings: Any = None,
    ) -> SellerBookingAgent:
        """
        Construct an agent using the current authenticated HTTP request.

        Prefer passing the already-resolved organisation from the view when
        available. This avoids performing another organisation lookup.
        """

        resolved_slug = self._resolve_organisation_slug(
            request=request,
            explicit_slug=organisation_slug,
            organisation=organisation,
        )

        resolved_ai_settings = self.resolve_ai_settings(
            organisation=organisation,
            ai_settings=ai_settings,
        )

        self._validate_ai_settings(resolved_ai_settings)

        credentials = SellerApiCredentials.from_request(request)

        api_client = SellerBookingApiClient(
            organisation_slug=resolved_slug,
            credentials=credentials,
            base_url=self._resolve_internal_api_url(request),
        )

        interpreter = self._create_interpreter(
            resolved_ai_settings
        )

        return SellerBookingAgent(
            api_client=api_client,
            conversation_store=self.conversation_store,
            memory_service=self.memory_service,
            interpreter=interpreter,
            workflow=self.workflow,
        )

    def create(
        self,
        *,
        organisation_slug: str,
        credentials: SellerApiCredentials,
        ai_settings: Any,
        organisation: Any = None,
        base_url: str | None = None,
    ) -> SellerBookingAgent:
        """
        Construct an agent outside an HTTP view.

        Useful for tests, Celery jobs, voice adapters and WhatsApp adapters.
        """

        clean_slug = self._required_string(
            organisation_slug,
            "organisation_slug",
        )

        resolved_ai_settings = self.resolve_ai_settings(
            organisation=organisation,
            ai_settings=ai_settings,
        )

        self._validate_ai_settings(resolved_ai_settings)

        api_client = SellerBookingApiClient(
            organisation_slug=clean_slug,
            credentials=credentials,
            base_url=base_url,
        )

        interpreter = self._create_interpreter(
            resolved_ai_settings
        )

        return SellerBookingAgent(
            api_client=api_client,
            conversation_store=self.conversation_store,
            memory_service=self.memory_service,
            interpreter=interpreter,
            workflow=self.workflow,
        )

    # ------------------------------------------------------------------
    # AI settings
    # ------------------------------------------------------------------

    def resolve_ai_settings(
        self,
        *,
        organisation: Any = None,
        ai_settings: Any = None,
    ) -> ResolvedOrganisationAISettings:
        """
        Normalise an OrganisationAISettings instance or mapping.

        When ai_settings is omitted, this attempts to read a settings relation
        from the provided organisation.
        """

        source = ai_settings

        if source is None and organisation is not None:
            source = self._get_ai_settings_from_organisation(
                organisation
            )

        if source is None:
            raise SellerAgentConfigurationError(
                "AI settings are not configured for this organisation."
            )

        provider = self._read_value(
            source,
            "provider",
            default="openai",
        ).lower()

        is_enabled = self._read_bool(
            source,
            "is_enabled",
            default=False,
        )

        default_model = self._read_value(
            source,
            "default_model",
            default=getattr(
                settings,
                "SELLER_AI_DEFAULT_MODEL",
                "gpt-5-mini",
            ),
        )

        api_key = self._resolve_provider_api_key(
            source=source,
            organisation=organisation,
        )

        organisation_id = self._optional_int(
            self._read_raw_value(
                source,
                "organisation_id",
                default=None,
            )
        )

        if organisation_id is None:
            organisation_value = self._read_raw_value(
                source,
                "organisation",
                default=None,
            )

            organisation_id = self._extract_model_id(
                organisation_value
            )

        ai_ready_field = self._read_raw_value(
            source,
            "ai_ready",
            default=None,
        )

        if ai_ready_field is None:
            ai_ready = (
                is_enabled
                and provider in self.SUPPORTED_PROVIDERS
                and bool(api_key)
                and bool(default_model)
            )
        else:
            ai_ready = bool(ai_ready_field)

        return ResolvedOrganisationAISettings(
            organisation_id=organisation_id,
            provider=provider,
            is_enabled=is_enabled,
            default_model=default_model,
            api_key=api_key,
            ai_ready=ai_ready,
        )

    def _resolve_provider_api_key(
        self,
        *,
        source: Any,
        organisation: Any = None,
    ) -> str:
        """
        Resolve a usable, decrypted provider API key.

        OrganisationAISettings stores ``provider_api_key`` encrypted. When a
        real organisation model is available, credential decryption must go
        through OrganisationAIService, which is the project's central AI
        credential boundary.

        Mapping and lightweight test doubles remain supported, but encrypted
        ``fernet:`` values are never returned to the OpenAI client.
        """

        if (
            organisation is not None
            and isinstance(organisation, Model)
            and not isinstance(source, Mapping)
        ):
            try:
                service = OrganisationAIService(organisation)
                clean_value = str(
                    service.get_decrypted_api_key(
                        ai_settings=source,
                    )
                    or ""
                ).strip()
            except OrganisationAICredentialError:
                logger.exception(
                    "Could not decrypt the organisation AI API key.",
                    extra={
                        "organisation_id": getattr(
                            organisation,
                            "pk",
                            None,
                        ),
                    },
                )
            else:
                if self._is_usable_provider_api_key(clean_value):
                    return clean_value

        getter_names = (
            "get_provider_api_key",
            "get_decrypted_api_key",
            "decrypt_api_key",
        )

        for getter_name in getter_names:
            getter = self._read_raw_value(
                source,
                getter_name,
                default=None,
            )

            if not callable(getter):
                continue

            try:
                clean_value = str(getter() or "").strip()
            except Exception:
                logger.exception(
                    "Could not resolve the organisation AI API key.",
                    extra={"key_source": getter_name},
                )
                continue

            if self._is_usable_provider_api_key(clean_value):
                return clean_value

        key_names = (
            "decrypted_api_key",
            "provider_api_key",
            "openai_api_key",
            "api_key",
        )

        for key_name in key_names:
            value = self._read_raw_value(
                source,
                key_name,
                default=None,
            )

            if callable(value):
                try:
                    value = value()
                except Exception:
                    logger.exception(
                        "Could not resolve the organisation AI API key.",
                        extra={"key_source": key_name},
                    )
                    continue

            clean_value = str(value or "").strip()

            if self._is_usable_provider_api_key(clean_value):
                return clean_value

            if clean_value.startswith("fernet:"):
                logger.warning(
                    "Ignored encrypted organisation AI API key value.",
                    extra={"key_source": key_name},
                )

        fallback_allowed = bool(
            getattr(
                settings,
                "SELLER_AI_ALLOW_GLOBAL_API_KEY_FALLBACK",
                False,
            )
        )

        if fallback_allowed:
            fallback_key = str(
                getattr(settings, "OPENAI_API_KEY", "") or ""
            ).strip()

            if self._is_usable_provider_api_key(fallback_key):
                return fallback_key

        return ""

    @staticmethod
    def _is_usable_provider_api_key(value: str) -> bool:
        """
        Return True only for a non-empty, already-decrypted credential.
        """

        clean_value = str(value or "").strip()

        return bool(
            clean_value
            and not clean_value.startswith("fernet:")
        )

    @staticmethod
    def _get_ai_settings_from_organisation(
        organisation: Any,
    ) -> Any:
        """
        Supports common reverse-relation names.

        Adjust the tuple when the actual model relation has another name.
        """

        relation_names = (
            "ai_settings",
            "organisation_ai_settings",
            "organisationaisettings",
        )

        for relation_name in relation_names:
            try:
                value = getattr(organisation, relation_name)
            except (
                AttributeError,
                ObjectDoesNotExist,
            ):
                continue

            if value is not None:
                return value

        return None

    def _validate_ai_settings(
        self,
        ai_settings: ResolvedOrganisationAISettings,
    ) -> None:
        if not ai_settings.is_enabled:
            raise SellerAgentConfigurationError(
                "AI is disabled for this organisation."
            )

        if ai_settings.provider not in self.SUPPORTED_PROVIDERS:
            raise SellerAgentConfigurationError(
                (
                    "Unsupported AI provider: "
                    f"{ai_settings.provider or 'unknown'}."
                )
            )

        if not ai_settings.api_key:
            raise SellerAgentConfigurationError(
                "The organisation does not have an AI API key configured."
            )

        if not ai_settings.default_model:
            raise SellerAgentConfigurationError(
                "The organisation does not have an AI model configured."
            )

        if not ai_settings.ai_ready:
            raise SellerAgentConfigurationError(
                "The organisation AI configuration is not ready."
            )

    # ------------------------------------------------------------------
    # Dependency creation
    # ------------------------------------------------------------------

    @staticmethod
    def _create_interpreter(
        ai_settings: ResolvedOrganisationAISettings,
    ) -> OpenAISellerMessageInterpreter:
        if ai_settings.provider != "openai":
            raise SellerAgentConfigurationError(
                f"Unsupported AI provider: {ai_settings.provider}."
            )

        return OpenAISellerMessageInterpreter(
            api_key=ai_settings.api_key,
            model=ai_settings.default_model,
            timeout=getattr(
                settings,
                "SELLER_AI_INTERPRETER_TIMEOUT_SECONDS",
                30,
            ),
            max_output_tokens=getattr(
                settings,
                "SELLER_AI_MAX_OUTPUT_TOKENS",
                1800,
            ),
        )

    # ------------------------------------------------------------------
    # Organisation and request resolution
    # ------------------------------------------------------------------

    def _resolve_organisation_slug(
        self,
        *,
        request: HttpRequest,
        explicit_slug: str | None,
        organisation: Any,
    ) -> str:
        candidates = [
            explicit_slug,
            self._extract_organisation_slug(organisation),
            request.query_params.get("organisation_slug")
            if hasattr(request, "query_params")
            else None,
            request.query_params.get("slug")
            if hasattr(request, "query_params")
            else None,
            request.GET.get("organisation_slug"),
            request.GET.get("slug"),
            request.headers.get("X-Organisation-Slug"),
        ]

        request_organisation = getattr(
            request,
            "organisation",
            None,
        )

        candidates.append(
            self._extract_organisation_slug(
                request_organisation
            )
        )

        user = getattr(request, "user", None)
        user_organisation = getattr(
            user,
            "organisation",
            None,
        )

        candidates.append(
            self._extract_organisation_slug(
                user_organisation
            )
        )

        for candidate in candidates:
            clean_candidate = str(candidate or "").strip()

            if clean_candidate:
                return clean_candidate

        raise SellerAgentConfigurationError(
            "The organisation slug could not be resolved."
        )

    @staticmethod
    def _resolve_internal_api_url(
        request: HttpRequest,
    ) -> str | None:
        configured_url = str(
            getattr(
                settings,
                "TICKETING_INTERNAL_API_URL",
                "",
            )
            or ""
        ).strip()

        if configured_url:
            return configured_url

        allow_request_host = bool(
            getattr(
                settings,
                "SELLER_AI_ALLOW_REQUEST_HOST_API_URL",
                settings.DEBUG,
            )
        )

        if not allow_request_host:
            return None

        api_prefix = str(
            getattr(
                settings,
                "SELLER_AI_API_PREFIX",
                "/api/",
            )
            or "/api/"
        )

        return request.build_absolute_uri(api_prefix)

    @staticmethod
    def _extract_organisation_slug(
        organisation: Any,
    ) -> str:
        if organisation is None:
            return ""

        if isinstance(organisation, Mapping):
            return str(
                organisation.get("slug")
                or organisation.get("organisation_slug")
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

    # ------------------------------------------------------------------
    # Generic value helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _read_raw_value(
        source: Any,
        key: str,
        *,
        default: Any,
    ) -> Any:
        if isinstance(source, Mapping):
            return source.get(key, default)

        return getattr(source, key, default)

    @classmethod
    def _read_value(
        cls,
        source: Any,
        key: str,
        *,
        default: str,
    ) -> str:
        value = cls._read_raw_value(
            source,
            key,
            default=default,
        )

        return str(value or default).strip()

    @classmethod
    def _read_bool(
        cls,
        source: Any,
        key: str,
        *,
        default: bool,
    ) -> bool:
        value = cls._read_raw_value(
            source,
            key,
            default=default,
        )

        if isinstance(value, str):
            return value.strip().lower() in {
                "1",
                "true",
                "yes",
                "on",
            }

        return bool(value)

    @staticmethod
    def _extract_model_id(
        value: Any,
    ) -> int | None:
        if value is None:
            return None

        if isinstance(value, Mapping):
            return SellerBookingAgentFactory._optional_int(
                value.get("id")
            )

        return SellerBookingAgentFactory._optional_int(
            getattr(value, "id", value)
        )

    @staticmethod
    def _optional_int(
        value: Any,
    ) -> int | None:
        if value in (None, ""):
            return None

        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _required_string(
        value: Any,
        field_name: str,
    ) -> str:
        clean_value = str(value or "").strip()

        if not clean_value:
            raise ValueError(f"{field_name} is required.")

        return clean_value


try:
    from django.core.exceptions import ObjectDoesNotExist
except ImportError:  # pragma: no cover
    class ObjectDoesNotExist(Exception):
        pass