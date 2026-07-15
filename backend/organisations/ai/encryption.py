"""
Encryption helpers for organisation-level AI provider credentials.

Required Django setting:

    ORGANISATION_AI_ENCRYPTION_KEY = env(
        "ORGANISATION_AI_ENCRYPTION_KEY"
    )

The configured value must be a valid Fernet key. Generate one with:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Never commit the generated key to source control.
"""

from __future__ import annotations

from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


ENCRYPTED_VALUE_PREFIX = "fernet:v1:"


class AIEncryptionError(Exception):
    """Base exception for AI credential encryption failures."""


class AIEncryptionConfigurationError(AIEncryptionError):
    """Raised when the encryption service is not configured correctly."""


class AISecretDecryptionError(AIEncryptionError):
    """Raised when an encrypted secret cannot be decrypted safely."""


def _normalise_key(raw_key: object) -> bytes:
    key = str(raw_key or "").strip()

    if not key:
        raise AIEncryptionConfigurationError(
            "ORGANISATION_AI_ENCRYPTION_KEY is not configured."
        )

    try:
        key_bytes = key.encode("utf-8")
        Fernet(key_bytes)
    except (TypeError, ValueError) as exc:
        raise AIEncryptionConfigurationError(
            "ORGANISATION_AI_ENCRYPTION_KEY must be a valid Fernet key."
        ) from exc

    return key_bytes


@lru_cache(maxsize=1)
def get_fernet() -> Fernet:
    """
    Return the configured Fernet instance.

    The instance is cached for the lifetime of the Django process.
    """
    raw_key = getattr(
        settings,
        "ORGANISATION_AI_ENCRYPTION_KEY",
        "",
    )

    return Fernet(_normalise_key(raw_key))


def is_encrypted_secret(value: object) -> bool:
    """Return True when the value uses the supported encrypted format."""
    return str(value or "").startswith(ENCRYPTED_VALUE_PREFIX)


def encrypt_secret(plain_text: object) -> str:
    """
    Encrypt a secret for database storage.

    Empty input returns an empty string so callers can clear credentials safely.
    """
    value = str(plain_text or "").strip()

    if not value:
        return ""

    encrypted = get_fernet().encrypt(value.encode("utf-8")).decode("utf-8")
    return f"{ENCRYPTED_VALUE_PREFIX}{encrypted}"


def decrypt_secret(encrypted_value: object) -> str:
    """
    Decrypt a value previously produced by encrypt_secret().

    Plain-text values are intentionally rejected to prevent silently accepting
    credentials that were stored without encryption.
    """
    value = str(encrypted_value or "").strip()

    if not value:
        return ""

    if not is_encrypted_secret(value):
        raise AISecretDecryptionError(
            "The stored AI provider credential is not encrypted."
        )

    token = value[len(ENCRYPTED_VALUE_PREFIX):]

    try:
        return get_fernet().decrypt(
            token.encode("utf-8")
        ).decode("utf-8")
    except (InvalidToken, ValueError, TypeError) as exc:
        raise AISecretDecryptionError(
            "The stored AI provider credential could not be decrypted."
        ) from exc


def clear_encryption_cache() -> None:
    """
    Clear the cached Fernet instance.

    Useful in tests or after changing settings at runtime.
    """
    get_fernet.cache_clear()
