from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, Q
from django.utils import timezone
from datetime import timedelta
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter
from drf_spectacular.types import OpenApiTypes

from common.mixins import HouseholdModelViewSet
from common.permissions import IsHouseholdMember
from common.pagination import StandardResultsSetPagination
from nutrition.models import Food, Consumption
from nutrition.serializers import (
    FoodSerializer, FoodCreateSerializer,
    ConsumptionSerializer, ConsumptionCreateSerializer,
    WeeklyNutritionSummarySerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['Nutrition - Foods']),
    create=extend_schema(tags=['Nutrition - Foods']),
    partial_update=extend_schema(tags=['Nutrition - Foods']),
    destroy=extend_schema(tags=['Nutrition - Foods']),
)
class FoodViewSet(HouseholdModelViewSet):
    queryset = Food.objects.all()
    serializer_class = FoodSerializer
    permission_classes = [IsHouseholdMember]
    pagination_class = StandardResultsSetPagination
    ordering = ['name']
    ordering_fields = ['name', 'calories', 'created_at']
    search_fields = ['name', 'description']

    def get_serializer_class(self):
        if self.action == 'create':
            return FoodCreateSerializer
        return FoodSerializer


@extend_schema_view(
    list=extend_schema(tags=['Nutrition - Consumptions']),
    create=extend_schema(tags=['Nutrition - Consumptions']),
    partial_update=extend_schema(tags=['Nutrition - Consumptions']),
    destroy=extend_schema(tags=['Nutrition - Consumptions']),
)
class ConsumptionViewSet(HouseholdModelViewSet):
    queryset = Consumption.objects.select_related('food', 'user').all()
    serializer_class = ConsumptionSerializer
    permission_classes = [IsHouseholdMember]
    pagination_class = StandardResultsSetPagination
    ordering = ['-date', '-created_at']
    ordering_fields = ['date', 'created_at']
    search_fields = ['food__name']

    def get_serializer_class(self):
        if self.action == 'create':
            return ConsumptionCreateSerializer
        return ConsumptionSerializer

    @action(detail=False, methods=['get'], url_path='weekly-summary')
    def weekly_summary(self, request):
        """
        Summarize weekly intake of calories, carbs, proteins and fats for the last 7 days.
        Calculated for each user in the logged in user's household, including the owner.
        """
        today = timezone.now().date()
        start_date = today - timedelta(days=6)

        household = request.user.households.first()
        if not household:
            return Response([])

        users = list(household.members.all())
        if household.owner not in users:
            users.append(household.owner)

        consumptions = self.get_queryset().filter(
            date__gte=start_date,
            date__lte=today,
        )

        summaries = {}
        for consumption in consumptions:
            date_key = consumption.date.isoformat()
            user_key = consumption.user.id
            if date_key not in summaries:
                summaries[date_key] = {
                    'date': consumption.date,
                    'calories': 0,
                    'protein': 0,
                    'carbs': 0,
                    'fat': 0,
                    'by_user': {},
                }
            if user_key not in summaries[date_key]['by_user']:
                summaries[date_key]['by_user'][user_key] = {
                    'user_id': consumption.user.id,
                    'username': consumption.user.username,
                    'email': consumption.user.email,
                    'calories': 0,
                    'protein': 0,
                    'carbs': 0,
                    'fat': 0,
                }

            summaries[date_key]['calories'] += consumption.calories
            summaries[date_key]['protein'] += consumption.protein
            summaries[date_key]['carbs'] += consumption.carbs
            summaries[date_key]['fat'] += consumption.fat

            user_summary = summaries[date_key]['by_user'][user_key]
            user_summary['calories'] += consumption.calories
            user_summary['protein'] += consumption.protein
            user_summary['carbs'] += consumption.carbs
            user_summary['fat'] += consumption.fat

        result = []
        for i in range(5):
            day = start_date + timedelta(days=i)
            day_key = day.isoformat()
            if day_key in summaries:
                summaries[day_key]['by_user'] = list(summaries[day_key]['by_user'].values())
                result.append(summaries[day_key])
            else:
                result.append({
                    'date': day,
                    'calories': 0,
                    'protein': 0,
                    'carbs': 0,
                    'fat': 0,
                    'by_user': [
                        {
                            'user_id': user.id,
                            'username': user.username,
                            'email': user.email,
                            'calories': 0,
                            'protein': 0,
                            'carbs': 0,
                            'fat': 0,
                        }
                        for user in users
                    ],
                })

        serializer = WeeklyNutritionSummarySerializer(result, many=True)
        return Response(serializer.data)