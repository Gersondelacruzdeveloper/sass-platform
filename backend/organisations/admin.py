from django.contrib import admin

from .models import Organisation, Membership


@admin.register(Organisation)
class OrganisationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "slug",
        "plan",
        "is_active",
        "created_at",
    )

    search_fields = (
        "name",
        "slug",
        "email",
    )

    list_filter = (
        "plan",
        "is_active",
    )

    prepopulated_fields = {
        "slug": ("name",)
    }


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "organisation",
        "role",
        "is_active",
        "created_at",
    )

    search_fields = (
        "user__email",
        "organisation__name",
    )

    list_filter = (
        "role",
        "is_active",
    )