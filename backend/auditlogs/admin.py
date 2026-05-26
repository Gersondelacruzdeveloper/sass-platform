from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "organisation",
        "user",
        "action",
        "model_name",
        "object_id",
        "created_at",
    )

    search_fields = (
        "organisation__name",
        "user__email",
        "model_name",
        "object_id",
    )

    list_filter = (
        "action",
        "created_at",
    )

    readonly_fields = (
        "organisation",
        "user",
        "action",
        "model_name",
        "object_id",
        "description",
        "ip_address",
        "created_at",
    )