from datetime import date

from django.test import SimpleTestCase

from ticketing.ai.customer.cart_components import ExplicitCustomerCartApprovalPolicy


class CustomerCartApprovalDateTests(SimpleTestCase):
    def test_spanish_full_and_numeric_dates_are_recognised(self):
        variants = ExplicitCustomerCartApprovalPolicy._date_variants(
            date(2026, 8, 28)
        )

        self.assertIn("28 de agosto de 2026", variants)
        self.assertIn("28 de agosto", variants)
        self.assertIn("28/08/2026", variants)
        self.assertIn("28-08-2026", variants)

    def test_spanish_abbreviated_date_is_recognised(self):
        variants = ExplicitCustomerCartApprovalPolicy._date_variants(
            date(2026, 8, 27)
        )

        self.assertIn("27 ago 2026", variants)
        self.assertIn("27 ago", variants)
