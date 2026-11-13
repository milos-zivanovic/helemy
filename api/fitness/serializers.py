from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from common.fields import HouseholdPrimaryKeyRelatedField
from fitness.models import Exercise, MuscleGroup, Training, TrainingItem, TrainingSet
from users.serializers import UserSerializer


class MuscleGroupSerializer(serializers.ModelSerializer):
    """Muscle groups are global reference data shared by all households."""

    class Meta:
        model = MuscleGroup
        fields = ["id", "name", "order", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class MuscleGroupDetailSerializer(MuscleGroupSerializer):
    # Annotated in MuscleGroupViewSet.get_queryset (counts only the user's household exercises)
    exercises_count = serializers.IntegerField(read_only=True)

    class Meta(MuscleGroupSerializer.Meta):
        fields = MuscleGroupSerializer.Meta.fields + ["exercises_count"]


class ExerciseSerializer(serializers.ModelSerializer):
    muscle_group = MuscleGroupSerializer(read_only=True)
    muscle_group_id = serializers.PrimaryKeyRelatedField(
        queryset=MuscleGroup.objects.all(),
        source="muscle_group",
        write_only=True,
        required=False,
        allow_null=True,
    )
    image_url = serializers.SerializerMethodField()
    trainings_count = serializers.SerializerMethodField()

    class Meta:
        model = Exercise
        fields = [
            "id",
            "name",
            "description",
            "muscle_group",
            "muscle_group_id",
            "image",
            "image_url",
            "trainings_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_image_url(self, obj) -> str | None:
        return obj.get_image_url()

    def get_trainings_count(self, obj) -> int:
        return obj.training_items.count()


class ExerciseListSerializer(serializers.ModelSerializer):
    muscle_group = MuscleGroupSerializer(read_only=True)

    class Meta:
        model = Exercise
        fields = ["id", "name", "muscle_group"]


class TrainingSetSerializer(serializers.ModelSerializer):
    volume = serializers.SerializerMethodField()

    class Meta:
        model = TrainingSet
        fields = [
            "id",
            "set_number",
            "weight",
            "reps",
            "volume",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_volume(self, obj) -> float:
        return obj.volume


class TrainingItemSerializer(serializers.ModelSerializer):
    exercise = ExerciseListSerializer(read_only=True)
    exercise_id = HouseholdPrimaryKeyRelatedField(
        queryset=Exercise.objects.all(),
        source="exercise",
        write_only=True,
    )
    sets = TrainingSetSerializer(many=True, read_only=True)
    total_volume = serializers.SerializerMethodField()
    sets_count = serializers.SerializerMethodField()

    class Meta:
        model = TrainingItem
        fields = [
            "id",
            "exercise",
            "exercise_id",
            "order",
            "notes",
            "sets",
            "total_volume",
            "sets_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_total_volume(self, obj) -> float:
        return obj.total_volume

    def get_sets_count(self, obj) -> int:
        return obj.sets.count()


class TrainingSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    items = TrainingItemSerializer(many=True, read_only=True)
    muscle_groups = MuscleGroupSerializer(many=True, read_only=True)
    muscle_group_ids = serializers.PrimaryKeyRelatedField(
        queryset=MuscleGroup.objects.all(),
        source="muscle_groups",
        write_only=True,
        many=True,
        required=False,
    )
    total_volume = serializers.SerializerMethodField()
    items_count = serializers.SerializerMethodField()
    total_sets = serializers.SerializerMethodField()

    class Meta:
        model = Training
        fields = [
            "id",
            "name",
            "date",
            "notes",
            "muscle_groups",
            "muscle_group_ids",
            "user",
            "items",
            "total_volume",
            "items_count",
            "total_sets",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user", "created_at", "updated_at"]

    def get_total_volume(self, obj) -> float:
        return obj.total_volume

    def get_items_count(self, obj) -> int:
        return obj.items.count()

    def get_total_sets(self, obj) -> int:
        return sum(item.sets.count() for item in obj.items.all())


class UniqueTrainingDateMixin:
    """One training per user per day (mirrors the `unique_training_per_user_per_day` constraint)."""

    def validate_date(self, value):
        if self.instance is not None:
            user, household = self.instance.user, self.instance.household
        else:
            user = self.context["request"].user
            household = user.get_active_household()
        duplicates = Training.objects.filter(user=user, household=household, date=value)
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError("You already have a training on this date.")
        return value


class TrainingCreateSerializer(UniqueTrainingDateMixin, serializers.ModelSerializer):
    muscle_group_ids = serializers.PrimaryKeyRelatedField(
        queryset=MuscleGroup.objects.all(),
        source="muscle_groups",
        write_only=True,
        many=True,
        required=False,
    )
    # Explicit field (not a model default) so validate_date also runs for the default value.
    date = serializers.DateField(default=timezone.localdate)

    class Meta:
        model = Training
        fields = ["id", "name", "date", "notes", "muscle_group_ids"]
        read_only_fields = ["id"]

    def create(self, validated_data):
        muscle_groups = validated_data.pop("muscle_groups", [])
        user = self.context["request"].user
        validated_data["user"] = user
        validated_data["household"] = user.get_active_household()
        training = Training.objects.create(**validated_data)

        if muscle_groups:
            training.muscle_groups.set(muscle_groups)

        return training


class TrainingUpdateSerializer(UniqueTrainingDateMixin, serializers.ModelSerializer):
    muscle_group_ids = serializers.PrimaryKeyRelatedField(
        queryset=MuscleGroup.objects.all(),
        source="muscle_groups",
        write_only=True,
        many=True,
        required=False,
    )

    class Meta:
        model = Training
        fields = ["name", "date", "notes", "muscle_group_ids"]


class AppendSetSerializer(serializers.Serializer):
    exercise_id = HouseholdPrimaryKeyRelatedField(
        queryset=Exercise.objects.all(), source="exercise"
    )
    weight = serializers.DecimalField(
        max_digits=6, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True
    )
    reps = serializers.IntegerField(min_value=1, default=1)

    def validate(self, attrs):
        """When the training has muscle groups, the exercise must target one of them."""
        attrs = super().validate(attrs)
        training = self.context.get("training")
        if training is not None:
            allowed = {group.id for group in training.muscle_groups.all()}
            if allowed and attrs["exercise"].muscle_group_id not in allowed:
                raise serializers.ValidationError(
                    {"exercise_id": "The exercise's muscle group is not part of this training."}
                )
        return attrs
