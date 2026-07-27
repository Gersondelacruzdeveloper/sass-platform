# ticketing/ai/seller/prompts.py

from __future__ import annotations

import json
from dataclasses import asdict
from typing import Any, Mapping

from django.utils import timezone

from .schemas import BookingConversationState, SellerMessage


SELLER_BOOKING_SYSTEM_PROMPT = """
You are the conversational interpreter for an authenticated ticket seller.

Your only job is to understand the seller's message and return structured JSON
for the seller booking workflow.

You do not create bookings.
You do not call APIs.
You do not decide business rules.
You do not calculate authoritative prices.
You do not approve discounts.
You do not decide whether a seller has permission.
You do not invent IDs.
You do not invent availability.
You do not invent pickup schedules.
You do not invent customer information.

The existing Ticketing APIs are the single source of truth.

GENERAL BEHAVIOUR

1. Understand informal, abbreviated, misspelled and multilingual messages.
2. Extract only information that the seller clearly provided.
3. Use existing conversation state when the seller is continuing a booking.
4. Do not erase previously collected information unless the seller changes it.
5. Ask for missing information through the workflow, not in your JSON response.
6. Never guess a product ID, pickup ID or external provider ID.
7. Product, option and pickup names may be extracted as phrases.
8. Exact IDs may only be returned when they already appear in trusted choices
   supplied in the prompt.
9. Understand natural-language dates in any supported language, including
   informal wording, abbreviations and spelling mistakes.

   The prompt context provides the current local date, current local datetime
   and timezone.

   Always resolve a clearly supplied date into ISO format: YYYY-MM-DD.

   Examples of expressions you must understand include:
   - today, tomorrow, the day after tomorrow
   - hoy, mañana, pasado mañana
   - aujourd'hui, demain, après-demain
   - hoje, amanhã, depois de amanhã
   - heute, morgen, übermorgen
   - this Friday, next Tuesday, this weekend
   - in two days, three days from now
   - July 30, 30 July, the 30th
   - misspellings such as "tomorow" when the intended meaning is clear

   Use the supplied current local date and timezone to resolve relative dates.

   Never return unresolved relative-date wording in service_date.
   Never return values such as "tomorrow", "tomorow", "mañana" or
   "next Friday" in service_date.

   If the date is clearly understood, service_date must contain YYYY-MM-DD.
   If the date is genuinely ambiguous or was not provided, return an empty
   string instead of guessing.

10. Return valid JSON only. Do not use Markdown.

SUPPORTED INTENTS

- provide_information
- modify_booking
- question
- confirm
- cancel
- reset
- new_booking
- small_talk
- clarification
- select_choice
- unknown

CONVERSATIONAL BEHAVIOUR

Treat the seller as an experienced human, not as someone filling out a form.

- If the seller provides several pieces of information in one message, extract all of them.
- Never ask again for information that already exists in the conversation state.
- If only one field is missing, ask only for that field.
- If the seller asks a question about the current draft, answer the question instead of trying to continue data collection.
- If the seller changes one field (discount, hotel, date, option, guests, payment), update only that field.
- Preserve every other field already collected.
- Do not reset the booking because the seller asked a question.
- Do not change the ticket option unless the seller explicitly requests a different option.
- If the seller requests a discount, extract it only. Do not decide whether it is allowed.
- If the seller says "15 de descuento" and the message is ambiguous between an amount and a percentage, leave the discount empty so the workflow can ask a clarification.

INTERPRETATION RULES

Product:
- Put the seller's product wording in product_phrase.
- Use product_id only when selected from trusted product choices.
- Do not match or invent an ID yourself.

Live ticket option:
- Put the seller's wording in option_phrase.
- Use external IDs only when selected from trusted live-option choices.

Pickup:
- Put the hotel, area or pickup wording in pickup_phrase.
- Compare the seller's wording against the complete trusted_pickup_locations
  list supplied in the prompt.
- Understand informal names, abbreviations, multilingual wording and obvious
  spelling mistakes.
- When one trusted location is clearly intended, return its exact ID in
  pickup_location_id.
- Never invent a pickup ID and never return an ID outside the trusted list.
- If more than one location remains genuinely possible, leave
  pickup_location_id null so the workflow can ask the seller to choose.

Guests:
- "two people" normally means two adults unless the seller says otherwise.
- Never assume children or infants.
- Guest values must be whole non-negative numbers.
- Adults should normally be at least one for a booking.

Customer:
- Extract customer name, WhatsApp, email, hotel and notes separately.
- Do not place seller information into customer fields.
- Do not invent a missing email or telephone number.

Payment:
- Extract the seller's requested payment action.
- Use only one of the supported values when clearly understood:
  pending_payment
  deposit_online
  full_online
  cash_full
  seller_deposit
  seller_full
  commission_only
  generate_ticket
  requires_supervisor_approval
- Do not decide whether the action is allowed.

Discount:
- Extract discount_amount when the seller gives a fixed amount.
- Extract discount_percent when the seller gives a percentage.
- Do not calculate the permitted or final discount.
- Do not silently correct the amount.

Confirmation:
- Use intent "confirm" only when the seller clearly agrees to create the
  previewed booking.
- Statements such as "yes", "book it", "confirm it" and "go ahead" may mean
  confirmation when the conversation is awaiting confirmation.
- Do not treat an initial booking request as final confirmation.

Selection:
- When trusted choices are present, the seller may select by:
  - choice number
  - exact ID
  - label or approximate phrase
- Put the one-based number in selection_index.
- Put an exact trusted ID in selection_id.
- Put natural wording in selection_phrase.

Changes:
- If the seller changes a previously supplied field, return the new value.
- Use intent "change" when the seller explicitly asks to edit the preview.
- The workflow will invalidate dependent selections where necessary.

Cancellation:
- Use intent "cancel" when the seller wants to stop the current booking draft.
- This does not mean cancelling an already-created booking unless explicitly
  handled through another workflow.

Reset:
- Use intent "reset" or "new_booking" when the seller wants to discard the
  current draft and begin again.

LANGUAGE

Return the detected message language as a short language code where possible:

- en
- es
- fr
- pt
- de

OUTPUT FORMAT

Return one JSON object using this structure:

{
  "intent": "provide_information",
  "question_topic": "",
  "changes": {},
  "language": "en",

  "product_phrase": "",
  "product_id": null,

  "service_date": "",
  "service_time": "",

  "option_phrase": "",
  "external_product_id": "",
  "external_variant_id": "",
  "external_availability_id": "",
  "selected_external_product_id": "",

  "pickup_phrase": "",
  "pickup_location_id": null,

  "guests": {
    "adults": null,
    "children": null,
    "infants": null
  },

  "customer": {
    "name": "",
    "whatsapp": "",
    "email": "",
    "hotel": "",
    "notes": ""
  },

  "payment_action": "",
  "payment_reference": "",
  "payment_note": "",

  "discount_amount": "",
  "discount_percent": "",

  "selection_id": "",
  "selection_index": null,
  "selection_phrase": "",

  "confirmed": false,

  "abbreviations": {},
  "corrections": {},
  "communication_style": ""
}

EMPTY VALUES

- Use an empty string for unknown text fields.
- Use null for unknown numeric fields.
- Use false for confirmed unless the seller clearly confirms.
- Do not repeat values merely because they exist in state unless the current
  message refers to or changes them.
- Return only fields supported by the output structure.
""".strip()


SELLER_BOOKING_JSON_SCHEMA: dict[str, Any] = {
    "name": "seller_booking_interpretation",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "intent": {
                "type": "string",
                "enum": [
                    "provide_information",
                    "select_choice",
                    "confirm",
                    "modify_booking",
                    "question",
                    "small_talk",
                    "clarification",
                    "cancel",
                    "reset",
                    "new_booking",
                    "unknown",
                ],
            },
            "language": {
                "type": "string",
            },
            "product_phrase": {
                "type": "string",
            },
            "product_id": {
                "type": ["integer", "null"],
            },
            "service_date": {
                "type": "string",
            },
            "service_time": {
                "type": "string",
            },
            "option_phrase": {
                "type": "string",
            },
            "external_product_id": {
                "type": "string",
            },
            "external_variant_id": {
                "type": "string",
            },
            "external_availability_id": {
                "type": "string",
            },
            "selected_external_product_id": {
                "type": "string",
            },
            "pickup_phrase": {
                "type": "string",
            },
            "pickup_location_id": {
                "type": ["integer", "null"],
            },
            "guests": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "adults": {
                        "type": ["integer", "null"],
                    },
                    "children": {
                        "type": ["integer", "null"],
                    },
                    "infants": {
                        "type": ["integer", "null"],
                    },
                },
                "required": [
                    "adults",
                    "children",
                    "infants",
                ],
            },
            "customer": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "name": {
                        "type": "string",
                    },
                    "whatsapp": {
                        "type": "string",
                    },
                    "email": {
                        "type": "string",
                    },
                    "hotel": {
                        "type": "string",
                    },
                    "notes": {
                        "type": "string",
                    },
                },
                "required": [
                    "name",
                    "whatsapp",
                    "email",
                    "hotel",
                    "notes",
                ],
            },
            "payment_action": {
                "type": "string",
                "enum": [
                    "",
                    "pending_payment",
                    "deposit_online",
                    "full_online",
                    "cash_full",
                    "seller_deposit",
                    "seller_full",
                    "commission_only",
                    "generate_ticket",
                    "requires_supervisor_approval",
                ],
            },
            "payment_reference": {
                "type": "string",
            },
            "payment_note": {
                "type": "string",
            },
            "discount_amount": {
                "type": "string",
            },
            "discount_percent": {
                "type": "string",
            },
            "selection_id": {
                "type": "string",
            },
            "selection_index": {
                "type": ["integer", "null"],
            },
            "selection_phrase": {
                "type": "string",
            },
            "confirmed": {
                "type": "boolean",
            },
            "abbreviations": {
                "type": "object",
                "additionalProperties": {
                    "type": "string",
                },
            },
            "corrections": {
                "type": "object",
                "additionalProperties": {
                    "type": "string",
                },
            },
            "communication_style": {
                "type": "string",
            },
        },
        "required": [
            "intent",
            "language",
            "product_phrase",
            "product_id",
            "service_date",
            "service_time",
            "option_phrase",
            "external_product_id",
            "external_variant_id",
            "external_availability_id",
            "selected_external_product_id",
            "pickup_phrase",
            "pickup_location_id",
            "guests",
            "customer",
            "payment_action",
            "payment_reference",
            "payment_note",
            "discount_amount",
            "discount_percent",
            "selection_id",
            "selection_index",
            "selection_phrase",
            "confirmed",
            "abbreviations",
            "corrections",
            "communication_style",
        ],
    },
}


def build_interpreter_messages(
    *,
    message: SellerMessage,
    state: BookingConversationState,
    seller: Mapping[str, Any],
    products: list[dict[str, Any]],
    trusted_pickup_locations: list[dict[str, Any]],
    memory: Mapping[str, Any] | None = None,
) -> list[dict[str, str]]:
    """
    Build messages for the natural-language interpreter.

    Only conversationally useful seller and product information is included.
    Sensitive credentials and unrelated seller fields are excluded.
    """

    context = build_interpreter_context(
        message=message,
        state=state,
        seller=seller,
        products=products,
        trusted_pickup_locations=trusted_pickup_locations,
        memory=memory,
    )

    return [
        {
            "role": "system",
            "content": SELLER_BOOKING_SYSTEM_PROMPT,
        },
        {
            "role": "user",
            "content": json.dumps(
                context,
                ensure_ascii=False,
                default=str,
            ),
        },
    ]


def build_interpreter_context(
    *,
    message: SellerMessage,
    state: BookingConversationState,
    seller: Mapping[str, Any],
    products: list[dict[str, Any]],
    trusted_pickup_locations: list[dict[str, Any]],
    memory: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Create a compact, safe context payload for the interpreter.
    """

    return {
        "task": (
            "Interpret the latest seller message using the current booking "
            "state and trusted choices. Understand informal, misspelled and "
            "multilingual language. Resolve every clearly understood natural-"
            "language date into service_date using YYYY-MM-DD and the supplied "
            "local date and timezone. Never return unresolved relative-date "
            "words in service_date. Return JSON only."
        ),
        "runtime": build_runtime_context(),
        "latest_message": {
            "text": message.text,
            "language_hint": message.language or "",
        },
        "conversation": build_safe_state_context(state),
        "seller": build_safe_seller_context(seller),
        "trusted_products": [
            build_safe_product_context(product)
            for product in products
            if isinstance(product, dict)
        ],
        "trusted_pickup_locations": [
            build_safe_pickup_location_context(location)
            for location in trusted_pickup_locations
            if isinstance(location, Mapping)
        ],
        "trusted_pending_choices": build_safe_pending_choices(state),
        "seller_language_memory": build_safe_memory_context(memory or {}),
    }


def build_runtime_context() -> dict[str, str]:
    """
    Provide trusted local date and timezone context for date interpretation.

    Relative expressions such as "tomorrow", "next Friday" and multilingual
    equivalents cannot be resolved reliably unless the interpreter knows the
    organisation's current local date.
    """

    current_timezone = timezone.get_current_timezone()
    current_local_datetime = timezone.localtime(
        timezone.now(),
        current_timezone,
    )

    return {
        "current_local_date": current_local_datetime.date().isoformat(),
        "current_local_datetime": current_local_datetime.isoformat(),
        "timezone": timezone.get_current_timezone_name(),
        "required_service_date_format": "YYYY-MM-DD",
    }


def build_safe_state_context(
    state: BookingConversationState,
) -> dict[str, Any]:
    """
    Include current progress without exposing unrelated internal metadata.
    """

    return {
        "conversation_id": state.conversation_id,
        "status": state.status,
        "preferred_language": state.preferred_language,
        "product_phrase": state.product_phrase,
        "option_phrase": state.option_phrase,
        "pickup_phrase": state.pickup_phrase,
        "service_date": state.service_date,
        "service_time": state.service_time,
        "guests": state.guests.to_dict(),
        "customer": {
            "name": state.customer.name,
            "has_whatsapp": bool(state.customer.whatsapp),
            "has_email": bool(state.customer.email),
            "hotel": state.customer.hotel,
            "notes": state.customer.notes,
        },
        "payment_action": state.payment.action or "",
        "requested_discount_amount": state.requested_discount_amount,
        "requested_discount_percent": state.requested_discount_percent,
        "selected_product": (
            {
                "id": state.product.product_id,
                "name": state.product.name,
                "slug": state.product.slug,
                "is_live_product": state.product.is_live_product,
                "requires_pickup_location": (
                    state.product.requires_pickup_location
                ),
                "supports_pickup": state.product.supports_pickup,
            }
            if state.product
            else None
        ),
        "selected_live_option": (
            {
                "provider": state.live_option.provider,
                "option_name": state.live_option.option_name,
                "external_product_id": (
                    state.live_option.external_product_id
                ),
                "external_variant_id": (
                    state.live_option.external_variant_id
                ),
                "external_availability_id": (
                    state.live_option.external_availability_id
                ),
                "selected_external_product_id": (
                    state.live_option.selected_external_product_id
                ),
            }
            if state.live_option
            else None
        ),
        "selected_pickup": (
            {
                "id": state.pickup.pickup_location_id,
                "name": state.pickup.name,
                "zone_name": state.pickup.zone_name,
                "resolved_pickup_time": (
                    state.pickup.resolved_pickup_time
                ),
            }
            if state.pickup
            else None
        ),
        "awaiting_confirmation": state.awaiting_confirmation,
    }


def build_safe_seller_context(
    seller: Mapping[str, Any],
) -> dict[str, Any]:
    """
    Pass only conversational and permission-shaped seller information.
    """

    safe_keys = (
        "id",
        "name",
        "display_name",
        "preferred_language",
        "language",
        "role",
        "allowed_payment_actions",
        "permissions",
        "can_apply_discounts",
        "maximum_discount_percent",
        "max_discount_percent",
        "can_create_pending_payment_booking",
        "can_create_deposit_online_booking",
        "can_create_full_online_booking",
        "can_collect_cash_full",
        "can_record_seller_deposit",
        "can_record_seller_full_payment",
        "can_create_commission_only_booking",
        "can_generate_ticket",
        "requires_supervisor_approval",
    )

    return {
        key: seller.get(key)
        for key in safe_keys
        if key in seller
    }


def build_safe_product_context(
    product: Mapping[str, Any],
) -> dict[str, Any]:
    """
    Provide trusted product data used only for language matching.
    """

    safe_keys = (
        "id",
        "name",
        "slug",
        "product_type",
        "short_description",
        "description",
        "location",
        "is_active",
        "supports_pickup",
        "requires_pickup_location",
        "external_provider",
        "external_product_id",
        "is_cocobongo_product",
    )

    return {
        key: product.get(key)
        for key in safe_keys
        if key in product
    }


def build_safe_pickup_location_context(
    location: Mapping[str, Any],
) -> dict[str, Any]:
    """
    Provide trusted pickup-location data for semantic matching by the model.

    The model may understand misspellings and informal hotel names, but it may
    only return an exact ID from this trusted list.
    """

    safe_keys = (
        "id",
        "name",
        "zone_name",
        "address",
        "default_pickup_point",
    )

    return {
        key: location.get(key)
        for key in safe_keys
        if key in location
    }


def build_safe_pending_choices(
    state: BookingConversationState,
) -> list[dict[str, Any]]:
    """
    Choices are trusted because they were created from API responses by
    workflow.py.
    """

    if not state.pending_selection:
        return []

    safe_choices: list[dict[str, Any]] = []

    for index, choice in enumerate(
        state.pending_selection.choices,
        start=1,
    ):
        if not isinstance(choice, Mapping):
            continue

        safe_choices.append(
            {
                "choice_number": index,
                "id": choice.get("id"),
                "value": choice.get("value"),
                "label": choice.get("label"),
                "description": choice.get("description"),
                "price": choice.get("price"),
                "currency": choice.get("currency"),
                "start_time": choice.get("start_time"),
            }
        )

    return safe_choices


def build_safe_memory_context(
    memory: Mapping[str, Any],
) -> dict[str, Any]:
    """
    Long-term memory is limited to language interpretation preferences.
    """

    safe_keys = (
        "preferred_language",
        "product_aliases",
        "pickup_aliases",
        "abbreviations",
        "common_misspellings",
        "corrections",
        "communication_style",
    )

    return {
        key: memory.get(key)
        for key in safe_keys
        if key in memory
    }


def empty_interpretation() -> dict[str, Any]:
    """
    Return the complete empty interpretation shape.

    Useful when normalising provider responses or writing tests.
    """

    return {
        "intent": "unknown",
        "question_topic": "",
        "changes": {},
        "language": "",
        "product_phrase": "",
        "product_id": None,
        "service_date": "",
        "service_time": "",
        "option_phrase": "",
        "external_product_id": "",
        "external_variant_id": "",
        "external_availability_id": "",
        "selected_external_product_id": "",
        "pickup_phrase": "",
        "pickup_location_id": None,
        "guests": {
            "adults": None,
            "children": None,
            "infants": None,
        },
        "customer": {
            "name": "",
            "whatsapp": "",
            "email": "",
            "hotel": "",
            "notes": "",
        },
        "payment_action": "",
        "payment_reference": "",
        "payment_note": "",
        "discount_amount": "",
        "discount_percent": "",
        "selection_id": "",
        "selection_index": None,
        "selection_phrase": "",
        "confirmed": False,
        "abbreviations": {},
        "corrections": {},
        "communication_style": "",
    }


def normalise_interpretation(
    value: Any,
) -> dict[str, Any]:
    """
    Merge a provider response into the expected interpretation structure.
    """

    result = empty_interpretation()

    if not isinstance(value, Mapping):
        return result

    for key in result:
        if key not in value:
            continue

        if key in {"guests", "customer"}:
            if isinstance(value[key], Mapping):
                result[key].update(value[key])
            continue

        result[key] = value[key]

    result["intent"] = str(
        result.get("intent") or "unknown"
    ).strip()

    result["language"] = str(
        result.get("language") or ""
    ).strip().lower()

    result["product_phrase"] = str(
        result.get("product_phrase") or ""
    ).strip()

    result["option_phrase"] = str(
        result.get("option_phrase") or ""
    ).strip()

    result["pickup_phrase"] = str(
        result.get("pickup_phrase") or ""
    ).strip()

    result["service_date"] = str(
        result.get("service_date") or ""
    ).strip()

    result["service_time"] = str(
        result.get("service_time") or ""
    ).strip()

    result["confirmed"] = result.get("confirmed") is True

    return result