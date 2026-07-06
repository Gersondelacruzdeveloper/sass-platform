from __future__ import annotations

import io
from typing import Any

import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
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


def _get_product_name(booking: Any) -> str:
    product = getattr(booking, "product", None) or getattr(booking, "tour", None)
    if product:
        return _first_attr(product, ["title", "name", "display_name"], "Tour / Product")
    return _first_attr(booking, ["product_name", "tour_name", "title"], "Tour / Product")


def _get_customer_name(booking: Any) -> str:
    full_name = _first_attr(
        booking,
        ["customer_name", "full_name", "name", "lead_passenger_name"],
        "",
    )
    if full_name:
        return full_name

    first_name = _safe_text(getattr(booking, "customer_first_name", ""))
    last_name = _safe_text(getattr(booking, "customer_last_name", ""))
    return _safe_text(f"{first_name} {last_name}", "Customer")


def _get_booking_date(booking: Any) -> str:
    value = (
        getattr(booking, "booking_date", None)
        or getattr(booking, "travel_date", None)
        or getattr(booking, "tour_date", None)
        or getattr(booking, "date", None)
        or getattr(booking, "start_date", None)
    )
    if hasattr(value, "strftime"):
        return value.strftime("%d %b %Y")
    return _safe_text(value, "To be confirmed")


def _get_booking_time(booking: Any) -> str:
    value = (
        getattr(booking, "booking_time", None)
        or getattr(booking, "pickup_time", None)
        or getattr(booking, "tour_time", None)
        or getattr(booking, "time", None)
        or getattr(booking, "start_time", None)
    )
    if hasattr(value, "strftime"):
        return value.strftime("%I:%M %p")
    return _safe_text(value, "To be confirmed")


def _get_pickup_info(booking: Any) -> str:
    pickup_point = _first_attr(
        booking,
        ["pickup_point", "pickup_location", "hotel_name", "hotel", "meeting_point"],
        "",
    )
    pickup_time = _safe_text(getattr(booking, "pickup_time", ""))

    if pickup_point and pickup_time:
        return f"{pickup_point} at {pickup_time}"
    if pickup_point:
        return pickup_point
    return "To be confirmed"


def _get_payment_status(booking: Any) -> str:
    return _first_attr(
        booking,
        ["payment_status", "status", "payment_state"],
        "Confirmed",
    ).replace("_", " ").title()


def _get_branding(booking: Any) -> dict[str, str]:
    organisation = getattr(booking, "organisation", None)

    brand_name = "Ticket"
    contact_email = ""
    whatsapp = ""

    if organisation:
        brand_name = _first_attr(organisation, ["name", "display_name"], brand_name)

        public_settings = (
            getattr(organisation, "ticketing_public_site_settings", None)
            or getattr(organisation, "public_site_settings", None)
            or getattr(organisation, "ticketingpublicsitesettings", None)
        )

        if public_settings:
            brand_name = _first_attr(
                public_settings,
                ["display_title", "site_title", "title", "brand_name"],
                brand_name,
            )
            contact_email = _first_attr(
                public_settings,
                ["public_email", "contact_email", "email"],
                "",
            )
            whatsapp = _first_attr(
                public_settings,
                ["public_whatsapp", "whatsapp", "phone", "contact_phone"],
                "",
            )

    return {
        "brand_name": brand_name,
        "contact_email": contact_email,
        "whatsapp": whatsapp,
    }


def _draw_wrapped_text(pdf: canvas.Canvas, text: str, x: float, y: float, max_chars: int = 80):
    words = text.split()
    line = ""
    for word in words:
        test_line = f"{line} {word}".strip()
        if len(test_line) > max_chars:
            pdf.drawString(x, y, line)
            y -= 6 * mm
            line = word
        else:
            line = test_line
    if line:
        pdf.drawString(x, y, line)
    return y


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

    margin = 18 * mm
    top = PAGE_HEIGHT - margin

    pdf.setFillColor(colors.HexColor("#111827"))
    pdf.roundRect(margin, top - 38 * mm, PAGE_WIDTH - (margin * 2), 38 * mm, 6 * mm, fill=1, stroke=0)

    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 20)
    pdf.drawString(margin + 8 * mm, top - 14 * mm, branding["brand_name"])

    pdf.setFont("Helvetica", 11)
    pdf.drawString(margin + 8 * mm, top - 23 * mm, "Official booking ticket")

    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawRightString(PAGE_WIDTH - margin - 8 * mm, top - 14 * mm, booking_code)

    qr_buffer = generate_ticket_qr_code(booking)
    pdf.drawImage(
        qr_buffer,
        PAGE_WIDTH - margin - 42 * mm,
        top - 76 * mm,
        width=36 * mm,
        height=36 * mm,
        preserveAspectRatio=True,
        mask="auto",
    )

    y = top - 54 * mm
    x = margin

    pdf.setFillColor(colors.HexColor("#111827"))
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(x, y, "Booking details")

    y -= 12 * mm
    rows = [
        ("Customer", _get_customer_name(booking)),
        ("Tour / Product", _get_product_name(booking)),
        ("Date", _get_booking_date(booking)),
        ("Time", _get_booking_time(booking)),
        ("Pickup", _get_pickup_info(booking)),
        ("Payment status", _get_payment_status(booking)),
    ]

    label_x = x
    value_x = x + 44 * mm

    for label, value in rows:
        pdf.setFont("Helvetica-Bold", 10)
        pdf.setFillColor(colors.HexColor("#374151"))
        pdf.drawString(label_x, y, label)

        pdf.setFont("Helvetica", 10)
        pdf.setFillColor(colors.HexColor("#111827"))
        y = _draw_wrapped_text(pdf, _safe_text(value, "-"), value_x, y, max_chars=56)
        y -= 8 * mm

    y -= 4 * mm
    pdf.setStrokeColor(colors.HexColor("#E5E7EB"))
    pdf.line(margin, y, PAGE_WIDTH - margin, y)

    y -= 12 * mm
    pdf.setFont("Helvetica-Bold", 12)
    pdf.setFillColor(colors.HexColor("#111827"))
    pdf.drawString(margin, y, "Important")

    y -= 8 * mm
    pdf.setFont("Helvetica", 9)
    pdf.setFillColor(colors.HexColor("#374151"))
    y = _draw_wrapped_text(
        pdf,
        "Please show this ticket when checking in for your tour. Keep your booking code available for verification.",
        margin,
        y,
        max_chars=95,
    )

    footer_y = 22 * mm
    pdf.setFont("Helvetica", 8)
    pdf.setFillColor(colors.HexColor("#6B7280"))

    contact_parts = []
    if branding["contact_email"]:
        contact_parts.append(branding["contact_email"])
    if branding["whatsapp"]:
        contact_parts.append(f"WhatsApp: {branding['whatsapp']}")

    footer = " | ".join(contact_parts) if contact_parts else "Thank you for your booking."
    pdf.drawCentredString(PAGE_WIDTH / 2, footer_y, footer)

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
