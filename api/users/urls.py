from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from users.views import (
    AvatarView,
    EmailVerificationView,
    HouseholdInvitationViewSet,
    HouseholdViewSet,
    LogoutView,
    PasswordChangeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RegisterView,
    ResendVerificationView,
    UserViewSet,
)

router = DefaultRouter()
router.register(r"households", HouseholdViewSet, basename="household")
router.register(r"invitations", HouseholdInvitationViewSet, basename="household-invitation")

urlpatterns = [
    # Auth endpoints
    path("register/", RegisterView.as_view(), name="register"),
    path("email/verify/", EmailVerificationView.as_view(), name="email_verify"),
    path("email/verify/resend/", ResendVerificationView.as_view(), name="email_verify_resend"),
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
    path("me/avatar/", AvatarView.as_view(), name="user-avatar"),
    path("me/", UserViewSet.as_view({"get": "me", "patch": "update_me"}), name="user-me"),
    # Router endpoints
    path("", include(router.urls)),
]
