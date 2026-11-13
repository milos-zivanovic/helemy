from rest_framework import serializers

from common.fields import HouseholdPrimaryKeyRelatedField
from nutrition.models import Consumption, Food
from users.serializers import UserSerializer


class UniqueFoodNameMixin:
    """Food names are unique per household, case-insensitive (see the model constraint)."""

    def validate_name(self, value):
        household = self.context["request"].user.get_active_household()
        duplicates = Food.objects.filter(household=household, name__iexact=value)
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError("A food with this name already exists.")
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

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        validated_data["household"] = self.context["request"].user.get_active_household()
        return super().create(validated_data)


class WeeklyNutritionSummarySerializer(serializers.Serializer):
    date = serializers.DateField()
    calories = serializers.IntegerField()
    protein = serializers.IntegerField()
    carbs = serializers.IntegerField()
    fat = serializers.IntegerField()
    by_user = serializers.ListField(child=serializers.DictField(), required=False)
