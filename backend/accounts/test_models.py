"""Tests for the accounts user model and its inherited manager."""

from django.db import IntegrityError, transaction
from django.test import TestCase

from organisations.models import Organisation

from .models import CustomUser


class CustomUserModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Accounts Model Organisation",
            slug="accounts-model-organisation",
            business_type="ticketing",
            is_active=True,
        )

    def test_create_user_hashes_password_and_sets_expected_defaults(self):
        user = CustomUser.objects.create_user(
            username="model-user",
            email="model-user@example.com",
            password="Strong-test-password-123",
        )

        self.assertNotEqual(user.password, "Strong-test-password-123")
        self.assertTrue(user.check_password("Strong-test-password-123"))
        self.assertEqual(user.preferred_language, "en")
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertIsNone(user.organisation)
        self.assertIsNone(user.phone)
        self.assertFalse(bool(user.avatar))

    def test_create_user_normalizes_email_domain(self):
        user = CustomUser.objects.create_user(
            username="normalized-user",
            email="person@EXAMPLE.COM",
            password="Strong-test-password-123",
        )

        self.assertEqual(user.email, "person@example.com")

    def test_create_superuser_sets_required_privileges(self):
        user = CustomUser.objects.create_superuser(
            username="platform-owner",
            email="platform-owner@example.com",
            password="Strong-test-password-123",
        )

        self.assertTrue(user.is_active)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.check_password("Strong-test-password-123"))

    def test_create_superuser_rejects_false_privilege_flags(self):
        invalid_flags = (
            {"is_staff": False},
            {"is_superuser": False},
        )

        for flags in invalid_flags:
            with self.subTest(flags=flags):
                with self.assertRaises(ValueError):
                    CustomUser.objects.create_superuser(
                        username=f"invalid-owner-{len(flags)}-{next(iter(flags))}",
                        email=f"{next(iter(flags))}@example.com",
                        password="Strong-test-password-123",
                        **flags,
                    )

    def test_string_representation_is_email(self):
        user = CustomUser.objects.create_user(
            username="display-user",
            email="display-user@example.com",
            password="Strong-test-password-123",
        )

        self.assertEqual(str(user), "display-user@example.com")

    def test_email_must_be_unique(self):
        CustomUser.objects.create_user(
            username="unique-email-one",
            email="unique@example.com",
            password="Strong-test-password-123",
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CustomUser.objects.create_user(
                    username="unique-email-two",
                    email="unique@example.com",
                    password="Strong-test-password-456",
                )

        self.assertEqual(
            CustomUser.objects.filter(email="unique@example.com").count(),
            1,
        )

    def test_username_must_be_unique(self):
        CustomUser.objects.create_user(
            username="unique-username",
            email="first-username@example.com",
            password="Strong-test-password-123",
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CustomUser.objects.create_user(
                    username="unique-username",
                    email="second-username@example.com",
                    password="Strong-test-password-456",
                )

        self.assertEqual(
            CustomUser.objects.filter(username="unique-username").count(),
            1,
        )

    def test_deleting_organisation_preserves_user_and_clears_foreign_key(self):
        user = CustomUser.objects.create_user(
            username="organisation-user",
            email="organisation-user@example.com",
            password="Strong-test-password-123",
            organisation=self.organisation,
        )

        self.organisation.delete()
        user.refresh_from_db()

        self.assertIsNone(user.organisation)
        self.assertTrue(
            CustomUser.objects.filter(pk=user.pk).exists()
        )

    def test_model_validation_rejects_unsupported_preferred_language(self):
        user = CustomUser(
            username="language-user",
            email="language-user@example.com",
            preferred_language="fr",
        )

        with self.assertRaisesMessage(
            Exception,
            "Value 'fr' is not a valid choice",
        ):
            user.full_clean()
