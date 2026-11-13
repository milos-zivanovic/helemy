from django.db.models import Count, Q
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.mixins import HouseholdModelViewSet, get_request_household
from common.pagination import StandardResultsSetPagination
from common.permissions import IsHouseholdMember
from fitness.models import Exercise, MuscleGroup, Training, TrainingItem, TrainingSet
from fitness.serializers import (
    AppendSetSerializer,
    ExerciseListSerializer,
    ExerciseSerializer,
    MuscleGroupDetailSerializer,
    TrainingCreateSerializer,
    TrainingItemSerializer,
    TrainingSerializer,
    TrainingSetSerializer,
    TrainingUpdateSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=["Fitness - Muscle Groups"]),
    retrieve=extend_schema(tags=["Fitness - Muscle Groups"]),
)
class MuscleGroupViewSet(viewsets.ReadOnlyModelViewSet):
    """Global, read-only reference data (no household). Managed through the admin."""

    serializer_class = MuscleGroupDetailSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    ordering = ["order", "name"]
    ordering_fields = ["order", "name", "created_at"]
    search_fields = ["name"]

    def get_queryset(self):
        household = get_request_household(self.request)
        return MuscleGroup.objects.annotate(
            exercises_count=Count("exercises", filter=Q(exercises__household=household))
        )


@extend_schema_view(
    list=extend_schema(tags=["Fitness - Exercises"]),
    create=extend_schema(tags=["Fitness - Exercises"]),
    retrieve=extend_schema(tags=["Fitness - Exercises"]),
    partial_update=extend_schema(tags=["Fitness - Exercises"]),
    destroy=extend_schema(tags=["Fitness - Exercises"]),
)
class ExerciseViewSet(HouseholdModelViewSet):
    queryset = Exercise.objects.select_related("muscle_group").all()
    serializer_class = ExerciseSerializer
    permission_classes = [IsHouseholdMember]
    pagination_class = StandardResultsSetPagination
    ordering = ["muscle_group__order", "name"]
    ordering_fields = ["name", "created_at"]
    # ?muscle_group=1 or ?muscle_group__in=1,2 (e.g. exercises for a training's muscle groups)
    filterset_fields = {"muscle_group": ["exact", "in"]}
    search_fields = ["name", "description"]

    def get_serializer_class(self):
        if self.action == "list":
            return ExerciseListSerializer
        return ExerciseSerializer


@extend_schema_view(
    list=extend_schema(
        tags=["Fitness - Trainings"],
        parameters=[
            OpenApiParameter("from_date", OpenApiTypes.DATE, description="Start date (YYYY-MM-DD)"),
            OpenApiParameter("to_date", OpenApiTypes.DATE, description="End date (YYYY-MM-DD)"),
        ],
    ),
    create=extend_schema(tags=["Fitness - Trainings"]),
    retrieve=extend_schema(tags=["Fitness - Trainings"]),
    partial_update=extend_schema(tags=["Fitness - Trainings"]),
    destroy=extend_schema(tags=["Fitness - Trainings"]),
)
class TrainingViewSet(HouseholdModelViewSet):
    queryset = (
        Training.objects.select_related("user")
        .prefetch_related("muscle_groups", "items__exercise__muscle_group", "items__sets")
        .all()
    )
    serializer_class = TrainingSerializer
    permission_classes = [IsHouseholdMember]
    pagination_class = StandardResultsSetPagination
    ordering = ["-date", "-created_at"]
    ordering_fields = ["date", "created_at"]
    filterset_fields = ["muscle_groups"]
    search_fields = ["name", "notes"]

    def get_serializer_class(self):
        if self.action == "create":
            return TrainingCreateSerializer
        elif self.action in ["update", "partial_update"]:
            return TrainingUpdateSerializer
        return TrainingSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        from_date = self.request.query_params.get("from_date")
        to_date = self.request.query_params.get("to_date")

        if from_date:
            queryset = queryset.filter(date__gte=from_date)
        if to_date:
            queryset = queryset.filter(date__lte=to_date)

        return queryset

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(TrainingSerializer(instance, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="sets")
    def append_set(self, request, pk=None):
        training = self.get_object()

        serializer = AppendSetSerializer(
            data=request.data, context={"request": request, "training": training}
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        training_set = training.add_set(
            exercise=data["exercise"],
            weight=data.get("weight"),
            reps=data["reps"],
        )

        return Response(
            TrainingSetSerializer(training_set, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


@extend_schema_view(
    list=extend_schema(tags=["Fitness - Training Items"]),
    retrieve=extend_schema(tags=["Fitness - Training Items"]),
    destroy=extend_schema(tags=["Fitness - Training Items"]),
)
class TrainingItemViewSet(HouseholdModelViewSet):
    serializer_class = TrainingItemSerializer
    permission_classes = [IsHouseholdMember]
    http_method_names = ["get", "delete", "head", "options"]

    def get_queryset(self):
        return (
            TrainingItem.objects.filter(training__household=get_request_household(self.request))
            .select_related("exercise", "exercise__muscle_group", "training")
            .prefetch_related("sets")
        )


@extend_schema_view(
    list=extend_schema(tags=["Fitness - Training Sets"]),
    retrieve=extend_schema(tags=["Fitness - Training Sets"]),
    destroy=extend_schema(tags=["Fitness - Training Sets"]),
)
class TrainingSetViewSet(HouseholdModelViewSet):
    serializer_class = TrainingSetSerializer
    permission_classes = [IsHouseholdMember]
    http_method_names = ["get", "delete", "head", "options"]

    def get_queryset(self):
        return TrainingSet.objects.filter(
            training_item__training__household=get_request_household(self.request)
        ).select_related("training_item__training", "training_item__exercise")
