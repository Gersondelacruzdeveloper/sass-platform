# ticketing/ai/seller/schemas.py

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal


ConversationStatus = Literal[
    "collecting",
    "awaiting_selection",
    "awaiting_confirmation",
    "creating_booking",
    "completed",
    "cancelled",
    "error",
]

PaymentIntent = Literal[
    "pending_payment",
    "deposit_online",
    "full_online",
    "cash_full",
    "seller_deposit",
    "seller_full",
    "commission_only",
    "generate_ticket",
    "requires_supervisor_approval",
]

SelectionType = Literal[
    "product",
    "live_option",
    "pickup_location",
    "payment_action",
]

ConversationAction = Literal[
    "provide_information",
    "modify_booking",
    "question",
    "confirm",
    "cancel",
    "reset",
    "new_booking",
    "small_talk",
    "clarification",
    "select_choice",
    "unknown",
]

MessageSource = Literal[
    "text",
    "voice",
    "whatsapp",
    "facebook",
    "api",
    "unknown",
]


QuestionTopic = Literal[
    "",
    "product",
    "option",
    "date",
    "time",
    "guests",
    "customer",
    "contact",
    "hotel",
    "pickup",
    "payment",
    "discount",
    "price",
    "subtotal",
    "total",
    "balance",
    "deposit",
    "booking",
    "availability",
    "other",
]


@dataclass
class ConversationIntent:
    """
    Meaning of the seller's latest message.

    This separates conversational intent from booking data so a question such
    as "did you apply the discount?" does not accidentally change the product,
    option, hotel or any other reservation field.
    """

    action: ConversationAction = "unknown"
    question_topic: QuestionTopic = ""
    changes: dict[str, Any] = field(default_factory=dict)
    ambiguous_fields: list[str] = field(default_factory=list)
    missing_fields: list[str] = field(default_factory=list)
    confidence: float = 0.0
    response_hint: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ConversationTurn:
    """
    One short conversational turn retained in the active booking session.

    This is short-term conversation context only. It should never be used as
    long-term seller memory.
    """

    role: Literal["user", "assistant"]
    text: str
    intent: str = ""
    source: MessageSource = "text"
    message_id: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class BookingProgress:
    """
    Dynamic view of what the workflow already has and what is still missing.
    """

    complete_fields: list[str] = field(default_factory=list)
    missing_fields: list[str] = field(default_factory=list)
    ambiguous_fields: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, list[str]]:
        return asdict(self)


@dataclass
class SellerMessage:
    """
    A message received from the authenticated seller.

    ``source`` and voice metadata allow the same booking workflow to process
    typed chat, interactive voice, WhatsApp, Facebook, or API-originated text
    without coupling the workflow to a specific transport.
    """

    text: str
    language: str | None = None
    message_id: str | None = None
    source: MessageSource = "text"
    transcript_confidence: float | None = None
    is_final_transcript: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_mapping(cls, data: dict[str, Any]) -> "SellerMessage":
        source = str(data.get("source") or "text").strip().lower()
        valid_sources = {
            "text",
            "voice",
            "whatsapp",
            "facebook",
            "api",
            "unknown",
        }
        if source not in valid_sources:
            source = "unknown"

        transcript_confidence = parse_optional_float(
            data.get("transcript_confidence")
            or data.get("speech_confidence")
        )

        return cls(
            text=str(data.get("text") or data.get("message") or "").strip(),
            language=clean_optional_string(data.get("language")),
            message_id=clean_optional_string(data.get("message_id")),
            source=source,  # type: ignore[arg-type]
            transcript_confidence=transcript_confidence,
            is_final_transcript=bool(
                data.get("is_final_transcript", True)
            ),
            metadata=normalise_mapping(data.get("metadata")),
        )

    @property
    def is_voice(self) -> bool:
        return self.source == "voice"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class TrustedProductSelection:
    """
    Product information returned by the seller-products API.

    The AI may identify a product by conversation, but these trusted values
    must come from the API response.
    """

    product_id: int
    name: str
    slug: str = ""
    product_type: str = ""
    supports_pickup: bool = False
    requires_pickup_location: bool = False
    external_provider: str = ""
    is_live_product: bool = False

    @classmethod
    def from_api_product(
        cls,
        product: dict[str, Any],
    ) -> "TrustedProductSelection":
        product_id = parse_required_int(product.get("id"), "product.id")

        provider = str(product.get("external_provider") or "").strip()
        name = str(product.get("name") or "").strip()
        slug = str(product.get("slug") or "").strip()

        return cls(
            product_id=product_id,
            name=name,
            slug=slug,
            product_type=str(product.get("product_type") or "").strip(),
            supports_pickup=bool(product.get("supports_pickup")),
            requires_pickup_location=bool(
                product.get("requires_pickup_location")
            ),
            external_provider=provider,
            is_live_product=bool(
                provider.lower() == "wellet"
                or product.get("is_cocobongo_product")
            ),
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class TrustedLiveOptionSelection:
    """
    Live option selected from the live-availability API response.

    External identifiers must never be invented or generated by the AI.
    """

    provider: str
    option_name: str
    unit_price: str

    external_product_id: str = ""
    external_variant_id: str = ""
    external_availability_id: str = ""
    selected_external_product_id: str = ""

    performance_id: str = ""
    start_time: str = ""
    end_time: str = ""
    checkin_time: str = ""

    currency: str = "USD"
    available: bool = True
    sold_out: bool = False
    available_quantity: int | None = None

    description: str = ""
    features: list[str] = field(default_factory=list)

    @classmethod
    def from_api_option(
        cls,
        option: dict[str, Any],
    ) -> "TrustedLiveOptionSelection":
        external_product_id = clean_optional_string(
            option.get("external_product_id")
        ) or ""

        external_variant_id = clean_optional_string(
            option.get("external_variant_id")
        ) or ""

        external_availability_id = clean_optional_string(
            option.get("external_availability_id")
        ) or ""

        option_name = str(
            option.get("option_name")
            or option.get("name")
            or "Ticket option"
        ).strip()

        selected_external_product_id = (
            external_availability_id
            or external_variant_id
            or external_product_id
            or option_name
        )

        available_quantity = parse_optional_int(
            option.get("available_quantity")
        )

        return cls(
            provider=str(option.get("provider") or "local").strip(),
            option_name=option_name,
            unit_price=money_string(option.get("price")),
            external_product_id=external_product_id,
            external_variant_id=external_variant_id,
            external_availability_id=external_availability_id,
            selected_external_product_id=selected_external_product_id,
            performance_id=clean_optional_string(
                option.get("performance_id")
            )
            or "",
            start_time=clean_optional_string(option.get("start_time")) or "",
            end_time=clean_optional_string(option.get("end_time")) or "",
            checkin_time=clean_optional_string(
                option.get("checkin_time")
            )
            or "",
            currency=str(option.get("currency") or "USD").strip(),
            available=option.get("available") is not False,
            sold_out=option.get("sold_out") is True,
            available_quantity=available_quantity,
            description=clean_optional_string(option.get("description")) or "",
            features=normalise_string_list(option.get("features")),
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class TrustedPickupSelection:
    """
    Pickup location selected from the pickup-location API response.
    """

    pickup_location_id: int
    name: str
    zone_name: str = ""
    default_pickup_point: str = ""
    resolved_pickup_time: str = ""
    resolved_pickup_point: str = ""
    instructions: str = ""

    @classmethod
    def from_api_location(
        cls,
        location: dict[str, Any],
    ) -> "TrustedPickupSelection":
        return cls(
            pickup_location_id=parse_required_int(
                location.get("id"),
                "pickup_location.id",
            ),
            name=str(location.get("name") or "").strip(),
            zone_name=str(location.get("zone_name") or "").strip(),
            default_pickup_point=str(
                location.get("default_pickup_point") or ""
            ).strip(),
        )

    def apply_resolution(
        self,
        response: dict[str, Any],
    ) -> None:
        schedule = normalise_mapping(response.get("schedule"))

        if not response.get("found") or not schedule:
            return

        self.resolved_pickup_time = str(
            schedule.get("pickup_time") or ""
        ).strip()

        self.resolved_pickup_point = str(
            schedule.get("resolved_pickup_point")
            or schedule.get("pickup_point")
            or self.default_pickup_point
            or ""
        ).strip()

        self.instructions = str(
            schedule.get("instructions") or ""
        ).strip()

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class GuestCounts:
    adults: int = 1
    children: int = 0
    infants: int = 0

    def normalise(self) -> None:
        self.adults = max(1, int(self.adults or 0))
        self.children = max(0, int(self.children or 0))
        self.infants = max(0, int(self.infants or 0))

    @property
    def total(self) -> int:
        return self.adults + self.children + self.infants

    def to_dict(self) -> dict[str, int]:
        self.normalise()
        return asdict(self)


@dataclass
class CustomerDetails:
    name: str = ""
    whatsapp: str = ""
    email: str = ""
    hotel: str = ""
    notes: str = ""

    def to_dict(self) -> dict[str, str]:
        return asdict(self)


@dataclass
class PaymentSelection:
    """
    Conversational payment choice.

    Whether the seller is allowed to use this action must be determined from
    the seller API response, not from this schema.
    """

    action: PaymentIntent | None = None
    reference: str = ""
    note: str = ""
    receipt_sent_before_full_payment: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class PendingSelection:
    """
    Used when the API returns multiple possible choices.
    """

    selection_type: SelectionType
    choices: list[dict[str, Any]] = field(default_factory=list)
    original_phrase: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class BookingConversationState:
    """
    Short-term state for one unfinished seller booking conversation.

    Trusted IDs are saved only after they have been returned by an API.
    """

    conversation_id: str
    seller_id: int
    organisation_slug: str

    status: ConversationStatus = "collecting"
    preferred_language: str = "en"

    product_phrase: str = ""
    option_phrase: str = ""
    pickup_phrase: str = ""

    service_date: str = ""
    service_time: str = ""

    guests: GuestCounts = field(default_factory=GuestCounts)
    customer: CustomerDetails = field(default_factory=CustomerDetails)
    payment: PaymentSelection = field(default_factory=PaymentSelection)

    requested_discount_amount: str = "0.00"
    requested_discount_percent: str = ""

    current_intent: ConversationIntent = field(
        default_factory=ConversationIntent
    )
    progress: BookingProgress = field(default_factory=BookingProgress)
    conversation_history: list[ConversationTurn] = field(
        default_factory=list
    )

    product: TrustedProductSelection | None = None
    live_option: TrustedLiveOptionSelection | None = None
    pickup: TrustedPickupSelection | None = None

    pending_selection: PendingSelection | None = None

    seller_api_data: dict[str, Any] = field(default_factory=dict)
    booking_preview: dict[str, Any] = field(default_factory=dict)
    created_booking: dict[str, Any] = field(default_factory=dict)

    awaiting_confirmation: bool = False
    seller_confirmed: bool = False

    last_user_message: str = ""
    last_assistant_message: str = ""

    error_message: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
    voice_context: dict[str, Any] = field(default_factory=dict)

    def set_intent(
        self,
        *,
        action: ConversationAction,
        question_topic: QuestionTopic = "",
        changes: dict[str, Any] | None = None,
        ambiguous_fields: list[str] | None = None,
        missing_fields: list[str] | None = None,
        confidence: float = 0.0,
        response_hint: str = "",
    ) -> None:
        self.current_intent = ConversationIntent(
            action=action,
            question_topic=question_topic,
            changes=dict(changes or {}),
            ambiguous_fields=list(ambiguous_fields or []),
            missing_fields=list(missing_fields or []),
            confidence=max(0.0, min(1.0, float(confidence or 0.0))),
            response_hint=str(response_hint or "").strip(),
        )

    def append_turn(
        self,
        *,
        role: Literal["user", "assistant"],
        text: str,
        intent: str = "",
        source: MessageSource = "text",
        message_id: str = "",
        max_turns: int = 16,
    ) -> None:
        clean_text = str(text or "").strip()
        if not clean_text:
            return

        self.conversation_history.append(
            ConversationTurn(
                role=role,
                text=clean_text,
                intent=str(intent or "").strip(),
                source=source,
                message_id=str(message_id or "").strip(),
            )
        )

        safe_limit = max(2, int(max_turns or 12))
        if len(self.conversation_history) > safe_limit:
            self.conversation_history = self.conversation_history[
                -safe_limit:
            ]

    def update_progress(
        self,
        *,
        complete_fields: list[str] | None = None,
        missing_fields: list[str] | None = None,
        ambiguous_fields: list[str] | None = None,
    ) -> None:
        self.progress = BookingProgress(
            complete_fields=normalise_string_list(
                complete_fields or []
            ),
            missing_fields=normalise_string_list(
                missing_fields or []
            ),
            ambiguous_fields=normalise_string_list(
                ambiguous_fields or []
            ),
        )

    def clear_product_dependencies(self) -> None:
        self.product = None
        self.live_option = None
        self.pickup = None
        self.option_phrase = ""
        self.pickup_phrase = ""
        self.service_time = ""
        self.booking_preview = {}
        self.awaiting_confirmation = False
        self.seller_confirmed = False
        self.progress = BookingProgress()

    def clear_live_option(
        self,
        *,
        preserve_phrase: bool = False,
    ) -> None:
        self.live_option = None
        if not preserve_phrase:
            self.option_phrase = ""
        self.pending_selection = None
        self.booking_preview = {}
        self.awaiting_confirmation = False
        self.seller_confirmed = False
        self.progress = BookingProgress()

    def clear_pickup(self) -> None:
        self.pickup = None
        self.pickup_phrase = ""
        self.booking_preview = {}
        self.awaiting_confirmation = False
        self.seller_confirmed = False
        self.progress = BookingProgress()

    def record_voice_context(
        self,
        *,
        transcript_confidence: float | None = None,
        is_final_transcript: bool = True,
        language: str = "",
    ) -> None:
        """
        Store non-authoritative voice-session metadata.

        This metadata may guide clarification behaviour but must never become
        authoritative booking data.
        """

        self.voice_context = {
            "transcript_confidence": transcript_confidence,
            "is_final_transcript": bool(is_final_transcript),
            "language": str(language or "").strip(),
        }

    def mark_changed(self) -> None:
        self.booking_preview = {}
        self.awaiting_confirmation = False
        self.seller_confirmed = False
        self.progress = BookingProgress()

    def to_dict(self) -> dict[str, Any]:
        return {
            "conversation_id": self.conversation_id,
            "seller_id": self.seller_id,
            "organisation_slug": self.organisation_slug,
            "status": self.status,
            "preferred_language": self.preferred_language,
            "product_phrase": self.product_phrase,
            "option_phrase": self.option_phrase,
            "pickup_phrase": self.pickup_phrase,
            "service_date": self.service_date,
            "service_time": self.service_time,
            "guests": self.guests.to_dict(),
            "customer": self.customer.to_dict(),
            "payment": self.payment.to_dict(),
            "requested_discount_amount": self.requested_discount_amount,
            "requested_discount_percent": self.requested_discount_percent,
            "current_intent": self.current_intent.to_dict(),
            "progress": self.progress.to_dict(),
            "conversation_history": [
                turn.to_dict()
                for turn in self.conversation_history
            ],
            "product": self.product.to_dict() if self.product else None,
            "live_option": (
                self.live_option.to_dict() if self.live_option else None
            ),
            "pickup": self.pickup.to_dict() if self.pickup else None,
            "pending_selection": (
                self.pending_selection.to_dict()
                if self.pending_selection
                else None
            ),
            "seller_api_data": self.seller_api_data,
            "booking_preview": self.booking_preview,
            "created_booking": self.created_booking,
            "awaiting_confirmation": self.awaiting_confirmation,
            "seller_confirmed": self.seller_confirmed,
            "last_user_message": self.last_user_message,
            "last_assistant_message": self.last_assistant_message,
            "error_message": self.error_message,
            "metadata": self.metadata,
            "voice_context": self.voice_context,
        }

    @classmethod
    def from_dict(
        cls,
        data: dict[str, Any],
    ) -> "BookingConversationState":
        state = cls(
            conversation_id=str(data["conversation_id"]),
            seller_id=parse_required_int(data.get("seller_id"), "seller_id"),
            organisation_slug=str(data["organisation_slug"]),
            status=data.get("status", "collecting"),
            preferred_language=str(
                data.get("preferred_language") or "en"
            ),
            product_phrase=str(data.get("product_phrase") or ""),
            option_phrase=str(data.get("option_phrase") or ""),
            pickup_phrase=str(data.get("pickup_phrase") or ""),
            service_date=str(data.get("service_date") or ""),
            service_time=str(data.get("service_time") or ""),
            guests=GuestCounts(**normalise_mapping(data.get("guests"))),
            customer=CustomerDetails(
                **normalise_mapping(data.get("customer"))
            ),
            payment=PaymentSelection(
                **normalise_mapping(data.get("payment"))
            ),
            requested_discount_amount=str(
                data.get("requested_discount_amount") or "0.00"
            ),
            requested_discount_percent=str(
                data.get("requested_discount_percent") or ""
            ),
            current_intent=ConversationIntent(
                **normalise_conversation_intent(
                    data.get("current_intent")
                )
            ),
            progress=BookingProgress(
                **normalise_booking_progress(
                    data.get("progress")
                )
            ),
            conversation_history=normalise_conversation_history(
                data.get("conversation_history")
            ),
            seller_api_data=normalise_mapping(data.get("seller_api_data")),
            booking_preview=normalise_mapping(data.get("booking_preview")),
            created_booking=normalise_mapping(data.get("created_booking")),
            awaiting_confirmation=bool(
                data.get("awaiting_confirmation", False)
            ),
            seller_confirmed=bool(data.get("seller_confirmed", False)),
            last_user_message=str(data.get("last_user_message") or ""),
            last_assistant_message=str(
                data.get("last_assistant_message") or ""
            ),
            error_message=str(data.get("error_message") or ""),
            metadata=normalise_mapping(data.get("metadata")),
            voice_context=normalise_mapping(
                data.get("voice_context")
            ),
        )

        product_data = normalise_mapping(data.get("product"))
        if product_data:
            state.product = TrustedProductSelection(**product_data)

        live_option_data = normalise_mapping(data.get("live_option"))
        if live_option_data:
            state.live_option = TrustedLiveOptionSelection(
                **live_option_data
            )

        pickup_data = normalise_mapping(data.get("pickup"))
        if pickup_data:
            state.pickup = TrustedPickupSelection(**pickup_data)

        pending_selection_data = normalise_mapping(
            data.get("pending_selection")
        )
        if pending_selection_data:
            state.pending_selection = PendingSelection(
                **pending_selection_data
            )

        state.guests.normalise()
        return state


@dataclass
class AgentResponse:
    conversation_id: str
    message: str
    status: ConversationStatus

    requires_reply: bool = True
    requires_confirmation: bool = False
    booking_created: bool = False

    choices: list[dict[str, Any]] = field(default_factory=list)
    booking_preview: dict[str, Any] = field(default_factory=dict)
    booking: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def normalise_conversation_intent(value: Any) -> dict[str, Any]:
    data = normalise_mapping(value)

    action = str(data.get("action") or "unknown").strip()
    valid_actions = {
        "provide_information",
        "modify_booking",
        "question",
        "confirm",
        "cancel",
        "reset",
        "new_booking",
        "small_talk",
        "clarification",
        "select_choice",
        "unknown",
    }
    if action not in valid_actions:
        action = "unknown"

    question_topic = str(
        data.get("question_topic") or ""
    ).strip()

    return {
        "action": action,
        "question_topic": question_topic,
        "changes": normalise_mapping(data.get("changes")),
        "ambiguous_fields": normalise_string_list(
            data.get("ambiguous_fields")
        ),
        "missing_fields": normalise_string_list(
            data.get("missing_fields")
        ),
        "confidence": normalise_confidence(
            data.get("confidence")
        ),
        "response_hint": str(
            data.get("response_hint") or ""
        ).strip(),
    }


def normalise_booking_progress(value: Any) -> dict[str, Any]:
    data = normalise_mapping(value)
    return {
        "complete_fields": normalise_string_list(
            data.get("complete_fields")
        ),
        "missing_fields": normalise_string_list(
            data.get("missing_fields")
        ),
        "ambiguous_fields": normalise_string_list(
            data.get("ambiguous_fields")
        ),
    }


def normalise_conversation_history(
    value: Any,
    *,
    max_turns: int = 16,
) -> list[ConversationTurn]:
    if not isinstance(value, list):
        return []

    turns: list[ConversationTurn] = []

    for item in value[-max(2, int(max_turns or 16)):]:
        if not isinstance(item, dict):
            continue

        role = str(item.get("role") or "").strip()
        text = str(item.get("text") or "").strip()

        if role not in {"user", "assistant"} or not text:
            continue

        source = str(item.get("source") or "text").strip().lower()
        if source not in {
            "text",
            "voice",
            "whatsapp",
            "facebook",
            "api",
            "unknown",
        }:
            source = "unknown"

        turns.append(
            ConversationTurn(
                role=role,  # type: ignore[arg-type]
                text=text,
                intent=str(item.get("intent") or "").strip(),
                source=source,  # type: ignore[arg-type]
                message_id=str(item.get("message_id") or "").strip(),
            )
        )

    return turns


def normalise_confidence(value: Any) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return 0.0

    return max(0.0, min(1.0, parsed))


def normalise_mapping(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    return {}


def normalise_string_list(value: Any) -> list[str]:
    if not isinstance(value, (list, tuple)):
        return []

    return [
        str(item).strip()
        for item in value
        if str(item).strip()
    ]


def clean_optional_string(value: Any) -> str | None:
    if value is None:
        return None

    cleaned = str(value).strip()
    return cleaned or None


def parse_required_int(value: Any, field_name: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"{field_name} must be a valid integer."
        ) from exc

    return parsed


def parse_optional_int(value: Any) -> int | None:
    if value in (None, ""):
        return None

    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def parse_optional_float(value: Any) -> float | None:
    if value in (None, ""):
        return None

    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None

    return max(0.0, min(1.0, parsed))


def money_string(value: Any) -> str:
    try:
        return f"{float(value or 0):.2f}"
    except (TypeError, ValueError):
        return "0.00"