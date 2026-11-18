"""Finance helpers used outside the finances views."""

from datetime import timedelta
from decimal import Decimal

from django.db.models import Case, F, Sum, When

from finances.models import Account, Category, CategoryGroup, Transaction, Transfer

# Starting categories for a new personal household (group -> categories). The user renames,
# switches off or deletes them later through the API; nothing depends on these names.
DEFAULT_CATEGORIES = {
    "Prihodi": ["Plata", "Ostali prihodi"],
    "Stanovanje": ["Kirija", "Režije", "Internet i telefon"],
    "Hrana": ["Namirnice", "Restorani i dostava"],
    "Prevoz": ["Gorivo", "Javni prevoz", "Taksi"],
    "Zdravlje": ["Lekovi", "Lekari", "Sport"],
    "Lično": ["Odeća i obuća", "Nega", "Zabava", "Pokloni"],
    "Ostalo": ["Ostali troškovi"],
}
# Every household starts with one account, so transactions can be entered right away.
DEFAULT_ACCOUNT_NAME = "Tekući račun"


def create_default_categories(household):
    """Create DEFAULT_CATEGORIES in `household`; meant for a brand new, empty household."""
    for group_name, category_names in DEFAULT_CATEGORIES.items():
        group = CategoryGroup.objects.create(household=household, name=group_name)
        Category.objects.bulk_create(
            Category(household=household, category_group=group, name=name)
            for name in category_names
        )


def create_default_finances(household):
    """Seed a brand new household: default categories and one account (balance 0 from today)."""
    create_default_categories(household)
    Account.objects.create(household=household, name=DEFAULT_ACCOUNT_NAME)


def balance_history(accounts, start, end):
    """
    The real balance of `accounts` (together) at the end of each day from `start` to `end`.

    An account counts from its opening_date: that day its opening balance is added, then its
    income, expenses and transfers. Transactions dated before opening_date are history the opening
    balance already contains, so they don't count. A transfer between two of `accounts` cancels
    out; with one account selected it moves that account's balance like income or expense.
    Returns a list of {"date", "net", "balance"}, one item per day, including days without changes.
    """
    accounts = list(accounts)
    ids = [account.pk for account in accounts]
    zero = Decimal("0")
    net_by_day = {}

    def add(day, amount):
        net_by_day[day] = net_by_day.get(day, zero) + amount

    # Everything up to the day before `start`, summed into the starting balance.
    before = start - timedelta(days=1)
    opening = (
        Account.objects.filter(pk__in=ids, opening_date__lte=before)
        .with_balance(before)
        .aggregate(total=Sum("balance"))["total"]
        or zero
    )

    for account in accounts:
        if start <= account.opening_date <= end:
            add(account.opening_date, account.opening_balance)

    signed = Case(When(transaction_type=Transaction.INCOME, then=F("amount")), default=-F("amount"))
    daily = (
        Transaction.objects.filter(
            account_id__in=ids,
            is_deleted=False,
            date__gte=F("account__opening_date"),
            date__range=(start, end),
        )
        .order_by()
        .values("date")
        .annotate(net=Sum(signed))
    )
    for row in daily:
        add(row["date"], row["net"])

    transfers = Transfer.objects.filter(date__range=(start, end)).order_by()
    incoming = transfers.filter(to_account_id__in=ids, date__gte=F("to_account__opening_date"))
    outgoing = transfers.filter(from_account_id__in=ids, date__gte=F("from_account__opening_date"))
    for row in incoming.values("date").annotate(total=Sum("amount")):
        add(row["date"], row["total"])
    for row in outgoing.values("date").annotate(total=Sum("amount")):
        add(row["date"], -row["total"])

    results, balance = [], opening
    for offset in range((end - start).days + 1):
        day = start + timedelta(days=offset)
        net = net_by_day.get(day, zero)
        balance += net
        results.append({"date": day, "net": net, "balance": balance})
    return results
