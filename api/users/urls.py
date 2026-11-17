from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from users.views import (
    HouseholdInvitationViewSet,
    HouseholdViewSet,
    LogoutView,
    PasswordChangeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RegisterView,
    UserViewSet,
)

router = DefaultRouter()
router.register(r"households", HouseholdViewSet, basename="household")
router.register(r"invitations", HouseholdInvitationViewSet, basename="household-invitation")

urlpatterns = [
    # Auth endpoints
    path("register/", RegisterView.as_view(), name="register"),
    path("token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("password/change/", PasswordChangeView.as_view(), name="password_change"),
    path("password/reset/", PasswordResetRequestView.as_view(), name="password_reset"),
    path(
        "password/reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="password_reset_confirm",
    ),
    # User endpoints
    path("me/", UserViewSet.as_view({"get": "me"}), name="user-me"),
    # Router endpoints
    path("", include(router.urls)),
]
