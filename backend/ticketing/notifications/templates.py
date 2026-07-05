"""
Shared notification template helpers for the Ticketing module.

This file intentionally stays small for now, but it gives the notification
system one central place for:
- email subject builders
- email template paths
- future WhatsApp/SMS/PDF template helpers
"""


CUSTOMER_CONFIRMATION_TEXT_TEMPLATE = "ticketing/emails/customer_confirmation.txt"
CUSTOMER_CONFIRMATION_HTML_TEMPLATE = "ticketing/emails/customer_confirmation.html"

OWNER_NOTIFICATION_TEXT_TEMPLATE = "ticketing/emails/owner_notification.txt"
OWNER_NOTIFICATION_HTML_TEMPLATE = "ticketing/emails/owner_notification.html"


def customer_confirmation_subject(booking):
    return f"Booking confirmation {booking.booking_code}"


def owner_notification_subject(booking):
    return f"New booking {booking.booking_code}"


def test_email_subject(organisation):
    return f"Test email from {organisation.name}"


def test_email_body(organisation):
    return (
        f"Your email notification settings for {organisation.name} are working.\n\n"
        "Booking confirmation emails and owner notification emails can now be sent "
        "using this email account.\n\n"
        "If you are using Gmail, remember this should be a Google App Password, "
        "not the normal Gmail account password."
    )
