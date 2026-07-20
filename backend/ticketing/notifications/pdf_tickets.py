from __future__ import annotations

import io
import os
import uuid
from decimal import Decimal
from typing import Any

import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

PAGE_WIDTH, PAGE_HEIGHT = A4

PDF_TICKET_GENERATOR_VERSION = "cocobongo-original-option-title-v5-2026-07-20"


def _safe_text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text or fallback


def _first_attr(obj: Any, names: list[str], fallback: str = "") -> str:
    if obj is None:
        return fallback
    for name in names:
        value = getattr(obj, name, None)
        if value not in (None, ""):
            return _safe_text(value)
    return fallback


def _valid_hex(value: Any, fallback: str) -> str:
    text = _safe_text(value, fallback)
    if not text.startswith("#"):
        text = f"#{text}"
    if len(text) not in (4, 7):
        return fallback
    try:
        colors.HexColor(text)
        return text
    except Exception:
        return fallback


def _hex(value: Any, fallback: str = "#111827"):
    return colors.HexColor(_valid_hex(value, fallback))


def _money_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value or "0"))
    except Exception:
        return Decimal("0")


def _money(value: Any, currency_symbol: str = "US$") -> str:
    amount = _money_decimal(value)
    return f"{currency_symbol}{amount:,.2f}"


def _format_date(value: Any, fallback: str = "To be confirmed") -> str:
    if hasattr(value, "strftime"):
        return value.strftime("%d %b %Y")
    return _safe_text(value, fallback)


def _format_time(value: Any, fallback: str = "To be confirmed") -> str:
    if hasattr(value, "strftime"):
        return value.strftime("%I:%M %p")
    return _safe_text(value, fallback)


def _get_public_settings(booking: Any) -> Any:
    organisation = getattr(booking, "organisation", None)
    if not organisation:
        return None

    return (
        getattr(organisation, "ticketing_public_site_settings", None)
        or getattr(organisation, "public_site_settings", None)
        or getattr(organisation, "ticketingpublicsitesettings", None)
    )


def _get_ticketing_settings(booking: Any) -> Any:
    organisation = getattr(booking, "organisation", None)
    if not organisation:
        return None
    return getattr(organisation, "ticketing_settings", None)


def _get_logo_reader(public_settings: Any) -> ImageReader | None:
    if not public_settings:
        return None

    logo = getattr(public_settings, "logo", None)
    if not logo:
        return None

    try:
        logo_path = getattr(logo, "path", None)
        if logo_path and os.path.exists(logo_path):
            return ImageReader(logo_path)
    except Exception:
        pass

    try:
        logo.open("rb")
        logo_bytes = logo.read()
        logo.close()
        if logo_bytes:
            return ImageReader(io.BytesIO(logo_bytes))
    except Exception:
        pass

    try:
        logo_url = getattr(logo, "url", None)
        if logo_url:
            return ImageReader(logo_url)
    except Exception:
        pass

    return None


def _get_first_booking_item(booking: Any) -> Any:
    try:
        items_manager = getattr(booking, "items", None)
        if not items_manager:
            return None

        first_item = items_manager.first()
        if first_item:
            return first_item

        items = list(items_manager.all()[:1])
        return items[0] if items else None
    except Exception:
        return None


def _get_container_product_name(booking: Any) -> str:
    product = (
        getattr(booking, "primary_product", None)
        or getattr(booking, "product", None)
        or getattr(booking, "tour", None)
    )

    if product:
        return _first_attr(product, ["title", "name", "display_name"], "")

    return _first_attr(booking, ["product_name", "tour_name", "title"], "")


def _get_ticket_information(booking: Any) -> str:
    """
    Return optional product-specific information that should be printed on the
    customer's ticket.

    Pickup times are intentionally not resolved here. They continue to come
    from BookingPickupInfo / ProductPickupSchedule.
    """
    product = (
        getattr(booking, "primary_product", None)
        or getattr(booking, "product", None)
        or getattr(booking, "tour", None)
    )

    if product:
        value = _safe_text(getattr(product, "ticket_information", ""))
        if value:
            return value

    first_item = _get_first_booking_item(booking)
    item_product = _get_item_product(first_item) if first_item else None

    if item_product:
        value = _safe_text(getattr(item_product, "ticket_information", ""))
        if value:
            return value

    return ""


def _extract_ticket_option_title(instructions: Any) -> str:
    """
    Extract the customer-facing option title saved in BookingItem.instructions.

    Expected format:
        Ticket option: ENTRADA FRONT ROW VIP + OPEN BAR PREMIUM + SNACK.
    """
    text = _safe_text(instructions, "")
    if not text:
        return ""

    for line in text.splitlines():
        clean_line = line.strip()
        if clean_line.lower().startswith("ticket option:"):
            return clean_line.split(":", 1)[1].strip()

    return ""


def _get_original_external_price(item: Any) -> Decimal:
    """
    Resolve the provider's original option price from the saved snapshot.

    Wellet/Coco Bongo stores it under:
        external_raw_data["price"]["amountWithoutDiscount"]
    """
    raw_data = getattr(item, "external_raw_data", None)
    if not isinstance(raw_data, dict):
        raw_data = {}

    price_data = raw_data.get("price")
    if not isinstance(price_data, dict):
        price_data = {}

    for value in (
        price_data.get("amountWithoutDiscount"),
        price_data.get("amount"),
        getattr(item, "unit_price", None),
    ):
        amount = _money_decimal(value)
        if amount > 0:
            return amount

    return Decimal("0.00")


def _format_option_title_price(value: Any) -> str:
    amount = _money_decimal(value)

    if amount == amount.to_integral_value():
        return f"${amount:,.0f}"

    return f"${amount:,.2f}"


def _get_product_name(booking: Any) -> str:
    first_item = _get_first_booking_item(booking)

    if first_item:
        option_name = (
            _extract_ticket_option_title(
                getattr(first_item, "instructions", "")
            )
            or _first_attr(first_item, ["external_option_name"], "")
            or _first_attr(first_item, ["product_name"], "")
        )

        if option_name:
            external_provider = _safe_text(
                getattr(first_item, "external_provider", "")
            ).lower()
            raw_data = getattr(first_item, "external_raw_data", None)
            has_external_snapshot = isinstance(raw_data, dict) and bool(raw_data)

            if external_provider or has_external_snapshot:
                original_price = _get_original_external_price(first_item)
                if original_price > 0:
                    return (
                        f"{_format_option_title_price(original_price)} "
                        f"{option_name}"
                    )

            return option_name

    container_name = _get_container_product_name(booking)
    return container_name or "Tour / Product"


def _to_title_case(value: str) -> str:
    """
    Convert names to a clean title/camel case while preserving apostrophes
    and hyphens.
    """
    value = _safe_text(value, "")
    if not value:
        return ""

    return " ".join(part.capitalize() for part in value.split())


def _get_customer_name(booking: Any) -> str:
    full_name = _first_attr(
        booking,
        ["customer_name", "full_name", "name", "lead_passenger_name"],
        "",
    )
    if full_name:
        return full_name

    customer = getattr(booking, "customer", None)
    if customer:
        full_name = _first_attr(customer, ["full_name", "name"], "")
        if full_name:
            return _to_title_case(full_name)

    first_name = _safe_text(getattr(booking, "customer_first_name", ""))
    last_name = _safe_text(getattr(booking, "customer_last_name", ""))
    return _to_title_case(f"{first_name} {last_name}") or "Customer"


def _get_customer_contact(booking: Any) -> str:
    email = _safe_text(getattr(booking, "customer_email", ""))
    whatsapp = _safe_text(getattr(booking, "customer_whatsapp", ""))
    phone = _safe_text(getattr(booking, "customer_phone", ""))

    if email and whatsapp:
        return f"{email} | {whatsapp}"
    return email or whatsapp or phone or "-"


def _get_booking_date(booking: Any) -> str:
    value = (
        getattr(booking, "service_date", None)
        or getattr(booking, "booking_date", None)
        or getattr(booking, "travel_date", None)
        or getattr(booking, "tour_date", None)
        or getattr(booking, "date", None)
        or getattr(booking, "start_date", None)
    )

    if not value:
        try:
            first_item = booking.items.first()
            value = getattr(first_item, "service_date", None)
        except Exception:
            value = None

    return _format_date(value)


def _get_booking_time(booking: Any) -> str:
    value = (
        getattr(booking, "service_time", None)
        or getattr(booking, "booking_time", None)
        or getattr(booking, "pickup_time", None)
        or getattr(booking, "tour_time", None)
        or getattr(booking, "time", None)
        or getattr(booking, "start_time", None)
    )

    if not value:
        try:
            first_item = booking.items.first()
            value = getattr(first_item, "service_time", None)
        except Exception:
            value = None

    return _format_time(value)


def _get_pickup_info(booking: Any) -> str:
    pickup_info = getattr(booking, "pickup_info", None)

    if pickup_info:
        hotel = _first_attr(pickup_info, ["hotel_or_location_name", "pickup_zone_name"], "")
        point = _first_attr(pickup_info, ["pickup_point"], "")
        pickup_time = _format_time(getattr(pickup_info, "pickup_time", None), "")

        parts = [part for part in [hotel, point, pickup_time] if part]
        if parts:
            return " | ".join(parts)

    pickup_point = _first_attr(
        booking,
        [
            "pickup_point",
            "pickup_location",
            "customer_hotel",
            "hotel_name",
            "hotel",
            "meeting_point",
        ],
        "",
    )
    pickup_time = _format_time(getattr(booking, "pickup_time", None), "")

    if pickup_point and pickup_time:
        return f"{pickup_point} | {pickup_time}"
    if pickup_point:
        return pickup_point
    return "To be confirmed"


def _is_transfer_booking(booking: Any) -> bool:
    product = getattr(booking, "primary_product", None) or getattr(booking, "product", None)
    product_type = _safe_text(getattr(product, "product_type", "")).lower() if product else ""

    if product_type == "transfer":
        return True

    if _first_attr(booking, ["transfer_origin", "transfer_destination"], ""):
        return True

    try:
        first_item = _get_first_booking_item(booking)
        if first_item and _safe_text(getattr(first_item, "product_type", "")).lower() == "transfer":
            return True
    except Exception:
        pass

    return False


def _extract_note_value(notes: str, labels: list[str]) -> str:
    if not notes:
        return ""

    for line in str(notes).splitlines():
        clean_line = line.strip()
        lower = clean_line.lower()

        for label in labels:
            prefix = f"{label.lower()}:"
            if lower.startswith(prefix):
                return clean_line.split(":", 1)[1].strip()

    return ""


def _get_transfer_origin(booking: Any) -> str:
    notes = _safe_text(getattr(booking, "customer_notes", ""))
    return (
        _first_attr(booking, ["transfer_origin"], "")
        or _extract_note_value(notes, ["Route from", "Pickup", "Pickup address"])
        or _safe_text(getattr(booking, "customer_hotel", ""))
        or "Pickup location"
    )


def _get_transfer_destination(booking: Any) -> str:
    notes = _safe_text(getattr(booking, "customer_notes", ""))
    return (
        _first_attr(booking, ["transfer_destination"], "")
        or _extract_note_value(notes, ["Route to", "Drop-off", "Drop-off address"])
        or "Drop-off location"
    )


def _get_transfer_vehicle(booking: Any) -> str:
    notes = _safe_text(getattr(booking, "customer_notes", ""))
    return (
        _first_attr(booking, ["transfer_vehicle_type", "vehicle_assigned"], "")
        or _extract_note_value(notes, ["Vehicle"])
        or "To be assigned"
    )


def _get_transfer_type(booking: Any) -> str:
    round_trip = bool(getattr(booking, "transfer_round_trip", False))
    return "Round trip" if round_trip else "One way"


def _get_transfer_pickup_details(booking: Any) -> str:
    notes = _safe_text(getattr(booking, "customer_notes", ""))
    pickup_name = _extract_note_value(notes, ["Pickup"]) or _safe_text(getattr(booking, "customer_hotel", ""))
    pickup_address = _extract_note_value(notes, ["Pickup address"])
    pickup_map = _extract_note_value(notes, ["Pickup map"])

    parts = [part for part in [pickup_name, pickup_address, pickup_map] if part]
    return " | ".join(parts) if parts else _get_pickup_info(booking)


def _get_transfer_dropoff_details(booking: Any) -> str:
    notes = _safe_text(getattr(booking, "customer_notes", ""))
    dropoff_name = _extract_note_value(notes, ["Drop-off"])
    dropoff_address = _extract_note_value(notes, ["Drop-off address"])
    dropoff_map = _extract_note_value(notes, ["Drop-off map"])

    parts = [part for part in [dropoff_name, dropoff_address, dropoff_map] if part]
    return " | ".join(parts) if parts else _get_transfer_destination(booking)


def _get_guest_summary(booking: Any) -> str:
    adults = getattr(booking, "adults", None) or 0
    children = getattr(booking, "children", None) or 0
    infants = getattr(booking, "infants", None) or 0
    total = getattr(booking, "total_guests", None) or 0

    parts = []
    try:
        if int(adults):
            parts.append(f"{adults} adult{'s' if int(adults) != 1 else ''}")
        if int(children):
            parts.append(f"{children} child{'ren' if int(children) != 1 else ''}")
        if int(infants):
            parts.append(f"{infants} infant{'s' if int(infants) != 1 else ''}")
        if parts:
            return ", ".join(parts)
        if int(total):
            return f"{total} guest{'s' if int(total) != 1 else ''}"
    except Exception:
        pass

    return "To be confirmed"


def _get_payment_status(booking: Any) -> str:
    return _first_attr(booking, ["payment_status", "status", "payment_state"], "Confirmed").replace("_", " ").title()


def _get_branding(booking: Any) -> dict[str, Any]:
    organisation = getattr(booking, "organisation", None)
    public_settings = _get_public_settings(booking)
    ticketing_settings = _get_ticketing_settings(booking)

    brand_name = "Ticket"
    contact_email = ""
    whatsapp = ""
    custom_domain = ""

    primary_color = "#111827"
    secondary_color = "#6B7280"
    accent_color = "#F59E0B"
    text_color = "#111827"
    muted_text_color = "#6B7280"
    currency_symbol = "US$"

    if organisation:
        brand_name = _first_attr(organisation, ["name", "display_name"], brand_name)

    if ticketing_settings:
        brand_name = _first_attr(ticketing_settings, ["public_brand_name", "module_name"], brand_name)
        currency_symbol = _first_attr(ticketing_settings, ["currency_symbol"], currency_symbol)

    if public_settings:
        brand_name = _first_attr(public_settings, ["display_title", "site_title", "title", "brand_name"], brand_name)
        contact_email = _first_attr(public_settings, ["public_email", "contact_email", "email"], "")
        whatsapp = _first_attr(public_settings, ["public_whatsapp", "whatsapp", "phone", "contact_phone"], "")
        custom_domain = _first_attr(public_settings, ["custom_domain", "subdomain"], "")

        primary_color = _first_attr(public_settings, ["primary_color"], primary_color)
        secondary_color = _first_attr(public_settings, ["secondary_color"], secondary_color)
        accent_color = _first_attr(public_settings, ["accent_color", "button_color"], accent_color)
        text_color = _first_attr(public_settings, ["text_color"], text_color)
        muted_text_color = _first_attr(public_settings, ["muted_text_color"], muted_text_color)

    return {
        "brand_name": brand_name,
        "contact_email": contact_email,
        "whatsapp": whatsapp,
        "logo_reader": _get_logo_reader(public_settings),
        "custom_domain": custom_domain,
        "primary_color": _valid_hex(primary_color, "#111827"),
        "secondary_color": _valid_hex(secondary_color, "#6B7280"),
        "accent_color": _valid_hex(accent_color, "#F59E0B"),
        "text_color": _valid_hex(text_color, "#111827"),
        "muted_text_color": _valid_hex(muted_text_color, "#6B7280"),
        "currency_symbol": currency_symbol,
    }


def _split_text(text: str, max_chars: int) -> list[str]:
    words = _safe_text(text, "-").split()
    lines: list[str] = []
    line = ""

    for word in words:
        test_line = f"{line} {word}".strip()
        if len(test_line) > max_chars and line:
            lines.append(line)
            line = word
        else:
            line = test_line

    if line:
        lines.append(line)

    return lines or ["-"]


def _draw_wrapped_text(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_chars: int = 80,
    line_height: float = 5 * mm,
    max_lines: int | None = None,
) -> float:
    lines = _split_text(text, max_chars)

    if max_lines is not None and len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1][: max(0, max_chars - 3)].rstrip() + "..."

    for line in lines:
        pdf.drawString(x, y, line)
        y -= line_height

    return y + line_height


def _draw_logo_or_brand(pdf: canvas.Canvas, branding: dict[str, Any], x: float, y: float) -> None:
    logo_reader = branding.get("logo_reader")

    if logo_reader:
        try:
            pdf.setFillColor(colors.white)
            pdf.roundRect(x - 2 * mm, y - 21 * mm, 54 * mm, 22 * mm, 4 * mm, fill=1, stroke=0)
            pdf.drawImage(
                logo_reader,
                x,
                y - 18 * mm,
                width=50 * mm,
                height=15 * mm,
                preserveAspectRatio=True,
                mask="auto",
                anchor="c",
            )
            return
        except Exception:
            pass

    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 17)
    pdf.drawString(x, y - 8 * mm, branding["brand_name"][:34])


def _draw_pill(pdf: canvas.Canvas, text: str, x: float, y: float, w: float, bg: str, fg: str) -> None:
    pdf.setFillColor(_hex(bg))
    pdf.roundRect(x, y, w, 9 * mm, 4.5 * mm, fill=1, stroke=0)
    pdf.setFillColor(_hex(fg, "#FFFFFF"))
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawCentredString(x + w / 2, y + 3.1 * mm, text.upper()[:24])


def _draw_card(pdf: canvas.Canvas, x: float, y: float, w: float, h: float, bg: str = "#FFFFFF", stroke: str = "#E5E7EB") -> None:
    pdf.setFillColor(_hex(bg))
    pdf.setStrokeColor(_hex(stroke))
    pdf.roundRect(x, y, w, h, 5 * mm, fill=1, stroke=1)


def _draw_field(pdf: canvas.Canvas, label: str, value: str, x: float, y: float, w: float, text_color: str, muted: str) -> None:
    pdf.setFillColor(_hex(muted))
    pdf.setFont("Helvetica-Bold", 6.8)
    pdf.drawString(x, y, label.upper())

    pdf.setFillColor(_hex(text_color))
    pdf.setFont("Helvetica-Bold", 10)
    _draw_wrapped_text(pdf, value, x, y - 5 * mm, max_chars=max(18, int(w / 4.1)), line_height=4.5 * mm, max_lines=2)


def _get_passenger_price_breakdown(booking: Any, currency_symbol: str) -> list[tuple[str, str]]:
    adults = int(getattr(booking, "adults", 0) or 0)
    children = int(getattr(booking, "children", 0) or 0)
    infants = int(getattr(booking, "infants", 0) or 0)

    product = getattr(booking, "primary_product", None) or getattr(booking, "product", None)
    first_item = _get_first_booking_item(booking)

    adult_price = _money_decimal(getattr(booking, "adult_price", None) or getattr(product, "adult_price", None) or getattr(product, "base_price", None))
    child_price = _money_decimal(getattr(booking, "child_price", None) or getattr(product, "child_price", None))
    infant_price = _money_decimal(getattr(booking, "infant_price", None) or getattr(product, "infant_price", None))

    # External tickets or old bookings may only store one BookingItem price.
    if first_item and adult_price <= 0:
        adult_price = _money_decimal(getattr(first_item, "unit_price", None))

    rows: list[tuple[str, str]] = []
    if adults:
        rows.append((f"Adults x {adults}", _money(adult_price * adults, currency_symbol)))
    if children:
        rows.append((f"Children x {children}", _money(child_price * children, currency_symbol)))
    if infants:
        rows.append((f"Infants x {infants}", _money(infant_price * infants, currency_symbol)))
    return rows



def _get_booking_item_quantity(booking: Any, item: Any) -> int:
    for source, names in (
        (item, ["quantity", "guest_count", "total_guests", "ticket_quantity"]),
        (booking, ["total_guests", "guest_count"]),
    ):
        if source is None:
            continue
        for name in names:
            value = getattr(source, name, None)
            try:
                quantity = int(value or 0)
            except (TypeError, ValueError):
                quantity = 0
            if quantity > 0:
                return quantity

    adults = int(getattr(booking, "adults", 0) or 0)
    children = int(getattr(booking, "children", 0) or 0)
    infants = int(getattr(booking, "infants", 0) or 0)
    return max(adults + children + infants, 1)


def _get_item_product(item: Any) -> Any:
    if item is None:
        return None

    product = (
        getattr(item, "product", None)
        or getattr(item, "experience_product", None)
        or getattr(item, "ticket_product", None)
    )

    if product is not None:
        return product

    product_id = getattr(item, "product_id", None)
    if not product_id:
        return None

    try:
        from ticketing.models import ExperienceProduct

        return ExperienceProduct.objects.filter(
            id=product_id,
        ).first()
    except Exception:
        return None


def _resolve_item_business_entity(booking: Any, item: Any) -> Any:
    """
    Resolve the venue/operator that is allowed to scan this booking item.

    Resolution order:
    1. Explicit business entity already attached to the item.
    2. Existing financial snapshot.
    3. Active product/business agreement for the service date.
    """
    explicit = (
        getattr(item, "business_entity", None)
        or getattr(item, "partner", None)
        or getattr(item, "provider_business_entity", None)
    )

    if explicit is not None:
        return explicit

    try:
        from ticketing.models import BookingFinancialSnapshot

        snapshot = (
            BookingFinancialSnapshot.objects.filter(
                booking_item=item,
                business_entity__isnull=False,
            )
            .select_related("business_entity")
            .order_by("-captured_at", "-id")
            .first()
        )

        if snapshot and snapshot.business_entity:
            return snapshot.business_entity
    except Exception:
        # Missing or unavailable snapshots must not block agreement lookup.
        pass

    product = _get_item_product(item)
    product_id = (
        getattr(item, "product_id", None)
        or getattr(product, "id", None)
    )

    if not product_id:
        return None

    from django.db.models import Q
    from django.utils import timezone
    from ticketing.models import ProductBusinessAgreement

    service_date = (
        getattr(item, "service_date", None)
        or getattr(booking, "service_date", None)
        or timezone.localdate()
    )

    agreement = (
        ProductBusinessAgreement.objects.filter(
            organisation_id=getattr(
                booking,
                "organisation_id",
                None,
            ),
            product_id=product_id,
            is_active=True,
        )
        .filter(
            Q(effective_from__isnull=True)
            | Q(effective_from__lte=service_date)
        )
        .filter(
            Q(effective_until__isnull=True)
            | Q(effective_until__gte=service_date)
        )
        .select_related("business_entity")
        .order_by("-effective_from", "-version", "-id")
        .first()
    )

    if agreement and agreement.business_entity:
        return agreement.business_entity

    return None


def _get_or_create_admission_token(booking: Any) -> Any | None:
    """
    Return the primary scanner admission token when the product participates
    in partner/venue operations.

    Business agreements are optional. A normal organisation-owned product
    must still be able to generate and email its PDF ticket even when it has
    no assigned business entity or active agreement.
    """
    item = _get_first_booking_item(booking)
    if item is None:
        return None

    try:
        from ticketing.models import AdmissionToken

        existing_tokens = AdmissionToken.objects.filter(
            booking_item=item,
        ).order_by("-is_primary", "-issued_at", "-id")

        for token in existing_tokens:
            token_status = _safe_text(getattr(token, "status", "")).lower()
            if token_status in {"", "active", "partially_used"}:
                return token
    except Exception:
        # Token lookup problems must not prevent a customer ticket from being
        # generated. The fallback QR below remains unique and verifiable using
        # the printed booking code.
        pass

    business_entity = _resolve_item_business_entity(booking, item)
    if business_entity is None:
        return None

    try:
        from ticketing.operations.tokens import issue_admission_token

        return issue_admission_token(
            item,
            business_entity=business_entity,
            total_admissions=_get_booking_item_quantity(booking, item),
            is_primary=True,
            metadata={
                "source": "ticket_pdf",
                "booking_code": _safe_text(
                    getattr(booking, "booking_code", "")
                ),
            },
        )
    except Exception:
        # PDF/email delivery is more important than partner-scanner token
        # creation. Operations can still use the booking code for manual
        # verification, while products with a valid agreement continue to get
        # their normal persisted AdmissionToken UUID.
        return None


def _get_fallback_ticket_uuid(booking: Any) -> str:
    """
    Build a stable UUID for ordinary products that do not use partner scanning.

    The same booking always produces the same UUID, and no secret or customer
    information is embedded in the QR payload.
    """
    organisation_id = _safe_text(
        getattr(booking, "organisation_id", ""),
        "organisation",
    )
    booking_id = _safe_text(
        getattr(booking, "id", ""),
        "booking",
    )
    booking_code = _safe_text(
        getattr(booking, "booking_code", ""),
        "ticket",
    )

    seed = f"ticket:{organisation_id}:{booking_id}:{booking_code}"
    return str(uuid.uuid5(uuid.NAMESPACE_URL, seed))


def _draw_text_block(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    width: float,
    *,
    font: str = "Helvetica",
    size: float = 9,
    color: str = "#111827",
    line_height: float = 4.5 * mm,
    max_lines: int = 3,
) -> float:
    """Draw wrapped text and return the next safe y coordinate."""
    approx_chars = max(18, int(width / max(size * 0.48, 1)))
    lines = _split_text(text, approx_chars)

    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip(". ") + "..."

    pdf.setFillColor(_hex(color))
    pdf.setFont(font, size)

    current_y = y
    for line in lines:
        pdf.drawString(x, current_y, line)
        current_y -= line_height

    return current_y


def _draw_detail_row(
    pdf: canvas.Canvas,
    label: str,
    value: str,
    x: float,
    y: float,
    width: float,
    text_color: str,
    muted: str,
) -> float:
    """Draw one clean detail row with a separator and dynamic height."""
    label_width = 36 * mm
    value_x = x + label_width

    pdf.setFillColor(_hex(muted))
    pdf.setFont("Helvetica-Bold", 7)
    pdf.drawString(x, y, label.upper())

    next_y = _draw_text_block(
        pdf,
        value,
        value_x,
        y,
        width - label_width,
        font="Helvetica-Bold",
        size=9,
        color=text_color,
        line_height=4.5 * mm,
        max_lines=2,
    )

    row_bottom = min(next_y, y - 5 * mm)
    pdf.setStrokeColor(_hex("#E5E7EB"))
    pdf.setLineWidth(0.6)
    pdf.line(x, row_bottom - 2 * mm, x + width, row_bottom - 2 * mm)
    return row_bottom - 6 * mm

def generate_ticket_qr_code(booking: Any) -> io.BytesIO:
    admission_token = _get_or_create_admission_token(booking)

    if admission_token is not None:
        token_value = getattr(admission_token, "token", None)
        qr_payload = (
            str(token_value)
            if token_value
            else _get_fallback_ticket_uuid(booking)
        )
    else:
        qr_payload = _get_fallback_ticket_uuid(booking)

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=3,
    )
    qr.add_data(qr_payload)
    qr.make(fit=True)

    image = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer


def generate_ticket_pdf(booking: Any) -> bytes:
    """
    Generate a clean one-page ticket.

    The layout intentionally uses flowing rows instead of many small boxes.
    Every wrapped block returns the next safe Y position, preventing text from
    overlapping the QR code, payment values, or surrounding content.
    """
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)

    booking_code = _safe_text(
        getattr(booking, "booking_code", ""),
        "BOOKING",
    )
    branding = _get_branding(booking)

    primary = branding["primary_color"]
    accent = branding["accent_color"]
    text_color = branding["text_color"]
    muted = branding["muted_text_color"]
    currency_symbol = branding["currency_symbol"]

    is_transfer = _is_transfer_booking(booking)
    ticket_name = (
        f"{_get_transfer_origin(booking)} to "
        f"{_get_transfer_destination(booking)}"
        if is_transfer
        else _get_product_name(booking)
    )
    container_product_name = (
        "Private Transfer"
        if is_transfer
        else _get_container_product_name(booking)
    )

    margin = 14 * mm
    ticket_x = margin
    ticket_y = 14 * mm
    ticket_w = PAGE_WIDTH - 2 * margin
    ticket_h = PAGE_HEIGHT - 2 * margin

    pdf.setFillColor(_hex("#F3F4F6"))
    pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)

    _draw_card(
        pdf,
        ticket_x,
        ticket_y,
        ticket_w,
        ticket_h,
        "#FFFFFF",
        "#E5E7EB",
    )

    # Header
    header_h = 42 * mm
    header_y = PAGE_HEIGHT - margin - header_h
    pdf.setFillColor(_hex(primary))
    pdf.roundRect(
        ticket_x,
        header_y,
        ticket_w,
        header_h,
        6 * mm,
        fill=1,
        stroke=0,
    )
    pdf.rect(
        ticket_x,
        header_y,
        ticket_w,
        8 * mm,
        fill=1,
        stroke=0,
    )

    _draw_logo_or_brand(
        pdf,
        branding,
        ticket_x + 9 * mm,
        PAGE_HEIGHT - margin - 7 * mm,
    )

    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica", 8)
    pdf.drawString(
        ticket_x + 9 * mm,
        header_y + 8 * mm,
        "Official booking ticket",
    )

    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawRightString(
        ticket_x + ticket_w - 9 * mm,
        PAGE_HEIGHT - margin - 11 * mm,
        booking_code,
    )
    pdf.setFont("Helvetica", 6.8)
    pdf.drawRightString(
        ticket_x + ticket_w - 9 * mm,
        PAGE_HEIGHT - margin - 17 * mm,
        "BOOKING CODE",
    )

    # Main content starts below header. QR gets a dedicated fixed column.
    content_x = ticket_x + 9 * mm
    content_right = ticket_x + ticket_w - 9 * mm
    content_w = content_right - content_x
    qr_size = 34 * mm
    qr_x = content_right - qr_size
    qr_y = header_y - qr_size - 10 * mm
    title_w = content_w - qr_size - 10 * mm

    qr_buffer = generate_ticket_qr_code(booking)
    pdf.setFillColor(colors.white)
    pdf.setStrokeColor(_hex("#E5E7EB"))
    pdf.roundRect(
        qr_x - 3 * mm,
        qr_y - 9 * mm,
        qr_size + 6 * mm,
        qr_size + 15 * mm,
        4 * mm,
        fill=1,
        stroke=1,
    )
    pdf.drawImage(
        ImageReader(qr_buffer),
        qr_x,
        qr_y,
        width=qr_size,
        height=qr_size,
        preserveAspectRatio=True,
        mask="auto",
    )
    pdf.setFillColor(_hex(muted))
    pdf.setFont("Helvetica-Bold", 6.5)
    pdf.drawCentredString(
        qr_x + qr_size / 2,
        qr_y - 5 * mm,
        "SCAN TO CHECK IN",
    )

    y = header_y - 13 * mm
    y = _draw_text_block(
        pdf,
        ticket_name,
        content_x,
        y,
        title_w,
        font="Helvetica-Bold",
        size=16,
        color=text_color,
        line_height=7.5 * mm,
        max_lines=3,
    )

    if container_product_name and container_product_name != ticket_name:
        y -= 1 * mm
        y = _draw_text_block(
            pdf,
            container_product_name,
            content_x,
            y,
            title_w,
            font="Helvetica-Bold",
            size=8,
            color=muted,
            line_height=4 * mm,
            max_lines=2,
        )

    y -= 2 * mm
    y = _draw_text_block(
        pdf,
        f"Issued for {_get_customer_name(booking)}",
        content_x,
        y,
        title_w,
        font="Helvetica",
        size=9,
        color=muted,
        max_lines=2,
    )

    # Ensure details begin below both title and QR.
    y = min(y - 5 * mm, qr_y - 14 * mm)

    pdf.setFillColor(_hex(text_color))
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(content_x, y, "Booking details")
    y -= 8 * mm

    detail_rows = [
        ("Date", _get_booking_date(booking)),
        ("Time", _get_booking_time(booking)),
        ("Guests", _get_guest_summary(booking)),
        ("Customer", _get_customer_name(booking)),
        ("Contact", _get_customer_contact(booking)),
    ]

    if is_transfer:
        detail_rows.extend(
            [
                ("Transfer", _get_transfer_type(booking)),
                ("Vehicle", _get_transfer_vehicle(booking)),
                ("Pickup", _get_transfer_pickup_details(booking)),
                ("Drop-off", _get_transfer_dropoff_details(booking)),
            ]
        )
    else:
        detail_rows.append(
            ("Pickup / Meeting Point", _get_pickup_info(booking))
        )

    for label, value in detail_rows:
        y = _draw_detail_row(
            pdf,
            label,
            value,
            content_x,
            y,
            content_w,
            text_color,
            muted,
        )

    # Payment summary
    y -= 1 * mm
    pdf.setFillColor(_hex(text_color))
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(content_x, y, "Payment summary")
    y -= 8 * mm

    total_amount = getattr(booking, "total_amount", 0)
    deposit_paid = getattr(booking, "deposit_paid", 0)
    balance_due = getattr(booking, "balance_due", 0)

    payment_col_w = content_w / 3
    for index, (label, value) in enumerate(
        [
            ("Total", _money(total_amount, currency_symbol)),
            ("Paid", _money(deposit_paid, currency_symbol)),
            ("Balance", _money(balance_due, currency_symbol)),
        ]
    ):
        x = content_x + index * payment_col_w
        pdf.setFillColor(_hex(muted))
        pdf.setFont("Helvetica-Bold", 7)
        pdf.drawString(x, y, label.upper())
        pdf.setFillColor(_hex(text_color))
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(x, y - 6 * mm, value)

    payment_status_label = _get_payment_status(booking)
    pdf.setFillColor(_hex(muted))
    pdf.setFont("Helvetica-Bold", 7)
    pdf.drawRightString(content_right, y, "STATUS")
    pdf.setFillColor(_hex(text_color))
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawRightString(content_right, y - 5 * mm, payment_status_label[:28])

    y -= 14 * mm

    breakdown = _get_passenger_price_breakdown(
        booking,
        currency_symbol,
    )
    if breakdown and not is_transfer:
        breakdown_text = "  |  ".join(
            f"{label}: {value}" for label, value in breakdown
        )
        y = _draw_text_block(
            pdf,
            breakdown_text,
            content_x,
            y,
            content_w,
            font="Helvetica",
            size=8,
            color=muted,
            line_height=4 * mm,
            max_lines=2,
        )

    # Important information
    #
    # Product-specific ticket information takes priority. This allows products
    # such as Coco Bongo to print return-bus or boarding instructions without
    # duplicating the automatic hotel pickup schedule.
    y -= 3 * mm
    product_ticket_information = _get_ticket_information(booking)

    default_info_text = (
        "Be ready at the selected pickup location and keep your phone or "
        "WhatsApp available. Show this QR code to the assigned operator."
        if is_transfer
        else "Show this QR code when checking in. Arrive on time and keep "
        "the booking code available in case manual verification is needed."
    )

    info_text = product_ticket_information or default_info_text
    info_lines = _split_text(info_text, 92)
    info_box_h = min(max(23 * mm, (13 + min(len(info_lines), 6) * 4) * mm), 38 * mm)
    info_box_y = max(y - info_box_h, ticket_y + 21 * mm)

    pdf.setFillColor(_hex(accent))
    pdf.roundRect(
        content_x,
        info_box_y,
        content_w,
        info_box_h,
        4 * mm,
        fill=1,
        stroke=0,
    )

    info_y = info_box_y + info_box_h - 7 * mm
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(content_x + 5 * mm, info_y, "Important information")

    _draw_text_block(
        pdf,
        info_text,
        content_x + 5 * mm,
        info_y - 6 * mm,
        content_w - 10 * mm,
        font="Helvetica",
        size=8,
        color="#FFFFFF",
        line_height=4 * mm,
        max_lines=6,
    )

    # Footer
    footer_y = ticket_y + 6 * mm
    contact_parts = []
    if branding["contact_email"]:
        contact_parts.append(branding["contact_email"])
    if branding["whatsapp"]:
        contact_parts.append(f"WhatsApp: {branding['whatsapp']}")
    if branding["custom_domain"]:
        contact_parts.append(branding["custom_domain"])

    footer = (
        " | ".join(contact_parts)
        if contact_parts
        else "Thank you for your booking."
    )
    pdf.setFillColor(_hex(muted))
    pdf.setFont("Helvetica", 7.5)
    pdf.drawCentredString(
        PAGE_WIDTH / 2,
        footer_y,
        footer[:120],
    )

    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.read()


def build_ticket_attachment(booking: Any) -> dict[str, Any]:
    booking_code = _safe_text(getattr(booking, "booking_code", "booking"), "booking")
    return {
        "filename": f"ticket-{booking_code}.pdf",
        "content": generate_ticket_pdf(booking),
        "mime_type": "application/pdf",
    }
