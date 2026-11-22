from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as _
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from common.fields import HouseholdPrimaryKeyRelatedField
from common.images import absolute_url
from common.units import WeightUnit
from fitness.models import MAX_WEIGHT, Exercise, MuscleGroup, Training, TrainingItem, TrainingSet
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
    muscle_group = MuscleGroupSerializer(read_only=True, allow_null=True)
    muscle_group_id = serializers.PrimaryKeyRelatedField(
        queryset=MuscleGroup.objects.all(),
        source="muscle_group",
        write_only=True,
        required=False,
        allow_null=True,
    )
    image_url = serializers.SerializerMethodField()
    trainings_count = serializers.SerializerMethodField()
    # The machine's unit. Left out on create: the user's own unit. Changed later: every set of the
    # exercise is converted (80 kg -> 176.37 lb).
    weight_unit = serializers.ChoiceField(choices=WeightUnit.choices, required=False)

    class Meta:
        model = Exercise
        fields = [
            "id",
            "name",
            "description",
            "muscle_group",
            "muscle_group_id",
            "weight_unit",
            "image_url",
            "trainings_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_image_url(self, obj) -> str | None:
        # Uploaded through `exercises/{id}/image/`, not here (it must be cut to a square first).
        return absolute_url(obj.image, self.context.get("request"))

    def get_trainings_count(self, obj) -> int:
        return obj.training_items.count()

    def validate_weight_unit(self, value):
        # A converted weight must still fit the field (9999.99): 9999 kg would be 22044 lb.
        if self.instance is not None:
            heaviest = self.instance.heaviest_set_in(value)
            if heaviest is not None and heaviest > MAX_WEIGHT:
                raise serializers.ValidationError(
                    _("Converted to %(unit)s, a set would weigh more than %(max)s.")
                    % {"unit": value, "max": MAX_WEIGHT}
                )
        return value

    def create(self, validated_data):
        validated_data.setdefault("weight_unit", self.context["request"].user.weight_unit)
        return super().create(validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        unit = validated_data.pop("weight_unit", None)
        if unit is not None:
            instance.change_weight_unit(unit)  # converts the sets; saved with the rest below
        return super().update(instance, validated_data)


class ExerciseListSerializer(serializers.ModelSerializer):
    muscle_group = MuscleGroupSerializer(read_only=True, allow_null=True)
    image_url = serializers.SerializerMethodField()
    # Declared read-only (it's never written through this serializer) so the schema marks it as
    # always present; the model's default would make it optional.
    weight_unit = serializers.ChoiceField(choices=WeightUnit.choices, read_only=True)

    class Meta:
        model = Exercise
        fields = ["id", "name", "muscle_group", "weight_unit", "image_url"]

    def get_image_url(self, obj) -> str | None:
        return absolute_url(obj.image, self.context.get("request"))


class ExerciseImageSerializer(serializers.Serializer):
    image = serializers.FileField(
        help_text="JPEG, PNG or WebP, at most 5 MB; stored as 512x512 WebP."
    )


class TrainingSetSerializer(serializers.ModelSerializer):
    volume = serializers.SerializerMethodField()
    # The model's constraints (weight >= 0, reps > 0) as validation, so bad input is a 400, not a 500.
    weight = serializers.DecimalField(
        max_digits=6, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True
    )
    reps = serializers.IntegerField(min_value=1, max_value=32767)

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
        # set_number is assigned by the API (append) and renumbered on delete.
        read_only_fields = ["id", "set_number", "created_at", "updated_at"]

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
    # In the exercise's own unit, like its sets.
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
    # Weight x reps of all sets in the requesting user's unit (`volume_unit`): kg and lb exercises
    # are converted before they're added up.
    total_volume = serializers.SerializerMethodField()
    volume_unit = serializers.SerializerMethodField()
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
            "volume_unit",
            "items_count",
            "total_sets",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user", "created_at", "updated_at"]

    def get_total_volume(self, obj) -> float:
        return obj.total_volume(self._volume_unit())

    @extend_schema_field(serializers.ChoiceField(choices=WeightUnit.choices))
    def get_volume_unit(self, obj):
        return self._volume_unit()

    def _volume_unit(self):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return getattr(user, "weight_unit", WeightUnit.KG)

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
            raise serializers.ValidationError(_("You already have a training on this date."))
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
                    {"exercise_id": _("The exercise's muscle group is not part of this training.")}
                )
        return attrs


class ExerciseHistorySetSerializer(serializers.Serializer):
    weight = serializers.DecimalField(max_digits=6, decimal_places=2, allow_null=True)
    reps = serializers.IntegerField()


class ExerciseHistoryEntrySerializer(serializers.Serializer):
    """One training in which the exercise was done."""

    training_id = serializers.IntegerField()
    date = serializers.DateField()
    sets = ExerciseHistorySetSerializer(many=True)
    max_weight = serializers.DecimalField(max_digits=6, decimal_places=2, allow_null=True)
    total_reps = serializers.IntegerField()
    volume = serializers.FloatField()
