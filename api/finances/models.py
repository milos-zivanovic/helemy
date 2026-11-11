from datetime import date
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Sum
from django.utils.translation import gettext_lazy as _


class CategoryGroup(models.Model):
    household = models.ForeignKey(
        'users.Household',
        on_delete=models.CASCADE,
        related_name='category_groups',
    )
    name = models.CharField(_('name'), max_length=100)
    is_active = models.BooleanField(_('is active'), default=True)
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Category(models.Model):
    household = models.ForeignKey(
        'users.Household',
        on_delete=models.CASCADE,
        related_name='categories',
    )
    category_group = models.ForeignKey(
        CategoryGroup,
        related_name='categories',
        on_delete=models.CASCADE,
    )
    name = models.CharField(_('name'), max_length=100)
    is_active = models.BooleanField(_('is active'), default=True)

    # Date range when category is active (static / one time only)
    start_date = models.DateField(_('start date'), null=True, blank=True)
    end_date = models.DateField(_('end date'), null=True, blank=True)

    # Date range when category is active each year (dynamic / repeatedly)
    start_month = models.PositiveSmallIntegerField(_('start month'), null=True, blank=True)
    start_day = models.PositiveSmallIntegerField(_('start day'), null=True, blank=True)
    end_month = models.PositiveSmallIntegerField(_('end month'), null=True, blank=True)
    end_day = models.PositiveSmallIntegerField(_('end day'), null=True, blank=True)

    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)

    class Meta:
        ordering = ['category_group', 'name']

    def __str__(self):
        return f'{self.category_group.name} / {self.name}'

    def current_budget(self):
        today = date.today()
        budgets = self.budgets.filter(start_date__lte=today, end_date__gte=today)
        if budgets.count() > 1:
            raise ValidationError('More than one active budget for this category.')
        return budgets.first()


class Budget(models.Model):
    household = models.ForeignKey(
        'users.Household',
        on_delete=models.CASCADE,
        related_name='budgets',
    )
    category = models.ForeignKey(
        Category,
        related_name='budgets',
        on_delete=models.CASCADE,
    )
    start_date = models.DateField(_('start date'))
    end_date = models.DateField(_('end date'))
    amount = models.DecimalField(
        _('amount'),
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
    )
    description = models.CharField(_('description'), max_length=255, blank=True)
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)

    class Meta:
        ordering = ['-start_date', 'category__name']

    def __str__(self):
        return f'Budget for {self.category} - {self.amount}'

    @property
    def total_spent(self):
        total_spent = Transaction.objects.filter(
            category=self.category,
            transaction_type=Transaction.EXPENSE,
            created_at__date__gte=self.start_date,
            created_at__date__lte=self.end_date,
            household=self.household,
            is_deleted=False,
        ).aggregate(amount=Sum('amount'))['amount']

        return Decimal(total_spent or 0)

    @property
    def percentage_spent(self):
        if self.amount and self.amount > 0:
            return (self.total_spent / self.amount) * 100
        return 0


class Transaction(models.Model):
    INCOME = 'income'
    EXPENSE = 'expense'

    TRANSACTION_TYPES = [
        (INCOME, _('Income')),
        (EXPENSE, _('Expense')),
    ]

    household = models.ForeignKey(
        'users.Household',
        on_delete=models.CASCADE,
        related_name='transactions',
    )
    transaction_type = models.CharField(
        _('type'),
        max_length=7,
        choices=TRANSACTION_TYPES,
        default=EXPENSE,
    )
    category = models.ForeignKey(
        Category,
        related_name='transactions',
        on_delete=models.CASCADE,
    )
    title = models.CharField(_('title'), max_length=100)
    description = models.CharField(_('description'), max_length=255, blank=True)
    amount = models.DecimalField(
        _('amount'),
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='transactions',
    )
    is_fixed = models.BooleanField(_('is fixed'), default=False)
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    is_deleted = models.BooleanField(_('is deleted'), default=False)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.type_sign}{self.amount} {self.title}'

    @property
    def type_sign(self):
        return '+' if self.transaction_type == self.INCOME else '-'

    @property
    def full_category_str(self):
        if not self.category:
            return ''
        return str(self.category)
