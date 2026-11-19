from django.db import transaction
from django.db.models import Count, Q
from django.utils.translation import gettext as _
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.mixins import HouseholdModelViewSet, get_request_household
from common.pagination import StandardResultsSetPagination
from common.permissions import IsHouseholdMember
from fitness.models import Exercise, MuscleGroup, Training, TrainingItem, TrainingSet
from fitness.serializers import (
    AppendSetSerializer,
    ExerciseHistoryEntrySerializer,
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

    def perform_destroy(self, instance):
        # Deleting would cascade into every training that has this exercise (its whole history).
        if instance.training_items.exists():
            raise ValidationError(
                {"detail": _("This exercise is used in trainings and can't be deleted.")}
            )
        instance.delete()

    @extend_schema(
        tags=["Fitness - Exercises"],
        parameters=[
            OpenApiParameter("user", OpenApiTypes.INT, description="Only this member's trainings")
        ],
        responses={200: ExerciseHistoryEntrySerializer(many=True)},
    )
    @action(
        detail=True,
        methods=["get"],
        url_path="history",
        filter_backends=[],
        pagination_class=None,  # a plain list; also keeps the schema from describing a page
    )
    def history(self, request, pk=None):
        """
        Every training with this exercise, oldest first: its sets, the heaviest weight, total reps
        and volume (weight x reps). For progress charts and "last time" hints. `?user=` narrows it
        to one household member (a training belongs to the member who logged it).
        """
        exercise = self.get_object()
        items = (
            TrainingItem.objects.filter(exercise=exercise)
            .select_related("training")
            .prefetch_related("sets")
            .order_by("training__date", "training__created_at")
        )
        user = request.query_params.get("user")
        if user:
            if not user.isdigit():
                raise ValidationError({"user": _("A user id is a number.")})
            items = items.filter(training__user_id=int(user))

        entries = []
        for item in items:
            sets = list(item.sets.all())
            weights = [s.weight for s in sets if s.weight is not None]
            entries.append(
                {
                    "training_id": item.training_id,
                    "date": item.training.date,
                    "sets": [{"weight": s.weight, "reps": s.reps} for s in sets],
                    "max_weight": max(weights) if weights else None,
                    "total_reps": sum(s.reps for s in sets),
                    "volume": sum(s.volume for s in sets),
                }
            )
        return Response(ExerciseHistoryEntrySerializer(entries, many=True).data)


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
    # The update response is the full training (see `update`), not the update serializer.
    partial_update=extend_schema(tags=["Fitness - Trainings"], responses=TrainingSerializer),
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

    @extend_schema(
        tags=["Fitness - Trainings"],
        request=AppendSetSerializer,
        responses={201: TrainingSetSerializer},
    )
    @action(detail=True, methods=["post"], url_path="sets")
    def append_set(self, request, pk=None):
        """Add the next set of an exercise; the exercise's item is created on its first set."""
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
            .select_related("exercise", "exercise__muscle_group", "training__household")
            .prefetch_related("sets")
        )


@extend_schema_view(
    list=extend_schema(tags=["Fitness - Training Sets"]),
    retrieve=extend_schema(tags=["Fitness - Training Sets"]),
    partial_update=extend_schema(tags=["Fitness - Training Sets"]),
    destroy=extend_schema(tags=["Fitness - Training Sets"]),
)
class TrainingSetViewSet(HouseholdModelViewSet):
    """Sets are added through POST trainings/{id}/sets/; here they are read, corrected or deleted."""

    serializer_class = TrainingSetSerializer
    permission_classes = [IsHouseholdMember]
    http_method_names = ["get", "patch", "delete", "head", "options"]

    @transaction.atomic
    def perform_destroy(self, instance):
        # Keep the remaining sets numbered 1..n (deleting set 2 of 3 makes set 3 the new set 2).
        item = instance.training_item
        instance.delete()
        for number, training_set in enumerate(item.sets.order_by("set_number"), start=1):
            if training_set.set_number != number:
                training_set.set_number = number
                training_set.save(update_fields=["set_number"])

    def get_queryset(self):
        return TrainingSet.objects.filter(
            training_item__training__household=get_request_household(self.request)
        ).select_related("training_item__training__household", "training_item__exercise")
