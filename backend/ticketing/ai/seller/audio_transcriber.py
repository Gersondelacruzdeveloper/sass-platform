from __future__ import annotations

import io
import logging
from dataclasses import dataclass

from django.conf import settings
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
    def __init__(self) -> None:
        api_key = getattr(settings, "OPENAI_API_KEY", "")
        if not api_key:
            raise SellerAudioTranscriptionError(
                "OPENAI_API_KEY is not configured."
            )

        self.client = OpenAI(api_key=api_key)
        self.model = getattr(
            settings,
            "SELLER_AI_TRANSCRIPTION_MODEL",
            "gpt-4o-transcribe",
        )

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
            prompt += f"Relevant booking vocabulary: {vocabulary_hint[:1500]}"

        try:
            response = self.client.audio.transcriptions.create(
                model=self.model,
                file=audio_file,
                prompt=prompt,
                response_format="json",
            )
        except Exception as exc:
            logger.exception("OpenAI seller transcription failed.")
            raise SellerAudioTranscriptionError(
                "The voice transcription service is temporarily unavailable."
            ) from exc

        transcript = str(getattr(response, "text", "") or "").strip()
        if not transcript:
            raise SellerAudioTranscriptionError(
                "No speech could be detected in the recording."
            )

        language = str(getattr(response, "language", "") or "").strip()

        return SellerTranscriptionResult(
            transcript=transcript,
            language=language,
            duration_ms=max(0, duration_ms),
            confidence=None,
        )
