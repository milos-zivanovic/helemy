"""Auth helpers shared by the users views."""

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken


def tokens_for_user(user):
    """A fresh JWT pair, the same shape as the `auth/token/` response."""
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def blacklist_user_tokens(user):
    """
    Blacklist every refresh token issued to the user, i.e. log them out on all devices.
    Access tokens already issued stay valid until they expire (they are not stored).
    """
    outstanding = OutstandingToken.objects.filter(user=user, blacklistedtoken__isnull=True)
    BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=token) for token in outstanding], ignore_conflicts=True
    )


def send_password_reset_email(user):
    # The token is tied to the password hash and last_login, so it stops working once the
    # password changes (or the user logs in); it also expires after PASSWORD_RESET_TIMEOUT.
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    link = settings.PASSWORD_RESET_URL.format(uid=uid, token=token)
    minutes = settings.PASSWORD_RESET_TIMEOUT // 60
    send_mail(
        subject="Life Tracker: reset your password",
        message=(
            f"Someone asked to reset the password for {user.email}.\n\n"
            f"Open this link to choose a new password (valid for {minutes} minutes):\n{link}\n\n"
            "If it wasn't you, ignore this email; your password stays the same."
        ),
        from_email=None,  # DEFAULT_FROM_EMAIL
        recipient_list=[user.email],
    )
