"""Auth and household helpers shared by the users views and serializers."""

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django.utils.translation import gettext as _
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from finances.services import create_default_finances
from users.models import Household, HouseholdInvitation


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
        subject=_("Life Tracker: reset your password"),
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
