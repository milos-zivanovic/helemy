from django.contrib import admin

from fitness.models import MuscleGroup


@admin.register(MuscleGroup)
class MuscleGroupAdmin(admin.ModelAdmin):
    """Global reference data: read-only through the API, managed here."""

    list_display = ("name", "order", "created_at")
    list_editable = ("order",)
    search_fields = ("name",)
    ordering = ("order", "name")
    readonly_fields = ("created_at", "updated_at")
