from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import (
    DecimalField,
    Exists,
    ExpressionWrapper,
    F,
    OuterRef,
    Q,
    Subquery,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

MONEY = DecimalField(max_digits=14, decimal_places=2)


def _sum_subquery(queryset, field="amount"):
    """A correlated SUM(field) of `queryset` (filtered with OuterRef) as a subquery; 0 if none."""
    # Group by a constant so SUM covers every row of the subquery (a plain .values(field) would
    # group by the field itself).
    total = (
        queryset.order_by()
        .annotate(_group=Value(1))
        .values("_group")
        .annotate(total=Sum(field))
        .values("total")
    )
    return Coalesce(Subquery(total, output_field=MONEY), Value(Decimal("0")), output_field=MONEY)


class AccountQuerySet(models.QuerySet):
    def with_balance(self, on_date=None):
        """
        Annotate `balance`: the account's balance at the end of `on_date` (default: today).

        balance = opening_balance + income - expenses + transfers in - transfers out, counting only
        what happened from `opening_date` (the opening balance already contains everything before
        it) up to `on_date`. Soft-deleted transactions don't count. One query, four subqueries.
        """
        on_date = on_date or timezone.localdate()
        period = {"date__gte": OuterRef("opening_date"), "date__lte": on_date}
        transactions = Transaction.objects.filter(
            account=OuterRef("pk"), is_deleted=False, **period
        )
        income = _sum_subquery(transactions.filter(transaction_type=Transaction.INCOME))
        expense = _sum_subquery(transactions.filter(transaction_type=Transaction.EXPENSE))
        transfers_in = _sum_subquery(Transfer.objects.filter(to_account=OuterRef("pk"), **period))
        transfers_out = _sum_subquery(
            Transfer.objects.filter(from_account=OuterRef("pk"), **period)
        )
        return self.annotate(
            balance=ExpressionWrapper(
                F("opening_balance") + income - expense + transfers_in - transfers_out,
                output_field=MONEY,
            )
        )


class Account(models.Model):
    """
    Where money is kept: a bank account, cash, savings. Every transaction belongs to one account;
    moving money between accounts is a Transfer, not income or expense.
    """

    household = models.ForeignKey(
        "users.Household",
        on_delete=models.CASCADE,
        related_name="accounts",
    )
    name = models.CharField(_("name"), max_length=100)
    # The balance at the start of opening_date (before that day's transactions). Transactions
    # dated earlier are history the opening balance already includes; they don't change it.
    opening_balance = models.DecimalField(
        _("opening balance"), max_digits=12, decimal_places=2, default=Decimal("0")
    )
    opening_date = models.DateField(_("opening date"), default=timezone.localdate)
    is_active = models.BooleanField(_("is active"), default=True)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    objects = AccountQuerySet.as_manager()

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class CategoryGroupQuerySet(models.QuerySet):
    def active(self, on_date=None):
        """Groups switched on that have at least one category active on `on_date` (default: today)."""
        active_categories = Category.objects.active(on_date).filter(category_group=OuterRef("pk"))
        return self.filter(Exists(active_categories), is_active=True)


class CategoryQuerySet(models.QuerySet):
    def active(self, on_date=None):
        """
        Categories active on `on_date` (default: today). All conditions must hold:

        - `is_active` is on (manual switch, e.g. to archive a category), and so is the group's;
        - `on_date` is inside the one-off range `start_date`..`end_date` (each bound optional);
        - `on_date` is inside the yearly window `start_month/start_day`..`end_month/end_day`
          (each bound optional). A window can wrap the new year, e.g. 12/01..02/28.

        Month/day pairs are compared as month * 100 + day (e.g. 1231), which works the same
        on SQLite and PostgreSQL. A pair with a NULL part counts as "no bound".
        """
        on_date = on_date or timezone.localdate()
        today_md = on_date.month * 100 + on_date.day

        in_yearly_window = (
            Q(window_start__isnull=True, window_end__isnull=True)
            | Q(window_start__isnull=True, window_end__gte=today_md)
            | Q(window_end__isnull=True, window_start__lte=today_md)
            # Regular window inside one year: start <= today <= end
            | (
                Q(window_start__lte=F("window_end"))
                & Q(window_start__lte=today_md, window_end__gte=today_md)
            )
            # Window wrapping the new year: today >= start OR today <= end
            | (
                Q(window_start__gt=F("window_end"))
                & (Q(window_start__lte=today_md) | Q(window_end__gte=today_md))
            )
        )
        return self.alias(
            window_start=F("start_month") * 100 + F("start_day"),
            window_end=F("end_month") * 100 + F("end_day"),
        ).filter(
            in_yearly_window,
            Q(start_date__isnull=True) | Q(start_date__lte=on_date),
            Q(end_date__isnull=True) | Q(end_date__gte=on_date),
            is_active=True,
            category_group__is_active=True,
        )


class CategoryGroup(models.Model):
    household = models.ForeignKey(
        "users.Household",
        on_delete=models.CASCADE,
        related_name="category_groups",
    )
    name = models.CharField(_("name"), max_length=100)
    is_active = models.BooleanField(_("is active"), default=True)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    objects = CategoryGroupQuerySet.as_manager()

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Category(models.Model):
    household = models.ForeignKey(
        "users.Household",
        on_delete=models.CASCADE,
        related_name="categories",
    )
    category_group = models.ForeignKey(
        CategoryGroup,
        related_name="categories",
        on_delete=models.CASCADE,
    )
    name = models.CharField(_("name"), max_length=100)
    is_active = models.BooleanField(_("is active"), default=True)

    # Date range when category is active (static / one time only)
    start_date = models.DateField(_("start date"), null=True, blank=True)
    end_date = models.DateField(_("end date"), null=True, blank=True)

    # Date range when category is active each year (dynamic / repeatedly)
    start_month = models.PositiveSmallIntegerField(_("start month"), null=True, blank=True)
    start_day = models.PositiveSmallIntegerField(_("start day"), null=True, blank=True)
    end_month = models.PositiveSmallIntegerField(_("end month"), null=True, blank=True)
    end_day = models.PositiveSmallIntegerField(_("end day"), null=True, blank=True)

    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    objects = CategoryQuerySet.as_manager()

    class Meta:
        ordering = ["category_group", "name"]

    def __str__(self):
        return f"{self.category_group.name} / {self.name}"

    def current_budget(self):
        """Budget active today. Overlapping budgets are rejected by BudgetSerializer."""
        today = timezone.localdate()
        return (
            Budget.objects.with_spent()
            .filter(category=self, start_date__lte=today, end_date__gte=today)
            .first()
        )


class BudgetQuerySet(models.QuerySet):
    def with_spent(self):
        """Annotate `spent_amount` (sum of expenses in the budget period) in a single query."""
        spent = (
            Transaction.objects.filter(
                household=OuterRef("household"),
                category=OuterRef("category"),
                transaction_type=Transaction.EXPENSE,
                is_deleted=False,
                date__gte=OuterRef("start_date"),
                date__lte=OuterRef("end_date"),
            )
            .order_by()
            .values("category")
            .annotate(total=Sum("amount"))
            .values("total")
        )
        money = DecimalField(max_digits=12, decimal_places=2)
        return self.annotate(
            spent_amount=Coalesce(
                Subquery(spent, output_field=money), Value(Decimal("0")), output_field=money
            )
        )


class Budget(models.Model):
    household = models.ForeignKey(
        "users.Household",
        on_delete=models.CASCADE,
        related_name="budgets",
    )
    category = models.ForeignKey(
        Category,
        related_name="budgets",
        on_delete=models.CASCADE,
    )
    start_date = models.DateField(_("start date"))
    end_date = models.DateField(_("end date"))
    amount = models.DecimalField(
        _("amount"),
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    description = models.CharField(_("description"), max_length=255, blank=True)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    objects = BudgetQuerySet.as_manager()

    class Meta:
        ordering = ["-start_date", "category__name"]

    def __str__(self):
        return f"Budget for {self.category} - {self.amount}"

    @property
    def total_spent(self):
        # Use the annotation from Budget.objects.with_spent() when available (no extra query).
        if hasattr(self, "spent_amount"):
            return Decimal(self.spent_amount or 0)
        total_spent = Transaction.objects.filter(
            category=self.category,
            transaction_type=Transaction.EXPENSE,
            date__gte=self.start_date,
            date__lte=self.end_date,
            household=self.household,
            is_deleted=False,
        ).aggregate(amount=Sum("amount"))["amount"]

        return Decimal(total_spent or 0)

    @property
    def percentage_spent(self):
        if self.amount and self.amount > 0:
            return (self.total_spent / self.amount) * 100
        return 0


class Transaction(models.Model):
    INCOME = "income"
    EXPENSE = "expense"

    TRANSACTION_TYPES = [
        (INCOME, _("Income")),
        (EXPENSE, _("Expense")),
    ]

    household = models.ForeignKey(
        "users.Household",
        on_delete=models.CASCADE,
        related_name="transactions",
    )
    transaction_type = models.CharField(
        _("type"),
        max_length=7,
        choices=TRANSACTION_TYPES,
        default=EXPENSE,
    )
    category = models.ForeignKey(
        Category,
        related_name="transactions",
        on_delete=models.CASCADE,
    )
    # PROTECT: an account with transactions can't be deleted (the view refuses it with a 400 first).
    account = models.ForeignKey(
        Account,
        related_name="transactions",
        on_delete=models.PROTECT,
    )
    title = models.CharField(_("title"), max_length=100)
    description = models.CharField(_("description"), max_length=255, blank=True)
    amount = models.DecimalField(
        _("amount"),
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="transactions",
    )
    is_fixed = models.BooleanField(_("is fixed"), default=False)
    # Day the transaction happened; can be in the past (e.g. entering yesterday's expense).
    date = models.DateField(_("date"), default=timezone.localdate, db_index=True)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    is_deleted = models.BooleanField(_("is deleted"), default=False)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.type_sign}{self.amount} {self.title}"

    @property
    def type_sign(self):
        return "+" if self.transaction_type == self.INCOME else "-"

    @property
    def full_category_str(self):
        if not self.category:
            return ""
        return str(self.category)


class Transfer(models.Model):
    """Money moved from one account to another (e.g. cash withdrawal). Not income or expense."""

    household = models.ForeignKey(
        "users.Household",
        on_delete=models.CASCADE,
        related_name="transfers",
    )
    from_account = models.ForeignKey(
        Account, related_name="transfers_out", on_delete=models.PROTECT
    )
    to_account = models.ForeignKey(Account, related_name="transfers_in", on_delete=models.PROTECT)
    amount = models.DecimalField(
        _("amount"),
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    date = models.DateField(_("date"), default=timezone.localdate, db_index=True)
    description = models.CharField(_("description"), max_length=255, blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="transfers",
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=~Q(from_account=F("to_account")), name="transfer_between_two_accounts"
            )
        ]

    def __str__(self):
        return f"{self.from_account} -> {self.to_account}: {self.amount}"
