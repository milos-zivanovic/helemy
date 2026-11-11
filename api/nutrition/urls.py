from django.urls import path, include
from rest_framework.routers import DefaultRouter
from nutrition.views import (
    FoodViewSet, ConsumptionViewSet,
)

router = DefaultRouter()
router.register(r'foods', FoodViewSet, basename='food')
router.register(r'consumptions', ConsumptionViewSet, basename='consumption')

urlpatterns = [
    path('', include(router.urls)),
]