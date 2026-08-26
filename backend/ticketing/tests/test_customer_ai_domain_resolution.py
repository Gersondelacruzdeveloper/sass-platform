from types import SimpleNamespace
from unittest.mock import MagicMock

from django.test import SimpleTestCase

from ticketing.ai.customer.cart_components import _tenant_domain
from ticketing.ai.customer.django_tool_adapters import _public_url


def _organisation(*, custom_domain: str = "", legacy_domain: str = ""):
    domains = MagicMock()
    domains.filter.return_value.first.return_value = (
        SimpleNamespace(domain=legacy_domain) if legacy_domain else None
    )
    domains.order_by.return_value.first.return_value = (
        SimpleNamespace(domain=legacy_domain) if legacy_domain else None
    )
    return SimpleNamespace(
        ticketing_public_site_settings=SimpleNamespace(
            custom_domain=custom_domain,
        ),
        domains=domains,
    )


class CustomerAIDomainResolutionTests(SimpleTestCase):
    def test_checkout_domain_prefers_current_tenant_public_site_settings(self):
        organisation = _organisation(
            custom_domain="www.alpha.example",
            legacy_domain="legacy.alpha.example",
        )

        result = _tenant_domain(organisation)

        self.assertEqual(result, "https://www.alpha.example")
        organisation.domains.filter.assert_not_called()

    def test_product_url_prefers_current_tenant_public_site_settings(self):
        organisation = _organisation(
            custom_domain="www.alpha.example",
            legacy_domain="legacy.alpha.example",
        )
        product = SimpleNamespace(current_public_path="/excursions/saona")

        result = _public_url(organisation, product)

        self.assertEqual(
            result,
            "https://www.alpha.example/excursions/saona",
        )
        organisation.domains.filter.assert_not_called()

    def test_domain_resolution_remains_tenant_scoped(self):
        first = _organisation(custom_domain="first.example")
        second = _organisation(custom_domain="second.example")
        product = SimpleNamespace(current_public_path="/product/test")

        self.assertEqual(_tenant_domain(first), "https://first.example")
        self.assertEqual(_tenant_domain(second), "https://second.example")
        self.assertEqual(
            _public_url(first, product),
            "https://first.example/product/test",
        )
        self.assertEqual(
            _public_url(second, product),
            "https://second.example/product/test",
        )

    def test_legacy_organisation_domain_remains_a_fallback(self):
        organisation = _organisation(legacy_domain="legacy.example")
        product = SimpleNamespace(current_public_path="/product/test")

        self.assertEqual(_tenant_domain(organisation), "https://legacy.example")
        self.assertEqual(
            _public_url(organisation, product),
            "https://legacy.example/product/test",
        )
        organisation.domains.filter.assert_called_with(is_primary=True)
