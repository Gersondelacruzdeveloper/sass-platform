from django.conf import settings
from django.core.mail import get_connection

from ticketing.models import TicketingEmailSettings, TicketingPublicSiteSettings


def get_site_settings(organisation):
    return TicketingPublicSiteSettings.objects.filter(
        organisation=organisation
    ).first()


def get_email_settings(organisation):
    email_settings, _ = TicketingEmailSettings.objects.get_or_create(
        organisation=organisation,
        defaults={
            "provider": "google_oauth",
        },
    )

    return email_settings


def get_email_connection(email_settings):
    return get_connection(
        backend="django.core.mail.backends.smtp.EmailBackend",
        host=email_settings.smtp_host,
        port=email_settings.smtp_port,
        username=email_settings.smtp_username,
        password=email_settings.smtp_password,
        use_tls=email_settings.smtp_encryption == "tls",
        use_ssl=email_settings.smtp_encryption == "ssl",
        timeout=15,
    )


def get_owner_email(booking):
    site = get_site_settings(booking.organisation)

    if site and site.public_email:
        return site.public_email

    return getattr(booking.organisation, "email", "") or ""


def get_brand_name(booking):
    site = get_site_settings(booking.organisation)

    if site and getattr(site, "display_title", ""):
        return site.display_title

    return booking.organisation.name


def get_public_base_url(booking):
    site = get_site_settings(booking.organisation)

    if site and site.custom_domain:
        return f"https://{site.custom_domain}"

    frontend_app_url = getattr(settings, "FRONTEND_APP_URL", "") or getattr(
        settings,
        "FRONTEND_URL",
        "",
    )

    return frontend_app_url.rstrip("/")


def get_currency_symbol(booking):
    settings_obj = getattr(booking.organisation, "ticketing_settings", None)

    if settings_obj:
        return settings_obj.currency_symbol or "US$"

    return "US$"


def build_booking_context(booking):
    return {
        "booking": booking,
        "brand_name": get_brand_name(booking),
        "public_base_url": get_public_base_url(booking),
        "currency_symbol": get_currency_symbol(booking),
        "items": booking.items.all(),
        "payments": booking.payments.all(),
        "pickup_info": getattr(booking, "pickup_info", None),
    }
