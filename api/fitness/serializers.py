from rest_framework import serializers
from fitness.models import MuscleGroup, Exercise, Training, TrainingItem, TrainingSet
from users.serializers import UserSerializer


class MuscleGroupSerializer(serializers.ModelSerializer):
    exercises_count = serializers.SerializerMethodField()

    class Meta:
        model = MuscleGroup
        fields = ['id', 'name', 'order', 'exercises_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_exercises_count(self, obj):
        return obj.exercises.count()


class ExerciseSerializer(serializers.ModelSerializer):
    muscle_group = MuscleGroupSerializer(read_only=True)
    muscle_group_id = serializers.PrimaryKeyRelatedField(
        queryset=MuscleGroup.objects.all(),
        source='muscle_group',
        write_only=True,
        required=False,
        allow_null=True,
    )
    image_url = serializers.SerializerMethodField()
    trainings_count = serializers.SerializerMethodField()

    class Meta:
        model = Exercise
        fields = [
            'id', 'name', 'description', 'muscle_group', 'muscle_group_id',
            'image', 'image_url', 'trainings_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_image_url(self, obj):
        return obj.get_image_url()

    def get_trainings_count(self, obj):
        return obj.training_items.count()


class ExerciseListSerializer(serializers.ModelSerializer):
    muscle_group = MuscleGroupSerializer(read_only=True)

    class Meta:
        model = Exercise
        fields = ['id', 'name', 'muscle_group']


class TrainingSetSerializer(serializers.ModelSerializer):
    volume = serializers.SerializerMethodField()

    class Meta:
        model = TrainingSet
        fields = [
            'id', 'set_number', 'weight', 'reps', 'volume',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_volume(self, obj):
        return obj.volume


class TrainingItemSerializer(serializers.ModelSerializer):
    exercise = ExerciseListSerializer(read_only=True)
    exercise_id = serializers.PrimaryKeyRelatedField(
        queryset=Exercise.objects.all(),
        source='exercise',
        write_only=True,
    )
    sets = TrainingSetSerializer(many=True, read_only=True)
    total_volume = serializers.SerializerMethodField()
    sets_count = serializers.SerializerMethodField()

    class Meta:
        model = TrainingItem
        fields = [
            'id', 'exercise', 'exercise_id', 'order', 'notes',
            'sets', 'total_volume', 'sets_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_total_volume(self, obj):
        return obj.total_volume

    def get_sets_count(self, obj):
        return obj.sets.count()


class TrainingSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    items = TrainingItemSerializer(many=True, read_only=True)
    muscle_groups = MuscleGroupSerializer(many=True, read_only=True)
    muscle_group_ids = serializers.PrimaryKeyRelatedField(
        queryset=MuscleGroup.objects.all(),
        source='muscle_groups',
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
            'id', 'name', 'date', 'notes',
            'muscle_groups', 'muscle_group_ids',
            'user', 'items', 'total_volume', 'items_count', 'total_sets',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']

    def get_total_volume(self, obj):
        return obj.total_volume

    def get_items_count(self, obj):
        return obj.items.count()

    def get_total_sets(self, obj):
        return sum(item.sets.count() for item in obj.items.all())


class TrainingCreateSerializer(serializers.ModelSerializer):
    muscle_group_ids = serializers.PrimaryKeyRelatedField(
        queryset=MuscleGroup.objects.all(),
        source='muscle_groups',
        write_only=True,
        many=True,
        required=False,
    )

    class Meta:
        model = Training
        fields = ['name', 'date', 'notes', 'muscle_group_ids']

    def create(self, validated_data):
        muscle_groups = validated_data.pop('muscle_groups', [])
        user = self.context['request'].user
        validated_data['user'] = user
        validated_data['household'] = user.households.first()
        training = Training.objects.create(**validated_data)

        if muscle_groups:
            training.muscle_groups.set(muscle_groups)

        return training


class TrainingUpdateSerializer(serializers.ModelSerializer):
    muscle_group_ids = serializers.PrimaryKeyRelatedField(
        queryset=MuscleGroup.objects.all(),
        source='muscle_groups',
        write_only=True,
        many=True,
        required=False,
    )

    class Meta:
        model = Training
        fields = ['name', 'date', 'notes', 'muscle_group_ids']