from decimal import Decimal

from django.db.models import Count, Exists, OuterRef, Q, Sum
from django.utils import timezone
from django.utils.translation import gettext as _
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from common.mixins import HouseholdModelViewSet
from common.pagination import StandardResultsSetPagination
from common.permissions import IsHouseholdMember
from finances.filters import (
    BudgetFilter,
    CategoryFilter,
    CategoryGroupFilter,
    TransactionFilter,
    TransferFilter,
)
from finances.models import Account, Budget, Category, CategoryGroup, Transaction
from finances.pagination import TransactionPagination
from finances.serializers import (
    AccountSerializer,
    BalanceHistoryQuerySerializer,
    BalanceHistorySerializer,
    BreakdownSerializer,
    BudgetOverviewSerializer,
    BudgetSerializer,
    CategoryGroupSerializer,
    CategoryListItemSerializer,
    CategorySerializer,
    TransactionCreateSerializer,
    TransactionSerializer,
    TransactionSuggestionSerializer,
    TransactionTotalsSerializer,
    TransferSerializer,
)
from finances.services import (
    balance_history,
    delete_transfer,
    first_balance_date,
    refresh_transfer_titles,
)

MAX_BALANCE_HISTORY_DAYS = 3660  # ~10 years of daily points
MAX_SUGGESTIONS = 10

# The report actions apply TransactionFilter like the list does, but drf-spectacular documents filter
# parameters only on list views, so they are listed here explicitly.
TRANSACTION_FILTER_PARAMETERS = [
    OpenApiParameter("start_date", OpenApiTypes.DATE, description="Date on or after"),
    OpenApiParameter("end_date", OpenApiTypes.DATE, description="Date on or before"),
    OpenApiParameter("category", OpenApiTypes.INT),
    OpenApiParameter("category_group", OpenApiTypes.INT),
    OpenApiParameter("account", OpenApiTypes.INT),
    OpenApiParameter(
        "transaction_type",
        OpenApiTypes.STR,
        enum=[Transaction.INCOME, Transaction.EXPENSE, "transfer"],
        description="income / expense: without transfers; transfer: only transfer legs",
    ),
    OpenApiParameter("is_fixed", OpenApiTypes.BOOL),
    OpenApiParameter("search", OpenApiTypes.STR, description="Part of the title or description"),
]


@extend_schema_view(
    list=extend_schema(tags=["Finances - Categories"]),
    create=extend_schema(tags=["Finances - Categories"]),
    retrieve=extend_schema(tags=["Finances - Categories"]),
    partial_update=extend_schema(tags=["Finances - Categories"]),
    destroy=extend_schema(tags=["Finances - Categories"]),
)
class CategoryGroupViewSet(HouseholdModelViewSet):
    queryset = CategoryGroup.objects.annotate(categories_count=Count("categories"))
    serializer_class = CategoryGroupSerializer
    permission_classes = [IsHouseholdMember]
    pagination_class = StandardResultsSetPagination
    ordering = ["name"]
    ordering_fields = ["name", "created_at"]
    filterset_class = CategoryGroupFilter
    search_fields = ["name"]

    def perform_destroy(self, instance):
        # Deleting a group cascades to its categories and their transactions: refuse while any of
        # them is in use, so a click can't wipe out history. Switching the group off hides it instead.
        if Transaction.objects.filter(category__category_group=instance, is_deleted=False).exists():
            raise ValidationError(
                {"detail": _("This group has categories with transactions. Switch it off instead.")}
            )
        instance.delete()


@extend_schema_view(
    list=extend_schema(tags=["Finances - Categories"]),
    create=extend_schema(tags=["Finances - Categories"]),
    retrieve=extend_schema(tags=["Finances - Categories"]),
    partial_update=extend_schema(tags=["Finances - Categories"]),
    destroy=extend_schema(tags=["Finances - Categories"]),
)
class CategoryViewSet(HouseholdModelViewSet):
    queryset = Category.objects.select_related("category_group").annotate(
        transactions_count=Count("transactions", filter=Q(transactions__is_deleted=False)),
        total_amount=Sum("transactions__amount", filter=Q(transactions__is_deleted=False)),
    )
    serializer_class = CategorySerializer
    permission_classes = [IsHouseholdMember]
    pagination_class = StandardResultsSetPagination
    ordering = ["category_group", "name"]
    ordering_fields = ["name", "created_at"]
    filterset_class = CategoryFilter
    search_fields = ["name"]

    def get_serializer_class(self):
        if self.action == "list":
            return CategoryListItemSerializer
        return CategorySerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "list":
            # Same rules as Category.objects.active(), evaluated per row inside the list query.
            active = Category.objects.active().filter(pk=OuterRef("pk"))
            queryset = queryset.annotate(active_today=Exists(active))
        return queryset

    def perform_destroy(self, instance):
        # The category's transactions would be deleted with it (CASCADE): refuse, see above.
        if instance.transactions.filter(is_deleted=False).exists():
            raise ValidationError(
                {"detail": _("This category has transactions. Switch it off instead.")}
            )
        instance.delete()


@extend_schema_view(
    list=extend_schema(tags=["Finances - Transactions"]),
    create=extend_schema(tags=["Finances - Transactions"]),
    retrieve=extend_schema(tags=["Finances - Transactions"]),
    partial_update=extend_schema(tags=["Finances - Transactions"]),
    destroy=extend_schema(tags=["Finances - Transactions"]),
)
class TransactionViewSet(HouseholdModelViewSet):
    queryset = Transaction.objects.select_related(
        "category", "category__category_group", "account", "user", "transfer_pair__account"
    ).all()
    serializer_class = TransactionSerializer
    permission_classes = [IsHouseholdMember]
    pagination_class = TransactionPagination
    ordering = ["-date", "-created_at"]
    ordering_fields = ["amount", "date", "created_at"]
    filterset_class = TransactionFilter
    search_fields = ["title", "description"]

    def get_serializer_class(self):
        if self.action == "create":
            return TransactionCreateSerializer
        return TransactionSerializer

    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)

    def perform_destroy(self, instance):
        # Soft delete: keep the row for history, hide it from every endpoint. A transfer leg takes
        # the other leg with it.
        if instance.transfer_pair_id:
            delete_transfer(instance)
            return
        instance.is_deleted = True
        instance.save(update_fields=["is_deleted"])

    @staticmethod
    def _totals(queryset):
        """
        Totals over the whole (filtered) queryset. Income and expenses leave transfer legs out
        (moving money isn't earning or spending it); `total_transfers` is their net: legs into
        minus out of the listed accounts, so 0 when both legs are listed. `total` is the change of
        the listed accounts' balance: income - expenses + transfers.
        """
        leg = Q(transfer_pair__isnull=False)
        income = Q(transaction_type=Transaction.INCOME)
        expense = Q(transaction_type=Transaction.EXPENSE)
        totals = {
            key: value or Decimal("0")
            for key, value in queryset.aggregate(
                incomes=Sum("amount", filter=income & ~leg),
                expenses=Sum("amount", filter=expense & ~leg),
                legs_in=Sum("amount", filter=income & leg),
                legs_out=Sum("amount", filter=expense & leg),
            ).items()
        }
        transfers = totals["legs_in"] - totals["legs_out"]
        return TransactionTotalsSerializer(
            {
                "total_incomes": totals["incomes"],
                "total_expenses": totals["expenses"],
                "total_transfers": transfers,
                "total": totals["incomes"] - totals["expenses"] + transfers,
            }
        ).data

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        totals_data = self._totals(queryset)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            response = self.get_paginated_response(serializer.data)
            response.data.update(totals_data)
            return response

        serializer = self.get_serializer(queryset, many=True)
        return Response({**totals_data, "results": serializer.data})

    @extend_schema(
        tags=["Finances - Transactions"],
        parameters=[
            OpenApiParameter("q", OpenApiTypes.STR, required=True, description="Part of the title")
        ],
        responses={200: TransactionSuggestionSerializer(many=True)},
    )
    @action(
        detail=False,
        methods=["get"],
        url_path="suggestions",
        filter_backends=[],
        pagination_class=None,
    )
    def suggestions(self, request):
        """
        Title autocomplete for quick entry. One entry per distinct title (case-insensitive),
        taken from its most recent transaction, so the client can prefill type, category,
        is_fixed and amount. Titles whose last category is no longer active are skipped.
        """
        q = request.query_params.get("q", "").strip()
        if not q:
            return Response([])

        rows = (
            self.get_queryset()
            .filter(title__icontains=q, transfer_pair__isnull=True)
            .filter(category__in=Category.objects.active().filter(is_transfer=False))
            .order_by("-date", "-created_at")
            .values(
                "title",
                "transaction_type",
                "category_id",
                "category__name",
                "category__category_group__name",
                "account_id",
                "is_fixed",
                "amount",
            )[:200]
        )
        suggestions = {}
        for row in rows:
            key = row["title"].casefold()
            if key in suggestions:
                continue
            suggestions[key] = {
                "title": row["title"],
                "transaction_type": row["transaction_type"],
                "category_id": row["category_id"],
                "category_name": row["category__name"],
                "category_group_name": row["category__category_group__name"],
                "account_id": row["account_id"],
                "is_fixed": row["is_fixed"],
                "last_amount": row["amount"],
            }
            if len(suggestions) == MAX_SUGGESTIONS:
                break
        return Response(TransactionSuggestionSerializer(suggestions.values(), many=True).data)

    @extend_schema(
        tags=["Finances - Reports"],
        parameters=TRANSACTION_FILTER_PARAMETERS,
        responses={200: BreakdownSerializer},
    )
    @action(detail=False, methods=["get"], url_path="breakdown")
    def breakdown(self, request):
        """
        Totals per category group, or per category when `category_group` is given.
        Accepts the same filters as the transaction list. Expenses only, unless
        `transaction_type` is passed explicitly; transfers never count. Sorted by total, largest
        first.
        """
        queryset = (
            self.filter_queryset(self.get_queryset()).filter(transfer_pair__isnull=True).order_by()
        )
        if "transaction_type" not in request.query_params:
            queryset = queryset.filter(transaction_type=Transaction.EXPENSE)

        if request.query_params.get("category_group"):
            group_by, id_field, name_field = "category", "category_id", "category__name"
        else:
            group_by, id_field, name_field = (
                "category_group",
                "category__category_group_id",
                "category__category_group__name",
            )

        rows = (
            queryset.values(id_field, name_field)
            .annotate(total=Sum("amount"))
            .order_by("-total", name_field)
        )
        results = [{"id": r[id_field], "name": r[name_field], "total": r["total"]} for r in rows]
        data = {
            "group_by": group_by,
            "total": sum((r["total"] for r in results), Decimal("0")),
            "results": results,
        }
        return Response(BreakdownSerializer(data).data)

    @extend_schema(
        tags=["Finances - Reports"],
        parameters=[BalanceHistoryQuerySerializer],
        responses={200: BalanceHistorySerializer},
    )
    @action(detail=False, methods=["get"], url_path="balance-history", filter_backends=[])
    def balance_history(self, request):
        """
        The real balance per day: one account (`account`) or all the household's accounts.
        Every transaction (transfer legs too) counts on its date; an account's opening balance
        is added on its opening date (see finances.services.balance_history). Defaults:
        `start_date` is the first day that changes the balance (an opening date or the oldest
        transaction), `end_date` is today. Every day in the range is returned, including days
        without changes.
        """
        params = BalanceHistoryQuerySerializer(
            data=request.query_params, context=self.get_serializer_context()
        )
        params.is_valid(raise_exception=True)
        account = params.validated_data.get("account")
        accounts = (
            [account]
            if account
            else list(Account.objects.filter(household=request.user.get_active_household()))
        )
        start = params.validated_data.get("start_date") or first_balance_date(accounts)
        end = params.validated_data.get("end_date") or timezone.localdate()
        if start is None:
            return Response(
                BalanceHistorySerializer({"start_date": None, "end_date": end, "results": []}).data
            )
        if start > end:
            raise ValidationError({"end_date": _("End date must be on or after start date.")})
        if (end - start).days > MAX_BALANCE_HISTORY_DAYS:
            raise ValidationError(
                {
                    "start_date": _("Range is limited to %(days)s days.")
                    % {"days": MAX_BALANCE_HISTORY_DAYS}
                }
            )
        data = {
            "start_date": start,
            "end_date": end,
            "results": balance_history(accounts, start, end),
        }
        return Response(BalanceHistorySerializer(data).data)


@extend_schema_view(
    create=extend_schema(tags=["Finances - Budgets"]),
    retrieve=extend_schema(tags=["Finances - Budgets"]),
    partial_update=extend_schema(tags=["Finances - Budgets"]),
    destroy=extend_schema(tags=["Finances - Budgets"]),
)
class BudgetViewSet(HouseholdModelViewSet):
    queryset = Budget.objects.with_spent().select_related("category", "category__category_group")
    serializer_class = BudgetSerializer
    permission_classes = [IsHouseholdMember]
    pagination_class = (
        StandardResultsSetPagination  # used by `all/`; `list` returns active budgets unpaginated
    )
    ordering = ["-start_date", "category__name"]
    ordering_fields = ["start_date", "amount", "created_at"]
    filterset_class = BudgetFilter
    search_fields = ["category__name", "description"]

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "list":
            today = timezone.localdate()
            queryset = queryset.filter(start_date__lte=today, end_date__gte=today)
        return queryset

    @extend_schema(
        tags=["Finances - Budgets"],
        responses={200: BudgetOverviewSerializer},
        # Unpaginated, although the viewset has a paginator (for all/).
        parameters=[
            OpenApiParameter("page", exclude=True),
            OpenApiParameter("page_size", exclude=True),
        ],
    )
    def list(self, request, *args, **kwargs):
        """
        Budgets active today with overall totals (unpaginated, there are only a handful).
        Sorted by percentage spent, highest first; untouched budgets by amount, largest first.
        """
        budgets = sorted(
            self.filter_queryset(self.get_queryset()),
            key=lambda b: (-b.percentage_spent, -b.amount if b.percentage_spent == 0 else 0),
        )
        total_amount = sum((b.amount for b in budgets), Decimal("0"))
        total_spent = sum((b.total_spent for b in budgets), Decimal("0"))
        data = {
            "total_amount": total_amount,
            "total_spent": total_spent,
            "percentage": (total_spent / total_amount * 100) if total_amount else Decimal("0"),
            "results": budgets,
        }
        return Response(BudgetOverviewSerializer(data, context=self.get_serializer_context()).data)

    @extend_schema(tags=["Finances - Budgets"], responses={200: BudgetSerializer(many=True)})
    @action(detail=False, methods=["get"], url_path="all")
    def all_budgets(self, request):
        """All budgets, paginated. Use `?year=2026` for the budgets overlapping a year."""
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(tags=["Finances - Accounts"]),
    create=extend_schema(tags=["Finances - Accounts"]),
    retrieve=extend_schema(tags=["Finances - Accounts"]),
    partial_update=extend_schema(tags=["Finances - Accounts"]),
    destroy=extend_schema(tags=["Finances - Accounts"]),
)
class AccountViewSet(HouseholdModelViewSet):
    """Where money is kept. `balance` is today's balance; archive (is_active=false) instead of deleting."""

    queryset = Account.objects.all()
    serializer_class = AccountSerializer
    permission_classes = [IsHouseholdMember]
    pagination_class = None  # a household has a handful of accounts
    filter_backends = []
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return super().get_queryset().with_balance().order_by("-is_active", "name")

    def perform_update(self, serializer):
        old_name = serializer.instance.name
        account = serializer.save()
        if account.name != old_name:
            refresh_transfer_titles(account)

    def perform_destroy(self, instance):
        # Only an unused account can be deleted (transfers are transactions too). Soft-deleted
        # transactions are hidden history: they go with it (the database protects accounts that
        # still have any transaction).
        if instance.transactions.filter(is_deleted=False).exists():
            raise ValidationError(
                {"detail": _("This account has transactions. Archive it instead.")}
            )
        instance.transactions.all().delete()
        instance.delete()


@extend_schema_view(
    list=extend_schema(tags=["Finances - Accounts"]),
    create=extend_schema(tags=["Finances - Accounts"]),
    retrieve=extend_schema(tags=["Finances - Accounts"]),
    partial_update=extend_schema(tags=["Finances - Accounts"]),
    destroy=extend_schema(tags=["Finances - Accounts"]),
)
class TransferViewSet(HouseholdModelViewSet):
    """
    Money moved between two accounts of the household: a pair of linked transactions (see
    finances.models.Transaction), handled here as one object. The legs also appear in the
    transaction list. `<id>` is either leg's id; the list has one row per transfer.
    """

    queryset = Transaction.objects.filter(
        transfer_pair__isnull=False, is_deleted=False
    ).select_related("account", "user", "transfer_pair__account", "transfer_pair__user")
    serializer_class = TransferSerializer
    permission_classes = [IsHouseholdMember]
    pagination_class = StandardResultsSetPagination
    filterset_class = TransferFilter
    ordering = ["-date", "-created_at"]
    ordering_fields = ["amount", "date", "created_at"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "list":
            queryset = queryset.filter(transaction_type=Transaction.EXPENSE)  # the outgoing legs
        return queryset

    def perform_destroy(self, instance):
        delete_transfer(instance)
