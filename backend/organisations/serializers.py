from django.db import transaction
from rest_framework import serializers

from .ai.encryption import encrypt_secret
from .models import (
    Membership,
    Organisation,
    OrganisationAISettings,
    OrganisationBranding,
)
from .utils.branding_icons import (
    generate_maskable_icon_from_logo,
    generate_square_icon_from_logo,
)


class OrganisationSerializer(serializers.ModelSerializer):
    plan_price = serializers.ReadOnlyField()
    max_users = serializers.ReadOnlyField()
    max_employees = serializers.ReadOnlyField()

    class Meta:
        model = Organisation
        fields = "__all__"


class MembershipSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(
        source="user.email",
        read_only=True,
    )

    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )

    class Meta:
        model = Membership
        fields = [
            "id",
            "user",
            "user_email",
            "organisation",
            "organisation_name",
            "role",
            "is_active",
            "created_at",
        ]


class OrganisationBrandingSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()
    favicon_url = serializers.SerializerMethodField()
    app_icon_192_url = serializers.SerializerMethodField()
    app_icon_512_url = serializers.SerializerMethodField()
    maskable_icon_url = serializers.SerializerMethodField()

    class Meta:
        model = OrganisationBranding
        fields = [
            "id",
            "organisation",
            "company_name",
            "platform_name",
            "logo",
            "logo_url",
            "favicon",
            "favicon_url",
            "app_icon_192",
            "app_icon_192_url",
            "app_icon_512",
            "app_icon_512_url",
            "maskable_icon",
            "maskable_icon_url",
            "app_short_name",
            "app_description",
            "primary_color",
            "secondary_color",
            "accent_color",
            "theme_color",
            "background_color",
            "login_title",
            "login_subtitle",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "organisation",
            "favicon",
            "favicon_url",
            "app_icon_192",
            "app_icon_192_url",
            "app_icon_512",
            "app_icon_512_url",
            "maskable_icon",
            "maskable_icon_url",
            "created_at",
            "updated_at",
        ]

    def get_file_url(self, file_field):
        if not file_field:
            return None

        request = self.context.get("request")
        url = file_field.url

        if request and url.startswith("/"):
            return request.build_absolute_uri(url)

        return url

    def get_logo_url(self, obj):
        return self.get_file_url(obj.logo)

    def get_favicon_url(self, obj):
        return self.get_file_url(obj.favicon)

    def get_app_icon_192_url(self, obj):
        return self.get_file_url(obj.app_icon_192)

    def get_app_icon_512_url(self, obj):
        return self.get_file_url(obj.app_icon_512)

    def get_maskable_icon_url(self, obj):
        return self.get_file_url(obj.maskable_icon)

    def create(self, validated_data):
        logo = validated_data.get("logo")
        instance = super().create(validated_data)

        if logo:
            self.generate_icons(instance, logo)

        return instance

    def update(self, instance, validated_data):
        logo = validated_data.get("logo")
        instance = super().update(instance, validated_data)

        if logo:
            self.generate_icons(instance, logo)

        return instance

    def generate_icons(self, instance, logo):
        base_name = f"{instance.organisation.slug}-branding"

        instance.favicon.save(
            f"{base_name}-favicon.png",
            generate_square_icon_from_logo(logo, size=32),
            save=False,
        )

        instance.app_icon_192.save(
            f"{base_name}-icon-192.png",
            generate_square_icon_from_logo(logo, size=192),
            save=False,
        )

        instance.app_icon_512.save(
            f"{base_name}-icon-512.png",
            generate_square_icon_from_logo(logo, size=512),
            save=False,
        )

        instance.maskable_icon.save(
            f"{base_name}-maskable-512.png",
            generate_maskable_icon_from_logo(logo, size=512),
            save=False,
        )

        instance.save()


class OrganisationAISettingsSerializer(serializers.ModelSerializer):
    ai_ready = serializers.BooleanField(read_only=True)

    api_key = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=False,
        trim_whitespace=True,
        max_length=500,
    )

    clear_api_key = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
    )

    class Meta:
        model = OrganisationAISettings
        fields = [
            "id",
            "organisation",
            "provider",
            "is_enabled",
            "translations_enabled",
            "default_model",
            "has_api_key",
            "provider_api_key_last_updated",
            "ai_ready",
            "last_test_at",
            "last_error_message",
            "api_key",
            "clear_api_key",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "organisation",
            "has_api_key",
            "provider_api_key_last_updated",
            "ai_ready",
            "last_test_at",
            "last_error_message",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        api_key = attrs.get("api_key")
        clear_api_key = attrs.get("clear_api_key", False)

        if api_key and clear_api_key:
            raise serializers.ValidationError(
                {
                    "clear_api_key": (
                        "You cannot provide a new API key and clear the "
                        "existing API key in the same request."
                    )
                }
            )

        instance = self.instance
        resulting_has_api_key = bool(
            api_key
            or (
                instance
                and instance.has_api_key
                and not clear_api_key
            )
        )

        resulting_is_enabled = attrs.get(
            "is_enabled",
            instance.is_enabled if instance else False,
        )

        if resulting_is_enabled and not resulting_has_api_key:
            raise serializers.ValidationError(
                {
                    "is_enabled": (
                        "Configure an AI provider API key before enabling AI."
                    )
                }
            )

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        api_key = validated_data.pop("api_key", None)
        clear_api_key = validated_data.pop("clear_api_key", False)

        instance = OrganisationAISettings(**validated_data)

        if api_key:
            instance.set_provider_api_key(
                encrypt_secret(api_key)
            )
        elif clear_api_key:
            instance.clear_provider_api_key()

        instance.save()
        return instance

    @transaction.atomic
    def update(self, instance, validated_data):
        api_key = validated_data.pop("api_key", None)
        clear_api_key = validated_data.pop("clear_api_key", False)

        for field, value in validated_data.items():
            setattr(instance, field, value)

        if api_key:
            instance.set_provider_api_key(
                encrypt_secret(api_key)
            )
            instance.last_error_message = ""
        elif clear_api_key:
            instance.clear_provider_api_key()
            instance.is_enabled = False
            instance.last_error_message = ""

        instance.save()
        return instance
