import django_filters

from finances.models import Budget, Category, CategoryGroup, Transaction


class ActiveFilterMixin(django_filters.FilterSet):
    """
    `?active=true|false` — active / not active today (see `CategoryQuerySet.active`).
    `?active_on=YYYY-MM-DD` — active on the given day.
    """

    active = django_filters.BooleanFilter(method="filter_active", label="Active today")
    active_on = django_filters.DateFilter(method="filter_active_on", label="Active on date")

    def filter_active(self, queryset, name, value):
        active_ids = queryset.model.objects.active().values("pk")
        return queryset.filter(pk__in=active_ids) if value else queryset.exclude(pk__in=active_ids)

    def filter_active_on(self, queryset, name, value):
        return queryset.filter(pk__in=queryset.model.objects.active(value).values("pk"))


class CategoryGroupFilter(ActiveFilterMixin):
    class Meta:
        model = CategoryGroup
        fields = ["is_active"]


class CategoryFilter(ActiveFilterMixin):
    class Meta:
        model = Category
        fields = ["category_group", "is_active"]


class TransactionFilter(django_filters.FilterSet):
    start_date = django_filters.DateFilter(
        field_name="date", lookup_expr="gte", label="Date on or after"
    )
    end_date = django_filters.DateFilter(
        field_name="date", lookup_expr="lte", label="Date on or before"
    )
    # NumberFilter instead of ModelChoiceFilter: a choice filter would validate IDs against
    # all households and leak which IDs exist. The queryset is already household-scoped.
    category = django_filters.NumberFilter(field_name="category_id")
    category_group = django_filters.NumberFilter(field_name="category__category_group_id")

    class Meta:
        model = Transaction
        fields = [
            "start_date",
            "end_date",
            "category",
            "category_group",
            "transaction_type",
            "is_fixed",
        ]


class BudgetFilter(django_filters.FilterSet):
    category = django_filters.NumberFilter(field_name="category_id")
    year = django_filters.NumberFilter(method="filter_year", label="Budgets overlapping this year")

    class Meta:
        model = Budget
        fields = ["category", "year"]

    def filter_year(self, queryset, name, value):
        return queryset.filter(start_date__year__lte=value, end_date__year__gte=value)
