from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils.translation import gettext_lazy as _

# Currencies a user can pick for showing amounts (ISO 4217); not `choices` on the field, so a code
# stored before (e.g. by the admin) stays valid. Extend the list when someone needs another one.
CURRENCIES = ["RSD", "EUR", "USD", "CHF", "GBP", "BAM", "HUF"]


class Household(models.Model):
    """
    A household represents a group of users who share data.
    """

    name = models.CharField(_("name"), max_length=100)
    owner = models.ForeignKey(
        "User",
        on_delete=models.PROTECT,
        related_name="owned_households",
        verbose_name=_("owner"),
    )
    members = models.ManyToManyField(
        "User",
        related_name="households",
        verbose_name=_("members"),
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        verbose_name = _("household")
        verbose_name_plural = _("households")
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

    @property
    def member_count(self):
        return self.members.count()

    @classmethod
    def create_personal(cls, user):
        """A new household owned by `user`, with `user` as its only member."""
        household = cls.objects.create(name=f"{user.get_short_name()}'s Household", owner=user)
        household.members.add(user)
        return household

    def add_member(self, user):
        """Add a user as member of this household."""
        self.members.add(user)

    def remove_member(self, user):
        """Remove a user from this household."""
        if user == self.owner:
            raise ValueError("Cannot remove the household owner.")
        self.members.remove(user)


class HouseholdInvitation(models.Model):
    """
    An invitation for an existing user to join a household. Accepting it moves the user into the
    household; their personal household stays (with its data) and is active again if they are removed.
    """

    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    STATUS_CHOICES = [
        (PENDING, _("pending")),
        (ACCEPTED, _("accepted")),
        (DECLINED, _("declined")),
    ]

    household = models.ForeignKey(
        Household,
        on_delete=models.CASCADE,
        related_name="invitations",
        verbose_name=_("household"),
    )
    invited_user = models.ForeignKey(
        "User",
        on_delete=models.CASCADE,
        related_name="household_invitations",
        verbose_name=_("invited user"),
    )
    invited_by = models.ForeignKey(
        "User",
        on_delete=models.CASCADE,
        related_name="sent_household_invitations",
        verbose_name=_("invited by"),
    )
    status = models.CharField(_("status"), max_length=10, choices=STATUS_CHOICES, default=PENDING)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    responded_at = models.DateTimeField(_("responded at"), null=True, blank=True)

    class Meta:
        verbose_name = _("household invitation")
        verbose_name_plural = _("household invitations")
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["household", "invited_user"],
                condition=models.Q(status="pending"),
                name="unique_pending_household_invitation",
            )
        ]

    def __str__(self):
        return f"{self.invited_user} -> {self.household} ({self.status})"


class UserManager(BaseUserManager):
    """Manager for a user model that logs in with `email` and has no `username`."""

    use_in_migrations = True

    def normalize_email(self, email):
        # Whole address lowercased (not just the domain), so "Ana@x.com" and "ana@x.com" are one user.
        return super().normalize_email(email).lower()

    def get_by_natural_key(self, email):
        # Used by authenticate() (login): match the email case-insensitively.
        return self.get(email__iexact=email)

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("The email must be set.")
        user = self.model(email=self.normalize_email(email), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        # Made on the command line: there's no email to confirm.
        extra_fields.setdefault("email_verified", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self._create_user(email, password, **extra_fields)


class User(AbstractUser):
    """
    Custom user model with household support.
    """

    username = None  # removed from AbstractUser: login is by email only
    email = models.EmailField(_("email address"), unique=True)
    # Set when the user opens the link from the verification email sent at sign up; until then they
    # can't log in (users.serializers.TokenObtainSerializer).
    email_verified = models.BooleanField(_("email verified"), default=False)

    # Preferences
    timezone = models.CharField(_("timezone"), max_length=50, default="Europe/Belgrade")
    language = models.CharField(_("language"), max_length=10, default="en")
    currency = models.CharField(_("currency"), max_length=3, default="RSD")
    # Profile picture: a 256x256 WebP made by users.services.save_avatar (R2 in production).
    avatar = models.ImageField(_("profile picture"), upload_to="avatars/", blank=True, null=True)

    # Timestamps
    last_activity = models.DateTimeField(_("last activity"), null=True, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        verbose_name = _("user")
        verbose_name_plural = _("users")
        ordering = ["-date_joined"]

    def __str__(self):
        return self.email

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip() or self.email

    def get_short_name(self):
        return self.first_name or self.email

    def get_active_household(self):
        """Get the user's active household (first household they belong to)."""
        return self.households.first()

    def is_household_owner(self, household):
        return household.owner == self

    def is_household_member(self, household):
        return household.members.filter(id=self.id).exists()

    def can_manage_household_members(self, household):
        return self.is_household_owner(household)

    def get_households(self):
        """Get all households the user is a member of."""
        return self.households.all()


@receiver(post_save, sender=User)
def create_user_household(sender, instance, created, **kwargs):
    """
    Automatically create a personal household for new users.
    This enables solo users to use the app without manually creating a household.
    """
    if created and not instance.owned_households.exists():
        Household.create_personal(instance)
