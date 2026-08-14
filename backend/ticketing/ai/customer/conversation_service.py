"""Organisation-isolated conversation state for the customer sales agent.

This service owns customer identity normalization, message idempotency,
approved preference updates, provider continuation state, and human-handoff
transitions. Persistence is injected through a repository so the service can be
tested before the Django models are introduced.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any, Callable, Mapping, Protocol, Sequence


CHANNEL_WHATSAPP = "whatsapp"
CHANNEL_WEBCHAT = "webchat"
SUPPORTED_CHANNELS = frozenset({CHANNEL_WHATSAPP, CHANNEL_WEBCHAT})

STATUS_ACTIVE = "active"
STATUS_HANDOFF_REQUESTED = "handoff_requested"
STATUS_HUMAN_OWNED = "human_owned"
STATUS_CLOSED = "closed"
SUPPORTED_CONVERSATION_STATUSES = frozenset(
    {
        STATUS_ACTIVE,
        STATUS_HANDOFF_REQUESTED,
        STATUS_HUMAN_OWNED,
        STATUS_CLOSED,
    }
)

DIRECTION_INBOUND = "inbound"
DIRECTION_OUTBOUND = "outbound"
SUPPORTED_DIRECTIONS = frozenset({DIRECTION_INBOUND, DIRECTION_OUTBOUND})

ROLE_CUSTOMER = "customer"
ROLE_ASSISTANT = "assistant"
ROLE_TOOL = "tool"
ROLE_SYSTEM = "system"
SUPPORTED_MESSAGE_ROLES = frozenset(
    {ROLE_CUSTOMER, ROLE_ASSISTANT, ROLE_TOOL, ROLE_SYSTEM}
)

SUPPORTED_LANGUAGES = frozenset({"en", "es", "fr", "pt", "de"})

MAX_MESSAGE_CHARACTERS = 8_000
MAX_INTERESTS = 20
MAX_PASSENGERS_PER_CATEGORY = 100

ALLOWED_MESSAGE_METADATA_KEYS = frozenset(
    {
        "channel",
        "message_type",
        "mime_type",
        "reply_to_message_id",
        "delivery_status",
        "provider",
        "model",
        "shadow_mode",
        "tool_name",
        "tool_succeeded",
        "cart_token",
        "handoff_category",
    }
)

ALLOWED_PREFERENCE_FIELDS = frozenset(
    {
        "language",
        "customer_name",
        "travel_start_date",
        "travel_end_date",
        "hotel_name",
        "adults",
        "children",
        "infants",
        "interests",
    }
)


class CustomerConversationError(RuntimeError):
    """Base exception for customer-conversation failures."""


class CustomerConversationIdentityError(CustomerConversationError):
    """Raised when channel/customer identity is missing or invalid."""


class CustomerConversationStateError(CustomerConversationError):
    """Raised when a conversation transition or preference update is invalid."""


class CustomerConversationRepositoryError(CustomerConversationError):
    """Raised when persistence does not satisfy the repository contract."""


@dataclass(frozen=True)
class InboundMessageResult:
    conversation: Any
    message: Any
    created: bool

    @property
    def is_duplicate(self) -> bool:
        return not self.created


@dataclass(frozen=True)
class OutboundMessageResult:
    conversation: Any
    message: Any


class CustomerConversationRepository(Protocol):
    """Persistence operations required by ``CustomerConversationService``."""

    def get_or_create_active_conversation(
        self,
        *,
        organisation: Any,
        channel: str,
        external_customer_id: str,
        defaults: Mapping[str, Any],
    ) -> tuple[Any, bool]:
        """Return the active conversation and whether it was created."""

    def record_inbound_message(
        self,
        *,
        conversation: Any,
        external_message_id: str,
        message_type: str,
        text: str,
        metadata: Mapping[str, Any],
        occurred_at: datetime,
    ) -> tuple[Any, bool]:
        """Atomically get/create an inbound message by external message ID."""

    def create_message(
        self,
        *,
        conversation: Any,
        direction: str,
        role: str,
        external_message_id: str,
        message_type: str,
        text: str,
        metadata: Mapping[str, Any],
        occurred_at: datetime,
    ) -> Any:
        """Create a non-idempotent outbound/tool/system message row."""

    def update_conversation(
        self,
        *,
        conversation: Any,
        values: Mapping[str, Any],
    ) -> Any:
        """Persist approved conversation fields and return the refreshed row."""


Clock = Callable[[], datetime]


class CustomerConversationService:
    """Manage customer-agent state without sharing seller-agent memory."""

    def __init__(
        self,
        *,
        repository: CustomerConversationRepository,
        clock: Clock | None = None,
    ) -> None:
        if repository is None:
            raise CustomerConversationRepositoryError(
                "A customer conversation repository is required."
            )
        self.repository = repository
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def get_or_create_conversation(
        self,
        *,
        organisation: Any,
        channel: str,
        external_customer_id: str,
        language: str = "",
    ) -> tuple[Any, bool]:
        if organisation is None:
            raise CustomerConversationIdentityError(
                "An organisation is required."
            )
        normalized_channel = self.normalize_channel(channel)
        normalized_customer_id = self.normalize_external_customer_id(
            channel=normalized_channel,
            value=external_customer_id,
        )
        normalized_language = self.normalize_language(language, allow_blank=True)

        conversation, created = self.repository.get_or_create_active_conversation(
            organisation=organisation,
            channel=normalized_channel,
            external_customer_id=normalized_customer_id,
            defaults={
                "status": STATUS_ACTIVE,
                "language": normalized_language,
                "last_inbound_at": None,
                "last_outbound_at": None,
            },
        )
        self._assert_conversation_scope(
            conversation=conversation,
            organisation=organisation,
            channel=normalized_channel,
            external_customer_id=normalized_customer_id,
        )
        return conversation, bool(created)

    def accept_inbound_message(
        self,
        *,
        organisation: Any,
        channel: str,
        external_customer_id: str,
        external_message_id: str,
        text: str,
        message_type: str = "text",
        language: str = "",
        metadata: Mapping[str, Any] | None = None,
        occurred_at: datetime | None = None,
    ) -> InboundMessageResult:
        """Store one inbound message exactly once and update activity state."""
        message_id = self._clean_required(
            external_message_id,
            field="external_message_id",
            max_length=512,
        )
        safe_text = self.normalize_message_text(text)
        safe_message_type = self._clean_required(
            message_type,
            field="message_type",
            max_length=50,
        ).lower()
        timestamp = self._normalize_datetime(occurred_at or self.clock())
        conversation, _created = self.get_or_create_conversation(
            organisation=organisation,
            channel=channel,
            external_customer_id=external_customer_id,
            language=language,
        )

        message, created = self.repository.record_inbound_message(
            conversation=conversation,
            external_message_id=message_id,
            message_type=safe_message_type,
            text=safe_text,
            metadata=self.sanitize_message_metadata(metadata),
            occurred_at=timestamp,
        )

        if created:
            values: dict[str, Any] = {"last_inbound_at": timestamp}
            current_status = str(getattr(conversation, "status", STATUS_ACTIVE))
            if current_status == STATUS_CLOSED:
                values["status"] = STATUS_ACTIVE
                values["closed_at"] = None
            conversation = self.repository.update_conversation(
                conversation=conversation,
                values=values,
            )

        return InboundMessageResult(
            conversation=conversation,
            message=message,
            created=bool(created),
        )

    def record_outbound_message(
        self,
        *,
        conversation: Any,
        text: str,
        external_message_id: str = "",
        message_type: str = "text",
        metadata: Mapping[str, Any] | None = None,
        occurred_at: datetime | None = None,
    ) -> OutboundMessageResult:
        self._assert_conversation_object(conversation)
        safe_text = self.normalize_message_text(text)
        timestamp = self._normalize_datetime(occurred_at or self.clock())
        message = self.repository.create_message(
            conversation=conversation,
            direction=DIRECTION_OUTBOUND,
            role=ROLE_ASSISTANT,
            external_message_id=self._clean_optional(
                external_message_id,
                max_length=512,
            ),
            message_type=self._clean_required(
                message_type,
                field="message_type",
                max_length=50,
            ).lower(),
            text=safe_text,
            metadata=self.sanitize_message_metadata(metadata),
            occurred_at=timestamp,
        )
        conversation = self.repository.update_conversation(
            conversation=conversation,
            values={"last_outbound_at": timestamp},
        )
        return OutboundMessageResult(conversation=conversation, message=message)

    def record_tool_audit(
        self,
        *,
        conversation: Any,
        tool_name: str,
        succeeded: bool,
        summary: str = "",
        metadata: Mapping[str, Any] | None = None,
    ) -> Any:
        """Store a small audit message, never raw arguments/provider results."""
        self._assert_conversation_object(conversation)
        safe_metadata = self.sanitize_message_metadata(metadata)
        safe_metadata.update(
            {
                "tool_name": self._clean_required(
                    tool_name,
                    field="tool_name",
                    max_length=120,
                ),
                "tool_succeeded": bool(succeeded),
            }
        )
        return self.repository.create_message(
            conversation=conversation,
            direction=DIRECTION_OUTBOUND,
            role=ROLE_TOOL,
            external_message_id="",
            message_type="tool_audit",
            text=self._clean_optional(summary, max_length=1_000),
            metadata=safe_metadata,
            occurred_at=self._normalize_datetime(self.clock()),
        )

    def update_preferences(
        self,
        *,
        conversation: Any,
        preferences: Mapping[str, Any],
    ) -> Any:
        """Persist only allowlisted, normalized customer planning preferences."""
        self._assert_conversation_object(conversation)
        if not isinstance(preferences, Mapping):
            raise CustomerConversationStateError(
                "Customer preferences must be an object."
            )
        unknown = set(preferences) - ALLOWED_PREFERENCE_FIELDS
        if unknown:
            raise CustomerConversationStateError(
                "Unsupported customer preference field(s): "
                + ", ".join(sorted(unknown))
                + "."
            )

        values: dict[str, Any] = {}
        for field_name, value in preferences.items():
            if field_name == "language":
                values[field_name] = self.normalize_language(value, allow_blank=True)
            elif field_name == "customer_name":
                values[field_name] = self._clean_optional(value, max_length=255)
            elif field_name in {"travel_start_date", "travel_end_date"}:
                values[field_name] = self._normalize_date(value, allow_none=True)
            elif field_name == "hotel_name":
                values[field_name] = self._clean_optional(value, max_length=255)
            elif field_name in {"adults", "children", "infants"}:
                values[field_name] = self._normalize_passenger_count(
                    value,
                    field=field_name,
                )
            elif field_name == "interests":
                values[field_name] = self._normalize_interests(value)

        start = values.get(
            "travel_start_date",
            getattr(conversation, "travel_start_date", None),
        )
        end = values.get(
            "travel_end_date",
            getattr(conversation, "travel_end_date", None),
        )
        if start and end and start > end:
            raise CustomerConversationStateError(
                "Travel start date cannot be after travel end date."
            )

        return self.repository.update_conversation(
            conversation=conversation,
            values=values,
        )

    def save_provider_state(
        self,
        *,
        conversation: Any,
        response_id: str = "",
        provider_conversation_id: str = "",
    ) -> Any:
        self._assert_conversation_object(conversation)
        values = {
            "last_response_id": self._clean_optional(
                response_id,
                max_length=255,
            ),
            "provider_conversation_id": self._clean_optional(
                provider_conversation_id,
                max_length=255,
            ),
        }
        return self.repository.update_conversation(
            conversation=conversation,
            values=values,
        )

    def request_handoff(
        self,
        *,
        conversation: Any,
        category: str,
        reason: str,
    ) -> Any:
        self._assert_conversation_object(conversation)
        current_status = str(getattr(conversation, "status", STATUS_ACTIVE))
        if current_status == STATUS_CLOSED:
            raise CustomerConversationStateError(
                "A closed conversation must be reopened before handoff."
            )
        now = self._normalize_datetime(self.clock())
        return self.repository.update_conversation(
            conversation=conversation,
            values={
                "status": STATUS_HANDOFF_REQUESTED,
                "handoff_category": self._clean_required(
                    category,
                    field="handoff_category",
                    max_length=80,
                ),
                "handoff_reason": self._clean_required(
                    reason,
                    field="handoff_reason",
                    max_length=1_000,
                ),
                "handoff_requested_at": now,
            },
        )

    def mark_human_owned(self, *, conversation: Any) -> Any:
        self._assert_conversation_object(conversation)
        status = str(getattr(conversation, "status", STATUS_ACTIVE))
        if status not in {STATUS_HANDOFF_REQUESTED, STATUS_HUMAN_OWNED}:
            raise CustomerConversationStateError(
                "Human ownership requires a requested handoff."
            )
        return self.repository.update_conversation(
            conversation=conversation,
            values={
                "status": STATUS_HUMAN_OWNED,
                "human_owned_at": self._normalize_datetime(self.clock()),
            },
        )

    def close_conversation(self, *, conversation: Any) -> Any:
        self._assert_conversation_object(conversation)
        return self.repository.update_conversation(
            conversation=conversation,
            values={
                "status": STATUS_CLOSED,
                "closed_at": self._normalize_datetime(self.clock()),
            },
        )

    @staticmethod
    def normalize_channel(value: Any) -> str:
        channel = str(value or "").strip().lower()
        if channel not in SUPPORTED_CHANNELS:
            raise CustomerConversationIdentityError(
                f"Unsupported customer conversation channel: {channel or 'unknown'}."
            )
        return channel

    @classmethod
    def normalize_external_customer_id(cls, *, channel: str, value: Any) -> str:
        if channel == CHANNEL_WHATSAPP:
            digits = re.sub(r"\D", "", str(value or ""))
            if len(digits) < 8 or len(digits) > 15:
                raise CustomerConversationIdentityError(
                    "WhatsApp customer identity must contain 8 to 15 digits including country code."
                )
            return digits
        return cls._clean_required(
            value,
            field="external_customer_id",
            max_length=255,
        )

    @staticmethod
    def normalize_language(value: Any, *, allow_blank: bool = False) -> str:
        language = str(value or "").strip().lower()
        if not language and allow_blank:
            return ""
        if language not in SUPPORTED_LANGUAGES:
            raise CustomerConversationStateError(
                f"Unsupported customer language: {language or 'unknown'}."
            )
        return language

    @staticmethod
    def normalize_message_text(value: Any) -> str:
        text = str(value or "").replace("\x00", " ")
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{4,}", "\n\n\n", text).strip()
        if not text:
            raise CustomerConversationStateError(
                "Customer message text cannot be empty."
            )
        if len(text) > MAX_MESSAGE_CHARACTERS:
            raise CustomerConversationStateError(
                "Customer message text exceeds the permitted length."
            )
        return text

    @staticmethod
    def sanitize_message_metadata(
        metadata: Mapping[str, Any] | None,
    ) -> dict[str, Any]:
        if metadata is None:
            return {}
        if not isinstance(metadata, Mapping):
            raise CustomerConversationStateError(
                "Customer message metadata must be an object."
            )
        sanitized: dict[str, Any] = {}
        for key in ALLOWED_MESSAGE_METADATA_KEYS:
            if key not in metadata:
                continue
            value = metadata[key]
            if isinstance(value, (str, int, float, bool)) or value is None:
                sanitized[key] = value
        return sanitized

    def _assert_conversation_scope(
        self,
        *,
        conversation: Any,
        organisation: Any,
        channel: str,
        external_customer_id: str,
    ) -> None:
        self._assert_conversation_object(conversation)
        conversation_org = getattr(conversation, "organisation", None)
        conversation_org_id = getattr(conversation, "organisation_id", None)
        expected_org_id = self._identity(organisation)
        actual_org_id = (
            self._identity(conversation_org)
            if conversation_org is not None
            else conversation_org_id
        )
        if (
            expected_org_id is not None
            and actual_org_id is not None
            and str(expected_org_id) != str(actual_org_id)
        ):
            raise CustomerConversationRepositoryError(
                "Repository returned a conversation from another organisation."
            )
        if str(getattr(conversation, "channel", "")) != channel:
            raise CustomerConversationRepositoryError(
                "Repository returned a conversation for another channel."
            )
        if str(getattr(conversation, "external_customer_id", "")) != external_customer_id:
            raise CustomerConversationRepositoryError(
                "Repository returned a conversation for another customer."
            )

    @staticmethod
    def _assert_conversation_object(conversation: Any) -> None:
        if conversation is None:
            raise CustomerConversationIdentityError(
                "A customer conversation is required."
            )

    @staticmethod
    def _normalize_date(value: Any, *, allow_none: bool) -> date | None:
        if value in (None, "") and allow_none:
            return None
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        try:
            return date.fromisoformat(str(value))
        except (TypeError, ValueError) as exc:
            raise CustomerConversationStateError(
                "Travel dates must use YYYY-MM-DD format."
            ) from exc

    @staticmethod
    def _normalize_passenger_count(value: Any, *, field: str) -> int:
        if isinstance(value, bool):
            raise CustomerConversationStateError(f"{field} must be an integer.")
        try:
            count = int(value)
        except (TypeError, ValueError) as exc:
            raise CustomerConversationStateError(
                f"{field} must be an integer."
            ) from exc
        if count < 0 or count > MAX_PASSENGERS_PER_CATEGORY:
            raise CustomerConversationStateError(
                f"{field} must be between 0 and {MAX_PASSENGERS_PER_CATEGORY}."
            )
        return count

    @classmethod
    def _normalize_interests(cls, value: Any) -> list[str]:
        if value in (None, ""):
            return []
        if isinstance(value, str):
            raw_values: Sequence[Any] = re.split(r"[,\n]+", value)
        elif isinstance(value, (list, tuple, set)):
            raw_values = list(value)
        else:
            raise CustomerConversationStateError(
                "Customer interests must be a list or comma-separated text."
            )
        result: list[str] = []
        for item in raw_values:
            cleaned = cls._clean_optional(item, max_length=80)
            if cleaned and cleaned.lower() not in {x.lower() for x in result}:
                result.append(cleaned)
            if len(result) >= MAX_INTERESTS:
                break
        return result

    @staticmethod
    def _normalize_datetime(value: datetime) -> datetime:
        if not isinstance(value, datetime):
            raise CustomerConversationStateError(
                "Conversation timestamp must be a datetime."
            )
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value

    @staticmethod
    def _clean_required(value: Any, *, field: str, max_length: int) -> str:
        text = CustomerConversationService._clean_optional(
            value,
            max_length=max_length,
        )
        if not text:
            raise CustomerConversationStateError(f"{field} is required.")
        return text

    @staticmethod
    def _clean_optional(value: Any, *, max_length: int) -> str:
        text = str(value or "").replace("\x00", " ")
        text = re.sub(r"\s+", " ", text).strip()
        return text[:max_length]

    @staticmethod
    def _identity(value: Any) -> Any:
        return getattr(value, "pk", None) or getattr(value, "id", None)


__all__ = [
    "ALLOWED_MESSAGE_METADATA_KEYS",
    "ALLOWED_PREFERENCE_FIELDS",
    "CHANNEL_WEBCHAT",
    "CHANNEL_WHATSAPP",
    "CustomerConversationError",
    "CustomerConversationIdentityError",
    "CustomerConversationRepository",
    "CustomerConversationRepositoryError",
    "CustomerConversationService",
    "CustomerConversationStateError",
    "DIRECTION_INBOUND",
    "DIRECTION_OUTBOUND",
    "InboundMessageResult",
    "OutboundMessageResult",
    "ROLE_ASSISTANT",
    "ROLE_CUSTOMER",
    "ROLE_SYSTEM",
    "ROLE_TOOL",
    "STATUS_ACTIVE",
    "STATUS_CLOSED",
    "STATUS_HANDOFF_REQUESTED",
    "STATUS_HUMAN_OWNED",
    "SUPPORTED_CHANNELS",
    "SUPPORTED_CONVERSATION_STATUSES",
    "SUPPORTED_LANGUAGES",
]
