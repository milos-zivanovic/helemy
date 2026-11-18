from django.urls import include, path
from rest_framework.routers import DefaultRouter

from finances.views import (
    AccountViewSet,
    BudgetViewSet,
    CategoryGroupViewSet,
    CategoryViewSet,
    TransactionViewSet,
    TransferViewSet,
)

router = DefaultRouter()
router.register(r"category-groups", CategoryGroupViewSet, basename="category-group")
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"transactions", TransactionViewSet, basename="transaction")
router.register(r"budgets", BudgetViewSet, basename="budget")
router.register(r"accounts", AccountViewSet, basename="account")
router.register(r"transfers", TransferViewSet, basename="transfer")

urlpatterns = [
    path("", include(router.urls)),
]
