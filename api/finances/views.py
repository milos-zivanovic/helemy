from datetime import timedelta
from decimal import Decimal

from django.db.models import Case, Count, DecimalField, F, Q, Sum, When
from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from common.mixins import HouseholdModelViewSet
from common.pagination import StandardResultsSetPagination
from common.permissions import IsHouseholdMember
from finances.filters import BudgetFilter, CategoryFilter, CategoryGroupFilter, TransactionFilter
from finances.models import Budget, Category, CategoryGroup, Transaction
from finances.serializers import (
    BalanceHistorySerializer,
    BreakdownSerializer,
    BudgetOverviewSerializer,
    BudgetSerializer,
    CategoryGroupSerializer,
    CategoryListSerializer,
    CategorySerializer,
    TransactionCreateSerializer,
    TransactionSerializer,
    TransactionSuggestionSerializer,
)

MAX_BALANCE_HISTORY_DAYS = 3660  # ~10 years of daily points
MAX_SUGGESTIONS = 10


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
            return CategoryListSerializer
        return CategorySerializer


@extend_schema_view(
    list=extend_schema(tags=["Finances - Transactions"]),
    create=extend_schema(tags=["Finances - Transactions"]),
    retrieve=extend_schema(tags=["Finances - Transactions"]),
    partial_update=extend_schema(tags=["Finances - Transactions"]),
    destroy=extend_schema(tags=["Finances - Transactions"]),
)
class TransactionViewSet(HouseholdModelViewSet):
    queryset = Transaction.objects.select_related(
        "category", "category__category_group", "user"
    ).all()
    serializer_class = TransactionSerializer
    permission_classes = [IsHouseholdMember]
    pagination_class = StandardResultsSetPagination
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
        # Soft delete: keep the row for history, hide it from every endpoint.
        instance.is_deleted = True
        instance.save(update_fields=["is_deleted"])

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())

        totals = queryset.aggregate(
            total_income=Sum("amount", filter=Q(transaction_type=Transaction.INCOME)),
            total_expense=Sum("amount", filter=Q(transaction_type=Transaction.EXPENSE)),
        )
        total_income = totals["total_income"] or 0
        total_expense = totals["total_expense"] or 0

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            response = self.get_paginated_response(serializer.data)
            response.data["total_incomes"] = total_income
            response.data["total_expenses"] = total_expense
            response.data["total"] = total_income - total_expense
            return response

        serializer = self.get_serializer(queryset, many=True)
        return Response(
            {
                "total_incomes": total_income,
                "total_expenses": total_expense,
                "total": total_income - total_expense,
                "results": serializer.data,
            }
        )

    @extend_schema(
        tags=["Finances - Transactions"],
        parameters=[
            OpenApiParameter("q", OpenApiTypes.STR, required=True, description="Part of the title")
        ],
        responses={200: TransactionSuggestionSerializer(many=True)},
    )
    @action(detail=False, methods=["get"], url_path="suggestions", filter_backends=[])
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
            .filter(title__icontains=q, category__in=Category.objects.active())
            .order_by("-date", "-created_at")
            .values(
                "title",
                "transaction_type",
                "category_id",
                "category__name",
                "category__category_group__name",
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
                "is_fixed": row["is_fixed"],
                "last_amount": row["amount"],
            }
            if len(suggestions) == MAX_SUGGESTIONS:
                break
        return Response(TransactionSuggestionSerializer(suggestions.values(), many=True).data)

    @extend_schema(tags=["Finances - Reports"], responses={200: BreakdownSerializer})
    @action(detail=False, methods=["get"], url_path="breakdown")
    def breakdown(self, request):
        """
        Totals per category group, or per category when `category_group` is given.
        Accepts the same filters as the transaction list. Expenses only, unless
        `transaction_type` is passed explicitly. Sorted by total, largest first.
        """
        queryset = self.filter_queryset(self.get_queryset()).order_by()
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

    @extend_schema(tags=["Finances - Reports"], responses={200: BalanceHistorySerializer})
    @action(detail=False, methods=["get"], url_path="balance-history")
    def balance_history(self, request):
        """
        Running balance per day (income minus expenses), starting from 0 at `start_date`.
        Accepts the same filters as the transaction list. Defaults: `start_date` is the
        first matching transaction's date, `end_date` is today. Every day in the range is
        returned, including days without transactions.
        """
        queryset = self.filter_queryset(self.get_queryset()).order_by()
        money = DecimalField(max_digits=12, decimal_places=2)
        daily = queryset.values("date").annotate(
            net=Sum(
                Case(
                    When(transaction_type=Transaction.INCOME, then=F("amount")),
                    default=-F("amount"),
                    output_field=money,
                )
            )
        )
        net_by_day = {row["date"]: row["net"] for row in daily}

        # The filter backend has already rejected malformed dates.
        start = parse_date(request.query_params.get("start_date", "")) or min(
            net_by_day, default=None
        )
        end = parse_date(request.query_params.get("end_date", "")) or timezone.localdate()
        if start is None:
            return Response(
                BalanceHistorySerializer({"start_date": None, "end_date": end, "results": []}).data
            )
        if start > end:
            raise ValidationError({"end_date": "End date must be on or after start date."})
        if (end - start).days > MAX_BALANCE_HISTORY_DAYS:
            raise ValidationError(
                {"start_date": f"Range is limited to {MAX_BALANCE_HISTORY_DAYS} days."}
            )

        results, balance = [], Decimal("0")
        for offset in range((end - start).days + 1):
            day = start + timedelta(days=offset)
            net = net_by_day.get(day, Decimal("0"))
            balance += net
            results.append({"date": day, "net": net, "balance": balance})
        data = {"start_date": start, "end_date": end, "results": results}
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

    @extend_schema(tags=["Finances - Budgets"], responses={200: BudgetOverviewSerializer})
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

    @extend_schema(tags=["Finances - Budgets"])
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
