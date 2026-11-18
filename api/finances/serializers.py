import calendar

from django.utils import timezone
from drf_spectacular.utils import extend_schema_field, extend_schema_serializer
from rest_framework import serializers

from common.fields import HouseholdPrimaryKeyRelatedField
from finances.models import Account, Budget, Category, CategoryGroup, Transaction, Transfer
from users.serializers import UserSerializer


class CategoryGroupSerializer(serializers.ModelSerializer):
    # Annotated in CategoryGroupViewSet.get_queryset
    categories_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = CategoryGroup
        fields = ["id", "name", "is_active", "categories_count", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class CurrentBudgetSerializer(serializers.Serializer):
    """Schema of `CategorySerializer.current_budget`."""

    id = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=8, decimal_places=2)
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    description = serializers.CharField()
    spent = serializers.DecimalField(max_digits=12, decimal_places=2)
    percentage = serializers.DecimalField(max_digits=7, decimal_places=2)


class CategorySerializer(serializers.ModelSerializer):
    category_group = CategoryGroupSerializer(read_only=True)
    category_group_id = HouseholdPrimaryKeyRelatedField(
        queryset=CategoryGroup.objects.all(),
        source="category_group",
        write_only=True,
    )
    # Annotated in CategoryViewSet.get_queryset
    transactions_count = serializers.IntegerField(read_only=True)
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)
    start_month = serializers.IntegerField(
        required=False, allow_null=True, min_value=1, max_value=12
    )
    start_day = serializers.IntegerField(required=False, allow_null=True, min_value=1, max_value=31)
    end_month = serializers.IntegerField(required=False, allow_null=True, min_value=1, max_value=12)
    end_day = serializers.IntegerField(required=False, allow_null=True, min_value=1, max_value=31)
    current_budget = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = [
            "id",
            "name",
            "is_active",
            "category_group",
            "category_group_id",
            "start_date",
            "end_date",
            "start_month",
            "start_day",
            "end_month",
            "end_day",
            "transactions_count",
            "total_amount",
            "current_budget",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        attrs = super().validate(attrs)

        def current(field):
            return attrs.get(field, getattr(self.instance, field, None))

        start_date, end_date = current("start_date"), current("end_date")
        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError(
                {"end_date": "End date must be on or after start date."}
            )

        for prefix in ("start", "end"):
            month, day = current(f"{prefix}_month"), current(f"{prefix}_day")
            if (month is None) != (day is None):
                raise serializers.ValidationError(
                    {f"{prefix}_day": f"Set both {prefix}_month and {prefix}_day, or neither."}
                )
            # 2024 is a leap year, so 29 February is allowed.
            if month is not None and day > calendar.monthrange(2024, month)[1]:
                raise serializers.ValidationError(
                    {f"{prefix}_day": f"Month {month} has no day {day}."}
                )
        return attrs

    @extend_schema_field(CurrentBudgetSerializer(allow_null=True))
    def get_current_budget(self, obj):
        budget = obj.current_budget()
        if budget:
            return {
                "id": budget.id,
                "amount": budget.amount,
                "start_date": budget.start_date,
                "end_date": budget.end_date,
                "description": budget.description,
                "spent": budget.total_spent,
                "percentage": budget.percentage_spent,
            }
        return None


class CategoryListSerializer(serializers.ModelSerializer):
    # Lets a client label categories "Group / Category" (e.g. a transaction form) without
    # fetching the groups separately.
    category_group_name = serializers.CharField(source="category_group.name", read_only=True)

    class Meta:
        model = Category
        fields = ["id", "name", "category_group", "category_group_name", "is_active"]


class CategoryListItemSerializer(CategoryListSerializer):
    """
    Row of the category list: the select fields plus the activity rules and usage, enough to manage
    categories. `active_today` and `transactions_count` are annotated in CategoryViewSet.get_queryset.
    """

    active_today = serializers.BooleanField(read_only=True)
    transactions_count = serializers.IntegerField(read_only=True)

    class Meta(CategoryListSerializer.Meta):
        fields = CategoryListSerializer.Meta.fields + [
            "active_today",
            "start_date",
            "end_date",
            "start_month",
            "start_day",
            "end_month",
            "end_day",
            "transactions_count",
        ]
        read_only_fields = fields


class AccountSerializer(serializers.ModelSerializer):
    # Annotated by AccountQuerySet.with_balance(): the balance at the end of today.
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Account
        fields = [
            "id",
            "name",
            "opening_balance",
            "opening_date",
            "balance",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "balance", "created_at"]


class AccountListSerializer(serializers.ModelSerializer):
    """Short form nested in transactions and transfers."""

    class Meta:
        model = Account
        fields = ["id", "name"]
        read_only_fields = fields


def validate_active_account(serializer, attrs, field, source):
    """A new or changed account reference must point to an active account (archived = read-only)."""
    account = attrs.get(source)
    if account is None or account.is_active:
        return
    if serializer.instance is not None and getattr(serializer.instance, source) == account:
        return  # editing something else on an old record of an archived account
    raise serializers.ValidationError({field: f'Account "{account.name}" is archived.'})


class ActiveCategoryValidationMixin:
    """The category must be active on the transaction's date (checked only when either changes)."""

    def validate(self, attrs):
        attrs = super().validate(attrs)
        validate_active_account(self, attrs, "account_id", "account")
        if self.instance is not None and "category" not in attrs and "date" not in attrs:
            return attrs  # editing e.g. the title of an old transaction in an archived category

        category = attrs.get("category", getattr(self.instance, "category", None))
        transaction_date = (
            attrs.get("date", getattr(self.instance, "date", None)) or timezone.localdate()
        )
        if (
            category
            and not Category.objects.active(transaction_date).filter(pk=category.pk).exists()
        ):
            raise serializers.ValidationError(
                {"category_id": f'Category "{category.name}" is not active on {transaction_date}.'}
            )
        return attrs


class TransactionSerializer(ActiveCategoryValidationMixin, serializers.ModelSerializer):
    category = CategoryListSerializer(read_only=True)
    category_id = HouseholdPrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        source="category",
        write_only=True,
    )
    account = AccountListSerializer(read_only=True)
    account_id = HouseholdPrimaryKeyRelatedField(
        queryset=Account.objects.all(),
        source="account",
        write_only=True,
    )
    user = UserSerializer(read_only=True)
    type_display = serializers.CharField(source="get_transaction_type_display", read_only=True)
    type_sign = serializers.CharField(read_only=True)

    class Meta:
        model = Transaction
        fields = [
            "id",
            "transaction_type",
            "type_display",
            "type_sign",
            "title",
            "description",
            "amount",
            "date",
            "category",
            "category_id",
            "account",
            "account_id",
            "user",
            "is_fixed",
            "is_deleted",
            "created_at",
        ]
        # Deleting goes through DELETE (soft delete), not by PATCHing is_deleted.
        read_only_fields = ["id", "user", "is_deleted", "created_at"]


class TransactionCreateSerializer(ActiveCategoryValidationMixin, serializers.ModelSerializer):
    category_id = HouseholdPrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        source="category",
        write_only=True,
    )
    account_id = HouseholdPrimaryKeyRelatedField(
        queryset=Account.objects.all(),
        source="account",
        write_only=True,
    )

    class Meta:
        model = Transaction
        fields = [
            "id",
            "transaction_type",
            "title",
            "description",
            "amount",
            "date",
            "category_id",
            "account_id",
            "is_fixed",
        ]
        read_only_fields = ["id"]

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        return super().create(validated_data)


class BudgetSerializer(serializers.ModelSerializer):
    category = CategoryListSerializer(read_only=True)
    category_id = HouseholdPrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        source="category",
        write_only=True,
    )
    spent = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True, source="total_spent"
    )
    percentage = serializers.DecimalField(
        max_digits=7, decimal_places=2, read_only=True, source="percentage_spent"
    )

    class Meta:
        model = Budget
        fields = [
            "id",
            "description",
            "amount",
            "start_date",
            "end_date",
            "category",
            "category_id",
            "spent",
            "percentage",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = self.instance
        category = attrs.get("category", getattr(instance, "category", None))
        start_date = attrs.get("start_date", getattr(instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(instance, "end_date", None))

        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError(
                {"end_date": "End date must be on or after start date."}
            )

        if category and start_date and end_date:
            overlapping = Budget.objects.filter(
                category=category,
                start_date__lte=end_date,
                end_date__gte=start_date,
            )
            if instance is not None:
                overlapping = overlapping.exclude(pk=instance.pk)
            if overlapping.exists():
                raise serializers.ValidationError(
                    "This category already has a budget that overlaps the given period."
                )
        return attrs


# --- Read-only response shapes for summary/report endpoints -----------------


# many=False: the list action returns this one object, not a (paginated) list of them.
@extend_schema_serializer(many=False)
class BudgetOverviewSerializer(serializers.Serializer):
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_spent = serializers.DecimalField(max_digits=12, decimal_places=2)
    percentage = serializers.DecimalField(max_digits=7, decimal_places=2)
    results = BudgetSerializer(many=True)


class TransactionTotalsSerializer(serializers.Serializer):
    """Totals added to the transaction list (see finances.pagination.TransactionPagination)."""

    total_incomes = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_expenses = serializers.DecimalField(max_digits=12, decimal_places=2)
    total = serializers.DecimalField(max_digits=12, decimal_places=2)


class TransactionSuggestionSerializer(serializers.Serializer):
    title = serializers.CharField()
    transaction_type = serializers.ChoiceField(choices=Transaction.TRANSACTION_TYPES)
    category_id = serializers.IntegerField()
    category_name = serializers.CharField()
    category_group_name = serializers.CharField()
    account_id = serializers.IntegerField()
    is_fixed = serializers.BooleanField()
    last_amount = serializers.DecimalField(max_digits=8, decimal_places=2)


class BreakdownItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    total = serializers.DecimalField(max_digits=12, decimal_places=2)


class BreakdownSerializer(serializers.Serializer):
    group_by = serializers.ChoiceField(choices=["category_group", "category"])
    total = serializers.DecimalField(max_digits=12, decimal_places=2)
    results = BreakdownItemSerializer(many=True)


class BalanceDaySerializer(serializers.Serializer):
    date = serializers.DateField()
    net = serializers.DecimalField(max_digits=12, decimal_places=2)
    balance = serializers.DecimalField(max_digits=12, decimal_places=2)


class BalanceHistorySerializer(serializers.Serializer):
    start_date = serializers.DateField(allow_null=True)
    end_date = serializers.DateField()
    results = BalanceDaySerializer(many=True)


class BalanceHistoryQuerySerializer(serializers.Serializer):
    """Query parameters of balance-history (validated here: the action has no filter backends)."""

    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)
    account = HouseholdPrimaryKeyRelatedField(queryset=Account.objects.all(), required=False)


class TransferSerializer(serializers.ModelSerializer):
    from_account = AccountListSerializer(read_only=True)
    to_account = AccountListSerializer(read_only=True)
    from_account_id = HouseholdPrimaryKeyRelatedField(
        queryset=Account.objects.all(), source="from_account", write_only=True
    )
    to_account_id = HouseholdPrimaryKeyRelatedField(
        queryset=Account.objects.all(), source="to_account", write_only=True
    )
    user = UserSerializer(read_only=True)

    class Meta:
        model = Transfer
        fields = [
            "id",
            "from_account",
            "from_account_id",
            "to_account",
            "to_account_id",
            "amount",
            "date",
            "description",
            "user",
            "created_at",
        ]
        read_only_fields = ["id", "user", "created_at"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        validate_active_account(self, attrs, "from_account_id", "from_account")
        validate_active_account(self, attrs, "to_account_id", "to_account")
        source = attrs.get("from_account", getattr(self.instance, "from_account", None))
        target = attrs.get("to_account", getattr(self.instance, "to_account", None))
        if source is not None and source == target:
            raise serializers.ValidationError(
                {"to_account_id": "Choose an account other than the source account."}
            )
        return attrs

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        return super().create(validated_data)
