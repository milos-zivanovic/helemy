from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import generics, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenBlacklistView

from common.pagination import StandardResultsSetPagination
from common.permissions import IsHouseholdOwner
from users.models import Household
from users.serializers import (
    HouseholdCreateSerializer,
    HouseholdSerializer,
    HouseholdUpdateSerializer,
    InviteMemberSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterResponseSerializer,
    RegisterSerializer,
    TokenPairSerializer,
    UserDetailSerializer,
    UserSerializer,
)
from users.services import blacklist_user_tokens, send_password_reset_email, tokens_for_user

User = get_user_model()


@extend_schema(responses={201: RegisterResponseSerializer})
class RegisterView(generics.CreateAPIView):
    """Create an account (with its personal household) and return JWT tokens, i.e. log in right away."""

    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    authentication_classes = []  # a stale token in the request must not turn sign-up into a 401

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        data = {"user": UserSerializer(user, context={"request": request}).data}
        data.update(tokens_for_user(user))
        return Response(data, status=status.HTTP_201_CREATED)


@extend_schema(responses={204: None})
class LogoutView(TokenBlacklistView):
    """
    Blacklist the given refresh token, so it can no longer be refreshed.
    The access token stays valid until it expires (JWT_ACCESS_TOKEN_LIFETIME_MINUTES);
    the client should drop both tokens.
    """

    def post(self, request, *args, **kwargs):
        super().post(request, *args, **kwargs)  # raises on an invalid or already blacklisted token
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(responses={200: TokenPairSerializer})
class PasswordChangeView(generics.GenericAPIView):
    """
    Change the password of the logged-in user. Logs out every other device (all refresh tokens
    are blacklisted) and returns a new token pair for this one.
    """

    serializer_class = PasswordChangeSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        blacklist_user_tokens(user)
        return Response(tokens_for_user(user))


@extend_schema(responses={204: None})
class PasswordResetRequestView(generics.GenericAPIView):
    """
    Email a password reset link (PASSWORD_RESET_URL with uid + token) to the user.
    Always answers 204, so the endpoint can't be used to find out which emails have an account.
    """

    serializer_class = PasswordResetRequestSerializer
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user and user.has_usable_password():
            send_password_reset_email(user)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(responses={204: None})
class PasswordResetConfirmView(generics.GenericAPIView):
    """Set a new password with the uid + token from the reset email; logs out every device."""

    serializer_class = PasswordResetConfirmSerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        blacklist_user_tokens(user)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(
    retrieve=extend_schema(tags=["Users"]),
    partial_update=extend_schema(tags=["Users"]),
)
class UserViewSet(mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user

    def get_serializer_class(self):
        if self.action == "retrieve":
            return UserDetailSerializer
        return UserSerializer

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        serializer = UserDetailSerializer(request.user, context={"request": request})
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(tags=["Households"]),
    create=extend_schema(tags=["Households"]),
    retrieve=extend_schema(tags=["Households"]),
    partial_update=extend_schema(tags=["Households"]),
    destroy=extend_schema(tags=["Households"]),
)
class HouseholdViewSet(viewsets.ModelViewSet):
    # Not a HouseholdModelViewSet: a Household *is* the tenant, it has no `household` FK.
    # Isolation comes from get_queryset (only households the user belongs to).
    queryset = Household.objects.none()  # for schema generation only; see get_queryset
    serializer_class = HouseholdSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.action in ["partial_update", "update", "destroy"]:
            return [IsAuthenticated(), IsHouseholdOwner()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == "create":
            return HouseholdCreateSerializer
        elif self.action in ["update", "partial_update"]:
            return HouseholdUpdateSerializer
        return HouseholdSerializer

    def get_queryset(self):
        return self.request.user.households.select_related("owner").all()

    @action(detail=True, methods=["get"], url_path="members")
    def members(self, request, pk=None):
        household = self.get_object()
        members = household.members.all()
        serializer = UserSerializer(members, many=True, context={"request": request})
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="invite")
    def invite_member(self, request, pk=None):
        household = self.get_object()

        # Check permission - only owner can invite
        if not request.user.is_household_owner(household):
            return Response(
                {"detail": "Only the household owner can invite members."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = InviteMemberSerializer(data=request.data, context={"household": household})
        serializer.is_valid(raise_exception=True)

        user = User.objects.get(email=serializer.validated_data["email"])

        household.add_member(user)

        return Response(
            UserSerializer(user, context={"request": request}).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["delete"], url_path=r"members/(?P<user_id>\d+)")
    def remove_member(self, request, pk=None, user_id=None):
        household = self.get_object()

        # Check permission - only owner can remove
        if not request.user.is_household_owner(household):
            return Response(
                {"detail": "Only the household owner can remove members."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Cannot remove owner
        if household.owner_id == int(user_id):
            return Response(
                {"detail": "Cannot remove the household owner."}, status=status.HTTP_400_BAD_REQUEST
            )

        user = get_object_or_404(User, id=user_id)

        if not household.members.filter(id=user.id).exists():
            return Response(
                {"detail": "User is not a member of this household."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        household.remove_member(user)

        return Response(status=status.HTTP_204_NO_CONTENT)
