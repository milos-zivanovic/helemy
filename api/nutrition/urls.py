from django.urls import include, path
from rest_framework.routers import DefaultRouter

from nutrition.views import (
    ConsumptionViewSet,
    FoodViewSet,
)

router = DefaultRouter()
router.register(r"foods", FoodViewSet, basename="food")
router.register(r"consumptions", ConsumptionViewSet, basename="consumption")

urlpatterns = [
    path("", include(router.urls)),
]
