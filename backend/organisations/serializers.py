from rest_framework import serializers

from .models import Organisation, Membership,OrganisationBranding


class OrganisationSerializer(serializers.ModelSerializer):
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

    class Meta:
        model = OrganisationBranding
        fields = [
            "id",
            "company_name",
            "platform_name",
            "logo",
            "logo_url",
            "favicon",
            "favicon_url",
            "primary_color",
            "secondary_color",
            "accent_color",
            "login_title",
            "login_subtitle",
        ]

    def get_logo_url(self, obj):
        request = self.context.get("request")
        if obj.logo and request:
            return request.build_absolute_uri(obj.logo.url)
        return None

    def get_favicon_url(self, obj):
        request = self.context.get("request")
        if obj.favicon and request:
            return request.build_absolute_uri(obj.favicon.url)
        return None