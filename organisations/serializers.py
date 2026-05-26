from rest_framework import serializers

from .models import Organisation, Membership


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