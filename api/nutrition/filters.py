import django_filters

from nutrition.models import Consumption


class ConsumptionFilter(django_filters.FilterSet):
    # `?date=2026-11-13` for one day, `start_date` / `end_date` for a range (both inclusive).
    date = django_filters.DateFilter(field_name="date", label="Exact date")
    start_date = django_filters.DateFilter(
        field_name="date", lookup_expr="gte", label="Date on or after"
    )
    end_date = django_filters.DateFilter(
        field_name="date", lookup_expr="lte", label="Date on or before"
    )
    # NumberFilter instead of ModelChoiceFilter: a choice filter would validate IDs against
    # all households and leak which IDs exist. The queryset is already household-scoped.
    food = django_filters.NumberFilter(field_name="food_id")
    user = django_filters.NumberFilter(field_name="user_id", label="Member who ate it")

    class Meta:
        model = Consumption
        fields = ["date", "start_date", "end_date", "food", "user"]
