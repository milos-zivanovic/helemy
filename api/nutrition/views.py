from datetime import timedelta

from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from common.mixins import HouseholdModelViewSet
from common.pagination import StandardResultsSetPagination
from common.permissions import IsHouseholdMember
from nutrition.filters import ConsumptionFilter
from nutrition.models import Consumption, Food
from nutrition.serializers import (
    ConsumptionCreateSerializer,
    ConsumptionSerializer,
    FoodCreateSerializer,
    FoodSerializer,
    WeeklyNutritionSummarySerializer,
)

MACROS = ("calories", "protein", "carbs", "fat")


@extend_schema_view(
    list=extend_schema(tags=["Nutrition - Foods"]),
    create=extend_schema(tags=["Nutrition - Foods"]),
    partial_update=extend_schema(tags=["Nutrition - Foods"]),
    destroy=extend_schema(tags=["Nutrition - Foods"]),
)
class FoodViewSet(HouseholdModelViewSet):
    queryset = Food.objects.all()
    serializer_class = FoodSerializer
    permission_classes = [IsHouseholdMember]
    pagination_class = StandardResultsSetPagination
    ordering = ["name"]
    ordering_fields = ["name", "calories", "created_at"]
    search_fields = ["name", "description"]

    def get_serializer_class(self):
        if self.action == "create":
            return FoodCreateSerializer
        return FoodSerializer


@extend_schema_view(
    list=extend_schema(tags=["Nutrition - Consumptions"]),
    create=extend_schema(tags=["Nutrition - Consumptions"]),
    partial_update=extend_schema(tags=["Nutrition - Consumptions"]),
    destroy=extend_schema(tags=["Nutrition - Consumptions"]),
)
class ConsumptionViewSet(HouseholdModelViewSet):
    queryset = Consumption.objects.select_related("food", "user").all()
    serializer_class = ConsumptionSerializer
    permission_classes = [IsHouseholdMember]
    pagination_class = StandardResultsSetPagination
    ordering = ["-date", "-created_at"]
    ordering_fields = ["date", "created_at"]
    filterset_class = ConsumptionFilter
    search_fields = ["food__name"]

    def get_serializer_class(self):
        if self.action == "create":
            return ConsumptionCreateSerializer
        return ConsumptionSerializer

    @extend_schema(
        tags=["Nutrition - Consumptions"],
        parameters=[
            OpenApiParameter(
                "date",
                OpenApiTypes.DATE,
                description="Any day of the wanted week (YYYY-MM-DD). Defaults to today.",
            ),
        ],
        responses={200: WeeklyNutritionSummarySerializer(many=True)},
    )
    @action(detail=False, methods=["get"], url_path="weekly-summary", filter_backends=[])
    def weekly_summary(self, request):
        """
        Calories and macros per day for the calendar week (Monday to Sunday) containing `date`.
        Always 7 days. Each day has household totals and a `by_user` breakdown that lists
        every household member, with zeros for members who logged nothing that day.
        """
        raw_date = request.query_params.get("date")
        # localdate, not now().date(): the latter is the UTC date and lags behind after midnight.
        day = parse_date(raw_date) if raw_date else timezone.localdate()
        if day is None:
            raise ValidationError({"date": "Use the YYYY-MM-DD format."})
        week_start = day - timedelta(days=day.weekday())
        week_days = [week_start + timedelta(days=i) for i in range(7)]

        household = request.user.get_active_household()
        members = {user.id: user for user in household.members.all()} if household else {}
        if household:
            members.setdefault(household.owner_id, household.owner)

        consumptions = list(self.get_queryset().filter(date__range=(week_days[0], week_days[-1])))
        for consumption in consumptions:  # e.g. entries by someone who has left the household
            members.setdefault(consumption.user_id, consumption.user)
        users = sorted(members.values(), key=lambda u: u.id)

        summary = {
            week_day: {
                "date": week_day,
                **dict.fromkeys(MACROS, 0),
                "by_user": {
                    user.id: {
                        "user_id": user.id,
                        "full_name": user.get_full_name(),
                        "email": user.email,
                        **dict.fromkeys(MACROS, 0),
                    }
                    for user in users
                },
            }
            for week_day in week_days
        }
        for consumption in consumptions:
            day_summary = summary[consumption.date]
            user_summary = day_summary["by_user"][consumption.user_id]
            for macro in MACROS:
                value = getattr(consumption, macro)
                day_summary[macro] += value
                user_summary[macro] += value

        result = [
            {**day_summary, "by_user": list(day_summary["by_user"].values())}
            for day_summary in summary.values()
        ]
        return Response(WeeklyNutritionSummarySerializer(result, many=True).data)
