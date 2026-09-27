from types import SimpleNamespace
from unittest.mock import patch

import stripe

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from colmado.models import Store
from organisations.models import Membership, Organisation, OrganisationBranding
from subscriptions.models import Subscription, SubscriptionPlan


User = get_user_model()


class ColmadoCheckoutApiTests(APITestCase):
    endpoint = "/api/subscriptions/create-checkout-session/"

    def setUp(self):
        self.plan = SubscriptionPlan.objects.create(
            name="Colmado Básico",
            slug="basic",
            price="29.00",
            currency="USD",
            interval="monthly",
            max_users=3,
            max_employees=10,
            max_modules=1,
            stripe_price_id="price_colmado_basic",
            is_active=True,
        )

    def build_payload(self, **overrides):
        payload = {
            "company_name": "Colmado La Esquina",
            "owner_name": "Juan Pérez",
            "email": "juan@example.com",
            "password": "ClaveSegura123",
            "business_type": "colmado",
            "app": "colmado",
            "plan": self.plan.slug,
            "store_name": "Sucursal Principal",
            "store_address": "Calle Duarte número 10",
            "store_phone": "8095550101",
        }
        payload.update(overrides)
        return payload

    @patch("subscriptions.views.stripe.checkout.Session.create")
    def test_creates_pending_colmado_and_first_store(self, create_session):
        create_session.return_value = SimpleNamespace(
            url="https://checkout.stripe.test/session-1"
        )

        response = self.client.post(
            self.endpoint,
            self.build_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            response.data["checkout_url"],
            "https://checkout.stripe.test/session-1",
        )
        self.assertEqual(
            response.data["organisation_slug"],
            "colmado-la-esquina",
        )
        self.assertEqual(
            response.data["login_url"],
            "/colmado/colmado-la-esquina/login",
        )

        organisation = Organisation.objects.get(slug="colmado-la-esquina")
        self.assertEqual(organisation.business_type, "colmado")
        self.assertFalse(organisation.is_active)

        store = Store.objects.get(organisation=organisation)
        self.assertEqual(store.name, "Sucursal Principal")
        self.assertEqual(store.address, "Calle Duarte número 10")
        self.assertEqual(store.phone, "8095550101")
        self.assertTrue(store.is_active)

        user = User.objects.get(email="juan@example.com")
        membership = Membership.objects.get(
            user=user,
            organisation=organisation,
        )
        self.assertEqual(membership.role, "owner")
        self.assertTrue(membership.is_active)

        subscription = Subscription.objects.get(organisation=organisation)
        self.assertEqual(subscription.plan, self.plan)
        self.assertEqual(subscription.status, "trialing")

    @patch("subscriptions.views.stripe.checkout.Session.create")
    def test_uses_simple_spanish_branding_for_colmado(self, create_session):
        create_session.return_value = SimpleNamespace(
            url="https://checkout.stripe.test/session-2"
        )

        response = self.client.post(
            self.endpoint,
            self.build_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        organisation = Organisation.objects.get(slug="colmado-la-esquina")
        branding = OrganisationBranding.objects.get(organisation=organisation)
        self.assertEqual(branding.platform_name, "Mi Colmado")
        self.assertEqual(branding.accent_color, "#047857")
        self.assertIn("inventario", branding.login_subtitle)

    @patch("subscriptions.views.stripe.checkout.Session.create")
    def test_forces_colmado_routes_and_stripe_metadata(self, create_session):
        create_session.return_value = SimpleNamespace(
            url="https://checkout.stripe.test/session-3"
        )

        response = self.client.post(
            self.endpoint,
            self.build_payload(app="ticketing"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            response.data["login_url"],
            "/colmado/colmado-la-esquina/login",
        )

        call_kwargs = create_session.call_args.kwargs
        self.assertEqual(call_kwargs["metadata"]["app_slug"], "colmado")
        self.assertEqual(
            call_kwargs["metadata"]["business_type"],
            "colmado",
        )
        self.assertIn(
            "/colmado/subscription/success",
            call_kwargs["success_url"],
        )
        self.assertIn(
            "/colmado/subscription/cancel",
            call_kwargs["cancel_url"],
        )

    @patch("subscriptions.views.stripe.checkout.Session.create")
    def test_does_not_create_colmado_store_for_existing_business_types(
        self,
        create_session,
    ):
        create_session.return_value = SimpleNamespace(
            url="https://checkout.stripe.test/session-4"
        )

        response = self.client.post(
            self.endpoint,
            self.build_payload(
                company_name="Punta Cana Tours",
                email="tours@example.com",
                business_type="ticketing",
                app="ticketing",
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        organisation = Organisation.objects.get(slug="punta-cana-tours")
        self.assertEqual(organisation.business_type, "ticketing")
        self.assertFalse(
            Store.objects.filter(organisation=organisation).exists()
        )

    @patch("subscriptions.views.stripe.checkout.Session.create")
    def test_removes_pending_colmado_data_when_stripe_fails(
        self,
        create_session,
    ):
        create_session.side_effect = stripe.error.StripeError(
            "Stripe unavailable"
        )

        response = self.client.post(
            self.endpoint,
            self.build_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            Organisation.objects.filter(slug="colmado-la-esquina").exists()
        )
        self.assertFalse(User.objects.filter(email="juan@example.com").exists())
        self.assertEqual(Store.objects.count(), 0)
        self.assertEqual(Subscription.objects.count(), 0)
        self.assertEqual(Membership.objects.count(), 0)
