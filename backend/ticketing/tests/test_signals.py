"""Signal and CORS hook tests for ticketing.

Ticketing currently registers one runtime signal hook: the django-cors-headers
``check_request_enabled`` signal in ``ticketing.cors``.  These tests exercise
that real signal rather than inventing model signals that do not exist.
"""

from __future__ import annotations

from django.apps import apps
from django.core.cache import cache
from django.test import RequestFactory, TestCase
from organisations.models import Organisation
from corsheaders.signals import check_request_enabled

from ticketing import cors
from ticketing.apps import TicketingConfig
from ticketing.models import TicketingPublicSiteSettings


class TicketingSignalTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Signal Organisation A",
            slug="signal-org-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Signal Organisation B",
            slug="signal-org-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.inactive_org = Organisation.objects.create(
            name="Signal Inactive Organisation",
            slug="signal-inactive-org",
            business_type="ticketing",
            is_active=False,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            custom_domain="www.signal-a.example.test",
            domain_status="active",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            custom_domain="signal-b.example.test",
            domain_status="active",
            is_published=True,
        )
        cls.inactive_site = TicketingPublicSiteSettings.objects.create(
            organisation=cls.inactive_org,
            custom_domain="inactive-signal.example.test",
            domain_status="active",
            is_published=True,
        )

    def setUp(self):
        cache.clear()
        self.factory = RequestFactory()

    def request(self, path, origin=None):
        headers = {}
        if origin is not None:
            headers["HTTP_ORIGIN"] = origin
        return self.factory.get(path, **headers)

    def signal_result_for_ticketing_receiver(self, request):
        responses = check_request_enabled.send(
            sender=self.__class__,
            request=request,
        )
        for receiver, result in responses:
            if receiver is cors.cors_allow_ticketing_public_domains:
                return result
        self.fail("ticketing CORS receiver was not registered on the signal")

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def test_ticketing_app_config_is_installed(self):
        config = apps.get_app_config("ticketing")
        self.assertIsInstance(config, TicketingConfig)

    def test_cors_receiver_is_registered_on_check_request_enabled_signal(self):
        request = self.request(
            "/api/ticketing/public-products/",
            "https://www.signal-a.example.test",
        )

        result = self.signal_result_for_ticketing_receiver(request)

        self.assertTrue(result)

    def test_ready_is_safe_to_call_more_than_once(self):
        config = apps.get_app_config("ticketing")

        config.ready()
        config.ready()

        request = self.request(
            "/api/ticketing/public-products/",
            "https://www.signal-a.example.test",
        )
        responses = check_request_enabled.send(
            sender=self.__class__,
            request=request,
        )
        ticketing_results = [
            result
            for receiver, result in responses
            if receiver is cors.cors_allow_ticketing_public_domains
        ]

        # Django Signal.connect without dispatch_uid keeps only the same
        # receiver reference once, so repeated AppConfig.ready() calls must not
        # create duplicate deliveries.
        self.assertEqual(ticketing_results, [True])

    # ------------------------------------------------------------------
    # Origin normalization utilities
    # ------------------------------------------------------------------

    def test_clean_origin_hostname_accepts_http_and_https(self):
        self.assertEqual(
            cors.clean_origin_hostname(
                "https://WWW.Signal-A.Example.Test:443/path?q=1"
            ),
            "www.signal-a.example.test",
        )
        self.assertEqual(
            cors.clean_origin_hostname("http://signal-a.example.test:8080"),
            "signal-a.example.test",
        )

    def test_clean_origin_hostname_rejects_missing_and_unsupported_schemes(self):
        for origin in (
            "",
            None,
            "signal-a.example.test",
            "ftp://signal-a.example.test",
            "javascript:alert(1)",
        ):
            with self.subTest(origin=origin):
                self.assertEqual(cors.clean_origin_hostname(origin), "")

    def test_build_domain_candidates_adds_or_removes_www_without_duplicates(self):
        self.assertEqual(
            cors.build_domain_candidates("signal-a.example.test"),
            [
                "signal-a.example.test",
                "www.signal-a.example.test",
            ],
        )
        self.assertEqual(
            cors.build_domain_candidates("www.signal-a.example.test"),
            [
                "www.signal-a.example.test",
                "signal-a.example.test",
            ],
        )

    # ------------------------------------------------------------------
    # Public/private path boundary
    # ------------------------------------------------------------------

    def test_known_direct_public_ticketing_paths_are_allowed_candidates(self):
        for path in (
            "/api/ticketing/public/resolve-domain/",
            "/api/ticketing/public-branding/",
            "/api/ticketing/public-products/",
            "/api/ticketing/public-categories/",
            "/api/ticketing/public-bookings/",
            "/api/ticketing/public-seo/",
            "/api/ticketing/public-sitemap/",
            "/api/ticketing/public-robots/",
            "/api/ticketing/public-pickup-locations/",
            "/api/ticketing/public-live-availability/",
        ):
            with self.subTest(path=path):
                self.assertTrue(cors.is_public_ticketing_path(path))

    def test_slugged_public_ticketing_paths_are_allowed_candidates(self):
        for path in (
            "/api/ticketing/signal-org-a/public-products/",
            "/api/ticketing/signal-org-a/public-branding/",
            "/api/ticketing/signal-org-a/public-bookings/",
            "/api/ticketing/signal-org-a/public-any-future-resource/",
        ):
            with self.subTest(path=path):
                self.assertTrue(cors.is_public_ticketing_path(path))

    def test_private_and_non_ticketing_paths_are_never_public_candidates(self):
        for path in (
            "/api/accounts/me/",
            "/api/organisations/",
            "/api/subscriptions/",
            "/api/disco/employees/me/",
            "/api/ticketing/products/",
            "/api/ticketing/sellers/me/",
            "/api/ticketing/settings/mine/",
            "/api/ticketing/integrations/",
            "/api/ticketing/dashboard/",
            "",
            None,
        ):
            with self.subTest(path=path):
                self.assertFalse(cors.is_public_ticketing_path(path))

    # ------------------------------------------------------------------
    # Real signal decisions
    # ------------------------------------------------------------------

    def test_signal_allows_active_published_custom_domain_for_public_path(self):
        request = self.request(
            "/api/ticketing/public-products/",
            "https://www.signal-a.example.test",
        )
        self.assertTrue(self.signal_result_for_ticketing_receiver(request))

    def test_signal_allows_www_variant_of_stored_custom_domain(self):
        self.site_a.custom_domain = "signal-a.example.test"
        self.site_a.save(update_fields=["custom_domain"])

        request = self.request(
            "/api/ticketing/public-products/",
            "https://www.signal-a.example.test",
        )

        self.assertTrue(self.signal_result_for_ticketing_receiver(request))

    def test_signal_allows_non_www_variant_when_stored_domain_has_www(self):
        request = self.request(
            "/api/ticketing/public-products/",
            "https://signal-a.example.test",
        )
        self.assertTrue(self.signal_result_for_ticketing_receiver(request))

    def test_signal_domain_match_is_case_insensitive(self):
        request = self.request(
            "/api/ticketing/public-products/",
            "https://WWW.SIGNAL-A.EXAMPLE.TEST",
        )
        self.assertTrue(self.signal_result_for_ticketing_receiver(request))

    def test_signal_rejects_unknown_origin(self):
        request = self.request(
            "/api/ticketing/public-products/",
            "https://unknown.example.test",
        )
        self.assertFalse(self.signal_result_for_ticketing_receiver(request))

    def test_signal_rejects_missing_origin(self):
        request = self.request("/api/ticketing/public-products/")
        self.assertFalse(self.signal_result_for_ticketing_receiver(request))

    def test_signal_rejects_malformed_origin_without_database_allowance(self):
        request = self.request(
            "/api/ticketing/public-products/",
            "signal-a.example.test",
        )
        self.assertFalse(self.signal_result_for_ticketing_receiver(request))

    def test_signal_rejects_valid_custom_domain_on_private_ticketing_endpoint(self):
        for path in (
            "/api/ticketing/products/",
            "/api/ticketing/sellers/me/",
            "/api/ticketing/settings/mine/",
            "/api/ticketing/dashboard/",
        ):
            with self.subTest(path=path):
                request = self.request(
                    path,
                    "https://www.signal-a.example.test",
                )
                self.assertFalse(
                    self.signal_result_for_ticketing_receiver(request)
                )

    def test_signal_rejects_valid_custom_domain_on_non_ticketing_endpoint(self):
        request = self.request(
            "/api/accounts/me/",
            "https://www.signal-a.example.test",
        )
        self.assertFalse(self.signal_result_for_ticketing_receiver(request))

    def test_signal_rejects_unpublished_site(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        request = self.request(
            "/api/ticketing/public-products/",
            "https://www.signal-a.example.test",
        )

        self.assertFalse(self.signal_result_for_ticketing_receiver(request))

    def test_signal_rejects_inactive_organisation(self):
        request = self.request(
            "/api/ticketing/public-products/",
            "https://inactive-signal.example.test",
        )
        self.assertFalse(self.signal_result_for_ticketing_receiver(request))

    def test_signal_rejects_failed_domain_status(self):
        self.site_a.domain_status = "failed"
        self.site_a.save(update_fields=["domain_status"])

        request = self.request(
            "/api/ticketing/public-products/",
            "https://www.signal-a.example.test",
        )

        self.assertFalse(self.signal_result_for_ticketing_receiver(request))

    def test_signal_keeps_tenant_domains_independent(self):
        request_a = self.request(
            "/api/ticketing/public-products/",
            "https://www.signal-a.example.test",
        )
        request_b = self.request(
            "/api/ticketing/public-products/",
            "https://signal-b.example.test",
        )

        self.assertTrue(self.signal_result_for_ticketing_receiver(request_a))
        self.assertTrue(self.signal_result_for_ticketing_receiver(request_b))

        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])
        cache.clear()

        self.assertFalse(self.signal_result_for_ticketing_receiver(request_a))
        self.assertTrue(self.signal_result_for_ticketing_receiver(request_b))

    # ------------------------------------------------------------------
    # Cache behavior
    # ------------------------------------------------------------------

    def test_signal_caches_allowed_origin_for_sixty_seconds_contractually(self):
        request = self.request(
            "/api/ticketing/public-products/",
            "https://www.signal-a.example.test",
        )

        self.assertTrue(self.signal_result_for_ticketing_receiver(request))

        cache_key = (
            "ticketing:cors:public-origin:"
            "www.signal-a.example.test"
        )
        self.assertIs(cache.get(cache_key), True)

    def test_signal_caches_denied_unknown_origin(self):
        request = self.request(
            "/api/ticketing/public-products/",
            "https://unknown.example.test",
        )

        self.assertFalse(self.signal_result_for_ticketing_receiver(request))

        cache_key = "ticketing:cors:public-origin:unknown.example.test"
        self.assertIs(cache.get(cache_key), False)

    def test_cached_allowance_is_used_until_cache_is_cleared(self):
        request = self.request(
            "/api/ticketing/public-products/",
            "https://www.signal-a.example.test",
        )

        self.assertTrue(self.signal_result_for_ticketing_receiver(request))

        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        # The one-minute cache intentionally preserves the existing decision.
        self.assertTrue(self.signal_result_for_ticketing_receiver(request))

        cache.clear()
        self.assertFalse(self.signal_result_for_ticketing_receiver(request))

    def test_cache_is_keyed_by_hostname_not_path(self):
        first = self.request(
            "/api/ticketing/public-products/",
            "https://www.signal-a.example.test",
        )
        second = self.request(
            "/api/ticketing/public-bookings/",
            "https://www.signal-a.example.test",
        )

        self.assertTrue(self.signal_result_for_ticketing_receiver(first))
        self.assertTrue(self.signal_result_for_ticketing_receiver(second))

        cache_key = (
            "ticketing:cors:public-origin:"
            "www.signal-a.example.test"
        )
        self.assertIs(cache.get(cache_key), True)

    def test_private_path_is_rejected_before_origin_cache_can_grant_access(self):
        public_request = self.request(
            "/api/ticketing/public-products/",
            "https://www.signal-a.example.test",
        )
        private_request = self.request(
            "/api/ticketing/products/",
            "https://www.signal-a.example.test",
        )

        self.assertTrue(
            self.signal_result_for_ticketing_receiver(public_request)
        )
        self.assertFalse(
            self.signal_result_for_ticketing_receiver(private_request)
        )
