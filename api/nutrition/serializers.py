from django.utils.translation import gettext as _
from rest_framework import serializers

from common.fields import HouseholdPrimaryKeyRelatedField
from nutrition.models import Consumption, Food
from users.serializers import UserSerializer

# Per 100 g: at most 100 g of a macro and 900 kcal (pure fat). Same limits as on a food label.
MACRO_LIMITS = {"calories": 900, "protein": 100, "carbs": 100, "fat": 100}
MACRO_KWARGS = {name: {"min_value": 0, "max_value": limit} for name, limit in MACRO_LIMITS.items()}
# A portion in grams: positive, at most 10 kg.
QUANTITY_KWARGS = {"quantity_grams": {"min_value": 1, "max_value": 10000}}


class UniqueFoodNameMixin:
    """Food names are unique per household, case-insensitive (see the model constraint)."""

    def validate_name(self, value):
        household = self.context["request"].user.get_active_household()
        duplicates = Food.objects.filter(household=household, name__iexact=value)
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError(_("A food with this name already exists."))
        return value


class FoodSerializer(UniqueFoodNameMixin, serializers.ModelSerializer):
    class Meta:
        model = Food
        fields = [
            "id",
            "name",
            "description",
            "calories",
            "protein",
            "carbs",
            "fat",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = MACRO_KWARGS


class FoodCreateSerializer(UniqueFoodNameMixin, serializers.ModelSerializer):
    class Meta:
        model = Food
        fields = [
            "name",
            "description",
            "calories",
            "protein",
            "carbs",
            "fat",
        ]
        extra_kwargs = MACRO_KWARGS


class ConsumptionSerializer(serializers.ModelSerializer):
    food = serializers.PrimaryKeyRelatedField(read_only=True)
    food_name = serializers.CharField(source="food.name", read_only=True)
    user = UserSerializer(read_only=True)

    # Computed macros
    calories = serializers.IntegerField(read_only=True)
    protein = serializers.IntegerField(read_only=True)
    carbs = serializers.IntegerField(read_only=True)
    fat = serializers.IntegerField(read_only=True)

    class Meta:
        model = Consumption
        fields = [
            "id",
            "food",
            "food_name",
            "quantity_grams",
            "date",
            "user",
            "calories",
            "protein",
            "carbs",
            "fat",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user", "created_at", "updated_at"]
        extra_kwargs = QUANTITY_KWARGS


class ConsumptionCreateSerializer(serializers.ModelSerializer):
    food_id = HouseholdPrimaryKeyRelatedField(
        queryset=Food.objects.all(),
        source="food",
        write_only=True,
    )

    class Meta:
        model = Consumption
        fields = [
            "id",
            "food_id",
            "quantity_grams",
            "date",
        ]
        read_only_fields = ["id"]
        extra_kwargs = QUANTITY_KWARGS

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        validated_data["household"] = self.context["request"].user.get_active_household()
        return super().create(validated_data)


class MemberMacrosSerializer(serializers.Serializer):
    """One member's totals for a day of the weekly summary."""

    user_id = serializers.IntegerField()
    full_name = serializers.CharField()
    email = serializers.EmailField()
    calories = serializers.IntegerField()
    protein = serializers.IntegerField()
    carbs = serializers.IntegerField()
    fat = serializers.IntegerField()


class WeeklyNutritionSummarySerializer(serializers.Serializer):
    date = serializers.DateField()
    calories = serializers.IntegerField()
    protein = serializers.IntegerField()
    carbs = serializers.IntegerField()
    fat = serializers.IntegerField()
    by_user = MemberMacrosSerializer(many=True)
