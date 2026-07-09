"""
SEO path utilities.

This module is the only place responsible for generating canonical
public URLs for products.

Nothing else in the project should manually concatenate
"/product/" + slug anymore.

Always use:

    build_product_path(...)
    build_product_url(...)
"""

from urllib.parse import urljoin


DEFAULT_PRODUCT_PATTERN = "/product/{slug}"


def normalize_path(path: str) -> str:
    """
    Normalize a URL path.

    Examples

    product/test
        -> /product/test

    /product/test/
        -> /product/test

    //product//test//
        -> /product/test
    """

    path = str(path or "").strip()

    if not path:
        return "/"

    path = path.replace("\\", "/")

    while "//" in path:
        path = path.replace("//", "/")

    if not path.startswith("/"):
        path = "/" + path

    if len(path) > 1:
        path = path.rstrip("/")

    return path


def ensure_slug_pattern(pattern: str) -> str:
    """
    Makes sure the pattern contains {slug}.
    """

    pattern = normalize_path(pattern or DEFAULT_PRODUCT_PATTERN)

    if "{slug}" not in pattern:
        pattern = DEFAULT_PRODUCT_PATTERN

    return pattern


def get_product_pattern(site_settings=None):
    """
    Returns the configured product URL pattern.

    Falls back to /product/{slug}
    """

    if site_settings is None:
        return DEFAULT_PRODUCT_PATTERN

    try:
        pattern = site_settings.get_product_url_pattern()
    except Exception:
        pattern = DEFAULT_PRODUCT_PATTERN

    return ensure_slug_pattern(pattern)


def build_product_path(product, site_settings=None):
    """
    Builds the canonical public path.

    Example:

        /product/saona-island

    or

        /excursions/detail/saona-island
    """

    pattern = get_product_pattern(site_settings)

    return normalize_path(
        pattern.replace("{slug}", product.slug)
    )


def build_product_url(product, site_settings=None):
    """
    Builds the absolute canonical URL.

    Example

    https://www.company.com/product/saona-island
    """

    path = build_product_path(product, site_settings)

    if site_settings and getattr(site_settings, "custom_domain", None):
        domain = site_settings.custom_domain.strip()

        if not domain.startswith("http"):
            domain = "https://" + domain

        return urljoin(domain.rstrip("/") + "/", path.lstrip("/"))

    if product.canonical_url:
        return product.canonical_url

    return path


def extract_slug_from_path(path):
    """
    Returns the last URL segment.

    /product/saona-island

        -> saona-island
    """

    path = normalize_path(path)

    pieces = [x for x in path.split("/") if x]

    if not pieces:
        return None

    return pieces[-1]


def path_matches_pattern(path, pattern):
    """
    Checks if a URL matches a configured pattern.

    Pattern

        /tour/{slug}

    matches

        /tour/saona-island

    but not

        /product/saona-island
    """

    path = normalize_path(path)
    pattern = ensure_slug_pattern(pattern)

    prefix = pattern.split("{slug}")[0]

    return path.startswith(prefix)


def is_legacy_product_path(path):
    """
    Detects old Punta Cana Discovery URLs.

    This list can grow over time.
    """

    path = normalize_path(path)

    legacy_prefixes = (
        "/excursions/detail/",
        "/excursions/",
        "/tour/",
        "/tours/",
        "/activities/",
        "/activity/",
        "/experience/",
        "/experiences/",
        "/product/",
        "/products/",
    )

    return any(path.startswith(prefix) for prefix in legacy_prefixes)