"""Human-handoff lifecycle for customer AI conversations.

The service persists an organisation-scoped handoff before queueing staff
notifications. A requested or human-owned conversation must not receive AI
replies. Repository and notifier adapters keep this module independent from
the final Django models and existing notification implementation.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Mapping, Protocol, Sequence


STATUS_ACTIVE = "active"
STATUS_HANDOFF_REQUESTED = "handoff_requested"
STATUS_HUMAN_OWNED = "human_owned"
STATUS_CLOSED = "closed"

HANDOFF_PENDING = "pending"
HANDOFF_ASSIGNED = "assigned"
HANDOFF_RESOLVED = "resolved"
HANDOFF_CANCELLED = "cancelled"

ALLOWED_CATEGORIES = frozenset(
    {
        "customer_request",
        "complaint",
        "payment_problem",
        "cancellation_or_refund",
        "missing_information",
        "manual_confirmation",
        "safety_or_policy",
        "technical_error",
        "other",
    }
)

PRIORITY_NORMAL = "normal"
PRIORITY_HIGH = "high"
PRIORITY_URGENT = "urgent"
ALLOWED_PRIORITIES = frozenset({PRIORITY_NORMAL, PRIORITY_HIGH, PRIORITY_URGENT})

DEFAULT_CUSTOMER_MESSAGES = {
    "en": "I’m passing this conversation to a member of our team who can help you.",
    "es": "Voy a pasar esta conversación a un miembro de nuestro equipo para que pueda ayudarte.",
    "fr": "Je transfère cette conversation à un membre de notre équipe qui pourra vous aider.",
    "pt": "Vou encaminhar esta conversa para um membro da nossa equipe que poderá ajudar.",
    "de": "Ich leite dieses Gespräch an ein Teammitglied weiter, das Ihnen helfen kann.",
}


class CustomerHandoffError(RuntimeError):
    """Base error for the customer handoff lifecycle."""


class CustomerHandoffInputError(CustomerHandoffError):
    """Raised when a handoff request or transition is invalid."""


class CustomerHandoffPermissionError(CustomerHandoffError):
    """Raised when a staff actor cannot manage the conversation."""


class CustomerHandoffRepositoryError(CustomerHandoffError):
    """Raised when persistence violates the handoff contract."""


@dataclass(frozen=True)
class HandoffRequest:
    category: str
    reason: str
    customer_message: str
    priority: str
    idempotency_key: str
    requested_at: datetime


@dataclass(frozen=True)
class HandoffResult:
    handoff: Any
    conversation: Any
    created: bool
    notification_queued: bool
    customer_message: str


class CustomerHandoffRepository(Protocol):
    """Atomic persistence required by ``CustomerHandoffService``."""

    def request_handoff(
        self,
        *,
        organisation: Any,
        conversation: Any,
        request: HandoffRequest,
    ) -> tuple[Any, Any, bool]:
        """Idempotently persist handoff and set status=handoff_requested."""

    def assign_handoff(
        self,
        *,
        organisation: Any,
        conversation: Any,
        handoff: Any,
        staff_user: Any,
        assigned_at: datetime,
    ) -> tuple[Any, Any]:
        """Assign staff and atomically set conversation status=human_owned."""

    def resolve_handoff(
        self,
        *,
        organisation: Any,
        conversation: Any,
        handoff: Any,
        staff_user: Any,
        resolution: str,
        resume_ai: bool,
        resolved_at: datetime,
    ) -> tuple[Any, Any]:
        """Resolve and set conversation active or closed in one transaction."""

    def cancel_handoff(
        self,
        *,
        organisation: Any,
        conversation: Any,
        handoff: Any,
        cancelled_at: datetime,
    ) -> tuple[Any, Any]:
        """Cancel an unassigned handoff and return conversation to active."""


class CustomerHandoffNotifier(Protocol):
    """Queue, rather than synchronously send, organisation staff alerts."""

    def queue_staff_notification(
        self,
        *,
        organisation: Any,
        conversation: Any,
        handoff: Any,
        idempotency_key: str,
    ) -> bool:
        """Return true when an idempotent notification was queued/already queued."""


class StaffAccessPolicy(Protocol):
    """Check active organisation membership and handoff permission."""

    def can_manage_handoff(self, *, organisation: Any, staff_user: Any) -> bool:
        """Return true only for an authorized active staff member."""


Clock = Callable[[], datetime]


class CustomerHandoffService:
    """Create, assign, resolve, and cancel human handoffs safely."""

    def __init__(
        self,
        *,
        repository: CustomerHandoffRepository,
        notifier: CustomerHandoffNotifier,
        staff_access_policy: StaffAccessPolicy,
        clock: Clock | None = None,
    ) -> None:
        if repository is None or notifier is None or staff_access_policy is None:
            raise CustomerHandoffRepositoryError(
                "Repository, notifier, and staff access policy are required."
            )
        self.repository = repository
        self.notifier = notifier
        self.staff_access_policy = staff_access_policy
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def handlers(self) -> dict[str, Any]:
        """Return the AI-accessible handler; staff transitions stay internal."""
        return {"request_human_handoff": self.request_human_handoff}

    def request_human_handoff(
        self,
        *,
        arguments: Mapping[str, Any],
        organisation: Any,
        conversation: Any,
        metadata: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        """Tool handler that durably stops AI ownership and alerts staff."""
        self._require_context(organisation, conversation)
        args = self._mapping(arguments)
        safe_metadata = self._mapping(metadata)
        category = self._category(args.get("category"))
        reason = self._required_text(args.get("reason"), 3, 500, "reason")
        customer_message = self._customer_message(
            args.get("customer_message"),
            conversation=conversation,
        )
        request = HandoffRequest(
            category=category,
            reason=reason,
            customer_message=customer_message,
            priority=self._priority(category),
            idempotency_key=self._required_text(
                safe_metadata.get("idempotency_key"), 1, 512, "idempotency_key"
            ),
            requested_at=self._now(),
        )

        try:
            handoff, updated_conversation, created = self.repository.request_handoff(
                organisation=organisation,
                conversation=conversation,
                request=request,
            )
        except CustomerHandoffError:
            raise
        except Exception as exc:
            raise CustomerHandoffRepositoryError(
                "The human handoff could not be saved."
            ) from exc

        self._assert_scope(handoff, organisation, conversation)
        self._assert_conversation_status(
            updated_conversation, {STATUS_HANDOFF_REQUESTED, STATUS_HUMAN_OWNED}
        )

        # Persistence already succeeded. Notification failure must not restore
        # AI ownership; the pending handoff remains visible for retry/monitoring.
        notification_queued = False
        try:
            notification_queued = bool(
                self.notifier.queue_staff_notification(
                    organisation=organisation,
                    conversation=updated_conversation,
                    handoff=handoff,
                    idempotency_key=request.idempotency_key,
                )
            )
        except Exception:
            notification_queued = False

        return {
            "ok": True,
            "handoff_id": self._identity(handoff),
            "status": str(
                self._value(updated_conversation, "status", default="")
            ),
            "category": category,
            "priority": request.priority,
            "created": bool(created),
            "notification_queued": notification_queued,
            "ai_replies_paused": True,
            "customer_message": customer_message,
            "message": "Human assistance has been requested.",
        }

    def assign_to_staff(
        self,
        *,
        organisation: Any,
        conversation: Any,
        handoff: Any,
        staff_user: Any,
    ) -> tuple[Any, Any]:
        """Claim a pending conversation for an authorized staff member."""
        self._authorize(organisation=organisation, staff_user=staff_user)
        self._assert_scope(handoff, organisation, conversation)
        status = str(self._value(handoff, "status", default=HANDOFF_PENDING))
        if status not in {HANDOFF_PENDING, HANDOFF_ASSIGNED}:
            raise CustomerHandoffInputError("Only a pending handoff can be assigned.")
        try:
            updated_handoff, updated_conversation = self.repository.assign_handoff(
                organisation=organisation,
                conversation=conversation,
                handoff=handoff,
                staff_user=staff_user,
                assigned_at=self._now(),
            )
        except Exception as exc:
            raise CustomerHandoffRepositoryError("The handoff could not be assigned.") from exc
        self._assert_scope(updated_handoff, organisation, updated_conversation)
        self._assert_conversation_status(updated_conversation, {STATUS_HUMAN_OWNED})
        return updated_handoff, updated_conversation

    def resolve(
        self,
        *,
        organisation: Any,
        conversation: Any,
        handoff: Any,
        staff_user: Any,
        resolution: str,
        resume_ai: bool = False,
    ) -> tuple[Any, Any]:
        """Resolve a handoff; AI resumes only after an explicit staff choice."""
        self._authorize(organisation=organisation, staff_user=staff_user)
        self._assert_scope(handoff, organisation, conversation)
        safe_resolution = self._required_text(resolution, 3, 2_000, "resolution")
        try:
            updated_handoff, updated_conversation = self.repository.resolve_handoff(
                organisation=organisation,
                conversation=conversation,
                handoff=handoff,
                staff_user=staff_user,
                resolution=safe_resolution,
                resume_ai=bool(resume_ai),
                resolved_at=self._now(),
            )
        except Exception as exc:
            raise CustomerHandoffRepositoryError("The handoff could not be resolved.") from exc
        expected = STATUS_ACTIVE if resume_ai else STATUS_CLOSED
        self._assert_scope(updated_handoff, organisation, updated_conversation)
        self._assert_conversation_status(updated_conversation, {expected})
        return updated_handoff, updated_conversation

    def cancel_unassigned(
        self,
        *,
        organisation: Any,
        conversation: Any,
        handoff: Any,
        staff_user: Any,
    ) -> tuple[Any, Any]:
        """Cancel only an unassigned request through an authorized staff action."""
        self._authorize(organisation=organisation, staff_user=staff_user)
        self._assert_scope(handoff, organisation, conversation)
        if str(self._value(handoff, "status", default="")) != HANDOFF_PENDING:
            raise CustomerHandoffInputError("Only an unassigned handoff can be cancelled.")
        try:
            updated_handoff, updated_conversation = self.repository.cancel_handoff(
                organisation=organisation,
                conversation=conversation,
                handoff=handoff,
                cancelled_at=self._now(),
            )
        except Exception as exc:
            raise CustomerHandoffRepositoryError("The handoff could not be cancelled.") from exc
        self._assert_conversation_status(updated_conversation, {STATUS_ACTIVE})
        return updated_handoff, updated_conversation

    @staticmethod
    def ai_may_reply(conversation: Any) -> bool:
        """Central guard for Celery/webhook orchestration before generating AI."""
        return str(CustomerHandoffService._value(
            conversation, "status", default=STATUS_ACTIVE
        )) == STATUS_ACTIVE

    def _authorize(self, *, organisation: Any, staff_user: Any) -> None:
        if organisation is None or staff_user is None or not self.staff_access_policy.can_manage_handoff(
            organisation=organisation, staff_user=staff_user
        ):
            raise CustomerHandoffPermissionError(
                "This staff user cannot manage customer handoffs."
            )

    def _assert_scope(self, handoff: Any, organisation: Any, conversation: Any) -> None:
        if str(self._value(handoff, "organisation_id", default="")) != str(
            self._identity(organisation)
        ) or str(self._value(handoff, "conversation_id", default="")) != str(
            self._identity(conversation)
        ):
            raise CustomerHandoffRepositoryError(
                "The handoff does not belong to this organisation and conversation."
            )

    @staticmethod
    def _assert_conversation_status(conversation: Any, allowed: set[str]) -> None:
        if str(CustomerHandoffService._value(conversation, "status", default="")) not in allowed:
            raise CustomerHandoffRepositoryError(
                "The conversation has an invalid post-handoff status."
            )

    def _customer_message(self, value: Any, *, conversation: Any) -> str:
        if value not in (None, ""):
            return self._required_text(value, 1, 1_000, "customer_message")
        language = str(self._value(conversation, "language", default="en") or "en").lower()
        return DEFAULT_CUSTOMER_MESSAGES.get(language, DEFAULT_CUSTOMER_MESSAGES["en"])

    @staticmethod
    def _category(value: Any) -> str:
        category = str(value or "").strip().lower()
        if category not in ALLOWED_CATEGORIES:
            raise CustomerHandoffInputError("Unsupported handoff category.")
        return category

    @staticmethod
    def _priority(category: str) -> str:
        if category in {"payment_problem", "cancellation_or_refund", "safety_or_policy"}:
            return PRIORITY_URGENT
        if category in {"complaint", "manual_confirmation", "technical_error"}:
            return PRIORITY_HIGH
        return PRIORITY_NORMAL

    def _now(self) -> datetime:
        result = self.clock()
        if not isinstance(result, datetime):
            raise CustomerHandoffRepositoryError("The clock returned an invalid value.")
        if result.tzinfo is None:
            result = result.replace(tzinfo=timezone.utc)
        return result

    @staticmethod
    def _mapping(value: Any) -> Mapping[str, Any]:
        if not isinstance(value, Mapping):
            raise CustomerHandoffInputError("Expected an object.")
        return value

    @staticmethod
    def _require_context(organisation: Any, conversation: Any) -> None:
        if organisation is None or conversation is None:
            raise CustomerHandoffInputError(
                "Organisation and conversation context are required."
            )

    @staticmethod
    def _value(source: Any, name: str, *, default: Any = None) -> Any:
        if isinstance(source, Mapping):
            return source.get(name, default)
        return getattr(source, name, default) if source is not None else default

    @staticmethod
    def _identity(value: Any) -> Any:
        if isinstance(value, Mapping):
            return value.get("id", value.get("pk"))
        return getattr(value, "id", getattr(value, "pk", None)) if value else None

    @staticmethod
    def _required_text(value: Any, minimum: int, maximum: int, field: str) -> str:
        if isinstance(value, (Mapping, list, tuple, set)):
            raise CustomerHandoffInputError(f"{field} must be text.")
        text = re.sub(
            r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", str(value or "")
        )
        text = re.sub(r"\s+", " ", text).strip()
        if not minimum <= len(text) <= maximum:
            raise CustomerHandoffInputError(
                f"{field} must contain {minimum} to {maximum} characters."
            )
        return text


def build_handoff_tool_handlers(
    *,
    repository: CustomerHandoffRepository,
    notifier: CustomerHandoffNotifier,
    staff_access_policy: StaffAccessPolicy,
    clock: Clock | None = None,
) -> dict[str, Any]:
    return CustomerHandoffService(
        repository=repository,
        notifier=notifier,
        staff_access_policy=staff_access_policy,
        clock=clock,
    ).handlers()


__all__ = [
    "CustomerHandoffError",
    "CustomerHandoffInputError",
    "CustomerHandoffNotifier",
    "CustomerHandoffPermissionError",
    "CustomerHandoffRepository",
    "CustomerHandoffRepositoryError",
    "CustomerHandoffService",
    "HandoffRequest",
    "HandoffResult",
    "StaffAccessPolicy",
    "build_handoff_tool_handlers",
]
