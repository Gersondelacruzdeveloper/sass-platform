from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from organisations.models import Membership, Organisation

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
        self.client.force_authenticate(self.owner)
        self.headers = {
            "HTTP_X_ORGANISATION_SLUG": self.organisation.slug,
        }

    def test_stores_require_authentication(self):
        self.client.force_authenticate(None)

        response = self.client.get(reverse("colmado-store-list"), **self.headers)

        self.assertIn(response.status_code, (401, 403))

    def test_owner_only_sees_stores_from_selected_organisation(self):
        response = self.client.get(reverse("colmado-store-list"), **self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.data], [self.store.id])
        self.assertNotContains(response, "Bávaro")

    def test_owner_can_create_second_store(self):
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
