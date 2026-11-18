from django.contrib import admin

from nutrition.models import Consumption, Food


@admin.register(Food)
class FoodAdmin(admin.ModelAdmin):
    list_display = ("name", "household", "calories", "protein", "carbs", "fat")
    list_filter = ("household",)
    search_fields = ("name",)


@admin.register(Consumption)
class ConsumptionAdmin(admin.ModelAdmin):
    list_display = ("date", "user", "food", "quantity_grams")
    list_filter = ("household", "date")
    list_select_related = ("user", "food")
