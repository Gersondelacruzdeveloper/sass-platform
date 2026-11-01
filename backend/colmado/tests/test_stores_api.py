from types import SimpleNamespace
from unittest.mock import patch

import stripe

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from organisations.models import Membership, Organisation
from subscriptions.models import Subscription, SubscriptionPlan

from colmado.models import Store


class StoreApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.owner = user_model.objects.create_user(
            email="owner@example.com",
            username="owner",
            password="safe-test-password",
        )
        self.organisation = Organisation.objects.create(
            name="Colmados Gerson",
            slug="colmados-gerson",
            business_type="colmado",
            is_active=True,
        )
        self.other_organisation = Organisation.objects.create(
            name="Colmados Ajeno",
            slug="colmados-ajeno",
            business_type="colmado",
            is_active=True,
        )
        self.membership = Membership.objects.create(
            user=self.owner,
            organisation=self.organisation,
            role="owner",
            is_active=True,
        )
        self.store = Store.objects.create(
            organisation=self.organisation,
            name="Macao",
        )
        self.other_store = Store.objects.create(
            organisation=self.other_organisation,
            name="Bávaro",
        )
        self.plan, _created = SubscriptionPlan.objects.update_or_create(
            slug="colmado-completo",
            defaults={
                "name": "Plan Completo",
                "price": "19.00",
                "currency": "USD",
                "interval": "monthly",
                "max_users": 5,
                "max_employees": 25,
                "max_modules": 1,
                "stripe_price_id": "price_colmado_complete",
                "is_active": True,
            },
        )
        self.subscription = Subscription.objects.create(
            organisation=self.organisation,
            plan=self.plan,
            status="active",
            stripe_subscription_id="sub_colmados_gerson",
        )
        self.client.force_authenticate(self.owner)
        self.headers = {
            "HTTP_X_ORGANISATION_SLUG": self.organisation.slug,
        }

        retrieve_patcher = patch(
            "colmado.billing.stripe.Subscription.retrieve",
        )
        modify_patcher = patch(
            "colmado.billing.stripe.Subscription.modify",
        )
        self.retrieve_subscription = retrieve_patcher.start()
        self.modify_subscription = modify_patcher.start()
        self.addCleanup(retrieve_patcher.stop)
        self.addCleanup(modify_patcher.stop)

        self.retrieve_subscription.return_value = SimpleNamespace(
            items=SimpleNamespace(
                data=[SimpleNamespace(id="si_branch_quantity")],
            ),
        )

    def test_stores_require_authentication(self):
        self.client.force_authenticate(None)

        response = self.client.get(reverse("colmado-store-list"), **self.headers)

        self.assertIn(response.status_code, (401, 403))

    def test_owner_only_sees_stores_from_selected_organisation(self):
        response = self.client.get(reverse("colmado-store-list"), **self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.data], [self.store.id])
        self.assertNotContains(response, "Bávaro")

    def test_owner_can_create_second_store_and_bills_two_branches(self):
        response = self.client.post(
            reverse("colmado-store-list"),
            {
                "name": "Verón",
                "address": "Av. Principal",
                "phone": "809-555-0101",
            },
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, 201)
        created = Store.objects.get(id=response.data["id"])
        self.assertEqual(created.organisation, self.organisation)
        self.retrieve_subscription.assert_called_once_with(
            "sub_colmados_gerson",
        )
        self.modify_subscription.assert_called_once_with(
            "sub_colmados_gerson",
            items=[
                {
                    "id": "si_branch_quantity",
                    "quantity": 2,
                }
            ],
            proration_behavior="create_prorations",
        )

    def test_deactivating_a_store_reduces_billing_quantity(self):
        second_store = Store.objects.create(
            organisation=self.organisation,
            name="Verón",
        )

        response = self.client.patch(
            reverse("colmado-store-detail", args=(second_store.id,)),
            {"is_active": False},
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, 200)
        second_store.refresh_from_db()
        self.assertFalse(second_store.is_active)
        self.modify_subscription.assert_called_once_with(
            "sub_colmados_gerson",
            items=[
                {
                    "id": "si_branch_quantity",
                    "quantity": 1,
                }
            ],
            proration_behavior="create_prorations",
        )

    def test_unrelated_store_update_does_not_bill_again(self):
        response = self.client.patch(
            reverse("colmado-store-detail", args=(self.store.id,)),
            {"address": "Nueva dirección"},
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, 200)
        self.retrieve_subscription.assert_not_called()
        self.modify_subscription.assert_not_called()

    def test_stripe_failure_rolls_back_new_store(self):
        self.retrieve_subscription.side_effect = stripe.error.StripeError(
            "Stripe unavailable",
        )

        response = self.client.post(
            reverse("colmado-store-list"),
            {"name": "Verón"},
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, 502)
        self.assertFalse(
            Store.objects.filter(
                organisation=self.organisation,
                name="Verón",
            ).exists()
        )

    def test_cannot_read_store_from_another_organisation(self):
        response = self.client.get(
            reverse("colmado-store-detail", args=(self.other_store.id,)),
            **self.headers,
        )

        self.assertEqual(response.status_code, 404)

    def test_cannot_update_store_from_another_organisation(self):
        response = self.client.patch(
            reverse("colmado-store-detail", args=(self.other_store.id,)),
            {"name": "Nombre cambiado"},
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, 404)
        self.other_store.refresh_from_db()
        self.assertEqual(self.other_store.name, "Bávaro")

    def test_cannot_delete_store_from_another_organisation(self):
        response = self.client.delete(
            reverse("colmado-store-detail", args=(self.other_store.id,)),
            **self.headers,
        )

        self.assertEqual(response.status_code, 404)
        self.assertTrue(Store.objects.filter(id=self.other_store.id).exists())

    def test_inactive_membership_is_rejected(self):
        self.membership.is_active = False
        self.membership.save(update_fields=("is_active",))

        response = self.client.get(reverse("colmado-store-list"), **self.headers)

        self.assertEqual(response.status_code, 403)

    def test_inactive_organisation_is_rejected(self):
        self.organisation.is_active = False
        self.organisation.save(update_fields=("is_active",))

        response = self.client.get(reverse("colmado-store-list"), **self.headers)

        self.assertEqual(response.status_code, 403)

    def test_organisation_slug_is_required(self):
        response = self.client.get(reverse("colmado-store-list"))

        self.assertEqual(response.status_code, 403)

    def test_duplicate_store_name_is_rejected_for_same_organisation(self):
        response = self.client.post(
            reverse("colmado-store-list"),
            {"name": "Macao"},
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, 400)

    def test_same_store_name_is_allowed_for_different_organisations(self):
        Store.objects.create(
            organisation=self.other_organisation,
            name="Macao",
        )

        self.assertEqual(Store.objects.filter(name="Macao").count(), 2)
