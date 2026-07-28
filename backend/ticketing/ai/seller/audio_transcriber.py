from __future__ import annotations

import io
import logging
from dataclasses import dataclass

from openai import OpenAI

logger = logging.getLogger(__name__)


class SellerAudioTranscriptionError(RuntimeError):
    """Raised when seller audio cannot be transcribed safely."""


@dataclass(frozen=True)
class SellerTranscriptionResult:
    transcript: str
    language: str = ""
    duration_ms: int = 0
    confidence: float | None = None


class SellerAudioTranscriber:
    """
    Transcribes seller audio using credentials supplied by the organisation.

    The API key must be resolved from OrganisationAISettings before this class
    is created. It intentionally does not read a global OPENAI_API_KEY.
    """

    def __init__(
        self,
        *,
        api_key: str,
        model: str = "gpt-4o-transcribe",
        base_url: str | None = None,
    ) -> None:
        clean_api_key = str(api_key or "").strip()

        if not clean_api_key:
            raise SellerAudioTranscriptionError(
                "The organisation's OpenAI API key is not configured."
            )

        client_kwargs: dict[str, object] = {
            "api_key": clean_api_key,
        }

        if base_url:
            client_kwargs["base_url"] = str(base_url).strip()

        self.client = OpenAI(**client_kwargs)
        self.model = str(model or "gpt-4o-transcribe").strip()

    def transcribe(
        self,
        *,
        content: bytes,
        filename: str,
        content_type: str,
        duration_ms: int = 0,
        vocabulary_hint: str = "",
    ) -> SellerTranscriptionResult:
        if not content:
            raise SellerAudioTranscriptionError("The audio file is empty.")

        audio_file = io.BytesIO(content)
        audio_file.name = filename or "seller-voice.webm"

        prompt = (
            "Transcribe a seller creating a tourism or event booking. "
            "The speaker may use Dominican Spanish, English, or switch between "
            "both. Preserve customer names, hotel names, dates, quantities, "
            "prices, product names, ticket options, phone numbers and payment "
            "details exactly. Do not translate. "
        )

        if vocabulary_hint:
            prompt += (
                "Relevant booking vocabulary: "
                f"{str(vocabulary_hint)[:1500]}"
            )

        try:
            response = self.client.audio.transcriptions.create(
                model=self.model,
                file=audio_file,
                prompt=prompt,
                response_format="json",
            )
        except Exception as exc:
            logger.exception(
                "Organisation OpenAI seller transcription failed.",
                extra={
                    "model": self.model,
                    "filename": filename,
                    "content_type": content_type,
                },
            )
            raise SellerAudioTranscriptionError(
                "The voice transcription service is temporarily unavailable."
            ) from exc

        transcript = str(
            getattr(response, "text", "") or ""
        ).strip()

        if not transcript:
            raise SellerAudioTranscriptionError(
                "No speech could be detected in the recording."
            )

        language = str(
            getattr(response, "language", "") or ""
        ).strip()

        return SellerTranscriptionResult(
            transcript=transcript,
            language=language,
            duration_ms=max(0, duration_ms),
            confidence=None,
        )
