from __future__ import annotations

import io
import os
from decimal import Decimal
from typing import Any

import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

PAGE_WIDTH, PAGE_HEIGHT = A4


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


def _get_product_name(booking: Any) -> str:
    first_item = _get_first_booking_item(booking)

    if first_item:
        option_name = (
            _first_attr(first_item, ["external_option_name"], "")
            or _first_attr(first_item, ["product_name"], "")
        )
        if option_name:
            return option_name

    container_name = _get_container_product_name(booking)
    return container_name or "Tour / Product"


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
            return full_name

    first_name = _safe_text(getattr(booking, "customer_first_name", ""))
    last_name = _safe_text(getattr(booking, "customer_last_name", ""))
    return _safe_text(f"{first_name} {last_name}", "Customer")


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


def generate_ticket_qr_code(booking: Any) -> io.BytesIO:
    booking_code = _safe_text(getattr(booking, "booking_code", ""), "BOOKING")
    qr_payload = f"BOOKING:{booking_code}"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(qr_payload)
    qr.make(fit=True)

    image = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer


def generate_ticket_pdf(booking: Any) -> bytes:
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)

    booking_code = _safe_text(getattr(booking, "booking_code", ""), "BOOKING")
    branding = _get_branding(booking)

    primary = branding["primary_color"]
    accent = branding["accent_color"]
    text_color = branding["text_color"]
    muted = branding["muted_text_color"]
    currency_symbol = branding["currency_symbol"]

    is_transfer = _is_transfer_booking(booking)
    ticket_name = (
        f"{_get_transfer_origin(booking)} -> {_get_transfer_destination(booking)}"
        if is_transfer
        else _get_product_name(booking)
    )
    container_product_name = "Private Transfer" if is_transfer else _get_container_product_name(booking)

    margin = 14 * mm
    page_bg = "#F3F4F6"
    card_bg = "#FFFFFF"
    soft_bg = "#F9FAFB"
    border = "#E5E7EB"

    pdf.setFillColor(_hex(page_bg))
    pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)

    # Main ticket shell.
    ticket_x = margin
    ticket_y = 18 * mm
    ticket_w = PAGE_WIDTH - margin * 2
    ticket_h = PAGE_HEIGHT - 32 * mm
    _draw_card(pdf, ticket_x, ticket_y, ticket_w, ticket_h, card_bg, border)

    # Header with brand and booking code.
    header_h = 50 * mm
    header_y = PAGE_HEIGHT - margin - header_h
    pdf.setFillColor(_hex(primary))
    pdf.roundRect(ticket_x, header_y, ticket_w, header_h, 6 * mm, fill=1, stroke=0)
    pdf.rect(ticket_x, header_y, ticket_w, 10 * mm, fill=1, stroke=0)

    _draw_logo_or_brand(pdf, branding, ticket_x + 9 * mm, PAGE_HEIGHT - margin - 8 * mm)

    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica", 9)
    pdf.drawString(ticket_x + 9 * mm, header_y + 11 * mm, "Official booking ticket")

    pdf.setFont("Helvetica-Bold", 15)
    pdf.drawRightString(ticket_x + ticket_w - 10 * mm, PAGE_HEIGHT - margin - 12 * mm, booking_code)
    pdf.setFont("Helvetica", 7)
    pdf.drawRightString(ticket_x + ticket_w - 10 * mm, PAGE_HEIGHT - margin - 18 * mm, "BOOKING CODE")

    _draw_pill(pdf, _get_payment_status(booking), ticket_x + ticket_w - 52 * mm, header_y + 10 * mm, 42 * mm, accent, "#FFFFFF")

    # QR card.
    qr_x = ticket_x + ticket_w - 49 * mm
    qr_y = header_y - 43 * mm
    _draw_card(pdf, qr_x, qr_y, 39 * mm, 46 * mm, "#FFFFFF", border)
    qr_buffer = generate_ticket_qr_code(booking)
    qr_reader = ImageReader(qr_buffer)
    pdf.drawImage(qr_reader, qr_x + 6 * mm, qr_y + 13 * mm, width=27 * mm, height=27 * mm, preserveAspectRatio=True, mask="auto")
    pdf.setFillColor(_hex(muted))
    pdf.setFont("Helvetica-Bold", 6.5)
    pdf.drawCentredString(qr_x + 19.5 * mm, qr_y + 6 * mm, "SCAN TO VERIFY")

    content_x = ticket_x + 9 * mm
    content_w = ticket_w - 18 * mm
    left_w = content_w - 54 * mm
    y = header_y - 12 * mm

    pdf.setFillColor(_hex(text_color))
    pdf.setFont("Helvetica-Bold", 22)
    y = _draw_wrapped_text(pdf, ticket_name, content_x, y, max_chars=35, line_height=8 * mm, max_lines=3)

    if container_product_name and container_product_name != ticket_name:
        y -= 5 * mm
        pdf.setFillColor(_hex(muted))
        pdf.setFont("Helvetica-Bold", 8)
        y = _draw_wrapped_text(pdf, container_product_name, content_x, y, max_chars=58, line_height=4 * mm, max_lines=2)

    y -= 9 * mm
    pdf.setFillColor(_hex(muted))
    pdf.setFont("Helvetica", 9)
    _draw_wrapped_text(pdf, f"Issued for {_get_customer_name(booking)}", content_x, y, max_chars=60, max_lines=1)

    # Detail grid cards.
    grid_y = y - 33 * mm
    grid_gap = 4 * mm
    col_w = (left_w - grid_gap * 2) / 3
    card_h = 21 * mm

    for idx, (label, value) in enumerate([
        ("Date", _get_booking_date(booking)),
        ("Time", _get_booking_time(booking)),
        ("Guests", _get_guest_summary(booking)),
    ]):
        x = content_x + idx * (col_w + grid_gap)
        _draw_card(pdf, x, grid_y, col_w, card_h, soft_bg, border)
        _draw_field(pdf, label, value, x + 4 * mm, grid_y + 14 * mm, col_w - 8 * mm, text_color, muted)

    row2_y = grid_y - card_h - 5 * mm
    half_w = (left_w - grid_gap) / 2
    for idx, (label, value) in enumerate([
        ("Customer", _get_customer_name(booking)),
        ("Contact", _get_customer_contact(booking)),
    ]):
        x = content_x + idx * (half_w + grid_gap)
        _draw_card(pdf, x, row2_y, half_w, card_h, soft_bg, border)
        _draw_field(pdf, label, value, x + 4 * mm, row2_y + 14 * mm, half_w - 8 * mm, text_color, muted)

    row3_y = row2_y - card_h - 5 * mm
    if is_transfer:
        for idx, (label, value) in enumerate([
            ("Transfer", _get_transfer_type(booking)),
            ("Vehicle", _get_transfer_vehicle(booking)),
        ]):
            x = content_x + idx * (half_w + grid_gap)
            _draw_card(pdf, x, row3_y, half_w, card_h, soft_bg, border)
            _draw_field(pdf, label, value, x + 4 * mm, row3_y + 14 * mm, half_w - 8 * mm, text_color, muted)

        row4_y = row3_y - card_h - 5 * mm
        _draw_card(pdf, content_x, row4_y, left_w, card_h, soft_bg, border)
        _draw_field(pdf, "Pickup", _get_transfer_pickup_details(booking), content_x + 4 * mm, row4_y + 14 * mm, left_w - 8 * mm, text_color, muted)

        row5_y = row4_y - card_h - 5 * mm
        _draw_card(pdf, content_x, row5_y, left_w, card_h, soft_bg, border)
        _draw_field(pdf, "Drop-off", _get_transfer_dropoff_details(booking), content_x + 4 * mm, row5_y + 14 * mm, left_w - 8 * mm, text_color, muted)

        pay_y = row5_y - 36 * mm
    else:
        _draw_card(pdf, content_x, row3_y, left_w, card_h, soft_bg, border)
        _draw_field(pdf, "Pickup / Meeting Point", _get_pickup_info(booking), content_x + 4 * mm, row3_y + 14 * mm, left_w - 8 * mm, text_color, muted)
        pay_y = row3_y - 36 * mm

    # Payment card.
    pay_h = 38 * mm
    _draw_card(pdf, content_x, pay_y, content_w, pay_h, "#FFFFFF", border)
    pdf.setFillColor(_hex(text_color))
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(content_x + 6 * mm, pay_y + pay_h - 9 * mm, "Payment summary")

    total_amount = getattr(booking, "total_amount", 0)
    deposit_paid = getattr(booking, "deposit_paid", 0)
    balance_due = getattr(booking, "balance_due", 0)

    payment_rows = [
        ("Total", _money(total_amount, currency_symbol)),
        ("Paid", _money(deposit_paid, currency_symbol)),
        ("Balance", _money(balance_due, currency_symbol)),
    ]
    for idx, (label, value) in enumerate(payment_rows):
        x = content_x + 6 * mm + idx * 45 * mm
        pdf.setFillColor(_hex(muted))
        pdf.setFont("Helvetica-Bold", 7)
        pdf.drawString(x, pay_y + pay_h - 18 * mm, label.upper())
        pdf.setFillColor(_hex(text_color))
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(x, pay_y + pay_h - 25 * mm, value)

    breakdown = _get_passenger_price_breakdown(booking, currency_symbol)
    if breakdown and not is_transfer:
        pdf.setFillColor(_hex(muted))
        pdf.setFont("Helvetica", 8)
        breakdown_text = " | ".join(f"{label}: {value}" for label, value in breakdown)
        _draw_wrapped_text(pdf, breakdown_text, content_x + 6 * mm, pay_y + 5 * mm, max_chars=100, line_height=4 * mm, max_lines=2)

    # Important info.
    info_y = pay_y - 14 * mm
    pdf.setFillColor(_hex(text_color))
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(content_x, info_y, "Important information")

    pdf.setFillColor(_hex(muted))
    pdf.setFont("Helvetica", 8.8)
    info_text = (
        "Please keep your booking code available. Your transfer is booked in advance. Be ready at the pickup location at the selected time and keep your phone/WhatsApp available."
        if is_transfer
        else "Please show this ticket when checking in. Keep your booking code and QR code available for verification. Arrive at the pickup or meeting point on time."
    )
    _draw_wrapped_text(pdf, info_text, content_x, info_y - 7 * mm, max_chars=96, line_height=4.5 * mm, max_lines=3)

    # Footer.
    footer_y = ticket_y
    footer_h = 15 * mm
    pdf.setFillColor(_hex("#F9FAFB"))
    pdf.roundRect(ticket_x, footer_y, ticket_w, footer_h, 6 * mm, fill=1, stroke=0)
    pdf.rect(ticket_x, footer_y + 7 * mm, ticket_w, 8 * mm, fill=1, stroke=0)

    contact_parts = []
    if branding["contact_email"]:
        contact_parts.append(branding["contact_email"])
    if branding["whatsapp"]:
        contact_parts.append(f"WhatsApp: {branding['whatsapp']}")
    if branding["custom_domain"]:
        contact_parts.append(branding["custom_domain"])

    footer = " | ".join(contact_parts) if contact_parts else "Thank you for your booking."
    pdf.setFillColor(_hex(muted))
    pdf.setFont("Helvetica", 8)
    pdf.drawCentredString(PAGE_WIDTH / 2, footer_y + 6 * mm, footer[:120])

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
