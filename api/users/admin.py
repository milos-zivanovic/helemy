from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import AdminUserCreationForm, UserChangeForm
from django.utils.translation import gettext_lazy as _

from users.models import Household, User

# Django's user forms and admin are built around `username`; these variants use `email` instead.
# The email is lowercased by User.clean() (it calls UserManager.normalize_email), which forms run.


class UserCreationAdminForm(AdminUserCreationForm):
    class Meta:
        model = User
        fields = ("email",)
        field_classes = {}


class UserChangeAdminForm(UserChangeForm):
    class Meta:
        model = User
        fields = "__all__"
        field_classes = {}


class HouseholdMembershipInline(admin.TabularInline):
    model = Household.members.through
    extra = 0
    autocomplete_fields = ("household",)
    verbose_name = _("household membership")
    verbose_name_plural = _("household memberships")


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = UserChangeAdminForm
    add_form = UserCreationAdminForm
    inlines = (HouseholdMembershipInline,)

    def get_inlines(self, request, obj):
        # Not on the add page: the personal household is created after save (post_save signal).
        return self.inlines if obj else ()

    list_display = ("email", "first_name", "last_name", "is_active", "is_staff", "date_joined")
    list_filter = ("is_staff", "is_superuser", "is_active")
    search_fields = ("email", "first_name", "last_name")
    ordering = ("-date_joined",)
    readonly_fields = ("last_login", "date_joined", "last_activity")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        (_("Personal info"), {"fields": ("first_name", "last_name")}),
        (_("Preferences"), {"fields": ("timezone", "language", "currency")}),
        (_("Onboarding"), {"fields": ("onboarding_completed", "onboarding_step")}),
        (
            _("Permissions"),
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                ),
            },
        ),
        (_("Important dates"), {"fields": ("last_login", "date_joined", "last_activity")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "usable_password", "password1", "password2"),
            },
        ),
    )


@admin.register(Household)
class HouseholdAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "member_count", "created_at")
    search_fields = ("name", "owner__email")
    autocomplete_fields = ("owner",)
    filter_horizontal = ("members",)
    readonly_fields = ("created_at", "updated_at")

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("owner").prefetch_related("members")

    @admin.display(description=_("members"))
    def member_count(self, obj):
        return len(obj.members.all())  # uses the prefetch, no query per row
