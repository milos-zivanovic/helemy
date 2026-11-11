from rest_framework import serializers
from nutrition.models import Food, Consumption
from users.serializers import UserSerializer


class FoodSerializer(serializers.ModelSerializer):
    class Meta:
        model = Food
        fields = [
            'id', 'name', 'description',
            'calories', 'protein', 'carbs', 'fat',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class FoodCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Food
        fields = [
            'name', 'description',
            'calories', 'protein', 'carbs', 'fat',
        ]


class ConsumptionSerializer(serializers.ModelSerializer):
    food = serializers.PrimaryKeyRelatedField(read_only=True)
    food_name = serializers.CharField(source='food.name', read_only=True)
    user = UserSerializer(read_only=True)

    # Computed macros
    calories = serializers.IntegerField(read_only=True)
    protein = serializers.IntegerField(read_only=True)
    carbs = serializers.IntegerField(read_only=True)
    fat = serializers.IntegerField(read_only=True)

    class Meta:
        model = Consumption
        fields = [
            'id', 'food', 'food_name', 'quantity_grams',
            'date', 'user',
            'calories', 'protein', 'carbs', 'fat',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']


class ConsumptionCreateSerializer(serializers.ModelSerializer):
    food_id = serializers.PrimaryKeyRelatedField(
        queryset=Food.objects.all(),
        source='food',
        write_only=True,
    )

    class Meta:
        model = Consumption
        fields = [
            'food_id', 'quantity_grams', 'date',
        ]

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        validated_data['household'] = self.context['request'].user.households.first()
        return super().create(validated_data)


class WeeklyNutritionSummarySerializer(serializers.Serializer):
    date = serializers.DateField()
    calories = serializers.IntegerField()
    protein = serializers.IntegerField()
    carbs = serializers.IntegerField()
    fat = serializers.IntegerField()
    by_user = serializers.ListField(child=serializers.DictField(), required=False)