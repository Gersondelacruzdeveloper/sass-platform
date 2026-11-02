from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from organisations.models import Membership, Organisation

from colmado.models import Employee, Store


User = get_user_model()


class EmployeeAccessApiTests(APITestCase):
    """Security contract for employee accounts in Mi Colmado."""

    def setUp(self):
        self.owner = User.objects.create_user(
            email="owner@example.com",
            username="owner",
            password="safe-owner-password",
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
        Membership.objects.create(
            user=self.owner,
            organisation=self.organisation,
            role="owner",
            is_active=True,
        )
        self.store = Store.objects.create(
            organisation=self.organisation,
            name="Macao",
        )
        self.second_store = Store.objects.create(
            organisation=self.organisation,
            name="Verón",
        )
        self.other_store = Store.objects.create(
            organisation=self.other_organisation,
            name="Bávaro",
        )
        self.employee = Employee.objects.create(
            organisation=self.organisation,
            store=self.store,
            name="María Pérez",
            position="Cajera",
            pay_frequency=Employee.WEEKLY,
            pay_amount="5000.00",
        )
        self.other_employee = Employee.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            name="Empleado Ajeno",
            position="Cajero",
            pay_frequency=Employee.WEEKLY,
            pay_amount="5000.00",
        )
        self.headers = {
            "HTTP_X_ORGANISATION_SLUG": self.organisation.slug,
        }
        self.client.force_authenticate(self.owner)

    def access_url(self, employee=None):
        selected_employee = employee or self.employee
        return reverse(
            "colmado-employee-access",
            args=(selected_employee.id,),
        )

    def access_payload(self, **overrides):
        payload = {
            "email": "maria@example.com",
            "temporary_password": "ClaveTemporal123!",
            "role": "cashier",
        }
        payload.update(overrides)
        return payload

    def grant_access(self, **overrides):
        return self.client.post(
            self.access_url(),
            self.access_payload(**overrides),
            format="json",
            **self.headers,
        )

    def test_access_requires_authentication(self):
        self.client.force_authenticate(None)

        response = self.client.post(
            self.access_url(),
            self.access_payload(),
            format="json",
            **self.headers,
        )

        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_owner_can_create_cashier_access(self):
        response = self.grant_access()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        self.employee.refresh_from_db()
        self.assertIsNotNone(self.employee.user_id)
        self.assertEqual(self.employee.user.email, "maria@example.com")
        self.assertTrue(
            self.employee.user.check_password("ClaveTemporal123!")
        )

        membership = Membership.objects.get(
            user=self.employee.user,
            organisation=self.organisation,
        )
        self.assertEqual(membership.role, "cashier")
        self.assertTrue(membership.is_active)

        self.assertEqual(
            response.data["access"],
            {
                "email": "maria@example.com",
                "role": "cashier",
                "is_active": True,
            },
        )

    def test_temporary_password_is_hashed_and_never_returned(self):
        temporary_password = "ClaveTemporal123!"

        response = self.grant_access(
            temporary_password=temporary_password,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.employee.refresh_from_db()
        self.assertNotEqual(self.employee.user.password, temporary_password)
        self.assertNotIn(
            temporary_password,
            response.content.decode("utf-8"),
        )
        self.assertNotIn("temporary_password", response.data)
        self.assertNotIn("password", response.data)

    def test_new_user_requires_a_secure_temporary_password(self):
        response = self.client.post(
            self.access_url(),
            {
                "email": "maria@example.com",
                "role": "cashier",
            },
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("temporary_password", response.data)
        self.assertFalse(User.objects.filter(email="maria@example.com").exists())

    def test_employee_screen_cannot_create_owner_or_admin_access(self):
        for role in ("owner", "admin"):
            with self.subTest(role=role):
                email = f"blocked-{role}@example.com"
                response = self.grant_access(email=email, role=role)

                self.assertEqual(
                    response.status_code,
                    status.HTTP_400_BAD_REQUEST,
                )
                self.assertIn("role", response.data)
                self.assertFalse(User.objects.filter(email=email).exists())

    def test_operational_employee_cannot_manage_access(self):
        manager_user = User.objects.create_user(
            email="manager@example.com",
            username="manager",
            password="safe-manager-password",
        )
        Membership.objects.create(
            user=manager_user,
            organisation=self.organisation,
            role="manager",
            is_active=True,
        )
        Employee.objects.create(
            organisation=self.organisation,
            store=self.store,
            user=manager_user,
            name="Encargado",
            position="Encargado",
            pay_frequency=Employee.MONTHLY,
            pay_amount="25000.00",
        )
        self.client.force_authenticate(manager_user)

        response = self.client.post(
            self.access_url(),
            self.access_payload(),
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(User.objects.filter(email="maria@example.com").exists())

    def test_admin_can_manage_employee_access(self):
        admin_user = User.objects.create_user(
            email="admin@example.com",
            username="admin",
            password="safe-admin-password",
        )
        Membership.objects.create(
            user=admin_user,
            organisation=self.organisation,
            role="admin",
            is_active=True,
        )
        self.client.force_authenticate(admin_user)

        response = self.client.post(
            self.access_url(),
            self.access_payload(),
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_cannot_manage_employee_from_another_organisation(self):
        response = self.client.post(
            self.access_url(self.other_employee),
            self.access_payload(email="other-employee@example.com"),
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.other_employee.refresh_from_db()
        self.assertIsNone(self.other_employee.user_id)
        self.assertFalse(
            User.objects.filter(email="other-employee@example.com").exists()
        )

    def test_inactive_employee_cannot_receive_access(self):
        self.employee.is_active = False
        self.employee.save(update_fields=("is_active",))

        response = self.grant_access()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(email="maria@example.com").exists())

    def test_existing_user_keeps_their_current_password(self):
        existing_user = User.objects.create_user(
            email="maria@example.com",
            username="maria-existing",
            password="existing-private-password",
        )

        response = self.grant_access(
            temporary_password="ShouldNotReplaceExistingPassword123!",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        existing_user.refresh_from_db()
        self.assertTrue(
            existing_user.check_password("existing-private-password")
        )
        self.assertFalse(
            existing_user.check_password(
                "ShouldNotReplaceExistingPassword123!"
            )
        )

    def test_same_user_cannot_be_linked_to_two_employees_in_one_business(self):
        existing_user = User.objects.create_user(
            email="maria@example.com",
            username="maria-existing",
            password="existing-private-password",
        )
        Membership.objects.create(
            user=existing_user,
            organisation=self.organisation,
            role="cashier",
            is_active=True,
        )
        first_employee = Employee.objects.create(
            organisation=self.organisation,
            store=self.second_store,
            user=existing_user,
            name="Primera empleada",
            position="Cajera",
            pay_frequency=Employee.WEEKLY,
            pay_amount="5000.00",
        )

        response = self.grant_access()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.employee.refresh_from_db()
        self.assertIsNone(self.employee.user_id)
        self.assertEqual(first_employee.user_id, existing_user.id)

    def test_employee_detail_returns_current_access_summary(self):
        create_response = self.grant_access()
        self.assertEqual(
            create_response.status_code,
            status.HTTP_201_CREATED,
        )

        response = self.client.get(
            reverse("colmado-employee-detail", args=(self.employee.id,)),
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["access"],
            {
                "email": "maria@example.com",
                "role": "cashier",
                "is_active": True,
            },
        )

    def test_owner_can_disable_access_without_deleting_employee_or_user(self):
        create_response = self.grant_access()
        self.assertEqual(
            create_response.status_code,
            status.HTTP_201_CREATED,
        )
        self.employee.refresh_from_db()
        employee_id = self.employee.id
        user_id = self.employee.user_id

        response = self.client.delete(
            self.access_url(),
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(Employee.objects.filter(id=employee_id).exists())
        self.assertTrue(User.objects.filter(id=user_id).exists())

        self.employee.refresh_from_db()
        self.assertEqual(self.employee.user_id, user_id)
        membership = Membership.objects.get(
            user_id=user_id,
            organisation=self.organisation,
        )
        self.assertFalse(membership.is_active)

    def test_disabled_access_is_rejected_by_colmado_endpoints(self):
        create_response = self.grant_access()
        self.assertEqual(
            create_response.status_code,
            status.HTTP_201_CREATED,
        )
        self.employee.refresh_from_db()
        employee_user = self.employee.user

        disable_response = self.client.delete(
            self.access_url(),
            **self.headers,
        )
        self.assertEqual(
            disable_response.status_code,
            status.HTTP_204_NO_CONTENT,
        )

        self.client.force_authenticate(employee_user)
        response = self.client.get(
            reverse("colmado-store-list"),
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
