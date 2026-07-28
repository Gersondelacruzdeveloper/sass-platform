# ticketing/ai/seller/workflow.py

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from difflib import SequenceMatcher
import re
import unicodedata
from typing import Any, Mapping


from .api_client import SellerApiError, SellerBookingApiClient
from .schemas import (
    AgentResponse,
    BookingConversationState,
    CustomerDetails,
    GuestCounts,
    PaymentSelection,
    PendingSelection,
    TrustedLiveOptionSelection,
    TrustedPickupSelection,
    TrustedProductSelection,
)


class SellerBookingWorkflow:
    """
    Conversational booking state machine.

    The workflow coordinates the existing Ticketing APIs. It does not own
    permission, price, discount, availability, pickup, payment, or booking
    validation rules. The existing API and serializers remain authoritative.
    """

    CONFIRM_INTENTS = {
        "confirm",
        "confirmed",
        "yes",
        "create_booking",
        "book_now",
    }
    CANCEL_INTENTS = {"cancel", "cancel_request", "stop"}
    RESET_INTENTS = {"reset", "start_over"}
    NEW_BOOKING_INTENTS = {"new_booking"}

    def process(
        self,
        *,
        state: BookingConversationState,
        interpretation: dict[str, Any],
        seller: dict[str, Any],
        products: list[dict[str, Any]],
        api_client: SellerBookingApiClient,
    ) -> AgentResponse:
        """
        Route the latest message by conversational intent before continuing
        normal booking collection.

        Questions never mutate the draft. Modifications update only fields
        explicitly present in the latest interpretation.
        """

        intent = self._text(interpretation.get("intent")).lower() or "unknown"

        raw_changes = (
            interpretation.get("changes")
            if isinstance(interpretation.get("changes"), Mapping)
            else {}
        )
        effective_interpretation = dict(interpretation)
        for field_name, field_value in raw_changes.items():
            if field_value not in (None, "", [], {}):
                effective_interpretation[field_name] = field_value
        interpretation = effective_interpretation

        question_topic = self._text(
            interpretation.get("question_topic")
        ).lower()

        state.set_intent(
            action=(
                intent
                if intent in {
                    "provide_information",
                    "modify_booking",
                    "question",
                    "confirm",
                    "cancel",
                    "reset",
                    "new_booking",
                    "small_talk",
                    "clarification",
                    "unknown",
                }
                else "unknown"
            ),
            question_topic=question_topic,
            changes=(
                interpretation.get("changes")
                if isinstance(interpretation.get("changes"), Mapping)
                else {}
            ),
            ambiguous_fields=self._string_list(
                interpretation.get("ambiguous_fields")
            ),
            missing_fields=self._string_list(
                interpretation.get("missing_fields")
            ),
            confidence=self._float(
                interpretation.get("confidence"),
                default=0.0,
            ),
            response_hint=self._text(
                interpretation.get("response_hint")
            ),
        )

        if state.last_user_message:
            state.append_turn(
                role="user",
                text=state.last_user_message,
                intent=intent,
            )

        if intent in self.CANCEL_INTENTS or intent == "cancel":
            state.status = "cancelled"
            state.pending_selection = None
            state.awaiting_confirmation = False
            return self._response(
                state,
                "The booking request was cancelled.",
                status="cancelled",
                requires_reply=False,
            )

        if intent in self.RESET_INTENTS or intent == "reset":
            self._reset_state(state)
            return self._response(
                state,
                "Tell me what you would like to book.",
                status="collecting",
            )

        if intent in self.NEW_BOOKING_INTENTS or intent == "new_booking":
            self._reset_state(state)

        if state.status == "completed":
            return self._response(
                state,
                "This booking has already been created.",
                status="completed",
                requires_reply=False,
                booking_created=True,
                booking=state.created_booking,
            )

        # A previous over-limit discount request may be accepted with a simple
        # "yes" without accidentally confirming the entire booking.
        pending_discount = state.metadata.get(
            "pending_discount_offer_percent"
        )
        if pending_discount not in (None, ""):
            if self._is_clear_confirmation_text(
                state.last_user_message
            ):
                state.requested_discount_amount = "0.00"
                state.requested_discount_percent = self._decimal(
                    pending_discount,
                    default="0.00",
                )
                state.metadata.pop(
                    "pending_discount_offer_percent",
                    None,
                )
                state.mark_changed()
            elif intent not in {"question", "small_talk"}:
                state.metadata.pop(
                    "pending_discount_offer_percent",
                    None,
                )

        if intent == "question":
            return self._answer_booking_question(
                state=state,
                topic=question_topic,
                seller=seller,
                products=products,
            )

        if intent == "small_talk":
            return self._response(
                state,
                self._text(interpretation.get("response_hint"))
                or "I’m ready. Tell me what you would like to book or change.",
                status=state.status,
            )

        if intent == "clarification":
            return self._response(
                state,
                self._text(interpretation.get("response_hint"))
                or self._clarification_message(interpretation),
                status=state.status,
            )

        # Confirmation is an action, not a data-collection step.
        if (
            state.awaiting_confirmation
            and self._is_confirmation(
                state=state,
                interpretation=interpretation,
                intent=intent,
            )
        ):
            return self._create_booking(
                state,
                api_client,
                seller=seller,
                products=products,
            )

        self._apply_interpretation(
            state,
            interpretation,
            explicit_change=(intent == "modify_booking"),
        )

        discount_response = self._validate_discount_request(
            state=state,
            seller=seller,
            products=products,
        )
        if discount_response is not None:
            return discount_response

        if state.pending_selection:
            pending_response = self._resolve_pending_selection(
                state,
                interpretation,
            )
            if pending_response is not None:
                return pending_response

        response = self._ensure_product(
            state,
            interpretation,
            products,
        )
        if response is not None:
            return response

        if not state.service_date:
            self._update_progress(state)
            return self._response(
                state,
                "What date is the booking for?",
                status="collecting",
            )

        if state.product and state.product.is_live_product:
            response = self._ensure_live_option(
                state,
                interpretation,
                api_client,
            )
            if response is not None:
                return response

        response = self._ensure_pickup(
            state,
            interpretation,
            api_client,
        )
        if response is not None:
            return response

        response = self._ensure_customer(state)
        if response is not None:
            return response

        response = self._ensure_payment(state, seller)
        if response is not None:
            return response

        state.booking_preview = self._build_preview(
            state,
            seller=seller,
            products=products,
        )
        state.awaiting_confirmation = True
        state.status = "awaiting_confirmation"
        self._update_progress(state)

        return self._response(
            state,
            self._confirmation_message(state),
            status="awaiting_confirmation",
            requires_confirmation=True,
            booking_preview=state.booking_preview,
        )

    # ------------------------------------------------------------------
    # Apply interpreted values
    # ------------------------------------------------------------------

    def _apply_interpretation(
        self,
        state: BookingConversationState,
        interpretation: Mapping[str, Any],
        *,
        explicit_change: bool = False,
    ) -> None:
        """
        Apply only values explicitly present in the latest message.

        Empty strings and null values never erase existing state. Dependent
        selections are cleared only when the seller clearly changes their
        parent field.
        """

        changed = False

        language = self._text(interpretation.get("language"))
        if language:
            state.preferred_language = language

        product_phrase = self._text(
            interpretation.get("product_phrase")
            or interpretation.get("product_name")
        )
        explicit_product_id = self._optional_int(
            interpretation.get("product_id")
        )
        if product_phrase and product_phrase != state.product_phrase:
            if state.product and explicit_change:
                state.clear_product_dependencies()
            state.product_phrase = product_phrase
            changed = True
        elif explicit_product_id is not None and state.product:
            if explicit_product_id != state.product.product_id:
                state.clear_product_dependencies()
                changed = True

        option_phrase = self._text(
            interpretation.get("option_phrase")
            or interpretation.get("option_name")
        )
        has_external_selection = any(
            self._text(interpretation.get(key))
            for key in (
                "external_product_id",
                "external_variant_id",
                "external_availability_id",
                "selected_external_product_id",
            )
        )
        if option_phrase and (
            self._normalise_phrase(option_phrase)
            != self._normalise_phrase(state.option_phrase)
        ):
            if state.live_option:
                state.clear_live_option()
            state.pending_selection = None
            state.option_phrase = option_phrase
            state.booking_preview = {}
            state.awaiting_confirmation = False
            changed = True
        elif has_external_selection and state.live_option and explicit_change:
            state.clear_live_option()
            state.pending_selection = None
            state.booking_preview = {}
            state.awaiting_confirmation = False
            changed = True

        pickup_phrase = self._text(
            interpretation.get("pickup_phrase")
            or interpretation.get("pickup_location")
            or interpretation.get("hotel")
        )
        explicit_pickup_id = self._optional_int(
            interpretation.get("pickup_location_id")
        )
        if pickup_phrase and pickup_phrase != state.pickup_phrase:
            if state.pickup and explicit_change:
                state.clear_pickup()
            state.pickup_phrase = pickup_phrase
            changed = True
        elif explicit_pickup_id is not None and state.pickup:
            if explicit_pickup_id != state.pickup.pickup_location_id:
                state.clear_pickup()
                changed = True

        service_date = self._normalise_service_date(
            interpretation.get("service_date")
            or interpretation.get("date")
        )
        if service_date and service_date != state.service_date:
            state.service_date = service_date
            state.clear_live_option()
            if state.pickup:
                state.pickup.resolved_pickup_time = ""
                state.pickup.resolved_pickup_point = ""
                state.pickup.instructions = ""
            changed = True

        service_time = self._text(
            interpretation.get("service_time")
            or interpretation.get("time")
        )
        if service_time and service_time != state.service_time:
            state.service_time = service_time
            changed = True

        guests = interpretation.get("guests")
        if isinstance(guests, Mapping):
            explicit_guest_values = {
                key: guests.get(key)
                for key in ("adults", "children", "infants")
                if guests.get(key) not in (None, "")
            }
            if explicit_guest_values:
                updated = GuestCounts(
                    adults=self._int(
                        explicit_guest_values.get("adults"),
                        state.guests.adults,
                        minimum=1,
                    ),
                    children=self._int(
                        explicit_guest_values.get("children"),
                        state.guests.children,
                    ),
                    infants=self._int(
                        explicit_guest_values.get("infants"),
                        state.guests.infants,
                    ),
                )
                updated.normalise()
                if updated.to_dict() != state.guests.to_dict():
                    state.guests = updated
                    changed = True

        customer = interpretation.get("customer")
        if isinstance(customer, Mapping):
            changed = (
                self._apply_customer(state.customer, customer)
                or changed
            )
        else:
            changed = (
                self._apply_customer(
                    state.customer,
                    {
                        "name": interpretation.get("customer_name"),
                        "whatsapp": interpretation.get(
                            "customer_whatsapp"
                        ),
                        "email": interpretation.get("customer_email"),
                        "hotel": interpretation.get("customer_hotel"),
                        "notes": interpretation.get("customer_notes"),
                    },
                )
                or changed
            )

        payment_action = self._text(
            interpretation.get("payment_action")
            or interpretation.get("payment_intent")
        )
        if (
            payment_action
            and payment_action != state.payment.action
        ):
            state.payment.action = payment_action  # type: ignore[assignment]
            changed = True

        payment_reference = self._text(
            interpretation.get("payment_reference")
        )
        if (
            payment_reference
            and payment_reference != state.payment.reference
        ):
            state.payment.reference = payment_reference
            changed = True

        payment_note = self._text(
            interpretation.get("payment_note")
        )
        if payment_note and payment_note != state.payment.note:
            state.payment.note = payment_note
            changed = True

        if interpretation.get("discount_amount") not in (None, ""):
            amount = self._decimal(
                interpretation.get("discount_amount"),
                default="0.00",
            )
            if amount != state.requested_discount_amount:
                state.requested_discount_amount = amount
                state.requested_discount_percent = ""
                changed = True

        if interpretation.get("discount_percent") not in (None, ""):
            percent = self._decimal(
                interpretation.get("discount_percent"),
                default="",
            )
            if percent != state.requested_discount_percent:
                state.requested_discount_percent = percent
                state.requested_discount_amount = "0.00"
                changed = True

        if changed:
            state.mark_changed()
            state.status = "collecting"

    @staticmethod
    def _apply_customer(
        customer: CustomerDetails,
        values: Mapping[str, Any],
    ) -> bool:
        changed = False
        for field in ("name", "whatsapp", "email", "hotel", "notes"):
            raw_value = values.get(field)
            if raw_value in (None, ""):
                continue
            value = str(raw_value).strip()
            if value and getattr(customer, field) != value:
                setattr(customer, field, value)
                changed = True
        return changed

    # ------------------------------------------------------------------
    # Product
    # ------------------------------------------------------------------

    def _ensure_product(
        self,
        state: BookingConversationState,
        interpretation: Mapping[str, Any],
        products: list[dict[str, Any]],
    ) -> AgentResponse | None:
        if state.product:
            return None

        if not products:
            return self._response(
                state,
                "There are no active products available for this seller.",
                status="error",
            )

        explicit_id = self._optional_int(interpretation.get("product_id"))
        if explicit_id is not None:
            selected = next(
                (item for item in products if self._optional_int(item.get("id")) == explicit_id),
                None,
            )
            if not selected:
                raise SellerApiError(
                    "The selected product is not available to this seller.",
                    status_code=404,
                    response_data={"product_id": explicit_id},
                    endpoint="/ticketing/seller/products/",
                    method="GET",
                )
            state.product = TrustedProductSelection.from_api_product(selected)
            return None

        if not state.product_phrase:
            return self._response(
                state,
                "Which product would you like to book?",
                status="collecting",
                choices=self._product_choices(products),
            )

        # The interpreter receives every trusted seller product and should
        # return an exact trusted product_id. The workflow validates IDs and
        # never guesses a product by ranking names.
        choices = self._product_choices(products)
        state.pending_selection = PendingSelection(
            selection_type="product",
            choices=choices,
            original_phrase=state.product_phrase,
        )
        return self._response(
            state,
            "I found more than one possible product. Which one do you mean?",
            status="awaiting_selection",
            choices=choices,
        )

    # ------------------------------------------------------------------
    # Live availability
    # ------------------------------------------------------------------

    def _ensure_live_option(
        self,
        state: BookingConversationState,
        interpretation: Mapping[str, Any],
        api_client: SellerBookingApiClient,
    ) -> AgentResponse | None:
        if state.live_option:
            return None
        if not state.product:
            raise ValueError("A product must be selected first.")

        response = api_client.get_live_availability(
            product_slug=state.product.slug,
            service_date=state.service_date,
        )

        if response.get("ok") is False:
            raise SellerApiError(
                self._text(response.get("error")) or "Live availability could not be loaded.",
                response_data=response,
                method="GET",
                endpoint="live availability",
            )

        raw_options = response.get("options")
        options = [item for item in raw_options if isinstance(item, dict)] if isinstance(raw_options, list) else []
        options = [
            item for item in options
            if item.get("available") is not False and item.get("sold_out") is not True
        ]

        if not options:
            return self._response(
                state,
                f"There are no available options for {state.product.name} on {state.service_date}.",
                status="collecting",
            )

        selected_external_id = self._text(
            interpretation.get("selected_external_product_id")
            or interpretation.get("external_availability_id")
            or interpretation.get("external_variant_id")
            or interpretation.get("external_product_id")
        )

        if selected_external_id:
            selected = next(
                (
                    item
                    for item in options
                    if selected_external_id
                    in {
                        self._text(item.get("external_availability_id")),
                        self._text(item.get("external_variant_id")),
                        self._text(item.get("external_product_id")),
                    }
                ),
                None,
            )
            if selected:
                state.live_option = (
                    TrustedLiveOptionSelection.from_api_option(selected)
                )
                return None

        if state.option_phrase:
            matched_option = self._match_live_option_phrase(
                phrase=state.option_phrase,
                options=options,
            )
            if matched_option is not None:
                state.live_option = TrustedLiveOptionSelection.from_api_option(
                    matched_option
                )
                state.pending_selection = None
                state.booking_preview = {}
                state.awaiting_confirmation = False
                state.mark_changed()
                return None

        if len(options) == 1:
            state.live_option = TrustedLiveOptionSelection.from_api_option(
                options[0]
            )
            return None

        choices = self._live_option_choices(options)
        state.pending_selection = PendingSelection(
            selection_type="live_option",
            choices=choices,
            original_phrase=state.option_phrase,
        )
        return self._response(
            state,
            f"Which {state.product.name} option would you like?",
            status="awaiting_selection",
            choices=choices,
        )

    # ------------------------------------------------------------------
    # Pickup
    # ------------------------------------------------------------------

    def _ensure_pickup(
        self,
        state: BookingConversationState,
        interpretation: Mapping[str, Any],
        api_client: SellerBookingApiClient,
    ) -> AgentResponse | None:
        if not state.product:
            raise ValueError("A product must be selected first.")

        requires_pickup = (
            state.product.requires_pickup_location
            or state.product.supports_pickup
            or bool(state.pickup_phrase)
        )
        if not requires_pickup:
            return None

        if not state.pickup:
            # Load the complete active pickup catalogue. OpenAI has already
            # received the trusted list and should return an exact trusted ID.
            # The workflow validates that ID; it does not rank or guess hotels.
            locations = api_client.get_pickup_locations(
                is_active=True,
                page_size=1000,
            )

            if not locations:
                return self._response(
                    state,
                    "No active pickup locations are configured.",
                    status="error",
                )

            explicit_id = self._optional_int(
                interpretation.get("pickup_location_id")
            )

            if explicit_id is not None:
                selected = next(
                    (
                        item
                        for item in locations
                        if self._optional_int(item.get("id")) == explicit_id
                    ),
                    None,
                )

                if not selected:
                    raise SellerApiError(
                        "The selected pickup location is not available.",
                        status_code=404,
                        response_data={
                            "pickup_location_id": explicit_id,
                        },
                        method="GET",
                        endpoint="/ticketing/pickup-locations/",
                    )

                state.pickup = (
                    TrustedPickupSelection.from_api_location(selected)
                )
                state.pending_selection = None
            else:
                choices = self._pickup_choices(locations)
                state.pending_selection = PendingSelection(
                    selection_type="pickup_location",
                    choices=choices,
                    original_phrase=state.pickup_phrase,
                )

                prompt = (
                    "Which hotel or pickup location do you mean?"
                    if state.pickup_phrase
                    else "Which hotel or pickup location should I use?"
                )

                return self._response(
                    state,
                    prompt,
                    status="awaiting_selection",
                    choices=choices,
                )

        if state.pickup and not state.pickup.resolved_pickup_time:
            result = api_client.resolve_pickup(
                product_id=state.product.product_id,
                pickup_location_id=state.pickup.pickup_location_id,
                service_date=state.service_date,
            )
            state.pickup.apply_resolution(result)
            if result.get("found") is False:
                unavailable_name = state.pickup.name

                state.pickup = None
                state.pickup_phrase = ""
                state.pending_selection = None
                state.mark_changed()

                return self._response(
                    state,
                    (
                        f"No pickup schedule is configured for "
                        f"{unavailable_name} on {state.service_date}. "
                        "Please provide another hotel or pickup location."
                    ),
                    status="collecting",
                )

        return None

    # ------------------------------------------------------------------
    # Customer and payment
    # ------------------------------------------------------------------

    def _ensure_customer(self, state: BookingConversationState) -> AgentResponse | None:
        if not state.customer.name:
            return self._response(state, "What is the customer's name?", status="collecting")

        if not state.customer.whatsapp and not state.customer.email:
            return self._response(
                state,
                "Please provide the customer's WhatsApp number or email.",
                status="collecting",
            )

        return None

    def _ensure_payment(
        self,
        state: BookingConversationState,
        seller: Mapping[str, Any],
    ) -> AgentResponse | None:
        if state.payment.action:
            return None

        actions = self._allowed_payment_actions(seller)
        if len(actions) == 1:
            state.payment.action = actions[0]  # type: ignore[assignment]
            return None

        choices = [
            {"id": action, "value": action, "label": self._payment_label(action)}
            for action in actions
        ]

        if choices:
            state.pending_selection = PendingSelection(
                selection_type="payment_action",
                choices=choices,
                original_phrase="",
            )
            return self._response(
                state,
                "How should the customer pay?",
                status="awaiting_selection",
                choices=choices,
            )

        return self._response(
            state,
            "How should this booking be handled: payment pending, online payment, seller payment, or ticket generation?",
            status="collecting",
        )

    # ------------------------------------------------------------------
    # Pending choices
    # ------------------------------------------------------------------

    def _resolve_pending_selection(
        self,
        state: BookingConversationState,
        interpretation: Mapping[str, Any],
    ) -> AgentResponse | None:
        pending = state.pending_selection
        if not pending:
            return None

        selected_id = interpretation.get("selection_id")
        selected_index = self._optional_int(
            interpretation.get("selection_index") or interpretation.get("choice_number")
        )
        selected_phrase = self._text(
            interpretation.get("selection_phrase")
            or interpretation.get("selected_choice")
            or interpretation.get("product_phrase")
            or interpretation.get("option_phrase")
            or interpretation.get("pickup_phrase")
            or interpretation.get("payment_action")
        )

        choice = None

        # For pickup selection, the exact trusted pickup_location_id returned
        # by OpenAI is authoritative.
        if pending.selection_type == "pickup_location":
            pickup_location_id = self._optional_int(
                interpretation.get("pickup_location_id")
            )

            if pickup_location_id is not None:
                choice = self._choice_by_id(
                    pending.choices,
                    str(pickup_location_id),
                )

        # Exact trusted selection IDs are authoritative for every choice type.
        if choice is None and selected_id not in (None, ""):
            choice = self._choice_by_id(
                pending.choices,
                str(selected_id),
            )

        # A one-based index is valid only when the seller explicitly selects
        # by number and the interpreter returns no meaningful phrase.
        if (
            choice is None
            and not selected_phrase
            and selected_index is not None
        ):
            index = selected_index - 1
            if 0 <= index < len(pending.choices):
                choice = pending.choices[index]

        # Product, live-option and payment choices may still use phrase
        # matching as a fallback. Pickup locations never do: OpenAI must choose
        # an exact trusted pickup ID from the complete supplied list.
        if (
            choice is None
            and selected_phrase
            and pending.selection_type != "pickup_location"
        ):
            ranked = sorted(
                (
                    (
                        self._similarity(
                            selected_phrase,
                            self._text(item.get("label")),
                        ),
                        item,
                    )
                    for item in pending.choices
                ),
                key=lambda item: item[0],
                reverse=True,
            )

            if ranked and ranked[0][0] >= 0.84:
                choice = ranked[0][1]

        if choice is None:
            return self._response(
                state,
                "Please choose one of the available options.",
                status="awaiting_selection",
                choices=pending.choices,
            )

        api_data = choice.get("api_data")
        if pending.selection_type == "product" and isinstance(api_data, dict):
            state.product = TrustedProductSelection.from_api_product(api_data)
        elif pending.selection_type == "live_option" and isinstance(api_data, dict):
            state.live_option = TrustedLiveOptionSelection.from_api_option(api_data)
        elif pending.selection_type == "pickup_location" and isinstance(api_data, dict):
            state.pickup = TrustedPickupSelection.from_api_location(api_data)
        elif pending.selection_type == "payment_action":
            state.payment.action = self._text(choice.get("value") or choice.get("id"))  # type: ignore[assignment]
        else:
            raise ValueError("The selected option is invalid.")

        state.pending_selection = None
        state.mark_changed()
        return None

    # ------------------------------------------------------------------
    # Create booking
    # ------------------------------------------------------------------

    def _create_booking(
        self,
        state: BookingConversationState,
        api_client: SellerBookingApiClient,
        *,
        seller: Mapping[str, Any],
        products: list[dict[str, Any]],
    ) -> AgentResponse:
        """
        Create the booking through the same seller-booking endpoint and payload
        contract used by TicketingSellerNewBookingPage.tsx.
        """

        state.status = "creating_booking"

        payload = self._build_booking_payload(
            state,
            seller=seller,
            products=products,
        )

        booking = api_client.create_booking(payload)

        if state.payment.action == "generate_ticket":
            booking_id = self._optional_int(booking.get("id"))
            if booking_id is None:
                raise SellerApiError(
                    "The booking API returned an invalid booking ID.",
                    response_data=booking,
                    method="POST",
                    endpoint="/ticketing/seller/bookings/",
                )

            booking = api_client.mark_ticket_generated(
                booking_id=booking_id,
            )

        state.created_booking = booking
        state.status = "completed"
        state.awaiting_confirmation = False
        state.seller_confirmed = True

        code = self._text(
            booking.get("booking_code")
            or booking.get("reference")
            or booking.get("code")
        )
        suffix = f" Booking code: {code}." if code else ""

        return self._response(
            state,
            f"The booking was created successfully.{suffix}",
            status="completed",
            requires_reply=False,
            booking_created=True,
            booking=booking,
        )

    def _build_booking_payload(
        self,
        state: BookingConversationState,
        *,
        seller: Mapping[str, Any],
        products: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """
        Build exactly the seller-booking payload used by the working manual
        booking page.

        Pricing is derived from trusted API data already loaded for the seller
        and from the selected live option returned by the availability API.
        The seller booking serializer remains authoritative.
        """

        if not state.product:
            raise ValueError("A product must be selected.")

        if not state.payment.action:
            raise ValueError("A payment action must be selected.")

        product = next(
            (
                item
                for item in products
                if self._optional_int(item.get("id"))
                == state.product.product_id
            ),
            None,
        )

        if not isinstance(product, Mapping):
            raise SellerApiError(
                "The selected product is not available to this seller.",
                status_code=404,
                response_data={
                    "product_id": state.product.product_id,
                },
                method="GET",
                endpoint="/ticketing/seller/products/",
            )

        is_live_product = state.live_option is not None

        if is_live_product:
            unit_price = self._money_decimal(
                state.live_option.unit_price,
            )
            quantity = max(1, state.guests.total)
            product_name = (
                state.live_option.option_name
                or state.product.name
            )
            service_time: str | None = None
        else:
            unit_price = self._money_decimal(
                product.get("base_price"),
            )
            quantity = max(
                1,
                state.guests.adults + state.guests.children,
            )
            product_name = state.product.name
            service_time = (
                state.service_time
                or self._normalise_time(
                    product.get("start_time")
                )
                or None
            )

        if unit_price <= Decimal("0.00"):
            raise ValueError(
                "The selected ticket option does not have a valid price."
            )

        subtotal = self._money(unit_price * Decimal(quantity))

        maximum_discount_percent = (
            self._seller_discount_limit_percent(
                seller=seller,
                product=product,
            )
        )

        requested_discount = self._requested_discount_amount(
            state=state,
            subtotal=subtotal,
        )

        maximum_discount_amount = self._money(
            subtotal
            * maximum_discount_percent
            / Decimal("100")
        )

        discount_amount = min(
            max(requested_discount, Decimal("0.00")),
            maximum_discount_amount,
        )
        discount_amount = self._money(discount_amount)

        customer_discount_percent = (
            self._money(
                discount_amount
                * Decimal("100")
                / subtotal
            )
            if subtotal > Decimal("0.00")
            else Decimal("0.00")
        )

        tax_amount = Decimal("0.00")
        total_amount = self._money(
            subtotal - discount_amount + tax_amount
        )

        deposit_required = self._calculate_deposit_required(
            product=product,
            subtotal=subtotal,
        )

        payment_payload = self._build_payment_payload(
            state=state,
            total_amount=total_amount,
            deposit_required=deposit_required,
        )

        payment_now = (
            self._money_decimal(payment_payload.get("amount"))
            if payment_payload
            else Decimal("0.00")
        )
        balance_due = self._money(
            max(total_amount - payment_now, Decimal("0.00"))
        )

        live_option_instructions: list[str] = []

        if state.live_option:
            live_option_instructions = [
                f"Ticket option: {state.live_option.option_name}",
                (
                    f"Check-in time: {state.live_option.checkin_time}"
                    if state.live_option.checkin_time
                    else ""
                ),
                (
                    f"Show time: {state.live_option.start_time}"
                    if state.live_option.start_time
                    else ""
                ),
                (
                    f"Performance ID: {state.live_option.performance_id}"
                    if state.live_option.performance_id
                    else ""
                ),
            ]

        item_payload: dict[str, Any] = {
            "product_id": state.product.product_id,
            "product_name": product_name,
            "service_date": state.service_date,
            "service_time": service_time,
            "quantity": quantity,
            "unit_price": self._money_string(unit_price),
            "unit_cost": self._money_string(
                self._money_decimal(product.get("cost_price"))
            ),
            "instructions": "\n".join(
                value
                for value in [
                    state.customer.notes,
                    *live_option_instructions,
                ]
                if self._text(value)
            ),
        }

        if state.live_option:
            selected_external_product_id = (
                state.live_option.selected_external_product_id
                or state.live_option.external_availability_id
                or state.live_option.external_variant_id
                or state.live_option.external_product_id
                or state.live_option.option_name
            )

            item_payload.update(
                {
                    "selected_external_product_id": (
                        selected_external_product_id
                    ),
                    "external_provider": (
                        state.live_option.provider or "wellet"
                    ),
                    "external_product_id": (
                        state.live_option.external_product_id
                    ),
                    "external_variant_id": (
                        state.live_option.external_variant_id
                    ),
                    "external_availability_id": (
                        state.live_option.external_availability_id
                    ),
                    "external_option_name": (
                        state.live_option.option_name
                    ),
                    "external_start_time": (
                        state.live_option.start_time
                    ),
                    "external_end_time": (
                        state.live_option.end_time
                    ),
                    "external_checkin_time": (
                        state.live_option.checkin_time
                    ),
                    "external_performance_id": (
                        state.live_option.performance_id
                    ),
                }
            )

        payment_fields = self._seller_payment_fields(
            state.payment.action
        )

        payload: dict[str, Any] = {
            "primary_product": state.product.product_id,
            "source": "seller_dashboard",
            "status": (
                "pending_approval"
                if state.payment.action
                == "requires_supervisor_approval"
                else "pending_payment"
            ),
            "payment_status": (
                "pending" if payment_payload else "unpaid"
            ),
            "payment_mode": payment_fields["payment_mode"],
            "payment_method": payment_fields["payment_method"],
            "service_date": state.service_date,
            "service_time": service_time,
            "customer_name": state.customer.name,
            "customer_whatsapp": (
                state.customer.whatsapp or None
            ),
            "customer_email": (
                state.customer.email or None
            ),
            "customer_hotel": (
                state.customer.hotel
                or (state.pickup.name if state.pickup else "")
            ),
            "customer_notes": state.customer.notes,
            "adults": state.guests.adults,
            "children": state.guests.children,
            "infants": state.guests.infants,
            "subtotal_amount": self._money_string(subtotal),
            "customer_discount_percent": self._money_string(
                customer_discount_percent
            ),
            "discount_amount": self._money_string(
                discount_amount
            ),
            "tax_amount": self._money_string(tax_amount),
            "total_amount": self._money_string(total_amount),
            "deposit_required": self._money_string(
                deposit_required
            ),
            "deposit_paid": "0.00",
            "balance_due": self._money_string(balance_due),
            "requires_supervisor_approval": (
                state.payment.action
                == "requires_supervisor_approval"
            ),
            "receipt_sent_before_full_payment": False,
            "pickup_location_id": (
                state.pickup.pickup_location_id
                if state.pickup
                else None
            ),
            "items_payload": [
                self._clean_payload(item_payload)
            ],
            "payments_payload": (
                [self._clean_payload(payment_payload)]
                if payment_payload
                else []
            ),
        }

        return self._clean_payload(payload)

    def _build_payment_payload(
        self,
        *,
        state: BookingConversationState,
        total_amount: Decimal,
        deposit_required: Decimal,
    ) -> dict[str, Any] | None:
        action = state.payment.action

        reference = self._text(
            getattr(state.payment, "reference", "")
        )
        note = self._text(
            getattr(state.payment, "note", "")
        )

        if action == "deposit_online":
            return {
                "amount": self._money_string(
                    deposit_required or total_amount
                ),
                "payment_type": "deposit",
                "payer_type": "customer",
                "method": "online",
                "status": "confirmed",
                "reference": reference,
                "note": note,
            }

        if action == "full_online":
            return {
                "amount": self._money_string(total_amount),
                "payment_type": "full",
                "payer_type": "customer",
                "method": "online",
                "status": "confirmed",
                "reference": reference,
                "note": note,
            }

        if action == "cash_full":
            return {
                "amount": self._money_string(total_amount),
                "payment_type": "full",
                "payer_type": "customer",
                "method": "cash",
                "status": "confirmed",
                "reference": reference,
                "note": note,
            }

        if action == "seller_deposit":
            return {
                "amount": self._money_string(
                    deposit_required or total_amount
                ),
                "payment_type": "deposit",
                "payer_type": "seller",
                "method": "cash",
                "status": "confirmed",
                "reference": reference,
                "note": note,
            }

        if action == "seller_full":
            return {
                "amount": self._money_string(total_amount),
                "payment_type": "full",
                "payer_type": "seller",
                "method": "cash",
                "status": "confirmed",
                "reference": reference,
                "note": note,
            }

        return None

    @staticmethod
    def _seller_payment_fields(action: str) -> dict[str, str]:
        payment_modes = {
            "pending_payment": "pending_payment",
            "deposit_online": "customer_deposit_online",
            "full_online": "customer_full_online",
            "cash_full": "customer_cash_to_seller",
            "seller_deposit": "seller_deposit_payment",
            "seller_full": "seller_full_payment",
            "commission_only": "seller_commission_only",
            "generate_ticket": "seller_commission_only",
            "requires_supervisor_approval": (
                "requires_supervisor_approval"
            ),
        }

        payment_methods = {
            "deposit_online": "online",
            "full_online": "online",
            "cash_full": "seller_collected",
            "seller_deposit": "seller_collected",
            "seller_full": "seller_collected",
        }

        return {
            "payment_mode": payment_modes.get(
                action,
                "pending_payment",
            ),
            "payment_method": payment_methods.get(
                action,
                "none",
            ),
        }

    def _seller_discount_limit_percent(
        self,
        *,
        seller: Mapping[str, Any],
        product: Mapping[str, Any],
    ) -> Decimal:
        if seller.get("can_apply_discounts") is not True:
            return Decimal("0.00")

        seller_limit = max(
            self._money_decimal(
                seller.get("max_customer_discount_percent")
                or seller.get("maximum_discount_percent")
                or seller.get("max_discount_percent")
            ),
            Decimal("0.00"),
        )
        product_limit = max(
            self._money_decimal(
                product.get(
                    "seller_allowed_discount_percent"
                )
            ),
            Decimal("0.00"),
        )

        if (
            seller_limit > Decimal("0.00")
            and product_limit > Decimal("0.00")
        ):
            return min(seller_limit, product_limit)

        return seller_limit or product_limit

    def _requested_discount_amount(
        self,
        *,
        state: BookingConversationState,
        subtotal: Decimal,
    ) -> Decimal:
        amount = self._money_decimal(
            state.requested_discount_amount
        )

        if amount > Decimal("0.00"):
            return amount

        percent = self._money_decimal(
            state.requested_discount_percent
        )

        if percent <= Decimal("0.00"):
            return Decimal("0.00")

        return self._money(
            subtotal * percent / Decimal("100")
        )

    def _calculate_deposit_required(
        self,
        *,
        product: Mapping[str, Any],
        subtotal: Decimal,
    ) -> Decimal:
        deposit_amount = self._money_decimal(
            product.get("deposit_amount")
        )
        deposit_percentage = self._money_decimal(
            product.get("deposit_percentage")
        )

        if deposit_amount > Decimal("0.00"):
            return self._money(deposit_amount)

        if deposit_percentage > Decimal("0.00"):
            return self._money(
                subtotal
                * deposit_percentage
                / Decimal("100")
            )

        return Decimal("0.00")

    @staticmethod
    def _money_decimal(value: Any) -> Decimal:
        try:
            return Decimal(str(value or "0")).quantize(
                Decimal("0.01"),
                rounding=ROUND_HALF_UP,
            )
        except (InvalidOperation, TypeError, ValueError):
            return Decimal("0.00")

    @staticmethod
    def _money(value: Decimal) -> Decimal:
        return value.quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )

    @classmethod
    def _money_string(cls, value: Any) -> str:
        return f"{cls._money_decimal(value):.2f}"

    @staticmethod
    def _normalise_time(value: Any) -> str:
        clean_value = str(value or "").strip()
        if not clean_value:
            return ""

        if "T" in clean_value:
            clean_value = clean_value.split("T", 1)[1]

        return clean_value[:8]

    # ------------------------------------------------------------------
    # Preview and choices
    # ------------------------------------------------------------------

    def _build_preview(
        self,
        state: BookingConversationState,
        *,
        seller: Mapping[str, Any],
        products: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """
        Build a preview from the same payload calculation used for creation.
        """

        payload = self._build_booking_payload(
            state,
            seller=seller,
            products=products,
        )

        preview: dict[str, Any] = {
            "product": (
                {
                    "id": state.product.product_id,
                    "name": state.product.name,
                }
                if state.product
                else None
            ),
            "service_date": state.service_date,
            "service_time": (
                payload.get("service_time")
                or state.service_time
            ),
            "guests": state.guests.to_dict(),
            "customer": state.customer.to_dict(),
            "payment": state.payment.to_dict(),
            "subtotal_amount": payload.get(
                "subtotal_amount",
                "0.00",
            ),
            "discount_amount": payload.get(
                "discount_amount",
                "0.00",
            ),
            "discount_percent": payload.get(
                "customer_discount_percent",
                "0.00",
            ),
            "tax_amount": payload.get("tax_amount", "0.00"),
            "total_amount": payload.get("total_amount", "0.00"),
            "deposit_required": payload.get(
                "deposit_required",
                "0.00",
            ),
            "balance_due": payload.get("balance_due", "0.00"),
            "currency": (
                state.live_option.currency
                if state.live_option
                else "USD"
            ),
        }

        if state.live_option:
            preview["live_option"] = {
                "name": state.live_option.option_name,
                "unit_price": state.live_option.unit_price,
                "currency": state.live_option.currency,
                "start_time": state.live_option.start_time,
                "checkin_time": state.live_option.checkin_time,
            }

        if state.pickup:
            preview["pickup"] = {
                "location": state.pickup.name,
                "time": state.pickup.resolved_pickup_time,
                "point": (
                    state.pickup.resolved_pickup_point
                    or state.pickup.default_pickup_point
                ),
                "instructions": state.pickup.instructions,
            }

        return preview

    def _confirmation_message(self, state: BookingConversationState) -> str:
        language = self._language_code(state.preferred_language)
        product_name = state.product.name if state.product else "selected product"
        option_name = state.live_option.option_name if state.live_option else ""
        pickup_name = state.pickup.name if state.pickup else ""
        pickup_time = state.pickup.resolved_pickup_time if state.pickup else ""
        preview = state.booking_preview or {}
        total = self._text(preview.get("total_amount"))
        discount = self._text(preview.get("discount_amount"))
        currency = self._text(preview.get("currency")) or "USD"

        if language == "es":
            lines = [
                "Perfecto. Esto es lo que tengo:",
                f"• Experiencia: {product_name}",
            ]
            if option_name:
                lines.append(f"• Opción: {option_name}")
            lines.extend([
                f"• Fecha: {state.service_date}",
                f"• Adultos: {state.guests.adults}",
                f"• Cliente: {state.customer.name}",
            ])
            if state.guests.children:
                lines.insert(-1, f"• Niños: {state.guests.children}")
            if pickup_name:
                pickup = pickup_name + (f" a las {pickup_time}" if pickup_time else "")
                lines.append(f"• Recogida: {pickup}")
            if state.payment.action:
                lines.append(
                    "• Pago: " + self._payment_label_localised(
                        state.payment.action, language
                    )
                )
            if discount and discount != "0.00":
                lines.append(f"• Descuento: {currency} {discount}")
            if total:
                lines.append(f"• Total: {currency} {total}")
            lines.append("¿Confirmas que cree la reserva?")
            return "\n".join(lines)

        lines = [
            "Perfect. Here is the booking I have:",
            f"• Experience: {product_name}",
        ]
        if option_name:
            lines.append(f"• Option: {option_name}")
        lines.extend([
            f"• Date: {state.service_date}",
            f"• Adults: {state.guests.adults}",
            f"• Customer: {state.customer.name}",
        ])
        if state.guests.children:
            lines.insert(-1, f"• Children: {state.guests.children}")
        if pickup_name:
            pickup = pickup_name + (f" at {pickup_time}" if pickup_time else "")
            lines.append(f"• Pickup: {pickup}")
        if state.payment.action:
            lines.append(
                "• Payment: " + self._payment_label_localised(
                    state.payment.action, language
                )
            )
        if discount and discount != "0.00":
            lines.append(f"• Discount: {currency} {discount}")
        if total:
            lines.append(f"• Total: {currency} {total}")
        lines.append("Should I create the booking?")
        return "\n".join(lines)

    def _match_live_option_phrase(
        self,
        *,
        phrase: str,
        options: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        normalised_phrase = self._normalise_phrase(phrase)
        if not normalised_phrase:
            return None

        alias_groups = {
            "premium": {"premium", "premiun", "vip", "entrada premium", "premium open bar"},
            "regular": {"regular", "general", "entrada general", "standard", "estandar", "open bar regular"},
            "front row": {"front row", "primera fila", "first row", "fila frontal"},
        }
        expanded_terms = {normalised_phrase}
        for canonical, terms in alias_groups.items():
            normalised_terms = {self._normalise_phrase(term) for term in terms}
            if normalised_phrase == canonical or any(
                term in normalised_phrase or normalised_phrase in term
                for term in normalised_terms
            ):
                expanded_terms.add(canonical)
                expanded_terms.update(normalised_terms)

        ranked = []
        for option in options:
            candidates = [
                self._text(option.get("option_name")),
                self._text(option.get("name")),
                self._text(option.get("description")),
                " ".join(str(x) for x in option.get("features", []) if x)
                if isinstance(option.get("features"), list) else "",
            ]
            score = max(
                (self._similarity(term, candidate)
                 for term in expanded_terms
                 for candidate in candidates
                 if candidate),
                default=0.0,
            )
            if score > 0:
                ranked.append((score, option))
        ranked.sort(key=lambda pair: pair[0], reverse=True)
        if not ranked:
            return None
        best_score, best_option = ranked[0]
        second_score = ranked[1][0] if len(ranked) > 1 else 0.0
        if best_score >= 0.90 or (
            best_score >= 0.72 and best_score - second_score >= 0.08
        ):
            return best_option
        return None

    @classmethod
    def _language_code(cls, value: Any) -> str:
        language = cls._normalise_phrase(value)
        if language in {"es", "spa", "spanish", "espanol", "castellano"}:
            return "es"
        if language in {"fr", "fra", "french", "francais"}:
            return "fr"
        if language in {"pt", "por", "portuguese", "portugues"}:
            return "pt"
        if language in {"de", "deu", "german", "deutsch"}:
            return "de"
        return "en"

    @staticmethod
    def _payment_label_localised(action: str, language: str) -> str:
        if language == "es":
            labels = {
                "pending_payment": "pago pendiente",
                "deposit_online": "depósito en línea",
                "full_online": "pago completo en línea",
                "cash_full": "pago completo en efectivo",
                "seller_deposit": "depósito recibido por el vendedor",
                "seller_full": "pago completo recibido por el vendedor",
                "commission_only": "solo comisión",
                "generate_ticket": "generar ticket",
                "requires_supervisor_approval": "requiere aprobación",
            }
            return labels.get(action, action.replace("_", " "))
        return SellerBookingWorkflow._payment_label(action)

    def _product_choices(self, products: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {
                "id": item.get("id"),
                "value": item.get("id"),
                "label": self._text(item.get("name")),
                "description": self._text(item.get("short_description") or item.get("location")),
                "api_data": item,
            }
            for item in products
            if item.get("id") is not None
        ]

    def _live_option_choices(self, options: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result = []
        for index, item in enumerate(options, start=1):
            option_id = (
                item.get("external_availability_id")
                or item.get("external_variant_id")
                or item.get("external_product_id")
                or index
            )
            result.append(
                {
                    "id": option_id,
                    "value": option_id,
                    "label": self._text(item.get("option_name") or item.get("name") or f"Option {index}"),
                    "price": item.get("price"),
                    "currency": item.get("currency") or "USD",
                    "api_data": item,
                }
            )
        return result

    def _pickup_choices(self, locations: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {
                "id": item.get("id"),
                "value": item.get("id"),
                "label": self._text(item.get("name")),
                "description": self._text(item.get("zone_name")),
                "api_data": item,
            }
            for item in locations
            if item.get("id") is not None
        ]

    # ------------------------------------------------------------------
    # Conversational routing
    # ------------------------------------------------------------------

    def _answer_booking_question(
        self,
        *,
        state: BookingConversationState,
        topic: str,
        seller: Mapping[str, Any],
        products: list[dict[str, Any]],
    ) -> AgentResponse:
        topic = topic or self._infer_question_topic(
            state.last_user_message
        )

        preview = state.booking_preview
        if not preview and self._state_is_complete(state):
            try:
                preview = self._build_preview(
                    state,
                    seller=seller,
                    products=products,
                )
                state.booking_preview = preview
            except (ValueError, SellerApiError):
                preview = {}

        answers = {
            "product": (
                state.product.name
                if state.product
                else "No product has been selected yet."
            ),
            "option": (
                state.live_option.option_name
                if state.live_option
                else "No ticket option has been selected yet."
            ),
            "date": (
                state.service_date
                or "No service date has been selected yet."
            ),
            "time": (
                state.service_time
                or (
                    state.live_option.start_time
                    if state.live_option
                    else ""
                )
                or "No service time is available yet."
            ),
            "guests": (
                f"{state.guests.adults} adult(s), "
                f"{state.guests.children} child(ren), "
                f"{state.guests.infants} infant(s)."
            ),
            "customer": (
                state.customer.name
                or "No customer name has been provided yet."
            ),
            "contact": (
                state.customer.whatsapp
                or state.customer.email
                or "No customer contact has been provided yet."
            ),
            "hotel": (
                state.pickup.name
                if state.pickup
                else (
                    state.customer.hotel
                    or "No hotel has been selected yet."
                )
            ),
            "pickup": self._pickup_answer(state),
            "payment": (
                self._payment_label(state.payment.action)
                if state.payment.action
                else "No payment action has been selected yet."
            ),
            "discount": self._discount_answer(state, preview),
            "price": self._money_answer(preview, "subtotal_amount"),
            "subtotal": self._money_answer(
                preview,
                "subtotal_amount",
            ),
            "total": self._money_answer(preview, "total_amount"),
            "balance": self._money_answer(preview, "balance_due"),
            "deposit": self._money_answer(
                preview,
                "deposit_required",
            ),
            "booking": self._booking_summary_answer(state, preview),
            "availability": (
                "The selected option is available."
                if state.live_option
                else "Availability has not been selected yet."
            ),
        }

        message = answers.get(
            topic,
            self._booking_summary_answer(state, preview),
        )

        return self._response(
            state,
            message,
            status=state.status,
            requires_confirmation=state.awaiting_confirmation,
            booking_preview=preview,
        )

    def _validate_discount_request(
        self,
        *,
        state: BookingConversationState,
        seller: Mapping[str, Any],
        products: list[dict[str, Any]],
    ) -> AgentResponse | None:
        requested_percent = self._money_decimal(
            state.requested_discount_percent
        )
        requested_amount = self._money_decimal(
            state.requested_discount_amount
        )

        if (
            requested_percent <= Decimal("0.00")
            and requested_amount <= Decimal("0.00")
        ):
            return None

        if not state.product:
            return None

        product = next(
            (
                item
                for item in products
                if self._optional_int(item.get("id"))
                == state.product.product_id
            ),
            None,
        )
        if not isinstance(product, Mapping):
            return None

        maximum_percent = self._seller_discount_limit_percent(
            seller=seller,
            product=product,
        )

        if maximum_percent <= Decimal("0.00"):
            state.requested_discount_amount = "0.00"
            state.requested_discount_percent = ""
            state.mark_changed()
            return self._response(
                state,
                "This seller is not allowed to apply a discount to this product.",
                status="collecting",
            )

        if requested_percent > maximum_percent:
            state.metadata[
                "pending_discount_offer_percent"
            ] = self._money_string(maximum_percent)
            state.requested_discount_amount = "0.00"
            state.requested_discount_percent = ""
            state.mark_changed()
            return self._response(
                state,
                (
                    "The maximum allowed discount is "
                    f"{self._money_string(maximum_percent)}%. "
                    "Would you like me to apply that?"
                ),
                status="collecting",
            )

        if requested_amount > Decimal("0.00"):
            subtotal = self._estimated_subtotal(state, product)
            maximum_amount = self._money(
                subtotal
                * maximum_percent
                / Decimal("100")
            )
            if requested_amount > maximum_amount:
                state.metadata[
                    "pending_discount_offer_percent"
                ] = self._money_string(maximum_percent)
                state.requested_discount_amount = "0.00"
                state.requested_discount_percent = ""
                state.mark_changed()
                return self._response(
                    state,
                    (
                        "That discount is above the allowed limit. "
                        "The maximum allowed discount is "
                        f"{self._money_string(maximum_percent)}%. "
                        "Would you like me to apply that?"
                    ),
                    status="collecting",
                )

        return None

    def _estimated_subtotal(
        self,
        state: BookingConversationState,
        product: Mapping[str, Any],
    ) -> Decimal:
        if state.live_option:
            unit_price = self._money_decimal(
                state.live_option.unit_price
            )
            quantity = max(1, state.guests.total)
        else:
            unit_price = self._money_decimal(
                product.get("base_price")
            )
            quantity = max(
                1,
                state.guests.adults + state.guests.children,
            )
        return self._money(unit_price * Decimal(quantity))

    def _update_progress(
        self,
        state: BookingConversationState,
    ) -> None:
        complete: list[str] = []
        missing: list[str] = []

        checks = {
            "product": state.product is not None,
            "service_date": bool(state.service_date),
            "live_option": (
                state.product is None
                or not state.product.is_live_product
                or state.live_option is not None
            ),
            "pickup": (
                state.product is None
                or not (
                    state.product.requires_pickup_location
                    or state.product.supports_pickup
                )
                or state.pickup is not None
            ),
            "customer_name": bool(state.customer.name),
            "customer_contact": bool(
                state.customer.whatsapp
                or state.customer.email
            ),
            "payment": bool(state.payment.action),
        }

        for field_name, is_complete in checks.items():
            (complete if is_complete else missing).append(
                field_name
            )

        state.update_progress(
            complete_fields=complete,
            missing_fields=missing,
            ambiguous_fields=(
                state.current_intent.ambiguous_fields
            ),
        )

    def _state_is_complete(
        self,
        state: BookingConversationState,
    ) -> bool:
        self._update_progress(state)
        return not state.progress.missing_fields

    @staticmethod
    def _clarification_message(
        interpretation: Mapping[str, Any],
    ) -> str:
        ambiguous = SellerBookingWorkflow._string_list(
            interpretation.get("ambiguous_fields")
        )
        if ambiguous:
            return (
                "I need clarification about: "
                + ", ".join(ambiguous)
                + "."
            )
        return "Could you clarify what you would like me to change?"

    @classmethod
    def _infer_question_topic(cls, value: Any) -> str:
        text = cls._normalise_phrase(value)
        keywords = (
            ("discount", ("discount", "descuento", "por ciento", "%")),
            ("total", ("total", "cuanto queda", "how much")),
            ("hotel", ("hotel", "pickup", "recogida")),
            ("date", ("date", "fecha", "dia")),
            ("option", ("option", "opcion", "premium", "regular")),
            ("payment", ("payment", "pago", "pagar")),
            ("customer", ("customer", "cliente", "nombre")),
        )
        for topic, terms in keywords:
            if any(term in text for term in terms):
                return topic
        return "booking"

    @staticmethod
    def _pickup_answer(
        state: BookingConversationState,
    ) -> str:
        if not state.pickup:
            return "No pickup location has been selected yet."
        answer = state.pickup.name
        if state.pickup.resolved_pickup_time:
            answer += f" at {state.pickup.resolved_pickup_time}"
        if (
            state.pickup.resolved_pickup_point
            or state.pickup.default_pickup_point
        ):
            answer += (
                " — "
                + (
                    state.pickup.resolved_pickup_point
                    or state.pickup.default_pickup_point
                )
            )
        return answer + "."

    @staticmethod
    def _money_answer(
        preview: Mapping[str, Any],
        field: str,
    ) -> str:
        value = str(preview.get(field) or "").strip()
        currency = str(preview.get("currency") or "USD").strip()
        return f"{currency} {value}" if value else "The amount is not available yet."

    @staticmethod
    def _discount_answer(
        state: BookingConversationState,
        preview: Mapping[str, Any],
    ) -> str:
        amount = str(
            preview.get("discount_amount")
            or state.requested_discount_amount
            or "0.00"
        )
        percent = str(
            preview.get("discount_percent")
            or state.requested_discount_percent
            or "0.00"
        )
        if amount in {"", "0", "0.00"} and percent in {
            "",
            "0",
            "0.00",
        }:
            return "No discount has been applied."
        return (
            f"Yes. The applied discount is {percent}% "
            f"({amount})."
        )

    def _booking_summary_answer(
        self,
        state: BookingConversationState,
        preview: Mapping[str, Any],
    ) -> str:
        parts: list[str] = []
        if state.product:
            parts.append(state.product.name)
        if state.live_option:
            parts.append(state.live_option.option_name)
        if state.service_date:
            parts.append(state.service_date)
        parts.append(
            f"{state.guests.adults} adult(s)"
        )
        if state.pickup:
            parts.append(f"pickup at {state.pickup.name}")
        if state.customer.name:
            parts.append(f"customer: {state.customer.name}")
        total = self._text(preview.get("total_amount"))
        if total:
            parts.append(f"total: {total}")
        return (
            "Current booking: " + "; ".join(parts) + "."
            if parts
            else "The booking draft is still empty."
        )

    @staticmethod
    def _string_list(value: Any) -> list[str]:
        if not isinstance(value, (list, tuple)):
            return []
        return [
            str(item).strip()
            for item in value
            if str(item).strip()
        ]

    @staticmethod
    def _float(value: Any, *, default: float = 0.0) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    # ------------------------------------------------------------------
    # Seller permission-shaped fields
    # ------------------------------------------------------------------

    def _allowed_payment_actions(self, seller: Mapping[str, Any]) -> list[str]:
        explicit = seller.get("allowed_payment_actions")
        if isinstance(explicit, list):
            return [self._text(item) for item in explicit if self._text(item)]

        permissions = seller.get("permissions")
        source = permissions if isinstance(permissions, Mapping) else seller

        field_map = (
            ("can_create_pending_payment_booking", "pending_payment"),
            ("can_create_deposit_online_booking", "deposit_online"),
            ("can_create_full_online_booking", "full_online"),
            ("can_collect_cash_full", "cash_full"),
            ("can_record_seller_deposit", "seller_deposit"),
            ("can_record_seller_full_payment", "seller_full"),
            ("can_create_commission_only_booking", "commission_only"),
            ("can_generate_ticket", "generate_ticket"),
            ("requires_supervisor_approval", "requires_supervisor_approval"),
        )
        return [action for field, action in field_map if source.get(field) is True]

    @staticmethod
    def _payment_label(action: str) -> str:
        labels = {
            "pending_payment": "payment pending",
            "deposit_online": "online deposit",
            "full_online": "full online payment",
            "cash_full": "full cash payment",
            "seller_deposit": "seller deposit",
            "seller_full": "seller full payment",
            "commission_only": "commission only",
            "generate_ticket": "generate ticket",
            "requires_supervisor_approval": "supervisor approval",
        }
        return labels.get(action, action.replace("_", " "))

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _is_confirmation(
        self,
        *,
        state: BookingConversationState,
        interpretation: Mapping[str, Any],
        intent: str,
    ) -> bool:
        """
        Return True only for a clear confirmation while a preview is pending.

        The AI interpretation remains primary. The text fallback exists so a
        simple reply such as "yes please" cannot get trapped in a repeated
        confirmation loop.
        """

        if intent in self.CONFIRM_INTENTS:
            return True

        if interpretation.get("confirmed") is True:
            return True

        return self._is_clear_confirmation_text(
            state.last_user_message
        )

    @classmethod
    def _is_clear_confirmation_text(cls, value: Any) -> bool:
        normalised = cls._normalise_phrase(value)

        if not normalised:
            return False

        exact_phrases = {
            "yes",
            "yes please",
            "please",
            "confirm",
            "confirmed",
            "confirm it",
            "book it",
            "create it",
            "go ahead",
            "do it",
            "ok",
            "okay",
            "sure",
            "si",
            "si por favor",
            "confirmar",
            "confirmalo",
            "confirmala",
            "crealo",
            "creala",
            "hazlo",
            "dale",
            "oui",
            "oui s il vous plait",
            "confirme",
            "vas y",
            "sim",
            "sim por favor",
            "confirma",
            "pode confirmar",
            "ja",
            "bitte",
            "bestaetigen",
        }

        if normalised in exact_phrases:
            return True

        confirmation_patterns = (
            r"^(yes|si|oui|sim|ja)\b.*$",
            r"^(please\s+)?(confirm|book|create|do)\s+(it|this)(\s+please)?$",
            r"^(go\s+ahead|dale|hazlo|crealo|confirmalo)(\s+please)?$",
        )

        return any(
            re.fullmatch(pattern, normalised)
            for pattern in confirmation_patterns
        )

    @staticmethod
    def _normalise_phrase(value: Any) -> str:
        text = unicodedata.normalize(
            "NFKD",
            str(value or ""),
        )
        text = "".join(
            character
            for character in text
            if not unicodedata.combining(character)
        )
        text = text.casefold()
        text = re.sub(r"[^a-z0-9]+", " ", text)
        return " ".join(text.split())

    def _rank_items(
        self,
        phrase: str,
        items: list[dict[str, Any]],
        *,
        fields: tuple[str, ...],
    ) -> list[tuple[float, dict[str, Any]]]:
        ranked=[]
        for item in items:
            scores=[self._similarity(phrase,self._text(item.get(f))) for f in fields if self._text(item.get(f))]
            score=max(scores,default=0.0)
            if score>0:
                ranked.append((score,item))
        ranked.sort(key=lambda p:p[0],reverse=True)
        return ranked

    @staticmethod
    def _similarity(left:str,right:str)->float:
        def norm(v):
            v=unicodedata.normalize("NFKD",str(v or ""))
            v="".join(c for c in v if not unicodedata.combining(c))
            v=v.casefold()
            v=re.sub(r"[^a-z0-9]+"," ",v)
            return " ".join(v.split())
        l=norm(left); r=norm(right)
        if not l or not r: return 0.0
        if l==r: return 1.0
        if l in r: return 0.95
        if r in l: return 0.93
        lt=set(l.split()); rt=set(r.split())
        overlap=max(len(lt&rt)/max(len(lt),1),len(lt&rt)/max(len(rt),1))
        return max(overlap,SequenceMatcher(None,l,r).ratio())

    @staticmethod
    def _choice_by_id(choices: list[dict[str, Any]], selected_id: str) -> dict[str, Any] | None:
        selected_id = str(selected_id).strip()
        for item in choices:
            if selected_id in {str(item.get("id") or "").strip(), str(item.get("value") or "").strip()}:
                return item
        return None

    @staticmethod
    def _clean_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
        cleaned = {}
        for key, value in payload.items():
            if value is None or value == "":
                continue
            if isinstance(value, Mapping):
                nested = SellerBookingWorkflow._clean_payload(value)
                if nested:
                    cleaned[key] = nested
            elif isinstance(value, list):
                cleaned_list = [
                    SellerBookingWorkflow._clean_payload(item) if isinstance(item, Mapping) else item
                    for item in value
                    if item not in (None, "")
                ]
                if cleaned_list or key == "payments_payload":
                    cleaned[key] = cleaned_list
            else:
                cleaned[key] = value
        return cleaned

    @staticmethod
    def _reset_state(state: BookingConversationState) -> None:
        state.status = "collecting"
        state.product_phrase = ""
        state.option_phrase = ""
        state.pickup_phrase = ""
        state.service_date = ""
        state.service_time = ""
        state.guests = GuestCounts()
        state.customer = CustomerDetails()
        state.payment = PaymentSelection()
        state.requested_discount_amount = "0.00"
        state.requested_discount_percent = ""
        state.product = None
        state.live_option = None
        state.pickup = None
        state.pending_selection = None
        state.booking_preview = {}
        state.created_booking = {}
        state.awaiting_confirmation = False
        state.seller_confirmed = False
        state.error_message = ""
        state.current_intent = state.current_intent.__class__()
        state.progress = state.progress.__class__()
        state.conversation_history = []
        state.metadata.pop("pending_discount_offer_percent", None)

    @staticmethod
    def _response(
        state: BookingConversationState,
        message: str,
        *,
        status: str,
        requires_reply: bool = True,
        requires_confirmation: bool = False,
        booking_created: bool = False,
        choices: list[dict[str, Any]] | None = None,
        booking_preview: dict[str, Any] | None = None,
        booking: dict[str, Any] | None = None,
    ) -> AgentResponse:
        state.status = status  # type: ignore[assignment]
        state.last_assistant_message = message
        state.append_turn(
            role="assistant",
            text=message,
            intent=state.current_intent.action,
        )
        return AgentResponse(
            conversation_id=state.conversation_id,
            message=message,
            status=status,  # type: ignore[arg-type]
            requires_reply=requires_reply,
            requires_confirmation=requires_confirmation,
            booking_created=booking_created,
            choices=choices or [],
            booking_preview=booking_preview or {},
            booking=booking or {},
        )

    @staticmethod
    def _normalise_service_date(value: Any) -> str:
        """
        Accept only the ISO date produced by the AI interpreter.
        """

        raw_value = str(value or "").strip()

        if not raw_value:
            return ""

        try:
            return date.fromisoformat(raw_value).isoformat()
        except ValueError:
            return ""

    @staticmethod
    def _text(value: Any) -> str:
        return str(value or "").strip()

    @staticmethod
    def _optional_int(value: Any) -> int | None:
        try:
            return int(value) if value not in (None, "") else None
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _int(value: Any, default: int, minimum: int = 0) -> int:
        try:
            return max(minimum, int(value)) if value not in (None, "") else max(minimum, default)
        except (TypeError, ValueError):
            return max(minimum, default)

    @staticmethod
    def _decimal(value: Any, *, default: str) -> str:
        try:
            return f"{float(value):.2f}"
        except (TypeError, ValueError):
            return default
    