from rest_framework import serializers

from .models import Organisation, Membership, OrganisationBranding
from .utils.branding_icons import (
    generate_square_icon_from_logo,
    generate_maskable_icon_from_logo,
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

            # Generated automatically from logo
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

        favicon_file = generate_square_icon_from_logo(logo, size=32)
        icon_192_file = generate_square_icon_from_logo(logo, size=192)
        icon_512_file = generate_square_icon_from_logo(logo, size=512)
        maskable_file = generate_maskable_icon_from_logo(logo, size=512)

        instance.favicon.save(
            f"{base_name}-favicon.png",
            favicon_file,
            save=False,
        )

        instance.app_icon_192.save(
            f"{base_name}-icon-192.png",
            icon_192_file,
            save=False,
        )

        instance.app_icon_512.save(
            f"{base_name}-icon-512.png",
            icon_512_file,
            save=False,
        )

        instance.maskable_icon.save(
            f"{base_name}-maskable-512.png",
            maskable_file,
            save=False,
        )

        instance.save()