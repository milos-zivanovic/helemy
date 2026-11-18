"""Finance helpers used outside the finances views."""

from datetime import timedelta
from decimal import Decimal

from django.db import transaction as db_transaction
from django.db.models import Case, F, Min, Sum, When
from django.utils import timezone

from finances.models import Account, Category, CategoryGroup, Transaction

# Starting categories for a new household (group -> categories), taken from the old wallet app.
# An entry is a category name, or (name, (start_month, start_day, end_month, end_day)) for a
# category active only in that window each year (see CategoryQuerySet.active). The user renames,
# switches off or deletes them later through the API; nothing depends on these names.
DEFAULT_CATEGORIES = {
    "Ostalo": ["Ostalo", "Izjednačavanje balansa"],
    "Nabavka": ["Hrana, piće i kućna hemija"],
    "Kuća": ["Računi", "Ulaganja", "Troškovi", ("Grejanje", (5, 1, 8, 1))],
    "Zdravlje": ["Apoteka"],
    "Auto": ["Gorivo"],
    "Kompjuteri i mobilni": ["Mesečna rata"],
    "Plata": ["Mesečna plata"],
    "Deca": ["Vrtić", "Igračke", "Ostalo", "Stvari", "Rođendani"],
    "Posete i veselja": ["Ostalo"],
    "Kredit": ["Mesečno zaduženje"],
    "Putovanja": [("Letovanje", (5, 1, 9, 1)), ("Zimovanje", (1, 1, 3, 1))],
}
# Every household starts with one account, so transactions can be entered right away.
DEFAULT_ACCOUNT_NAME = "Tekući račun"
# Where transfer legs go (see transfer_category). Created with the defaults, or on the first transfer.
TRANSFER_GROUP_NAME = "Ostalo"
TRANSFER_CATEGORY_NAME = "Prenos"


def create_default_categories(household):
    """Create DEFAULT_CATEGORIES in `household`; meant for a brand new, empty household."""
    for group_name, entries in DEFAULT_CATEGORIES.items():
        group = CategoryGroup.objects.create(household=household, name=group_name)
        categories = []
        for entry in entries:
            name, window = entry if isinstance(entry, tuple) else (entry, None)
            category = Category(household=household, category_group=group, name=name)
            if window:
                (
                    category.start_month,
                    category.start_day,
                    category.end_month,
                    category.end_day,
                ) = window
            categories.append(category)
        Category.objects.bulk_create(categories)


def create_default_finances(household):
    """Seed a brand new household: default categories, the transfer category and one account
    (balance 0 from today)."""
    create_default_categories(household)
    transfer_category(household)
    Account.objects.create(household=household, name=DEFAULT_ACCOUNT_NAME)


# --- transfers --------------------------------------------------------------------------------
# A transfer is two transactions pointing at each other (Transaction.transfer_pair): an expense
# on the source account and an income on the target. Everything that changes them goes through
# these functions, so the two legs always agree.


def transfer_category(household):
    """
    The household's category for transfer legs (`is_transfer`). Created on first use, as
    "Prenos" in the "Ostalo" group (the group too, if it's gone). The user may rename it later.
    """
    category = Category.objects.filter(household=household, is_transfer=True).first()
    if category is None:
        group = CategoryGroup.objects.filter(
            household=household, name=TRANSFER_GROUP_NAME
        ).first() or CategoryGroup.objects.create(household=household, name=TRANSFER_GROUP_NAME)
        category = Category.objects.create(
            household=household,
            category_group=group,
            name=TRANSFER_CATEGORY_NAME,
            is_transfer=True,
        )
    return category


def transfer_legs(leg):
    """(outgoing, incoming): the two transactions of the transfer that `leg` belongs to."""
    if leg.transaction_type == Transaction.EXPENSE:
        return leg, leg.transfer_pair
    return leg.transfer_pair, leg


def _outgoing_title(target):
    return f"Prenos na {target.name}"[:100]


def _incoming_title(source):
    return f"Prenos sa {source.name}"[:100]


@db_transaction.atomic
def create_transfer(
    *, household, user, from_account, to_account, amount, date=None, description=""
):
    """Move `amount` from one account to another: two linked transactions. Returns the outgoing one."""
    common = {
        "household": household,
        "user": user,
        "category": transfer_category(household),
        "amount": amount,
        "date": date or timezone.localdate(),
        "description": description,
    }
    outgoing = Transaction.objects.create(
        transaction_type=Transaction.EXPENSE,
        account=from_account,
        title=_outgoing_title(to_account),
        **common,
    )
    incoming = Transaction.objects.create(
        transaction_type=Transaction.INCOME,
        account=to_account,
        title=_incoming_title(from_account),
        transfer_pair=outgoing,
        **common,
    )
    outgoing.transfer_pair = incoming
    outgoing.save(update_fields=["transfer_pair"])
    return outgoing


@db_transaction.atomic
def update_transfer(leg, *, from_account=None, to_account=None, **changes):
    """
    Change the transfer that `leg` belongs to. `changes` (amount, date, description) go to both
    legs; `from_account` to the outgoing leg, `to_account` to the incoming one. Returns the
    outgoing leg.
    """
    outgoing, incoming = transfer_legs(leg)
    if from_account is not None:
        outgoing.account = from_account
    if to_account is not None:
        incoming.account = to_account
    outgoing.title = _outgoing_title(incoming.account)
    incoming.title = _incoming_title(outgoing.account)
    for each in (outgoing, incoming):
        for field, value in changes.items():
            setattr(each, field, value)
        each.save()
    return outgoing


def delete_transfer(leg):
    """Soft-delete both legs of the transfer that `leg` belongs to."""
    Transaction.objects.filter(pk__in=[leg.pk, leg.transfer_pair_id]).update(is_deleted=True)


def refresh_transfer_titles(account):
    """After `account` was renamed: the legs whose title names it ("Prenos na/sa <name>")."""
    legs = Transaction.objects.filter(transfer_pair__account=account)
    legs.filter(transaction_type=Transaction.EXPENSE).update(title=_outgoing_title(account))
    legs.filter(transaction_type=Transaction.INCOME).update(title=_incoming_title(account))


def first_balance_date(accounts):
    """The first day that changes the balance of `accounts`: an opening date or the oldest
    transaction. None when there are no accounts."""
    ids = [account.pk for account in accounts]
    dates = [account.opening_date for account in accounts]
    dates.append(
        Transaction.objects.filter(account_id__in=ids, is_deleted=False).aggregate(d=Min("date"))[
            "d"
        ]
    )
    return min((d for d in dates if d), default=None)


def balance_history(accounts, start, end):
    """
    The real balance of `accounts` (together) at the end of each day from `start` to `end`.

    Every transaction counts on its own date, however old; an account's opening balance is added
    on its opening_date (see AccountQuerySet.with_balance). A transfer between two of `accounts`
    cancels out (its two legs); with one account selected its leg moves that account's balance.
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
        Account.objects.filter(pk__in=ids)
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
            date__range=(start, end),
        )
        .order_by()
        .values("date")
        .annotate(net=Sum(signed))
    )
    for row in daily:
        add(row["date"], row["net"])

    results, balance = [], opening
    for offset in range((end - start).days + 1):
        day = start + timedelta(days=offset)
        net = net_by_day.get(day, zero)
        balance += net
        results.append({"date": day, "net": net, "balance": balance})
    return results
