"""
SEO migration helpers.

This module is for importing/preserving old product URLs when a customer
moves from another website into the SaaS.

It does NOT scrape websites yet. It prepares and stores URL migration data.
"""

from urllib.parse import urlparse

from django.utils.text import slugify

from ticketing.models import ExperienceProduct, ProductURLAlias

from .paths import normalize_path


def clean_domain(value: str) -> str:
    value = str(value or "").strip().lower()

    if not value:
        return ""

    value = value.replace("https://", "").replace("http://", "")
    value = value.split("/")[0]
    value = value.split(":")[0]

    return value


def path_from_url(value: str) -> str:
    raw = str(value or "").strip()

    if not raw:
        return ""

    if raw.startswith("http://") or raw.startswith("https://"):
        parsed = urlparse(raw)
        return normalize_path(parsed.path)

    return normalize_path(raw)


def guess_slug_from_url(value: str) -> str:
    path = path_from_url(value)

    if not path:
        return ""

    parts = [part for part in path.split("/") if part]

    if not parts:
        return ""

    return slugify(parts[-1])


def create_product_url_alias_from_legacy_url(
    product,
    legacy_url,
    source="import",
    notes="Imported from previous website.",
):
    path = path_from_url(legacy_url)

    if not path:
        return None

    alias, created = ProductURLAlias.objects.get_or_create(
        organisation=product.organisation,
        product=product,
        path=path,
        defaults={
            "is_primary": False,
            "is_active": True,
            "redirect_to_primary": True,
            "redirect_type": 301,
            "source": source,
            "original_full_url": legacy_url or "",
            "notes": notes or "",
        },
    )

    if not created:
        alias.product = product
        alias.is_active = True
        alias.redirect_to_primary = True
        alias.redirect_type = 301
        alias.source = alias.source or source

        if legacy_url and not alias.original_full_url:
            alias.original_full_url = legacy_url

        if notes and not alias.notes:
            alias.notes = notes

        alias.save()

    return alias


def prepare_product_for_seo_migration(
    product,
    legacy_url="",
    legacy_domain="",
    preserve_legacy_url=True,
):
    if legacy_url:
        product.imported_from_url = legacy_url

    if legacy_domain:
        product.imported_from_domain = clean_domain(legacy_domain)

    product.preserve_legacy_url = bool(preserve_legacy_url)

    update_fields = [
        "imported_from_url",
        "imported_from_domain",
        "preserve_legacy_url",
        "updated_at",
    ]

    product.save(update_fields=update_fields)

    product.ensure_primary_url_alias()

    if legacy_url and preserve_legacy_url:
        create_product_url_alias_from_legacy_url(product, legacy_url)

    return product


def create_product_from_migration_data(
    organisation,
    data,
    created_by=None,
):
    """
    Create a product from migration/import data.

    Expected data can include:

        name
        slug
        product_type
        base_price
        short_description
        long_description
        seo_title
        meta_description
        canonical_url
        legacy_url
        legacy_domain
    """

    name = data.get("name") or data.get("title") or "Imported Product"
    legacy_url = data.get("legacy_url") or data.get("url") or ""
    legacy_domain = data.get("legacy_domain") or clean_domain(legacy_url)

    slug = (
        data.get("slug")
        or guess_slug_from_url(legacy_url)
        or slugify(name)
    )

    product = ExperienceProduct.objects.create(
        organisation=organisation,
        name=name,
        slug=slug,
        product_type=data.get("product_type") or "excursion",
        base_price=data.get("base_price") or data.get("price") or 0,
        short_description=data.get("short_description") or "",
        long_description=data.get("long_description") or data.get("description") or "",
        seo_title=data.get("seo_title") or "",
        meta_description=data.get("meta_description") or "",
        canonical_url=data.get("canonical_url") or "",
        imported_from_url=legacy_url,
        imported_from_domain=legacy_domain,
        preserve_legacy_url=True,
        status=data.get("status") or "draft",
        public_enabled=data.get("public_enabled", True),
        seller_enabled=data.get("seller_enabled", True),
        created_by=created_by,
    )

    product.ensure_primary_url_alias()

    if legacy_url:
        create_product_url_alias_from_legacy_url(product, legacy_url)

    return product


def bulk_prepare_legacy_urls(organisation, rows):
    """
    Accepts rows like:

        [
            {
                "product_id": 1,
                "legacy_url": "https://oldsite.com/excursions/detail/saona"
            }
        ]

    Returns summary.
    """

    summary = {
        "processed": 0,
        "created_aliases": 0,
        "updated_products": 0,
        "errors": [],
    }

    for index, row in enumerate(rows, start=1):
        try:
            product_id = row.get("product_id")
            legacy_url = row.get("legacy_url") or row.get("url") or ""

            if not product_id:
                raise ValueError("product_id is required.")

            if not legacy_url:
                raise ValueError("legacy_url is required.")

            product = ExperienceProduct.objects.get(
                id=product_id,
                organisation=organisation,
            )

            before_count = product.url_aliases.count()

            prepare_product_for_seo_migration(
                product=product,
                legacy_url=legacy_url,
                legacy_domain=row.get("legacy_domain") or clean_domain(legacy_url),
                preserve_legacy_url=True,
            )

            after_count = product.url_aliases.count()

            summary["processed"] += 1
            summary["updated_products"] += 1

            if after_count > before_count:
                summary["created_aliases"] += 1

        except Exception as exc:
            summary["errors"].append(
                {
                    "row": index,
                    "error": str(exc),
                    "data": row,
                }
            )

    return summary