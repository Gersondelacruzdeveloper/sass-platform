"""API tests for account registration, login, and logout."""

from django.test import TestCase
from django.urls import reverse
from organisations.models import Membership, Organisation
from rest_framework.test import APIClient

from .models import CustomUser


class RegistrationAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse("register")

    def valid_payload(self, **overrides):
        payload = {
            "email": "api-owner@example.com",
            "username": "api-owner",
            "password": "Strong-test-password-123",
            "organisation_name": "API Test Organisation",
            "business_type": "ticketing",
            "plan": "pro",
        }
        payload.update(overrides)
        return payload

    def test_register_url_name_resolves_to_expected_path(self):
        self.assertEqual(self.url, "/api/accounts/register/")

    def test_anonymous_user_can_register(self):
        response = self.client.post(
            self.url,
            self.valid_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        user = CustomUser.objects.get(email="api-owner@example.com")
        membership = user.memberships.select_related("organisation").get()

        self.assertTrue(user.check_password("Strong-test-password-123"))
        self.assertEqual(membership.role, "owner")
        self.assertEqual(
            membership.organisation.slug,
            "api-test-organisation",
        )
        self.assertNotIn("password", response.data)
        self.assertNotIn("organisation_name", response.data)
        self.assertNotIn("plan", response.data)
        self.assertNotIn("business_type", response.data)

    def test_duplicate_registration_is_rejected_without_duplicate_records(self):
        payload = self.valid_payload()

        first_response = self.client.post(self.url, payload, format="json")
        second_response = self.client.post(self.url, payload, format="json")

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(second_response.status_code, 400)
        self.assertEqual(CustomUser.objects.count(), 1)
        self.assertEqual(Organisation.objects.count(), 1)
        self.assertEqual(Membership.objects.count(), 1)
        self.assertNotIn("password", second_response.data)

    def test_invalid_registration_returns_validation_errors_without_writes(self):
        response = self.client.post(
            self.url,
            self.valid_payload(
                email="not-an-email",
                password="short",
            ),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)
        self.assertIn("password", response.data)
        self.assertFalse(CustomUser.objects.exists())
        self.assertFalse(Organisation.objects.exists())
        self.assertFalse(Membership.objects.exists())

    def test_get_is_not_allowed_on_registration_endpoint(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 405)
        self.assertFalse(CustomUser.objects.exists())


class LoginAPITests(TestCase):
    password = "Strong-test-password-123"

    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Active Accounts Organisation",
            slug="active-accounts-organisation",
            business_type="ticketing",
            plan="pro",
            is_active=True,
        )
        cls.user = CustomUser.objects.create_user(
            username="login-user",
            email="login-user@example.com",
            password=cls.password,
            first_name="Login",
            last_name="User",
        )
        cls.membership = Membership.objects.create(
            user=cls.user,
            organisation=cls.organisation,
            role="owner",
            is_active=True,
        )

    def setUp(self):
        self.client = APIClient()
        self.url = reverse("login")

    def assert_safe_login_payload(self, response):
        self.assertEqual(response.data["detail"], "Login successful")
        payload = response.data["user"]
        self.assertEqual(payload["id"], self.user.pk)
        self.assertEqual(payload["email"], self.user.email)
        self.assertEqual(payload["username"], self.user.username)
        self.assertEqual(payload["role"], "owner")
        self.assertEqual(
            payload["organisation"]["id"],
            self.organisation.pk,
        )
        self.assertTrue(payload["organisation"]["is_active"])

        serialized = repr(response.data)
        self.assertNotIn(self.password, serialized)
        for forbidden_field in (
            "password",
            "session_key",
            "token",
            "access",
            "refresh",
            "groups",
            "user_permissions",
        ):
            self.assertNotIn(forbidden_field, payload)

    def test_login_url_name_resolves_to_expected_path(self):
        self.assertEqual(self.url, "/api/accounts/login/")

    def test_user_can_login_with_email(self):
        response = self.client.post(
            self.url,
            {"login": self.user.email, "password": self.password},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assert_safe_login_payload(response)
        self.assertEqual(
            self.client.session.get("_auth_user_id"),
            str(self.user.pk),
        )

    def test_user_can_login_with_username(self):
        response = self.client.post(
            self.url,
            {"login": self.user.username, "password": self.password},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assert_safe_login_payload(response)
        self.assertEqual(
            self.client.session.get("_auth_user_id"),
            str(self.user.pk),
        )

    def test_wrong_password_and_unknown_user_return_same_safe_error(self):
        wrong_password_response = self.client.post(
            self.url,
            {"login": self.user.email, "password": "Wrong-password-123"},
            format="json",
        )
        unknown_user_response = self.client.post(
            self.url,
            {
                "login": "unknown@example.com",
                "password": "Wrong-password-123",
            },
            format="json",
        )

        self.assertEqual(wrong_password_response.status_code, 401)
        self.assertEqual(unknown_user_response.status_code, 401)
        self.assertEqual(
            wrong_password_response.data,
            {"detail": "Invalid credentials"},
        )
        self.assertEqual(
            unknown_user_response.data,
            wrong_password_response.data,
        )
        self.assertNotIn("email", repr(wrong_password_response.data))
        self.assertNotIn("username", repr(unknown_user_response.data))
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_missing_credentials_are_rejected_without_server_error(self):
        for payload in (
            {},
            {"login": self.user.email},
            {"password": self.password},
            {"login": "", "password": ""},
        ):
            with self.subTest(payload=payload):
                response = self.client.post(self.url, payload, format="json")

                self.assertEqual(response.status_code, 401)
                self.assertEqual(
                    response.data,
                    {"detail": "Invalid credentials"},
                )
                self.assertNotIn("_auth_user_id", self.client.session)

    def test_inactive_user_is_rejected_with_generic_error(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])

        response = self.client.post(
            self.url,
            {"login": self.user.email, "password": self.password},
            format="json",
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data, {"detail": "Invalid credentials"})
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_user_with_inactive_membership_is_rejected(self):
        self.membership.is_active = False
        self.membership.save(update_fields=["is_active"])

        response = self.client.post(
            self.url,
            {"login": self.user.email, "password": self.password},
            format="json",
        )

        self.assertIn(response.status_code, (401, 403))
        self.assertNotIn("user", response.data)
        self.assertNotIn("organisation", repr(response.data))
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_user_with_inactive_organisation_is_rejected(self):
        self.organisation.is_active = False
        self.organisation.save(update_fields=["is_active"])

        response = self.client.post(
            self.url,
            {"login": self.user.email, "password": self.password},
            format="json",
        )

        self.assertIn(response.status_code, (401, 403))
        self.assertNotIn("user", response.data)
        self.assertNotIn("organisation", repr(response.data))
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_get_is_not_allowed_on_login_endpoint(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 405)


class LogoutAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = CustomUser.objects.create_user(
            username="logout-user",
            email="logout-user@example.com",
            password="Strong-test-password-123",
        )

    def setUp(self):
        self.client = APIClient()
        self.url = reverse("logout")

    def test_logout_url_name_resolves_to_expected_path(self):
        self.assertEqual(self.url, "/api/accounts/logout/")

    def test_authenticated_user_can_logout_and_session_is_cleared(self):
        self.client.force_login(self.user)
        self.assertIn("_auth_user_id", self.client.session)

        response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"detail": "Logged out"})
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_unauthenticated_logout_is_rejected(self):
        response = self.client.post(self.url, {}, format="json")

        self.assertIn(response.status_code, (401, 403))
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_get_is_not_allowed_on_logout_endpoint(self):
        self.client.force_login(self.user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 405)
