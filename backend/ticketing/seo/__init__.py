"""
Ticketing SEO package.

Includes:
- canonical URL/path generation
- public URL resolution
- legacy URL redirects
- sitemap helpers
- migration helpers
"""

from .paths import (
    DEFAULT_PRODUCT_PATTERN,
    normalize_path,
    ensure_slug_pattern,
    get_product_pattern,
    build_product_path,
    build_product_url,
    extract_slug_from_path,
    path_matches_pattern,
    is_legacy_product_path,
)

from .resolver import (
    ProductURLResolveResult,
    resolve_public_product_url,
)

from .redirects import (
    build_redirect_response,
    redirect_payload,
)

__all__ = [
    "DEFAULT_PRODUCT_PATTERN",
    "normalize_path",
    "ensure_slug_pattern",
    "get_product_pattern",
    "build_product_path",
    "build_product_url",
    "extract_slug_from_path",
    "path_matches_pattern",
    "is_legacy_product_path",
    "ProductURLResolveResult",
    "resolve_public_product_url",
    "build_redirect_response",
    "redirect_payload",
]