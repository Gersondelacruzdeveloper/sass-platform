"""
Provider abstraction for organisation-level AI features.

This module keeps third-party SDK calls out of serializers, views, models,
and ticketing translation services.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

from .constants import OPENAI


class AIProviderError(Exception):
    """Base exception for AI provider failures."""


class AIProviderConfigurationError(AIProviderError):
    """Raised when a provider is missing required configuration."""


class AIProviderRequestError(AIProviderError):
    """Raised when a provider request fails."""


class UnsupportedAIProviderError(AIProviderError):
    """Raised when the requested provider is not supported."""


@dataclass(frozen=True)
class AITextResult:
    text: str
    provider: str
    model: str
    response_id: str = ""
    raw_response: Any = None


class BaseAIProvider(ABC):
    provider_name: str

    def __init__(
        self,
        *,
        api_key: str,
        default_model: str,
        timeout_seconds: float = 60.0,
    ) -> None:
        self.api_key = str(api_key or "").strip()
        self.default_model = str(default_model or "").strip()
        self.timeout_seconds = float(timeout_seconds)

        if not self.api_key:
            raise AIProviderConfigurationError(
                f"{self.provider_name} API key is not configured."
            )

        if not self.default_model:
            raise AIProviderConfigurationError(
                f"{self.provider_name} default model is not configured."
            )

    @abstractmethod
    def generate_text(
        self,
        *,
        instructions: str,
        input_text: str,
        model: str | None = None,
    ) -> AITextResult:
        """Generate text using the configured provider."""

    @abstractmethod
    def test_connection(self) -> bool:
        """Verify that the configured provider credentials work."""


class OpenAIProvider(BaseAIProvider):
    provider_name = OPENAI

    def _build_client(self):
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise AIProviderConfigurationError(
                "The openai package is not installed. "
                "Install it with: pip install openai"
            ) from exc

        return OpenAI(
            api_key=self.api_key,
            timeout=self.timeout_seconds,
            max_retries=2,
        )

    def generate_text(
        self,
        *,
        instructions: str,
        input_text: str,
        model: str | None = None,
    ) -> AITextResult:
        resolved_model = str(model or self.default_model).strip()

        if not resolved_model:
            raise AIProviderConfigurationError(
                "An OpenAI model must be configured."
            )

        try:
            client = self._build_client()
            response = client.responses.create(
                model=resolved_model,
                instructions=str(instructions or "").strip(),
                input=str(input_text or "").strip(),
            )
        except AIProviderError:
            raise
        except Exception as exc:
            raise AIProviderRequestError(
                "OpenAI could not complete the request."
            ) from exc

        output_text = str(
            getattr(response, "output_text", "") or ""
        ).strip()

        if not output_text:
            raise AIProviderRequestError(
                "OpenAI returned an empty response."
            )

        return AITextResult(
            text=output_text,
            provider=self.provider_name,
            model=resolved_model,
            response_id=str(getattr(response, "id", "") or ""),
            raw_response=response,
        )

    def test_connection(self) -> bool:
        try:
            client = self._build_client()
            client.models.list()
        except AIProviderError:
            raise
        except Exception as exc:
            raise AIProviderRequestError(
                "OpenAI credentials could not be verified."
            ) from exc

        return True


def get_ai_provider(
    *,
    provider: str,
    api_key: str,
    default_model: str,
    timeout_seconds: float = 60.0,
) -> BaseAIProvider:
    provider_name = str(provider or "").strip().lower()

    if provider_name == OPENAI:
        return OpenAIProvider(
            api_key=api_key,
            default_model=default_model,
            timeout_seconds=timeout_seconds,
        )

    raise UnsupportedAIProviderError(
        f"Unsupported AI provider: {provider_name or 'unknown'}."
    )
