# ticketing/ai/seller/agent.py

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import uuid4

from .api_client import SellerApiError, SellerBookingApiClient
from .conversation_store import SellerConversationStore
from .memory_service import SellerMemoryService
from .schemas import (
    AgentResponse,
    BookingConversationState,
    SellerMessage,
)


logger = logging.getLogger(__name__)


class SellerMessageInterpreter(Protocol):
    """
    Converts a seller's natural-language message into structured instructions.

    The concrete implementation may use an LLM, but it must not:

    - invent product IDs
    - invent external option IDs
    - calculate authoritative prices
    - approve discounts
    - approve payment actions
    - create bookings directly

    It only extracts conversational intent and values.
    """

    def interpret(
        self,
        *,
        message: SellerMessage,
        state: BookingConversationState,
        seller: dict[str, Any],
        products: list[dict[str, Any]],
        trusted_pickup_locations: list[dict[str, Any]],
        memory: dict[str, Any],
    ) -> dict[str, Any]:
        ...


class SellerBookingWorkflow(Protocol):
    """
    Booking workflow contract.

    The workflow decides which existing API must be called next and updates
    the conversation state. Ticketing APIs remain authoritative.
    """

    def process(
        self,
        *,
        state: BookingConversationState,
        interpretation: dict[str, Any],
        seller: dict[str, Any],
        products: list[dict[str, Any]],
        api_client: SellerBookingApiClient,
    ) -> AgentResponse:
        ...


@dataclass(frozen=True)
class SellerAgentContext:
    organisation_slug: str
    seller_id: int
    conversation_id: str


class SellerBookingAgent:
    """
    Main conversational entry point for the authenticated seller assistant.

    Responsibilities:

    1. Load or create conversation state.
    2. Load the authenticated seller from the existing API.
    3. Load only products exposed by the seller-products API.
    4. Load interpretation memory for the authenticated seller.
    5. Ask the message interpreter to understand the seller's words.
    6. Pass the structured interpretation to the booking workflow.
    7. Save the updated conversation.
    8. Record safe language-learning observations.

    This class does not own Ticketing business rules.
    """

    def __init__(
        self,
        *,
        api_client: SellerBookingApiClient,
        conversation_store: SellerConversationStore,
        memory_service: SellerMemoryService,
        interpreter: SellerMessageInterpreter,
        workflow: SellerBookingWorkflow,
    ) -> None:
        self.api_client = api_client
        self.conversation_store = conversation_store
        self.memory_service = memory_service
        self.interpreter = interpreter
        self.workflow = workflow

    def handle_message(
        self,
        *,
        text: str,
        conversation_id: str | None = None,
        language: str | None = None,
        message_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AgentResponse:
        """
        Process one seller message.

        The authenticated seller is resolved through `/ticketing/sellers/me/`.
        The caller must construct `SellerBookingApiClient` using the current
        seller's authentication credentials.
        """

        clean_text = str(text or "").strip()
        resolved_conversation_id = (
            str(conversation_id or "").strip() or self.new_conversation_id()
        )

        if not clean_text:
            return AgentResponse(
                conversation_id=resolved_conversation_id,
                message="Please tell me what you would like to book.",
                status="collecting",
                requires_reply=True,
            )

        message = SellerMessage(
            text=clean_text,
            language=self._clean_optional_string(language),
            message_id=self._clean_optional_string(message_id),
            metadata=dict(metadata or {}),
        )

        state: BookingConversationState | None = None

        try:
            seller = self.api_client.get_me()
            seller_id = self._get_seller_id(seller)

            state = self._load_or_create_state(
                conversation_id=resolved_conversation_id,
                seller_id=seller_id,
                organisation_slug=self.api_client.organisation_slug,
                language=message.language,
            )

            state.last_user_message = message.text
            state.error_message = ""

            self._assert_state_ownership(
                state=state,
                seller_id=seller_id,
                organisation_slug=self.api_client.organisation_slug,
            )

            products = self.api_client.get_products(
                is_active=True,
                page_size=1000,
            )

            # Load the complete active hotel/pickup-location catalogue.
            #
            # Do not pre-filter this list by pickup schedules here. OpenAI must
            # see every trusted hotel so it can understand the seller's actual
            # wording and return the exact trusted pickup_location_id.
            #
            # The workflow remains responsible for validating whether the
            # selected hotel has a schedule for the selected excursion/date.
            pickup_locations = self.api_client.get_pickup_locations(
                is_active=True,
                page_size=1000,
            )

            trusted_pickup_locations = self._trusted_pickup_locations(
                pickup_locations,
            )

            # The API response is retained only for the active conversation.
            # It allows workflow.py to read seller permissions without
            # hard-coding them in the AI layer.
            state.seller_api_data = seller

            memory = self.memory_service.get_interpretation_memory(
                seller_id=seller_id,
                organisation_slug=self.api_client.organisation_slug,
            )

            interpretation = self.interpreter.interpret(
                message=message,
                state=state,
                seller=seller,
                products=products,
                trusted_pickup_locations=trusted_pickup_locations,
                memory=memory,
            )

            interpretation = self._normalise_interpretation(interpretation)

            response = self.workflow.process(
                state=state,
                interpretation=interpretation,
                seller=seller,
                products=products,
                api_client=self.api_client,
            )

            state.last_assistant_message = response.message
            state.status = response.status
            state.error_message = ""

            self.conversation_store.save(state)

            self._record_memory_observations(
                state=state,
                message=message,
                interpretation=interpretation,
            )

            return response

        except SellerApiError as exc:
            logger.warning(
                "Seller booking API request failed.",
                extra={
                    "conversation_id": resolved_conversation_id,
                    "organisation_slug": (
                        self.api_client.organisation_slug
                    ),
                    "status_code": exc.status_code,
                    "method": exc.method,
                    "endpoint": exc.endpoint,
                },
            )

            error_message = self._seller_safe_api_error(exc)

            if state is not None:
                state.status = "error"
                state.error_message = error_message
                state.last_assistant_message = error_message
                self.conversation_store.save(state)

            return AgentResponse(
                conversation_id=resolved_conversation_id,
                message=error_message,
                status="error",
                requires_reply=True,
            )

        except ValueError as exc:
            logger.info(
                "Seller booking conversation validation failed.",
                extra={
                    "conversation_id": resolved_conversation_id,
                    "organisation_slug": (
                        self.api_client.organisation_slug
                    ),
                    "error": str(exc),
                },
            )

            error_message = str(exc).strip() or (
                "I need a little more information to continue."
            )

            if state is not None:
                state.status = "collecting"
                state.error_message = error_message
                state.last_assistant_message = error_message
                self.conversation_store.save(state)

            return AgentResponse(
                conversation_id=resolved_conversation_id,
                message=error_message,
                status="collecting",
                requires_reply=True,
            )

        except Exception as exc:
            logger.exception(
                "Unexpected seller booking agent error.",
                extra={
                    "conversation_id": resolved_conversation_id,
                    "organisation_slug": (
                        self.api_client.organisation_slug
                    ),
                },
            )

            # TEMPORARY LOCAL DEBUG MESSAGE.
            # Remove this detailed exception from API responses before
            # deploying to production.
            error_message = (
                f"DEBUG: {type(exc).__name__}: {str(exc)}"
            )

            if state is not None:
                state.status = "error"
                state.error_message = error_message
                state.last_assistant_message = error_message
                self.conversation_store.save(state)

            return AgentResponse(
                conversation_id=resolved_conversation_id,
                message=error_message,
                status="error",
                requires_reply=True,
            )

    def start_conversation(
        self,
        *,
        language: str | None = None,
    ) -> AgentResponse:
        """
        Create a fresh conversation for the authenticated seller.
        """

        conversation_id = self.new_conversation_id()

        try:
            seller = self.api_client.get_me()
            seller_id = self._get_seller_id(seller)

            state = BookingConversationState(
                conversation_id=conversation_id,
                seller_id=seller_id,
                organisation_slug=self.api_client.organisation_slug,
                preferred_language=self._resolve_language(
                    requested_language=language,
                    seller=seller,
                ),
                seller_api_data=seller,
            )

            self.conversation_store.save(state)

            message = self._welcome_message(state.preferred_language)
            state.last_assistant_message = message
            self.conversation_store.save(state)

            return AgentResponse(
                conversation_id=conversation_id,
                message=message,
                status="collecting",
                requires_reply=True,
            )

        except SellerApiError as exc:
            return AgentResponse(
                conversation_id=conversation_id,
                message=self._seller_safe_api_error(exc),
                status="error",
                requires_reply=True,
            )

    def get_state(
        self,
        *,
        conversation_id: str,
    ) -> BookingConversationState | None:
        """
        Return conversation state only when it belongs to the current seller
        and organisation.
        """

        seller = self.api_client.get_me()
        seller_id = self._get_seller_id(seller)

        state = self.conversation_store.get(
            str(conversation_id or "").strip()
        )

        if state is None:
            return None

        self._assert_state_ownership(
            state=state,
            seller_id=seller_id,
            organisation_slug=self.api_client.organisation_slug,
        )

        return state

    def cancel_conversation(
        self,
        *,
        conversation_id: str,
    ) -> AgentResponse:
        """
        Cancel only the unfinished conversation.

        This does not cancel an already-created Ticketing booking.
        Booking cancellation must use the existing booking API.
        """

        seller = self.api_client.get_me()
        seller_id = self._get_seller_id(seller)

        state = self.conversation_store.get(
            str(conversation_id or "").strip()
        )

        if state is None:
            return AgentResponse(
                conversation_id=conversation_id,
                message="That booking conversation was not found.",
                status="cancelled",
                requires_reply=False,
            )

        self._assert_state_ownership(
            state=state,
            seller_id=seller_id,
            organisation_slug=self.api_client.organisation_slug,
        )

        state.status = "cancelled"
        state.awaiting_confirmation = False
        state.seller_confirmed = False
        state.pending_selection = None
        state.last_assistant_message = "The booking request was cancelled."

        self.conversation_store.save(state)

        return AgentResponse(
            conversation_id=state.conversation_id,
            message=state.last_assistant_message,
            status="cancelled",
            requires_reply=False,
        )

    def reset_conversation(
        self,
        *,
        conversation_id: str,
    ) -> AgentResponse:
        """
        Clear the current booking draft while retaining the conversation ID.
        """

        seller = self.api_client.get_me()
        seller_id = self._get_seller_id(seller)

        existing_state = self.conversation_store.get(
            str(conversation_id or "").strip()
        )

        if existing_state is not None:
            self._assert_state_ownership(
                state=existing_state,
                seller_id=seller_id,
                organisation_slug=self.api_client.organisation_slug,
            )

        preferred_language = (
            existing_state.preferred_language
            if existing_state
            else self._resolve_language(
                requested_language=None,
                seller=seller,
            )
        )

        state = BookingConversationState(
            conversation_id=conversation_id,
            seller_id=seller_id,
            organisation_slug=self.api_client.organisation_slug,
            preferred_language=preferred_language,
            seller_api_data=seller,
        )

        state.last_assistant_message = self._welcome_message(
            preferred_language
        )

        self.conversation_store.save(state)

        return AgentResponse(
            conversation_id=conversation_id,
            message=state.last_assistant_message,
            status="collecting",
            requires_reply=True,
        )

    @staticmethod
    def new_conversation_id() -> str:
        return uuid4().hex

    def _load_or_create_state(
        self,
        *,
        conversation_id: str,
        seller_id: int,
        organisation_slug: str,
        language: str | None,
    ) -> BookingConversationState:
        state = self.conversation_store.get(conversation_id)

        if state is not None:
            if language:
                state.preferred_language = language
            return state

        seller_memory = self.memory_service.get_interpretation_memory(
            seller_id=seller_id,
            organisation_slug=organisation_slug,
        )

        preferred_language = (
            language
            or str(seller_memory.get("preferred_language") or "").strip()
            or "en"
        )

        state = BookingConversationState(
            conversation_id=conversation_id,
            seller_id=seller_id,
            organisation_slug=organisation_slug,
            preferred_language=preferred_language,
        )

        self.conversation_store.save(state)
        return state

    @classmethod
    def _trusted_pickup_locations(
        cls,
        pickup_locations: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """
        Return every active trusted hotel/pickup location from the API.

        No similarity ranking, schedule pre-filtering, top-five trimming or
        Python hotel-name guessing is performed here. OpenAI receives the
        complete trusted catalogue and may return only an ID from this list.
        """

        result: list[dict[str, Any]] = []

        for location in pickup_locations:
            if not isinstance(location, dict):
                continue

            if not cls._is_active(location):
                continue

            location_id = cls._optional_positive_int(
                location.get("id")
            )
            name = str(location.get("name") or "").strip()

            if location_id is None or not name:
                continue

            result.append(
                {
                    "id": location_id,
                    "name": name,
                    "zone_name": str(
                        location.get("zone_name") or ""
                    ).strip(),
                    "address": str(
                        location.get("address") or ""
                    ).strip(),
                    "default_pickup_point": str(
                        location.get("default_pickup_point") or ""
                    ).strip(),
                }
            )

        return result

    @staticmethod
    def _optional_positive_int(value: Any) -> int | None:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return None

        return parsed if parsed > 0 else None

    @staticmethod
    def _is_active(value: dict[str, Any]) -> bool:
        active = value.get("is_active", True)

        if isinstance(active, str):
            return active.strip().lower() not in {
                "false",
                "0",
                "no",
                "off",
            }

        return active is not False

    def _record_memory_observations(
        self,
        *,
        state: BookingConversationState,
        message: SellerMessage,
        interpretation: dict[str, Any],
    ) -> None:
        """
        Save only interpretation-related observations.

        Customer details, payment information and complete booking payloads
        must not become long-term seller language memory.
        """

        try:
            self.memory_service.observe_message(
                seller_id=state.seller_id,
                organisation_slug=state.organisation_slug,
                message=message.text,
                language=(
                    message.language or state.preferred_language
                ),
                interpretation=self._safe_memory_interpretation(
                    interpretation
                ),
            )
        except Exception:
            # Memory improvement must never block a booking.
            logger.exception(
                "Could not record seller memory observation.",
                extra={
                    "seller_id": state.seller_id,
                    "organisation_slug": state.organisation_slug,
                    "conversation_id": state.conversation_id,
                },
            )

    @staticmethod
    def _safe_memory_interpretation(
        interpretation: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Whitelist non-sensitive interpretation fields for seller memory.
        """

        allowed_keys = {
            "intent",
            "language",
            "product_phrase",
            "matched_product_name",
            "option_phrase",
            "pickup_phrase",
            "abbreviations",
            "corrections",
            "communication_style",
        }

        return {
            key: value
            for key, value in interpretation.items()
            if key in allowed_keys
        }

    @staticmethod
    def _normalise_interpretation(
        interpretation: Any,
    ) -> dict[str, Any]:
        if interpretation is None:
            return {}

        if not isinstance(interpretation, dict):
            raise ValueError(
                "The message interpreter returned an invalid response."
            )

        return dict(interpretation)

    @staticmethod
    def _assert_state_ownership(
        *,
        state: BookingConversationState,
        seller_id: int,
        organisation_slug: str,
    ) -> None:
        if state.seller_id != seller_id:
            raise ValueError(
                "This conversation belongs to another seller."
            )

        if state.organisation_slug != organisation_slug:
            raise ValueError(
                "This conversation belongs to another organisation."
            )

    @staticmethod
    def _get_seller_id(seller: dict[str, Any]) -> int:
        try:
            seller_id = int(seller.get("id"))
        except (TypeError, ValueError) as exc:
            raise SellerApiError(
                "The seller API returned an invalid seller ID.",
                response_data=seller,
                method="GET",
                endpoint="/ticketing/sellers/me/",
            ) from exc

        if seller_id <= 0:
            raise SellerApiError(
                "The seller API returned an invalid seller ID.",
                response_data=seller,
                method="GET",
                endpoint="/ticketing/sellers/me/",
            )

        return seller_id

    @staticmethod
    def _resolve_language(
        *,
        requested_language: str | None,
        seller: dict[str, Any],
    ) -> str:
        requested = str(requested_language or "").strip().lower()
        if requested:
            return requested

        for key in (
            "preferred_language",
            "language",
            "user_preferred_language",
        ):
            value = str(seller.get(key) or "").strip().lower()
            if value:
                return value

        user = seller.get("user")
        if isinstance(user, dict):
            value = str(
                user.get("preferred_language")
                or user.get("language")
                or ""
            ).strip().lower()

            if value:
                return value

        return "en"

    @staticmethod
    def _welcome_message(language: str) -> str:
        clean_language = str(language or "").lower()

        if clean_language.startswith("es"):
            return (
                "Dime qué deseas reservar. Puedes hablar de forma natural, "
                "por ejemplo: dos entradas para Coco Bongo mañana."
            )

        if clean_language.startswith("fr"):
            return (
                "Dites-moi ce que vous souhaitez réserver. "
                "Vous pouvez parler naturellement."
            )

        return (
            "Tell me what you would like to book. You can speak naturally, "
            "for example: two Coco Bongo tickets for tomorrow."
        )

    @staticmethod
    def _seller_safe_api_error(exc: SellerApiError) -> str:
        if exc.status_code in {401, 403}:
            return (
                "Your seller account is not authorised to complete that "
                "action."
            )

        if exc.status_code == 404:
            return (
                exc.message
                or "The requested seller product or booking was not found."
            )

        if exc.status_code == 409:
            return (
                exc.message
                or "That option is no longer available. Please choose "
                "another option."
            )

        if exc.status_code == 429:
            return (
                "The booking service is receiving too many requests. "
                "Please try again shortly."
            )

        if exc.status_code and 400 <= exc.status_code < 500:
            return (
                exc.message
                or "The booking information was not accepted."
            )

        return (
            "The booking service could not complete the request. "
            "No booking was created."
        )

    @staticmethod
    def _clean_optional_string(value: Any) -> str | None:
        if value is None:
            return None

        cleaned = str(value).strip()
        return cleaned or None