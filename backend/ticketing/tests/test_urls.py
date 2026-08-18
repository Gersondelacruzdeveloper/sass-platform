"""Routing contract tests for the ticketing application.

These tests verify URL names and reverse() behavior only. They deliberately do
not call views, providers, Celery, or external services.
"""

from __future__ import annotations

from uuid import uuid4

from django.test import SimpleTestCase
from django.urls import NoReverseMatch, resolve, reverse


class TicketingURLTests(SimpleTestCase):
    """Protect ticketing route names and canonical paths from regressions."""

    ROUTER_BASES = {
        # Private owner/admin.
        "ticketing-settings": "settings",
        "ticketing-public-site-settings": "public-site-settings",
        "ticketing-payment-provider-settings": "payment-provider-settings",
        "ticketing-email-settings": "email-settings",
        "ticketing-whatsapp-settings": "whatsapp-settings",
        "ticketing-categories": "categories",
        "ticketing-products": "products",
        "ticketing-product-gallery-images": "product-gallery-images",
        "ticketing-blog-categories": "blog-categories",
        "ticketing-blog-posts": "blog-posts",
        "ticketing-blog-gallery-images": "blog-gallery-images",
        "ticketing-packages": "packages",
        "ticketing-availability": "availability",
        "ticketing-pickup-zones": "pickup-zones",
        "ticketing-pickup-locations": "pickup-locations",
        "ticketing-pickup-schedules": "pickup-schedules",
        "ticketing-customers": "customers",
        "ticketing-sellers": "sellers",
        "ticketing-seller-signup-invites": "seller-signup-invites",
        "ticketing-seller-applications": "seller-applications",
        "ticketing-seller-payout-requests": "seller-payout-requests",
        "ticketing-seller-commission-rules": "seller-commission-rules",
        "ticketing-transfer-routes": "transfer-routes",
        "ticketing-transfer-price-bands": "transfer-price-bands",
        "ticketing-event-ticket-types": "event-ticket-types",
        "ticketing-bookings": "bookings",
        "ticketing-booking-items": "booking-items",
        "ticketing-booking-pickup-info": "booking-pickup-info",
        "ticketing-payments": "payments",
        "ticketing-commissions": "commissions",
        "ticketing-receipts": "receipts",
        "ticketing-notifications": "notifications",
        "ticketing-integrations": "integrations",
        "ticketing-external-snapshots": "external-snapshots",
        "ticketing-reviews": "reviews",

        # Customer AI.
        "ticketing-customer-ai-conversations": "customer-ai/conversations",
        "ticketing-customer-ai-handoffs": "customer-ai/handoffs",
        "ticketing-customer-ai-carts": "customer-ai/carts",

        # Partner / admission / finance.
        "ticketing-business-entities": "business-entities",
        "ticketing-business-entity-access": "business-entity-access",
        "ticketing-business-agreements": "business-agreements",
        "ticketing-financial-snapshots": "financial-snapshots",
        "ticketing-admission-tokens": "admission-tokens",
        "ticketing-admissions": "admissions",
        "ticketing-scan-attempts": "scan-attempts",
        "ticketing-partner-settlements": "partner-settlements",
        "ticketing-partner-settlement-payments": "partner-settlement-payments",
        "ticketing-ledger": "ledger",

        # Seller-only.
        "ticketing-seller-products": "seller/products",
        "ticketing-seller-bookings": "seller/bookings",
        "ticketing-seller-payments": "seller/payments",
        "ticketing-seller-commissions": "seller/commissions",
        "ticketing-seller-payout-accounts": "seller/payout-accounts",
        "ticketing-seller-my-payout-requests": "seller/payout-requests",

        # Public router.
        "ticketing-public-products": "public/products",
        "ticketing-public-categories": "public/categories",
        "ticketing-public-blog-categories": "public/blog-categories",
        "ticketing-public-blog-posts": "public/blog-posts",
        "ticketing-public-bookings": "public/bookings",
        "ticketing-public-pickup-locations": "public/pickup-locations",
    }

    EXPLICIT_PATHS = {
        "ticketing-whatsapp-webhook": "/api/ticketing/whatsapp/webhook/",
        "ticketing-partner-bootstrap": "/api/ticketing/partner/bootstrap/",
        "ticketing-partner-login": "/api/ticketing/partner/login/",
        "ticketing-dashboard": "/api/ticketing/dashboard/",
        "ticketing-reports": "/api/ticketing/reports/",
        "ticketing-seller-dashboard-legacy": "/api/ticketing/seller-dashboard/",
        "ticketing-seller-dashboard": "/api/ticketing/seller/dashboard/",
        "ticketing-seller-application-status": "/api/ticketing/seller/application/",
        "ticketing-public-resolve-domain": "/api/ticketing/public/resolve-domain/",
        "ticketing-public-product-resolve": "/api/ticketing/public/product-resolve/",
        "ticketing-public-branding": "/api/ticketing/public/branding/",
        "ticketing-public-seo": "/api/ticketing/public/seo/",
        "ticketing-public-sitemap": "/api/ticketing/public/sitemap.xml",
        "ticketing-public-robots": "/api/ticketing/public/robots.txt",
        "ticketing-public-pickup-schedule-resolve": (
            "/api/ticketing/public/pickup-schedules/resolve/"
        ),
        "ticketing-stripe-webhook": "/api/ticketing/payments/stripe/webhook/",
        "ticketing-wellet-products": "/api/ticketing/integrations/wellet/products/",
        "ticketing-wellet-settings": "/api/ticketing/integrations/wellet/settings/",
        "ticketing-live-availability": "/api/ticketing/live-availability/",
        "ticketing-seller-ai-chat": "/api/ticketing/seller/ai/chat/",
        "ticketing-seller-ai-transcribe": "/api/ticketing/seller/ai/transcribe/",
    }

    SLUGGED_PATHS = {
        "ticketing-public-customer-cart-session-convert": (
            "/api/ticketing/public/acme/customer-cart-session/convert/"
        ),
        "ticketing-public-customer-cart-session-resolve": (
            "/api/ticketing/public/acme/customer-cart-session/resolve/"
        ),
        "ticketing-public-product-resolve-by-slug": (
            "/api/ticketing/public/acme/product-resolve/"
        ),
        "ticketing-public-branding-by-slug": (
            "/api/ticketing/public/acme/branding/"
        ),
        "ticketing-public-seo-by-slug": "/api/ticketing/public/acme/seo/",
        "ticketing-public-sitemap-by-slug": (
            "/api/ticketing/public/acme/sitemap.xml"
        ),
        "ticketing-public-robots-by-slug": (
            "/api/ticketing/public/acme/robots.txt"
        ),
        "ticketing-public-blog-list": "/api/ticketing/public/acme/blog/",
        "ticketing-public-blog-categories": (
            "/api/ticketing/public/acme/blog-categories/"
        ),
        "ticketing-public-pickup-schedule-resolve-by-slug": (
            "/api/ticketing/public/acme/pickup-schedules/resolve/"
        ),
        "ticketing-public-seller-bookings": (
            "/api/ticketing/public/acme/s/seller-one/bookings/"
        ),
        "ticketing-public-booking-confirmation": (
            "/api/ticketing/public/acme/confirmation/PCD-ABC123/"
        ),
        "ticketing-public-payment-options": (
            "/api/ticketing/public/acme/payments/options/"
        ),
        "ticketing-public-stripe-create-checkout-session": (
            "/api/ticketing/public/acme/payments/stripe/"
            "create-checkout-session/"
        ),
        "ticketing-public-stripe-confirm-session": (
            "/api/ticketing/public/acme/payments/stripe/confirm-session/"
        ),
        "ticketing-public-paypal-create-order": (
            "/api/ticketing/public/acme/payments/paypal/create-order/"
        ),
        "ticketing-public-paypal-capture-order": (
            "/api/ticketing/public/acme/payments/paypal/capture-order/"
        ),
        "ticketing-public-product-availability": (
            "/api/ticketing/public/acme/products/saona/availability/"
        ),
    }

    def test_all_router_list_routes_reverse_to_expected_paths(self):
        for basename, path in self.ROUTER_BASES.items():
            with self.subTest(basename=basename):
                self.assertEqual(
                    reverse(f"{basename}-list"),
                    f"/api/ticketing/{path}/",
                )

    def test_all_router_detail_routes_reverse_to_expected_paths(self):
        for basename, path in self.ROUTER_BASES.items():
            with self.subTest(basename=basename):
                self.assertEqual(
                    reverse(f"{basename}-detail", args=[123]),
                    f"/api/ticketing/{path}/123/",
                )

    def test_explicit_named_paths_reverse_to_expected_paths(self):
        for name, path in self.EXPLICIT_PATHS.items():
            with self.subTest(name=name):
                self.assertEqual(reverse(name), path)

    def test_slugged_named_paths_reverse_to_expected_paths(self):
        kwargs_by_name = {
            "ticketing-public-customer-cart-session-convert": {
                "organisation_slug": "acme"
            },
            "ticketing-public-customer-cart-session-resolve": {
                "organisation_slug": "acme"
            },
            "ticketing-public-product-resolve-by-slug": {
                "organisation_slug": "acme"
            },
            "ticketing-public-branding-by-slug": {
                "organisation_slug": "acme"
            },
            "ticketing-public-seo-by-slug": {"organisation_slug": "acme"},
            "ticketing-public-sitemap-by-slug": {"organisation_slug": "acme"},
            "ticketing-public-robots-by-slug": {"organisation_slug": "acme"},
            "ticketing-public-blog-list": {"organisation_slug": "acme"},
            "ticketing-public-blog-categories": {
                "organisation_slug": "acme"
            },
            "ticketing-public-pickup-schedule-resolve-by-slug": {
                "organisation_slug": "acme"
            },
            "ticketing-public-seller-bookings": {
                "organisation_slug": "acme",
                "seller_slug": "seller-one",
            },
            "ticketing-public-booking-confirmation": {
                "organisation_slug": "acme",
                "booking_code": "PCD-ABC123",
            },
            "ticketing-public-payment-options": {
                "organisation_slug": "acme"
            },
            "ticketing-public-stripe-create-checkout-session": {
                "organisation_slug": "acme"
            },
            "ticketing-public-stripe-confirm-session": {
                "organisation_slug": "acme"
            },
            "ticketing-public-paypal-create-order": {
                "organisation_slug": "acme"
            },
            "ticketing-public-paypal-capture-order": {
                "organisation_slug": "acme"
            },
            "ticketing-public-product-availability": {
                "organisation_slug": "acme",
                "product_slug": "saona",
            },
        }

        for name, expected in self.SLUGGED_PATHS.items():
            with self.subTest(name=name):
                self.assertEqual(
                    reverse(name, kwargs=kwargs_by_name[name]),
                    expected,
                )

    def test_public_seller_application_uuid_route_reverses(self):
        token = uuid4()
        self.assertEqual(
            reverse(
                "ticketing-public-seller-apply",
                kwargs={"token": token},
            ),
            f"/api/ticketing/public/seller-apply/{token}/",
        )

    def test_public_blog_detail_route_reverses(self):
        self.assertEqual(
            reverse(
                "ticketing-public-blog-detail",
                kwargs={
                    "organisation_slug": "acme",
                    "slug": "best-beaches",
                },
            ),
            "/api/ticketing/public/acme/blog/best-beaches/",
        )

    def test_reversed_explicit_urls_resolve_back_to_same_names(self):
        for name in self.EXPLICIT_PATHS:
            with self.subTest(name=name):
                match = resolve(reverse(name))
                self.assertEqual(match.url_name, name)

    def test_reversed_slugged_urls_resolve_back_to_same_names(self):
        checks = (
            (
                "ticketing-public-seo-by-slug",
                {"organisation_slug": "acme"},
            ),
            (
                "ticketing-public-seller-bookings",
                {
                    "organisation_slug": "acme",
                    "seller_slug": "seller-one",
                },
            ),
            (
                "ticketing-public-booking-confirmation",
                {
                    "organisation_slug": "acme",
                    "booking_code": "PCD-ABC123",
                },
            ),
            (
                "ticketing-public-product-availability",
                {
                    "organisation_slug": "acme",
                    "product_slug": "saona",
                },
            ),
        )
        for name, kwargs in checks:
            with self.subTest(name=name):
                match = resolve(reverse(name, kwargs=kwargs))
                self.assertEqual(match.url_name, name)

    def test_router_list_and_detail_urls_resolve_to_expected_names(self):
        representative = (
            "ticketing-products",
            "ticketing-bookings",
            "ticketing-sellers",
            "ticketing-partner-settlements",
            "ticketing-seller-bookings",
            "ticketing-public-products",
            "ticketing-customer-ai-conversations",
        )
        for basename in representative:
            with self.subTest(basename=basename):
                self.assertEqual(
                    resolve(reverse(f"{basename}-list")).url_name,
                    f"{basename}-list",
                )
                self.assertEqual(
                    resolve(
                        reverse(f"{basename}-detail", args=[123])
                    ).url_name,
                    f"{basename}-detail",
                )

    def test_critical_router_action_names_reverse(self):
        cases = (
            (
                "ticketing-settings-mine",
                (),
                "/api/ticketing/settings/mine/",
            ),
            (
                "ticketing-sellers-me",
                (),
                "/api/ticketing/sellers/me/",
            ),
            (
                "ticketing-seller-bookings-cancel",
                (123,),
                "/api/ticketing/seller/bookings/123/cancel/",
            ),
            (
                "ticketing-scanner-resolve",
                (),
                "/api/ticketing/scanner/resolve/",
            ),
            (
                "ticketing-scanner-admit",
                (),
                "/api/ticketing/scanner/admit/",
            ),
            (
                "ticketing-scanner-sync-offline",
                (),
                "/api/ticketing/scanner/sync-offline/",
            ),
        )
        for name, args, expected in cases:
            with self.subTest(name=name):
                self.assertEqual(reverse(name, args=args), expected)

    def test_router_basename_names_are_unique(self):
        # A duplicate basename can silently shadow reverse() contracts.
        basenames = list(self.ROUTER_BASES)
        self.assertEqual(len(basenames), len(set(basenames)))

    def test_invalid_slugged_routes_require_declared_parameters(self):
        for name in (
            "ticketing-public-seo-by-slug",
            "ticketing-public-seller-bookings",
            "ticketing-public-booking-confirmation",
            "ticketing-public-product-availability",
        ):
            with self.subTest(name=name):
                with self.assertRaises(NoReverseMatch):
                    reverse(name)
