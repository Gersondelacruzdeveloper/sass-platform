from dataclasses import dataclass
from typing import Optional

from django.db.models import Q

from ticketing.models import ExperienceProduct, ProductURLAlias
from ticketing.seo.paths import (
    build_product_path,
    extract_slug_from_path,
    is_legacy_product_path,
    normalize_path,
)


@dataclass
class ProductURLResolveResult:
    product: Optional[ExperienceProduct] = None
    alias: Optional[ProductURLAlias] = None
    redirect_path: str = ""
    redirect_type: int = 301
    resolved_by: str = ""
    found: bool = False

    @property
    def should_redirect(self):
        return bool(self.redirect_path)


def resolve_public_product_url(organisation, path):
    """
    Resolve any public product URL to the correct product.

    Supports:
    - current canonical product path
    - ProductURLAlias rows
    - old legacy URLs
    - slug fallback

    Returns ProductURLResolveResult.
    """

    clean_path = normalize_path(path)

    alias = (
        ProductURLAlias.objects
        .select_related("product", "organisation")
        .filter(
            organisation=organisation,
            path=clean_path,
            is_active=True,
            product__is_active=True,
            product__public_enabled=True,
        )
        .first()
    )

    if alias:
        alias.mark_hit()

        canonical_path = build_product_path(
            alias.product,
            getattr(organisation, "ticketing_public_site_settings", None),
        )

        if alias.redirect_to_primary and clean_path != canonical_path:
            return ProductURLResolveResult(
                product=alias.product,
                alias=alias,
                redirect_path=canonical_path,
                redirect_type=alias.redirect_type or 301,
                resolved_by="alias_redirect",
                found=True,
            )

        return ProductURLResolveResult(
            product=alias.product,
            alias=alias,
            resolved_by="alias",
            found=True,
        )

    slug = extract_slug_from_path(clean_path)

    if not slug:
        return ProductURLResolveResult(found=False, resolved_by="empty_slug")

    product = (
        ExperienceProduct.objects
        .filter(
            organisation=organisation,
            slug=slug,
            is_active=True,
            public_enabled=True,
        )
        .select_related("organisation", "category")
        .prefetch_related(
            "gallery_images",
            "packages",
            "availability",
            "pickup_schedules",
            "transfer_routes",
            "event_ticket_types",
            "url_aliases",
        )
        .first()
    )

    if not product:
        product = (
            ExperienceProduct.objects
            .filter(
                Q(imported_from_url__icontains=clean_path)
                | Q(imported_from_url__iendswith=clean_path),
                organisation=organisation,
                is_active=True,
                public_enabled=True,
            )
            .select_related("organisation", "category")
            .prefetch_related(
                "gallery_images",
                "packages",
                "availability",
                "pickup_schedules",
                "transfer_routes",
                "event_ticket_types",
                "url_aliases",
            )
            .first()
        )

    if not product:
        return ProductURLResolveResult(found=False, resolved_by="not_found")

    site_settings = getattr(organisation, "ticketing_public_site_settings", None)
    canonical_path = build_product_path(product, site_settings)

    product.ensure_primary_url_alias()

    if clean_path != canonical_path and is_legacy_product_path(clean_path):
        product.add_legacy_url_alias(
            path=clean_path,
            source="legacy",
            original_full_url=getattr(product, "imported_from_url", "") or "",
            notes="Auto-created from legacy product URL resolver.",
        )

        return ProductURLResolveResult(
            product=product,
            redirect_path=canonical_path,
            redirect_type=301,
            resolved_by="legacy_slug_redirect",
            found=True,
        )

    return ProductURLResolveResult(
        product=product,
        resolved_by="slug",
        found=True,
    )