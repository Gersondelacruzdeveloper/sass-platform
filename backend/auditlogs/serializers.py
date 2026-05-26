from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(
        source="user.email",
        read_only=True,
    )

    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )

    class Meta:
        model = AuditLog
        fields = "__all__"