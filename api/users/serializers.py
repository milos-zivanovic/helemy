from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from django.utils.translation import get_language, gettext_lazy
from django.utils.translation import gettext as _
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from finances.services import create_default_finances
from users.models import Household, HouseholdInvitation

User = get_user_model()

# 'owner' / 'member' of the household, or null when the user has none.
ROLE_FIELD = serializers.ChoiceField(choices=["owner", "member"], allow_null=True)


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "timezone",
            "language",
            "currency",
            "date_joined",
            "last_activity",
            "role",
        ]
        read_only_fields = ["id", "date_joined", "last_activity"]

    @extend_schema_field(ROLE_FIELD)
    def get_role(self, obj):
        household = obj.households.first()
        if household:
            if household.owner == obj:
                return "owner"
            return "member"
        return None


class HouseholdSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(read_only=True)
    owner = UserSerializer(read_only=True)
    user_role = serializers.SerializerMethodField()

    class Meta:
        model = Household
        fields = ["id", "name", "owner", "member_count", "user_role", "created_at", "updated_at"]
        read_only_fields = ["id", "owner", "created_at", "updated_at"]

    @extend_schema_field(ROLE_FIELD)
    def get_user_role(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            if obj.owner == request.user:
                return "owner"
            if obj.members.filter(id=request.user.id).exists():
                return "member"
        return None


class UserPreferencesSerializer(serializers.ModelSerializer):
    """What users change about themselves with PATCH /api/auth/me/ (for now only the language)."""

    # One of settings.LANGUAGES ("en", "sr-latn"): the language of emails and messages that don't
    # come from one of the user's own requests (those follow Accept-Language).
    language = serializers.ChoiceField(choices=settings.LANGUAGES)

    class Meta:
        model = User
        fields = ["language"]


class UserDetailSerializer(UserSerializer):
    # Nested serializer instead of a method field: same output, and the schema gets the real type.
    households = HouseholdSerializer(many=True, read_only=True)

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ["households"]


class HouseholdCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Household
        fields = ["id", "name"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        user = self.context["request"].user
        # Every user is in exactly one household (the personal one is created at sign up).
        if user.households.exists():
            raise serializers.ValidationError(_("You already belong to a household."))
        return attrs

    def create(self, validated_data):
        user = self.context["request"].user
        household = Household.objects.create(owner=user, **validated_data)
        household.members.add(user)
        return household


class HouseholdUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Household
        fields = ["name"]


class InviteMemberSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        try:
            user = User.objects.get(email__iexact=User.objects.normalize_email(value))
        except User.DoesNotExist:
            raise serializers.ValidationError(_("User with this email does not exist.")) from None

        household = self.context["household"]
        if household.members.filter(pk=user.pk).exists():
            raise serializers.ValidationError(_("User is already a member of this household."))
        if household.invitations.filter(
            invited_user=user, status=HouseholdInvitation.PENDING
        ).exists():
            raise serializers.ValidationError(_("User already has a pending invitation."))

        self.context["user"] = user
        return user.email


class InvitationUserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "full_name"]


class InvitationHouseholdSerializer(serializers.ModelSerializer):
    class Meta:
        model = Household
        fields = ["id", "name"]


class HouseholdInvitationSerializer(serializers.ModelSerializer):
    household = InvitationHouseholdSerializer(read_only=True)
    invited_user = InvitationUserSerializer(read_only=True)
    invited_by = InvitationUserSerializer(read_only=True)

    class Meta:
        model = HouseholdInvitation
        fields = ["id", "household", "invited_user", "invited_by", "status", "created_at"]
        read_only_fields = fields


def check_password_strength(password, user, field):
    """
    Run Django's AUTH_PASSWORD_VALIDATORS (length, common, numeric, similar to email/name)
    and report failures under `field`.
    """
    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError({field: list(exc.messages)}) from exc


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = User
        fields = ["email", "password", "first_name", "last_name"]
        # Uniqueness is checked case-insensitively in validate_email instead.
        extra_kwargs = {"email": {"validators": []}}

    def validate_email(self, value):
        email = User.objects.normalize_email(value)
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError(_("A user with this email already exists."))
        return email

    def validate(self, attrs):
        user = User(**{k: v for k, v in attrs.items() if k != "password"})
        check_password_strength(attrs["password"], user, field="password")
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        # The post_save signal creates the user's personal household; sign up also seeds it.
        # The language of the sign up request (LocaleMiddleware, from Accept-Language) becomes the
        # user's language; the web client keeps it in sync when the user switches it later.
        language = get_language() or settings.LANGUAGE_CODE
        user = User.objects.create_user(**validated_data, language=language)
        create_default_finances(user.get_active_household())
        return user


class RegisterResponseSerializer(serializers.Serializer):
    user = UserSerializer()
    access = serializers.CharField()
    refresh = serializers.CharField()


class TokenPairSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True, style={"input_type": "password"})
    new_password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate_old_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError(_("The current password is incorrect."))
        return value

    def validate(self, attrs):
        check_password_strength(attrs["new_password"], self.context["request"].user, "new_password")
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, style={"input_type": "password"})

    INVALID_LINK = gettext_lazy("The reset link is invalid or has expired.")

    def validate(self, attrs):
        try:
            user_id = force_str(urlsafe_base64_decode(attrs["uid"]))
            user = User.objects.get(pk=user_id, is_active=True)
        except (ValueError, OverflowError, User.DoesNotExist):
            user = None
        if user is None or not default_token_generator.check_token(user, attrs["token"]):
            raise serializers.ValidationError({"token": [self.INVALID_LINK]})
        check_password_strength(attrs["new_password"], user, "new_password")
        attrs["user"] = user
        return attrs
