from django.contrib.auth import get_user_model
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext as _
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import generics, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenBlacklistView

from common.images import ImageError
from common.pagination import StandardResultsSetPagination
from common.permissions import IsHouseholdOwner
from users.models import Household, HouseholdInvitation
from users.serializers import (
    AvatarSerializer,
    EmailVerificationSerializer,
    HouseholdCreateSerializer,
    HouseholdInvitationSerializer,
    HouseholdSerializer,
    HouseholdUpdateSerializer,
    InviteMemberSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterResponseSerializer,
    RegisterSerializer,
    ResendVerificationSerializer,
    TokenPairSerializer,
    UserDetailSerializer,
    UserPreferencesSerializer,
    UserSerializer,
)
from users.services import (
    HouseholdError,
    accept_invitation,
    blacklist_user_tokens,
    decline_invitation,
    delete_avatar,
    remove_from_household,
    save_avatar,
    send_password_reset_email,
    send_verification_email,
    tokens_for_user,
)

User = get_user_model()


@extend_schema(responses={201: RegisterResponseSerializer})
class RegisterView(generics.CreateAPIView):
    """
    Create an account (with its personal household) and email a verification link
    (EMAIL_VERIFICATION_URL). No tokens: login works once the email is confirmed (`email/verify/`).
    """

    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    authentication_classes = []  # a stale token in the request must not turn sign-up into a 401

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        send_verification_email(user)
        return Response({"email": user.email}, status=status.HTTP_201_CREATED)


@extend_schema(responses={200: TokenPairSerializer})
class EmailVerificationView(generics.GenericAPIView):
    """
    Confirm the email with the token from the verification email and log in: returns a JWT pair.
    A link works once; afterwards (or expired, after 48 hours) it answers 400 under `token`.
    """

    serializer_class = EmailVerificationSerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.context["user"]
        user.email_verified = True
        user.save(update_fields=["email_verified"])
        return Response(tokens_for_user(user))


@extend_schema(responses={204: None})
class ResendVerificationView(generics.GenericAPIView):
    """
    Email a new verification link to an account that isn't confirmed yet. Always answers 204, so the
    endpoint can't be used to find out which emails have an account.
    """

    serializer_class = ResendVerificationSerializer
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "email_verification"

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        user = User.objects.filter(
            email__iexact=email, is_active=True, email_verified=False
        ).first()
        if user:
            send_verification_email(user)
        return Response(status=status.HTTP_204_NO_CONTENT)


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

    @extend_schema(tags=["Users"], responses={200: UserDetailSerializer})
    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        serializer = UserDetailSerializer(request.user, context={"request": request})
        return Response(serializer.data)

    @extend_schema(
        tags=["Users"], request=UserPreferencesSerializer, responses={200: UserDetailSerializer}
    )
    def update_me(self, request):
        """Change your name and preferences (currency, time zone, language); answers like GET."""
        serializer = UserPreferencesSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return self.me(request)


@extend_schema(tags=["Users"], responses={200: UserDetailSerializer})
class AvatarView(generics.GenericAPIView):
    """
    Your profile picture. PUT (multipart, field `avatar`) stores a new one, cut to a 256x256 square
    (the web client lets the user choose the square first); DELETE removes it. Both answer with the
    whole profile, like GET /api/auth/me/ (`avatar_url`).
    """

    serializer_class = AvatarSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def put(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            save_avatar(request.user, serializer.validated_data["avatar"])
        except ImageError as exc:
            raise ValidationError({"avatar": [str(exc)]}) from exc
        return self.profile()

    def delete(self, request):
        delete_avatar(request.user)
        return self.profile()

    def profile(self):
        return Response(
            UserDetailSerializer(self.request.user, context={"request": self.request}).data
        )


@extend_schema_view(
    list=extend_schema(tags=["Households"]),
    create=extend_schema(tags=["Households"]),
    retrieve=extend_schema(tags=["Households"]),
    partial_update=extend_schema(tags=["Households"]),
)
class HouseholdViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    # No destroy: a household is never deleted (a personal one waits, inactive, for its owner to return).
    # DELETE stays in http_method_names for the members/{user_id}/ action.
    # Not a HouseholdModelViewSet: a Household *is* the tenant, it has no `household` FK.
    # Isolation comes from get_queryset (only households the user belongs to).
    queryset = Household.objects.none()  # for schema generation only; see get_queryset
    serializer_class = HouseholdSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.action in ["partial_update", "update"]:
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

    @extend_schema(tags=["Households"], responses={200: UserSerializer(many=True)})
    @action(
        detail=True, methods=["get"], url_path="members", pagination_class=None, filter_backends=[]
    )
    def members(self, request, pk=None):
        household = self.get_object()
        members = household.members.all()
        serializer = UserSerializer(members, many=True, context={"request": request})
        return Response(serializer.data)

    @extend_schema(
        tags=["Households"],
        request=InviteMemberSerializer,
        responses={201: HouseholdInvitationSerializer},
    )
    @action(detail=True, methods=["post"], url_path="invite")
    def invite_member(self, request, pk=None):
        household = self.get_object()

        # Check permission - only owner can invite
        if not request.user.is_household_owner(household):
            return Response(
                {"detail": _("Only the household owner can invite members.")},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = InviteMemberSerializer(data=request.data, context={"household": household})
        serializer.is_valid(raise_exception=True)

        invitation = HouseholdInvitation.objects.create(
            household=household, invited_user=serializer.context["user"], invited_by=request.user
        )
        return Response(
            HouseholdInvitationSerializer(invitation).data, status=status.HTTP_201_CREATED
        )

    @extend_schema(tags=["Households"], request=None, responses={200: HouseholdSerializer})
    @action(detail=True, methods=["post"])
    def leave(self, request, pk=None):
        """Leave a household you were invited to; your personal household becomes active again."""
        household = self.get_object()
        if household.owner_id == request.user.pk:
            return Response(
                {"detail": _("The owner can't leave their own household.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        remove_from_household(request.user, household)
        active = request.user.get_active_household()
        return Response(HouseholdSerializer(active, context={"request": request}).data)

    @extend_schema(tags=["Households"], responses={204: None})
    @action(detail=True, methods=["delete"], url_path=r"members/(?P<user_id>\d+)")
    def remove_member(self, request, pk=None, user_id=None):
        household = self.get_object()

        # Check permission - only owner can remove
        if not request.user.is_household_owner(household):
            return Response(
                {"detail": _("Only the household owner can remove members.")},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Cannot remove owner
        if household.owner_id == int(user_id):
            return Response(
                {"detail": _("Cannot remove the household owner.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = get_object_or_404(User, id=user_id)

        if not household.members.filter(id=user.id).exists():
            return Response(
                {"detail": _("User is not a member of this household.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        remove_from_household(user, household)

        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(
    list=extend_schema(tags=["Households"]),
    retrieve=extend_schema(tags=["Households"]),
    destroy=extend_schema(tags=["Households"]),
)
class HouseholdInvitationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    Pending invitations the user received or sent (as the household owner).
    The invited user accepts or declines; the owner cancels with DELETE.
    """

    queryset = HouseholdInvitation.objects.none()  # for schema generation only; see get_queryset
    serializer_class = HouseholdInvitationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        user = self.request.user
        return (
            HouseholdInvitation.objects.filter(
                Q(invited_user=user) | Q(household__owner=user),
                status=HouseholdInvitation.PENDING,
            )
            .select_related("household", "invited_user", "invited_by")
            .order_by("-created_at")
        )

    def destroy(self, request, *args, **kwargs):
        invitation = self.get_object()
        if invitation.household.owner_id != request.user.pk:
            return Response(
                {"detail": _("Only the household owner can cancel an invitation.")},
                status=status.HTTP_403_FORBIDDEN,
            )
        invitation.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _respond(self, request, handler):
        """Run `handler(invitation)` for the invited user only; HouseholdError becomes a 400."""
        invitation = self.get_object()
        if invitation.invited_user_id != request.user.pk:
            return Response(
                {"detail": _("Only the invited user can respond to an invitation.")},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            return handler(invitation)
        except HouseholdError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(tags=["Households"], request=None, responses={200: HouseholdSerializer})
    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        """Join the household; your personal household keeps its data, inactive until you are removed."""

        def handler(invitation):
            household = accept_invitation(invitation)
            return Response(HouseholdSerializer(household, context={"request": request}).data)

        return self._respond(request, handler)

    @extend_schema(tags=["Households"], request=None, responses={204: None})
    @action(detail=True, methods=["post"])
    def decline(self, request, pk=None):
        def handler(invitation):
            decline_invitation(invitation)
            return Response(status=status.HTTP_204_NO_CONTENT)

        return self._respond(request, handler)
