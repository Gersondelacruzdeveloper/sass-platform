from rest_framework import serializers
from .models import TrainingImportJob


class TrainingImportJobSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TrainingImportJob
        fields = [
            "id", "file_name", "file_sha256", "dataset_key", "dataset_version",
            "status", "preview", "result", "error_message", "created_at",
            "applied_at", "rolled_back_at", "created_by_name",
        ]
        read_only_fields = fields

    def get_created_by_name(self, obj):
        user = obj.created_by
        if not user:
            return ""
        return getattr(user, "email", "") or str(user)
