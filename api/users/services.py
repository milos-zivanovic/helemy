"""Auth and household helpers shared by the users views and serializers."""

import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django.utils.translation import gettext as _
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from common.images import remove_image, replace_image
from finances.services import create_default_finances
from users.models import Household, HouseholdInvitation

logger = logging.getLogger(__name__)

# Namespaces the signature, so a token signed for anything else (another salt) never verifies here.
EMAIL_VERIFICATION_SALT = "users.email-verification"


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
        subject=_("Helemy: reset your password"),
        message=_(
            "Someone asked to reset the password for %(email)s.\n\n"
            "Open this link to choose a new password (valid for %(minutes)s minutes):\n"
            "%(link)s\n\n"
            "If it wasn't you, ignore this email; your password stays the same."
        )
        % {"email": user.email, "minutes": minutes, "link": link},
        from_email=None,  # DEFAULT_FROM_EMAIL
        recipient_list=[user.email],
    )


def make_email_verification_token(user):
    """
    A signed, timestamped token with the user's id and email (django.core.signing, SECRET_KEY): it
    can't be forged, expires after EMAIL_VERIFICATION_TIMEOUT and stops working if the email changes.
    """
    return signing.dumps({"user": user.pk, "email": user.email}, salt=EMAIL_VERIFICATION_SALT)


def user_for_email_verification_token(token):
    """The active user the token was made for, or None if it's invalid, expired or outdated."""
    try:
        payload = signing.loads(
            token, salt=EMAIL_VERIFICATION_SALT, max_age=settings.EMAIL_VERIFICATION_TIMEOUT
        )
    except signing.BadSignature:  # also SignatureExpired, its subclass
        return None
    if not isinstance(payload, dict):
        return None
    return (
        get_user_model()
        .objects.filter(pk=payload.get("user"), email=payload.get("email"), is_active=True)
        .first()
    )


def send_verification_email(user):
    """
    Email the link that confirms the address (EMAIL_VERIFICATION_URL with the token). A failure to
    send is logged, not raised: the account exists already and the user can ask for a new email.
    """
    link = settings.EMAIL_VERIFICATION_URL.format(token=make_email_verification_token(user))
    hours = settings.EMAIL_VERIFICATION_TIMEOUT // 3600
    try:
        send_mail(
            subject=_("Helemy: confirm your email address"),
            message=_(
                "Welcome to Helemy!\n\n"
                "Open this link to confirm %(email)s and finish signing up "
                "(valid for %(hours)s hours):\n"
                "%(link)s\n\n"
                "If you didn't sign up, ignore this email."
            )
            % {"email": user.email, "hours": hours, "link": link},
            from_email=None,  # DEFAULT_FROM_EMAIL
            recipient_list=[user.email],
        )
    except Exception:
        logger.exception("Sending the verification email to user %s failed", user.pk)


AVATAR_SIZE = 256  # px, square; shown at most ~56 px, so enough for sharp retina screens


def save_avatar(user, upload):
    """Store `upload` as the user's profile picture (raises ImageError); the old file is deleted."""
    replace_image(user, "avatar", upload, AVATAR_SIZE)


def delete_avatar(user):
    remove_image(user, "avatar")


class HouseholdError(Exception):
    """A household membership change that isn't allowed; the message is shown to the client."""


@transaction.atomic
def create_personal_household(user):
    """A new personal household with the default finance categories and account."""
    household = Household.create_personal(user)
    create_default_finances(household)
    return household


@transaction.atomic
def accept_invitation(invitation):
    """
    Move the invited user into the invitation's household. Their personal household is kept with
    all its data but has no members while they are away, so it's inactive.
    """
    user, household = invitation.invited_user, invitation.household
    if invitation.status != HouseholdInvitation.PENDING:
        raise HouseholdError(_("This invitation is no longer pending."))
    current = user.get_active_household()
    if current is not None:
        if current.owner_id != user.pk:
            raise HouseholdError(_("You already belong to another household."))
        if current.members.exclude(pk=user.pk).exists():
            raise HouseholdError(_("Remove the members of your household first."))
        current.members.remove(user)
    household.add_member(user)
    invitation.status = HouseholdInvitation.ACCEPTED
    invitation.responded_at = timezone.now()
    invitation.save(update_fields=["status", "responded_at"])
    return household


def decline_invitation(invitation):
    if invitation.status != HouseholdInvitation.PENDING:
        raise HouseholdError(_("This invitation is no longer pending."))
    invitation.status = HouseholdInvitation.DECLINED
    invitation.responded_at = timezone.now()
    invitation.save(update_fields=["status", "responded_at"])


@transaction.atomic
def remove_from_household(user, household):
    """Remove `user` from `household`; their personal household becomes active again."""
    household.remove_member(user)
    personal = user.owned_households.order_by("created_at").first()
    if personal is None:  # e.g. a user created before personal households existed
        create_personal_household(user)
    else:
        personal.add_member(user)
