"""Tests for account registration and user profile serializers."""

from django.test import RequestFactory, TestCase

from organisations.models import Membership, Organisation

from .models import CustomUser
from .serializers import RegisterSerializer, UserSerializer


class RegisterSerializerTests(TestCase):
    def valid_payload(self, **overrides):
        payload = {
            "email": "new-owner@example.com",
            "username": "new-owner",
            "password": "Strong-test-password-123",
            "organisation_name": "Punta Cana Discovery",
            "business_type": "ticketing",
            "plan": "pro",
        }
        payload.update(overrides)
        return payload

    def test_valid_registration_creates_user_organisation_and_owner_membership(self):
        serializer = RegisterSerializer(data=self.valid_payload())

        self.assertTrue(serializer.is_valid(), serializer.errors)
        user = serializer.save()

        organisation = Organisation.objects.get(
            slug="punta-cana-discovery"
        )
        membership = Membership.objects.get(
            user=user,
            organisation=organisation,
        )

        self.assertEqual(user.email, "new-owner@example.com")
        self.assertEqual(user.username, "new-owner")
        self.assertTrue(user.check_password("Strong-test-password-123"))
        self.assertEqual(organisation.name, "Punta Cana Discovery")
        self.assertEqual(organisation.business_type, "ticketing")
        self.assertEqual(organisation.plan, "pro")
        self.assertEqual(membership.role, "owner")
        self.assertTrue(membership.is_active)

    def test_registration_uses_business_and_plan_defaults(self):
        payload = self.valid_payload()
        payload.pop("business_type")
        payload.pop("plan")
        serializer = RegisterSerializer(data=payload)

        self.assertTrue(serializer.is_valid(), serializer.errors)
        user = serializer.save()
        membership = user.memberships.select_related("organisation").get()

        self.assertEqual(membership.organisation.business_type, "disco")
        self.assertEqual(membership.organisation.plan, "basic")

    def test_registration_generates_unique_slug_for_duplicate_organisation_name(self):
        Organisation.objects.create(
            name="Punta Cana Discovery",
            slug="punta-cana-discovery",
            business_type="ticketing",
        )
        serializer = RegisterSerializer(data=self.valid_payload())

        self.assertTrue(serializer.is_valid(), serializer.errors)
        user = serializer.save()
        membership = user.memberships.select_related("organisation").get()

        self.assertEqual(
            membership.organisation.slug,
            "punta-cana-discovery-1",
        )

    def test_registration_skips_multiple_existing_slug_suffixes(self):
        for slug in (
            "punta-cana-discovery",
            "punta-cana-discovery-1",
            "punta-cana-discovery-2",
        ):
            Organisation.objects.create(
                name=slug,
                slug=slug,
                business_type="ticketing",
            )
        serializer = RegisterSerializer(data=self.valid_payload())

        self.assertTrue(serializer.is_valid(), serializer.errors)
        user = serializer.save()
        organisation = user.memberships.get().organisation

        self.assertEqual(organisation.slug, "punta-cana-discovery-3")

    def test_password_is_write_only_and_never_returned(self):
        serializer = RegisterSerializer(data=self.valid_payload())

        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        self.assertNotIn("password", serializer.data)
        self.assertNotIn("organisation_name", serializer.data)
        self.assertNotIn("business_type", serializer.data)
        self.assertNotIn("plan", serializer.data)

    def test_short_password_is_rejected_without_database_writes(self):
        serializer = RegisterSerializer(
            data=self.valid_payload(password="short")
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("password", serializer.errors)
        self.assertFalse(CustomUser.objects.exists())
        self.assertFalse(Organisation.objects.exists())
        self.assertFalse(Membership.objects.exists())

    def test_malformed_email_is_rejected_without_database_writes(self):
        serializer = RegisterSerializer(
            data=self.valid_payload(email="not-an-email")
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("email", serializer.errors)
        self.assertFalse(CustomUser.objects.exists())
        self.assertFalse(Organisation.objects.exists())

    def test_missing_required_fields_are_rejected(self):
        for field in (
            "email",
            "username",
            "password",
            "organisation_name",
        ):
            with self.subTest(field=field):
                payload = self.valid_payload()
                payload.pop(field)
                serializer = RegisterSerializer(data=payload)

                self.assertFalse(serializer.is_valid())
                self.assertIn(field, serializer.errors)

        self.assertFalse(CustomUser.objects.exists())
        self.assertFalse(Organisation.objects.exists())

    def test_duplicate_email_is_rejected_case_sensitively_by_current_contract(self):
        CustomUser.objects.create_user(
            username="existing-owner",
            email="new-owner@example.com",
            password="Strong-test-password-123",
        )
        serializer = RegisterSerializer(data=self.valid_payload())

        self.assertFalse(serializer.is_valid())
        self.assertIn("email", serializer.errors)
        self.assertEqual(CustomUser.objects.count(), 1)
        self.assertFalse(Organisation.objects.exists())

    def test_duplicate_username_is_rejected(self):
        CustomUser.objects.create_user(
            username="new-owner",
            email="existing-owner@example.com",
            password="Strong-test-password-123",
        )
        serializer = RegisterSerializer(data=self.valid_payload())

        self.assertFalse(serializer.is_valid())
        self.assertIn("username", serializer.errors)
        self.assertEqual(CustomUser.objects.count(), 1)
        self.assertFalse(Organisation.objects.exists())


class UserSerializerTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = CustomUser.objects.create_user(
            username="profile-user",
            email="profile-user@example.com",
            password="Strong-test-password-123",
            first_name="Original",
            last_name="Name",
            phone="8095550100",
        )

    def test_serialized_profile_omits_password_and_sensitive_auth_fields(self):
        data = UserSerializer(self.user).data

        self.assertEqual(data["id"], self.user.pk)
        self.assertEqual(data["email"], "profile-user@example.com")
        self.assertEqual(data["username"], "profile-user")
        self.assertIsNone(data["avatar_url"])
        self.assertIsNone(data["profile_image_url"])
        for forbidden_field in (
            "password",
            "is_staff",
            "is_superuser",
            "groups",
            "user_permissions",
            "organisation",
        ):
            self.assertNotIn(forbidden_field, data)

    def test_profile_update_allows_supported_editable_fields(self):
        serializer = UserSerializer(
            self.user,
            data={
                "first_name": "Updated",
                "last_name": "Owner",
                "phone": "8495550101",
                "preferred_language": "es",
            },
            partial=True,
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated_user = serializer.save()

        self.assertEqual(updated_user.first_name, "Updated")
        self.assertEqual(updated_user.last_name, "Owner")
        self.assertEqual(updated_user.phone, "8495550101")
        self.assertEqual(updated_user.preferred_language, "es")

    def test_profile_update_rejects_unsupported_language(self):
        serializer = UserSerializer(
            self.user,
            data={"preferred_language": "fr"},
            partial=True,
        )

        self.assertFalse(serializer.is_valid())
        self.assertEqual(
            str(serializer.errors["preferred_language"][0]),
            '"fr" is not a valid choice.',
        )
        self.user.refresh_from_db()
        self.assertEqual(self.user.preferred_language, "en")

    def test_profile_update_cannot_change_read_only_identity_fields(self):
        serializer = UserSerializer(
            self.user,
            data={
                "email": "attacker@example.com",
                "username": "changed-username",
                "first_name": "Allowed",
            },
            partial=True,
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        self.user.refresh_from_db()

        self.assertEqual(self.user.email, "profile-user@example.com")
        self.assertEqual(self.user.username, "profile-user")
        self.assertEqual(self.user.first_name, "Allowed")

    def test_avatar_url_is_absolute_when_request_is_available(self):
        self.user.avatar.name = "avatars/profile-user.png"
        request = RequestFactory().get(
            "/api/accounts/me/",
            HTTP_HOST="testserver",
        )

        data = UserSerializer(
            self.user,
            context={"request": request},
        ).data

        self.assertEqual(
            data["avatar_url"],
            request.build_absolute_uri(self.user.avatar.url),
        )
        self.assertEqual(data["profile_image_url"], data["avatar_url"])