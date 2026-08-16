"""Tests for organisation branding serialization and icon generation hooks."""

from unittest.mock import Mock, patch

from django.core.files.base import ContentFile
from django.test import RequestFactory, TestCase

from organisations.models import Organisation, OrganisationBranding
from organisations.serializers import OrganisationBrandingSerializer


class FakeFileField:
    def __init__(self, url):
        self.url = url

    def __bool__(self):
        return True


class BrokenFileField:
    def __bool__(self):
        return True

    @property
    def url(self):
        raise RuntimeError("private storage failure")


class OrganisationBrandingSerializerTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Branding Serializer Organisation",
            slug="branding-serializer-organisation",
            is_active=True,
        )
        cls.other_organisation = Organisation.objects.create(
            name="Other Branding Serializer Organisation",
            slug="other-branding-serializer-organisation",
            is_active=True,
        )
        cls.branding = OrganisationBranding.objects.create(
            organisation=cls.organisation,
            company_name="Branding Serializer Company",
            platform_name="Branding Serializer Platform",
            app_short_name="Branding App",
        )

    def setUp(self):
        self.request = RequestFactory().get(
            "/api/organisations/branding/",
            HTTP_HOST="testserver",
        )

    def test_serialized_branding_contains_safe_fields_and_no_tenant_secrets(self):
        data = OrganisationBrandingSerializer(
            self.branding,
            context={"request": self.request},
        ).data

        self.assertEqual(data["id"], self.branding.pk)
        self.assertEqual(data["organisation"], self.organisation.pk)
        self.assertEqual(
            data["company_name"],
            "Branding Serializer Company",
        )
        self.assertIsNone(data["logo_url"])
        self.assertIsNone(data["favicon_url"])
        self.assertIsNone(data["app_icon_192_url"])
        self.assertIsNone(data["app_icon_512_url"])
        self.assertIsNone(data["maskable_icon_url"])
        for forbidden_field in (
            "provider_api_key",
            "api_key",
            "password",
            "token",
            "stripe_customer_id",
            "stripe_subscription_id",
        ):
            self.assertNotIn(forbidden_field, data)

    def test_get_file_url_returns_none_for_empty_file(self):
        serializer = OrganisationBrandingSerializer(
            context={"request": self.request}
        )

        self.assertIsNone(serializer.get_file_url(None))

    def test_get_file_url_builds_absolute_url_for_relative_path(self):
        serializer = OrganisationBrandingSerializer(
            context={"request": self.request}
        )

        result = serializer.get_file_url(
            FakeFileField("/media/branding/logo.png")
        )

        self.assertEqual(
            result,
            "http://testserver/media/branding/logo.png",
        )

    def test_get_file_url_preserves_absolute_storage_url(self):
        serializer = OrganisationBrandingSerializer(
            context={"request": self.request}
        )
        absolute_url = "https://assets.example.com/branding/logo.png"

        result = serializer.get_file_url(FakeFileField(absolute_url))

        self.assertEqual(result, absolute_url)

    def test_get_file_url_without_request_preserves_relative_path(self):
        serializer = OrganisationBrandingSerializer()

        result = serializer.get_file_url(
            FakeFileField("/media/branding/logo.png")
        )

        self.assertEqual(result, "/media/branding/logo.png")

    def test_get_file_url_sanitizes_storage_failure(self):
        serializer = OrganisationBrandingSerializer(
            context={"request": self.request}
        )

        result = serializer.get_file_url(BrokenFileField())

        self.assertIsNone(result)

    def test_update_allows_branding_fields_but_not_tenant_or_generated_icons(self):
        serializer = OrganisationBrandingSerializer(
            self.branding,
            data={
                "organisation": self.other_organisation.pk,
                "company_name": "Updated Branding Company",
                "platform_name": "Updated Platform",
                "favicon": "forbidden-file-name.png",
                "app_icon_192": "forbidden-icon-name.png",
                "app_icon_512": "forbidden-icon-name.png",
                "maskable_icon": "forbidden-icon-name.png",
            },
            partial=True,
            context={"request": self.request},
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        branding = serializer.save()

        self.assertEqual(branding.organisation, self.organisation)
        self.assertEqual(branding.company_name, "Updated Branding Company")
        self.assertEqual(branding.platform_name, "Updated Platform")
        self.assertFalse(bool(branding.favicon))
        self.assertFalse(bool(branding.app_icon_192))
        self.assertFalse(bool(branding.app_icon_512))
        self.assertFalse(bool(branding.maskable_icon))

    def test_update_without_logo_does_not_generate_icons(self):
        serializer = OrganisationBrandingSerializer(
            self.branding,
            data={"login_title": "Updated Login Title"},
            partial=True,
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        with patch.object(serializer, "generate_icons") as generate_icons:
            serializer.save()

        generate_icons.assert_not_called()

    @patch(
        "organisations.serializers.generate_maskable_icon_from_logo"
    )
    @patch(
        "organisations.serializers.generate_square_icon_from_logo"
    )
    def test_generate_icons_uses_expected_sizes_names_and_single_final_save(
        self,
        generate_square,
        generate_maskable,
    ):
        square_32 = ContentFile(b"square-32")
        square_192 = ContentFile(b"square-192")
        square_512 = ContentFile(b"square-512")
        maskable_512 = ContentFile(b"maskable-512")
        generate_square.side_effect = (
            square_32,
            square_192,
            square_512,
        )
        generate_maskable.return_value = maskable_512
        uploaded_logo = Mock(name="uploaded_logo")
        serializer = OrganisationBrandingSerializer()

        with (
            patch.object(self.branding.favicon, "save") as favicon_save,
            patch.object(
                self.branding.app_icon_192,
                "save",
            ) as icon_192_save,
            patch.object(
                self.branding.app_icon_512,
                "save",
            ) as icon_512_save,
            patch.object(
                self.branding.maskable_icon,
                "save",
            ) as maskable_save,
            patch.object(self.branding, "save") as instance_save,
        ):
            serializer.generate_icons(self.branding, uploaded_logo)

        generate_square.assert_any_call(uploaded_logo, size=32)
        generate_square.assert_any_call(uploaded_logo, size=192)
        generate_square.assert_any_call(uploaded_logo, size=512)
        self.assertEqual(generate_square.call_count, 3)
        generate_maskable.assert_called_once_with(
            uploaded_logo,
            size=512,
        )
        favicon_save.assert_called_once_with(
            "branding-serializer-organisation-branding-favicon.png",
            square_32,
            save=False,
        )
        icon_192_save.assert_called_once_with(
            "branding-serializer-organisation-branding-icon-192.png",
            square_192,
            save=False,
        )
        icon_512_save.assert_called_once_with(
            "branding-serializer-organisation-branding-icon-512.png",
            square_512,
            save=False,
        )
        maskable_save.assert_called_once_with(
            "branding-serializer-organisation-branding-maskable-512.png",
            maskable_512,
            save=False,
        )
        instance_save.assert_called_once_with()
