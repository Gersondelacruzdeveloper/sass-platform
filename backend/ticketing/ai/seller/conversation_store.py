# ticketing/ai/seller/conversation_store.py

from __future__ import annotations

import logging
from typing import Any

from django.conf import settings
from django.core.cache import BaseCache, caches

from .schemas import BookingConversationState


logger = logging.getLogger(__name__)


class SellerConversationStore:
    """
    Stores short-term seller booking conversation state.

    By default, this uses Django's configured cache. In production, the cache
    should normally be backed by Redis so conversations survive across
    Gunicorn workers and application containers.

    This store contains only the active booking conversation. It is not the
    seller's long-term memory.
    """

    DEFAULT_CACHE_ALIAS = "default"
    DEFAULT_TTL_SECONDS = 60 * 60 * 4
    KEY_PREFIX = "ticketing:ai:seller:conversation"

    def __init__(
        self,
        *,
        cache_alias: str | None = None,
        ttl_seconds: int | None = None,
        cache_backend: BaseCache | None = None,
        key_prefix: str | None = None,
    ) -> None:
        self.cache_alias = (
            str(cache_alias or "").strip()
            or getattr(
                settings,
                "SELLER_AI_CONVERSATION_CACHE_ALIAS",
                self.DEFAULT_CACHE_ALIAS,
            )
        )

        configured_ttl = getattr(
            settings,
            "SELLER_AI_CONVERSATION_TTL_SECONDS",
            self.DEFAULT_TTL_SECONDS,
        )

        self.ttl_seconds = self._normalise_ttl(
            ttl_seconds if ttl_seconds is not None else configured_ttl
        )

        self.key_prefix = (
            str(key_prefix or "").strip()
            or getattr(
                settings,
                "SELLER_AI_CONVERSATION_KEY_PREFIX",
                self.KEY_PREFIX,
            )
        ).rstrip(":")

        self.cache = (
            cache_backend
            if cache_backend is not None
            else caches[self.cache_alias]
        )

    def get(
        self,
        conversation_id: str,
    ) -> BookingConversationState | None:
        """
        Return a conversation state or None when it does not exist or expired.
        """

        clean_conversation_id = self._required_conversation_id(
            conversation_id
        )
        key = self._key(clean_conversation_id)

        raw_state = self.cache.get(key)

        if raw_state is None:
            return None

        if isinstance(raw_state, BookingConversationState):
            state = raw_state
        elif isinstance(raw_state, dict):
            try:
                state = BookingConversationState.from_dict(raw_state)
            except (KeyError, TypeError, ValueError):
                logger.exception(
                    "Invalid seller conversation state found in cache.",
                    extra={
                        "conversation_id": clean_conversation_id,
                        "cache_key": key,
                    },
                )
                self.cache.delete(key)
                return None
        else:
            logger.warning(
                "Unsupported seller conversation value found in cache.",
                extra={
                    "conversation_id": clean_conversation_id,
                    "cache_key": key,
                    "value_type": type(raw_state).__name__,
                },
            )
            self.cache.delete(key)
            return None

        if state.conversation_id != clean_conversation_id:
            logger.warning(
                "Seller conversation cache key and state ID do not match.",
                extra={
                    "requested_conversation_id": clean_conversation_id,
                    "stored_conversation_id": state.conversation_id,
                },
            )
            self.cache.delete(key)
            return None

        return state

    def save(
        self,
        state: BookingConversationState,
        *,
        ttl_seconds: int | None = None,
    ) -> BookingConversationState:
        """
        Save or replace the complete short-term conversation state.
        """

        if not isinstance(state, BookingConversationState):
            raise TypeError(
                "state must be a BookingConversationState instance."
            )

        conversation_id = self._required_conversation_id(
            state.conversation_id
        )

        timeout = (
            self._normalise_ttl(ttl_seconds)
            if ttl_seconds is not None
            else self.ttl_seconds
        )

        key = self._key(conversation_id)
        payload = state.to_dict()

        saved = self.cache.set(
            key,
            payload,
            timeout=timeout,
        )

        if saved is False:
            raise SellerConversationStoreError(
                "The seller conversation could not be saved."
            )

        return state

    def delete(
        self,
        conversation_id: str,
    ) -> bool:
        """
        Delete one conversation.

        Django cache backends may return True, False, an integer, or None.
        This method normalises the result to a boolean where possible.
        """

        clean_conversation_id = self._required_conversation_id(
            conversation_id
        )

        result = self.cache.delete(
            self._key(clean_conversation_id)
        )

        if result is None:
            return True

        return bool(result)

    def exists(
        self,
        conversation_id: str,
    ) -> bool:
        clean_conversation_id = self._required_conversation_id(
            conversation_id
        )

        key = self._key(clean_conversation_id)

        has_key = getattr(self.cache, "has_key", None)
        if callable(has_key):
            return bool(has_key(key))

        return self.cache.get(key) is not None

    def touch(
        self,
        conversation_id: str,
        *,
        ttl_seconds: int | None = None,
    ) -> bool:
        """
        Extend the expiry of an existing conversation.

        Falls back to loading and saving when the cache backend does not
        support touch().
        """

        clean_conversation_id = self._required_conversation_id(
            conversation_id
        )

        timeout = (
            self._normalise_ttl(ttl_seconds)
            if ttl_seconds is not None
            else self.ttl_seconds
        )

        key = self._key(clean_conversation_id)
        touch_method = getattr(self.cache, "touch", None)

        if callable(touch_method):
            try:
                return bool(
                    touch_method(
                        key,
                        timeout=timeout,
                    )
                )
            except (NotImplementedError, TypeError):
                pass

        state = self.get(clean_conversation_id)

        if state is None:
            return False

        self.save(
            state,
            ttl_seconds=timeout,
        )
        return True

    def get_for_seller(
        self,
        *,
        conversation_id: str,
        seller_id: int,
        organisation_slug: str,
    ) -> BookingConversationState | None:
        """
        Load a conversation only when it belongs to the specified seller and
        organisation.
        """

        state = self.get(conversation_id)

        if state is None:
            return None

        clean_seller_id = self._required_positive_int(
            seller_id,
            "seller_id",
        )
        clean_organisation_slug = self._required_string(
            organisation_slug,
            "organisation_slug",
        )

        if state.seller_id != clean_seller_id:
            return None

        if state.organisation_slug != clean_organisation_slug:
            return None

        return state

    def delete_for_seller(
        self,
        *,
        conversation_id: str,
        seller_id: int,
        organisation_slug: str,
    ) -> bool:
        """
        Delete a conversation only when its seller and organisation match.
        """

        state = self.get_for_seller(
            conversation_id=conversation_id,
            seller_id=seller_id,
            organisation_slug=organisation_slug,
        )

        if state is None:
            return False

        return self.delete(conversation_id)

    def update(
        self,
        state: BookingConversationState,
        *,
        expected_seller_id: int | None = None,
        expected_organisation_slug: str | None = None,
        ttl_seconds: int | None = None,
    ) -> BookingConversationState:
        """
        Save a state after optionally checking ownership against the currently
        stored conversation.
        """

        existing = self.get(state.conversation_id)

        if existing is not None:
            if (
                expected_seller_id is not None
                and existing.seller_id
                != self._required_positive_int(
                    expected_seller_id,
                    "expected_seller_id",
                )
            ):
                raise SellerConversationOwnershipError(
                    "This conversation belongs to another seller."
                )

            if expected_organisation_slug is not None:
                clean_slug = self._required_string(
                    expected_organisation_slug,
                    "expected_organisation_slug",
                )

                if existing.organisation_slug != clean_slug:
                    raise SellerConversationOwnershipError(
                        "This conversation belongs to another organisation."
                    )

            if existing.seller_id != state.seller_id:
                raise SellerConversationOwnershipError(
                    "The conversation seller cannot be changed."
                )

            if (
                existing.organisation_slug
                != state.organisation_slug
            ):
                raise SellerConversationOwnershipError(
                    "The conversation organisation cannot be changed."
                )

        return self.save(
            state,
            ttl_seconds=ttl_seconds,
        )

    def clear_completed(
        self,
        conversation_id: str,
    ) -> bool:
        """
        Delete a conversation only when its booking workflow is completed,
        cancelled, or permanently failed.
        """

        state = self.get(conversation_id)

        if state is None:
            return False

        if state.status not in {
            "completed",
            "cancelled",
            "error",
        }:
            return False

        return self.delete(conversation_id)

    def _key(
        self,
        conversation_id: str,
    ) -> str:
        return f"{self.key_prefix}:{conversation_id}"

    @staticmethod
    def _required_conversation_id(
        value: Any,
    ) -> str:
        conversation_id = str(value or "").strip()

        if not conversation_id:
            raise ValueError("conversation_id is required.")

        if len(conversation_id) > 128:
            raise ValueError(
                "conversation_id cannot exceed 128 characters."
            )

        allowed_characters = set(
            "abcdefghijklmnopqrstuvwxyz"
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
            "0123456789"
            "-_"
        )

        if any(
            character not in allowed_characters
            for character in conversation_id
        ):
            raise ValueError(
                "conversation_id contains unsupported characters."
            )

        return conversation_id

    @staticmethod
    def _normalise_ttl(
        value: Any,
    ) -> int:
        try:
            ttl = int(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(
                "Conversation TTL must be a valid integer."
            ) from exc

        if ttl <= 0:
            raise ValueError(
                "Conversation TTL must be greater than zero."
            )

        return ttl

    @staticmethod
    def _required_positive_int(
        value: Any,
        field_name: str,
    ) -> int:
        try:
            parsed = int(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"{field_name} must be a valid integer."
            ) from exc

        if parsed <= 0:
            raise ValueError(
                f"{field_name} must be greater than zero."
            )

        return parsed

    @staticmethod
    def _required_string(
        value: Any,
        field_name: str,
    ) -> str:
        cleaned = str(value or "").strip()

        if not cleaned:
            raise ValueError(f"{field_name} is required.")

        return cleaned


class SellerConversationStoreError(Exception):
    """
    Base exception for conversation storage failures.
    """


class SellerConversationOwnershipError(
    SellerConversationStoreError
):
    """
    Raised when a conversation is accessed using a different seller or
    organisation.
    """