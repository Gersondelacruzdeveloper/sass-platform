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
    for name in names:
        value = getattr(obj, name, None)
        if value:
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


def _get_product_name(booking: Any) -> str:
    product = (
        getattr(booking, "primary_product", None)
        or getattr(booking, "product", None)
        or getattr(booking, "tour", None)
    )
    if product:
        return _first_attr(product, ["title", "name", "display_name"], "Tour / Product")

    try:
        first_item = booking.items.first()
    except Exception:
        first_item = None

    if first_item:
        return _first_attr(first_item, ["product_name", "external_option_name"], "Tour / Product")

    return _first_attr(booking, ["product_name", "tour_name", "title"], "Tour / Product")


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
        return f"{email} • {whatsapp}"
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
        hotel = _first_attr(
            pickup_info,
            ["hotel_or_location_name", "pickup_zone_name"],
            "",
        )
        point = _first_attr(pickup_info, ["pickup_point"], "")
        pickup_time = _format_time(getattr(pickup_info, "pickup_time", None), "")

        parts = []
        if hotel:
            parts.append(hotel)
        if point:
            parts.append(point)
        if pickup_time:
            parts.append(pickup_time)

        if parts:
            return " • ".join(parts)

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
        return f"{pickup_point} • {pickup_time}"
    if pickup_point:
        return pickup_point
    return "To be confirmed"


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
    return _first_attr(
        booking,
        ["payment_status", "status", "payment_state"],
        "Confirmed",
    ).replace("_", " ").title()


def _money(value: Any, currency_symbol: str = "US$") -> str:
    try:
        amount = Decimal(str(value or "0"))
        return f"{currency_symbol}{amount:,.2f}"
    except Exception:
        return f"{currency_symbol}0.00"


def _get_branding(booking: Any) -> dict[str, Any]:
    organisation = getattr(booking, "organisation", None)
    public_settings = _get_public_settings(booking)
    ticketing_settings = _get_ticketing_settings(booking)

    brand_name = "Ticket"
    contact_email = ""
    whatsapp = ""
    logo_path = ""
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
        brand_name = _first_attr(
            ticketing_settings,
            ["public_brand_name", "module_name"],
            brand_name,
        )
        currency_symbol = _first_attr(ticketing_settings, ["currency_symbol"], currency_symbol)

    if public_settings:
        brand_name = _first_attr(
            public_settings,
            ["display_title", "site_title", "title", "brand_name"],
            brand_name,
        )
        contact_email = _first_attr(public_settings, ["public_email", "contact_email", "email"], "")
        whatsapp = _first_attr(public_settings, ["public_whatsapp", "whatsapp", "phone", "contact_phone"], "")
        custom_domain = _first_attr(public_settings, ["custom_domain", "subdomain"], "")

        primary_color = _first_attr(public_settings, ["primary_color"], primary_color)
        secondary_color = _first_attr(public_settings, ["secondary_color"], secondary_color)
        accent_color = _first_attr(public_settings, ["accent_color", "button_color"], accent_color)
        text_color = _first_attr(public_settings, ["text_color"], text_color)
        muted_text_color = _first_attr(public_settings, ["muted_text_color"], muted_text_color)

        logo = getattr(public_settings, "logo", None)
        if logo:
            try:
                if getattr(logo, "path", None) and os.path.exists(logo.path):
                    logo_path = logo.path
            except Exception:
                logo_path = ""

    return {
        "brand_name": brand_name,
        "contact_email": contact_email,
        "whatsapp": whatsapp,
        "logo_path": logo_path,
        "custom_domain": custom_domain,
        "primary_color": _valid_hex(primary_color, "#111827"),
        "secondary_color": _valid_hex(secondary_color, "#6B7280"),
        "accent_color": _valid_hex(accent_color, "#F59E0B"),
        "text_color": _valid_hex(text_color, "#111827"),
        "muted_text_color": _valid_hex(muted_text_color, "#6B7280"),
        "currency_symbol": currency_symbol,
    }


def _draw_wrapped_text(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_chars: int = 80,
    line_height: float = 5 * mm,
) -> float:
    words = _safe_text(text, "-").split()
    line = ""

    for word in words:
        test_line = f"{line} {word}".strip()
        if len(test_line) > max_chars and line:
            pdf.drawString(x, y, line)
            y -= line_height
            line = word
        else:
            line = test_line

    if line:
        pdf.drawString(x, y, line)

    return y


def _draw_label_value(
    pdf: canvas.Canvas,
    label: str,
    value: str,
    x: float,
    y: float,
    width: float,
    label_color: str,
    value_color: str,
) -> float:
    pdf.setFillColor(_hex(label_color, "#6B7280"))
    pdf.setFont("Helvetica-Bold", 7)
    pdf.drawString(x, y, label.upper())

    pdf.setFillColor(_hex(value_color, "#111827"))
    pdf.setFont("Helvetica-Bold", 11)
    y -= 5 * mm
    return _draw_wrapped_text(pdf, value, x, y, max_chars=max(18, int(width / 4.3)))


def _draw_logo_or_brand(pdf: canvas.Canvas, branding: dict[str, Any], x: float, y: float) -> None:
    logo_path = branding.get("logo_path")

    if logo_path:
        try:
            logo_reader = ImageReader(logo_path)
            pdf.drawImage(
                logo_reader,
                x,
                y - 18 * mm,
                width=44 * mm,
                height=18 * mm,
                preserveAspectRatio=True,
                mask="auto",
                anchor="w",
            )
            return
        except Exception:
            pass

    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 17)
    pdf.drawString(x, y - 8 * mm, branding["brand_name"][:34])


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

    margin = 16 * mm
    top = PAGE_HEIGHT - margin
    ticket_x = margin
    ticket_y = 45 * mm
    ticket_w = PAGE_WIDTH - (margin * 2)
    ticket_h = PAGE_HEIGHT - (margin * 2) - 18 * mm

    primary = branding["primary_color"]
    accent = branding["accent_color"]
    text_color = branding["text_color"]
    muted = branding["muted_text_color"]
    currency_symbol = branding["currency_symbol"]

    # Page background
    pdf.setFillColor(_hex("#F3F4F6"))
    pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)

    # Main ticket card
    pdf.setFillColor(colors.white)
    pdf.setStrokeColor(_hex("#E5E7EB"))
    pdf.roundRect(ticket_x, ticket_y, ticket_w, ticket_h, 7 * mm, fill=1, stroke=1)

    # Header
    header_h = 42 * mm
    header_y = top - header_h
    pdf.setFillColor(_hex(primary))
    pdf.roundRect(ticket_x, header_y, ticket_w, header_h, 7 * mm, fill=1, stroke=0)
    pdf.rect(ticket_x, header_y, ticket_w, 8 * mm, fill=1, stroke=0)

    _draw_logo_or_brand(pdf, branding, ticket_x + 9 * mm, top - 8 * mm)

    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica", 9)
    pdf.drawString(ticket_x + 9 * mm, header_y + 9 * mm, "Official booking ticket")

    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawRightString(ticket_x + ticket_w - 9 * mm, top - 12 * mm, booking_code)

    pdf.setFont("Helvetica", 8)
    pdf.drawRightString(ticket_x + ticket_w - 9 * mm, top - 18 * mm, "BOOKING CODE")

    # QR panel
    qr_panel_x = ticket_x + ticket_w - 55 * mm
    qr_panel_y = header_y - 46 * mm
    qr_panel_w = 43 * mm
    qr_panel_h = 51 * mm

    pdf.setFillColor(colors.white)
    pdf.setStrokeColor(_hex("#E5E7EB"))
    pdf.roundRect(qr_panel_x, qr_panel_y, qr_panel_w, qr_panel_h, 4 * mm, fill=1, stroke=1)

    qr_buffer = generate_ticket_qr_code(booking)
    qr_reader = ImageReader(qr_buffer)
    pdf.drawImage(
        qr_reader,
        qr_panel_x + 6 * mm,
        qr_panel_y + 13 * mm,
        width=31 * mm,
        height=31 * mm,
        preserveAspectRatio=True,
        mask="auto",
    )

    pdf.setFillColor(_hex(muted))
    pdf.setFont("Helvetica-Bold", 6.5)
    pdf.drawCentredString(qr_panel_x + qr_panel_w / 2, qr_panel_y + 6 * mm, "SCAN TO VERIFY")

    # Main content
    content_x = ticket_x + 9 * mm
    content_w = ticket_w - 18 * mm
    y = header_y - 12 * mm

    # Payment badge
    status = _get_payment_status(booking)
    pdf.setFillColor(_hex(accent))
    pdf.roundRect(content_x, y - 8 * mm, 38 * mm, 8 * mm, 4 * mm, fill=1, stroke=0)
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawCentredString(content_x + 19 * mm, y - 5.3 * mm, status.upper()[:20])

    # Product title
    y -= 18 * mm
    pdf.setFillColor(_hex(text_color))
    pdf.setFont("Helvetica-Bold", 21)
    y = _draw_wrapped_text(
        pdf,
        _get_product_name(booking),
        content_x,
        y,
        max_chars=35,
        line_height=8 * mm,
    )

    y -= 13 * mm
    pdf.setFillColor(_hex(muted))
    pdf.setFont("Helvetica", 10)
    y = _draw_wrapped_text(
        pdf,
        f"Ticket issued for {_get_customer_name(booking)}",
        content_x,
        y,
        max_chars=52,
    )

    # Details grid
    grid_top = y - 18 * mm
    col_gap = 7 * mm
    col_w = (content_w - (2 * col_gap)) / 3

    _draw_label_value(pdf, "Date", _get_booking_date(booking), content_x, grid_top, col_w, muted, text_color)
    _draw_label_value(pdf, "Time", _get_booking_time(booking), content_x + col_w + col_gap, grid_top, col_w, muted, text_color)
    _draw_label_value(pdf, "Guests", _get_guest_summary(booking), content_x + (col_w + col_gap) * 2, grid_top, col_w, muted, text_color)

    second_row_y = grid_top - 24 * mm
    half_w = (content_w - col_gap) / 2

    _draw_label_value(pdf, "Customer", _get_customer_name(booking), content_x, second_row_y, half_w, muted, text_color)
    _draw_label_value(pdf, "Contact", _get_customer_contact(booking), content_x + half_w + col_gap, second_row_y, half_w, muted, text_color)

    third_row_y = second_row_y - 26 * mm
    _draw_label_value(pdf, "Pickup / Meeting Point", _get_pickup_info(booking), content_x, third_row_y, content_w, muted, text_color)

    # Payment summary
    payment_y = third_row_y - 30 * mm
    pdf.setFillColor(_hex("#F9FAFB"))
    pdf.setStrokeColor(_hex("#E5E7EB"))
    pdf.roundRect(content_x, payment_y - 24 * mm, content_w, 25 * mm, 4 * mm, fill=1, stroke=1)

    total_amount = getattr(booking, "total_amount", 0)
    deposit_paid = getattr(booking, "deposit_paid", 0)
    balance_due = getattr(booking, "balance_due", 0)

    pdf.setFillColor(_hex(text_color))
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(content_x + 6 * mm, payment_y - 7 * mm, "Payment summary")

    pdf.setFont("Helvetica", 9)
    pdf.setFillColor(_hex(muted))
    pdf.drawString(content_x + 6 * mm, payment_y - 15 * mm, f"Total: {_money(total_amount, currency_symbol)}")
    pdf.drawString(content_x + 55 * mm, payment_y - 15 * mm, f"Paid: {_money(deposit_paid, currency_symbol)}")
    pdf.drawString(content_x + 100 * mm, payment_y - 15 * mm, f"Balance: {_money(balance_due, currency_symbol)}")

    # Important information
    info_y = payment_y - 39 * mm
    pdf.setFillColor(_hex(text_color))
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(content_x, info_y, "Important information")

    pdf.setFillColor(_hex(muted))
    pdf.setFont("Helvetica", 9)
    info_y -= 7 * mm
    info_text = (
        "Please show this ticket when checking in. Keep your booking code and QR code "
        "available for verification. Arrive at the pickup or meeting point on time."
    )
    _draw_wrapped_text(pdf, info_text, content_x, info_y, max_chars=92, line_height=5 * mm)

    # Footer
    footer_h = 18 * mm
    footer_y = ticket_y
    pdf.setFillColor(_hex("#F9FAFB"))
    pdf.roundRect(ticket_x, footer_y, ticket_w, footer_h, 7 * mm, fill=1, stroke=0)
    pdf.rect(ticket_x, footer_y + 8 * mm, ticket_w, 10 * mm, fill=1, stroke=0)

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
    pdf.drawCentredString(PAGE_WIDTH / 2, footer_y + 7 * mm, footer[:120])

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

