from urllib.parse import urlparse

from corsheaders.signals import check_request_enabled
from django.core.cache import cache
from django.db.models import Q


PUBLIC_TICKETING_CORS_PATH_PREFIXES = [
    "/api/ticketing/public/",
    "/api/ticketing/public-branding/",
    "/api/ticketing/public-products/",
    "/api/ticketing/public-categories/",
    "/api/ticketing/public-bookings/",
    "/api/ticketing/public-seo/",
    "/api/ticketing/public-sitemap/",
    "/api/ticketing/public-robots/",
]


def clean_origin_hostname(origin):
    if not origin:
        return ""

    parsed = urlparse(origin)

    if parsed.scheme not in ["http", "https"]:
        return ""

    return (parsed.hostname or "").strip().lower()


def build_domain_candidates(hostname):
    candidates = [hostname]

    if hostname.startswith("www."):
        candidates.append(hostname[4:])
    else:
        candidates.append(f"www.{hostname}")

    return list(dict.fromkeys(candidates))


def is_public_ticketing_path(path):
    path = str(path or "")

    return any(
        path.startswith(prefix)
        for prefix in PUBLIC_TICKETING_CORS_PATH_PREFIXES
    )


def cors_allow_ticketing_public_domains(sender, request, **kwargs):
    """
    Allow tenant custom domains from the DB only for public ticketing endpoints.

    This intentionally does NOT allow custom domains to call private endpoints
    like /api/accounts/me/, /api/organisations/, /api/subscriptions/, etc.
    """
    if not is_public_ticketing_path(request.path):
        return False

    origin = request.headers.get("origin", "")
    hostname = clean_origin_hostname(origin)

    if not hostname:
        return False

    cache_key = f"ticketing:cors:public-origin:{hostname}"
    cached_value = cache.get(cache_key)

    if cached_value is not None:
        return cached_value

    from ticketing.models import TicketingPublicSiteSettings

    candidates = build_domain_candidates(hostname)

    query = Q()

    for candidate in candidates:
        query |= Q(custom_domain__iexact=candidate)

    allowed = (
        TicketingPublicSiteSettings.objects.select_related("organisation")
        .filter(
            query,
            organisation__is_active=True,
            is_published=True,
        )
        .exclude(domain_status="failed")
        .exists()
    )

    cache.set(cache_key, allowed, 60)

    return allowed


check_request_enabled.connect(cors_allow_ticketing_public_domains)