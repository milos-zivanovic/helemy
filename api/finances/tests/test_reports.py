from datetime import date
from decimal import Decimal

from common.testing import HouseholdAPITestCase
from finances.models import Account, Category, CategoryGroup, Transaction

TRANSACTIONS_URL = "/api/finances/transactions/"
CATEGORIES_URL = "/api/finances/categories/"
CATEGORY_GROUPS_URL = "/api/finances/category-groups/"


class ActiveCategoryTests(HouseholdAPITestCase):
    """`Category.objects.active()`: one-off date range, yearly window and the manual switch."""

    def setUp(self):
        super().setUp()
        self.group = CategoryGroup.objects.create(household=self.alice_household, name="Seasonal")
        self.account = Account.objects.create(household=self.alice_household, name="Bank")

    def _category(self, name, **fields):
        return Category.objects.create(
            household=self.alice_household, category_group=self.group, name=name, **fields
        )

    def _active_names(self, on_date):
        return set(Category.objects.active(on_date).values_list("name", flat=True))

    def test_date_range_window_and_switch(self):
        self._category("Always")
        self._category("Archived", is_active=False)
        self._category("Trip 2026", start_date=date(2026, 7, 1), end_date=date(2026, 7, 15))
        self._category("From 2026", start_date=date(2026, 1, 1))
        self._category("Summer", start_month=6, start_day=1, end_month=8, end_day=31)
        self._category(
            "Winter", start_month=12, start_day=1, end_month=2, end_day=28
        )  # wraps the new year
        self._category("Until March", end_month=3, end_day=31)

        self.assertEqual(
            self._active_names(date(2026, 7, 10)), {"Always", "Trip 2026", "From 2026", "Summer"}
        )
        self.assertEqual(self._active_names(date(2026, 12, 24)), {"Always", "From 2026", "Winter"})
        self.assertEqual(
            self._active_names(date(2026, 1, 15)), {"Always", "From 2026", "Winter", "Until March"}
        )
        self.assertEqual(self._active_names(date(2025, 3, 31)), {"Always", "Until March"})

    def test_group_is_active_only_with_an_active_category(self):
        self._category("Summer", start_month=6, start_day=1, end_month=8, end_day=31)
        self.assertTrue(
            CategoryGroup.objects.active(date(2026, 7, 1)).filter(pk=self.group.pk).exists()
        )
        self.assertFalse(
            CategoryGroup.objects.active(date(2026, 10, 1)).filter(pk=self.group.pk).exists()
        )

    def test_active_filter_on_endpoints(self):
        self._category("Always")
        self._category("Archived", is_active=False)
        response = self.client.get(CATEGORIES_URL, {"active": "true"})
        self.assertEqual([c["name"] for c in self.results(response)], ["Always"])
        response = self.client.get(CATEGORIES_URL, {"active": "false"})
        self.assertEqual([c["name"] for c in self.results(response)], ["Archived"])
        response = self.client.get(CATEGORY_GROUPS_URL, {"active": "true"})
        self.assertEqual([g["name"] for g in self.results(response)], ["Seasonal"])

    def test_category_period_validation(self):
        payload = {"name": "X", "category_group_id": self.group.id}
        response = self.client.post(CATEGORIES_URL, {**payload, "start_month": 6}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("start_day", response.data)
        response = self.client.post(
            CATEGORIES_URL, {**payload, "end_month": 2, "end_day": 30}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        response = self.client.post(
            CATEGORIES_URL,
            {**payload, "start_date": "2026-05-01", "end_date": "2026-04-01"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        response = self.client.post(
            CATEGORIES_URL, {**payload, "end_month": 2, "end_day": 29}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)

    def test_transaction_requires_category_active_on_its_date(self):
        trip = self._category("Trip", start_date=date(2026, 7, 1), end_date=date(2026, 7, 15))
        payload = {
            "transaction_type": "expense",
            "title": "Hotel",
            "amount": "100",
            "category_id": trip.id,
            "account_id": self.account.id,
        }

        response = self.client.post(
            TRANSACTIONS_URL, {**payload, "date": "2026-08-01"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("category_id", response.data)

        response = self.client.post(
            TRANSACTIONS_URL, {**payload, "date": "2026-07-05"}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)

    def test_old_transaction_in_archived_category_can_still_be_edited(self):
        category = self._category("Old")
        transaction = Transaction.objects.create(
            household=self.alice_household,
            user=self.alice,
            account=self.account,
            category=category,
            title="Old",
            amount=1,
        )
        category.is_active = False
        category.save()
        url = f"{TRANSACTIONS_URL}{transaction.id}/"
        self.assertEqual(
            self.client.patch(url, {"title": "Renamed"}, format="json").status_code, 200
        )
        self.assertEqual(
            self.client.patch(url, {"date": "2026-01-01"}, format="json").status_code, 400
        )


class TransactionReportTests(HouseholdAPITestCase):
    """Filter by group, title suggestions, breakdown and balance history."""

    def setUp(self):
        super().setUp()
        self.home = CategoryGroup.objects.create(household=self.alice_household, name="Home")
        self.car = CategoryGroup.objects.create(household=self.alice_household, name="Car")
        self.food = Category.objects.create(
            household=self.alice_household, category_group=self.home, name="Food"
        )
        self.bills = Category.objects.create(
            household=self.alice_household, category_group=self.home, name="Bills"
        )
        self.fuel = Category.objects.create(
            household=self.alice_household, category_group=self.car, name="Fuel"
        )
        self.account = Account.objects.create(
            household=self.alice_household, name="Bank", opening_date=date(2026, 3, 1)
        )

        bob_group = CategoryGroup.objects.create(household=self.bob_household, name="Bob home")
        bob_category = Category.objects.create(
            household=self.bob_household, category_group=bob_group, name="Bob"
        )
        Transaction.objects.create(
            household=self.bob_household,
            user=self.bob,
            account=Account.objects.create(household=self.bob_household, name="Bob bank"),
            category=bob_category,
            title="Milk from Bob",
            amount=999,
            date=date(2026, 3, 2),
        )

    def _tx(self, title, amount, category, day, transaction_type=Transaction.EXPENSE, **fields):
        return Transaction.objects.create(
            household=self.alice_household,
            user=self.alice,
            account=fields.pop("account", self.account),
            category=category,
            title=title,
            amount=Decimal(amount),
            date=day,
            transaction_type=transaction_type,
            **fields,
        )

    def test_filter_by_category_group(self):
        self._tx("Bread", "1", self.food, date(2026, 3, 1))
        self._tx("Diesel", "2", self.fuel, date(2026, 3, 1))
        response = self.client.get(TRANSACTIONS_URL, {"category_group": self.car.id})
        self.assertEqual([t["title"] for t in self.results(response)], ["Diesel"])

    def test_suggestions_are_distinct_recent_and_household_scoped(self):
        self._tx("Milk", "100", self.food, date(2026, 3, 1))
        self._tx("milk", "120", self.bills, date(2026, 3, 5), is_fixed=True)
        self._tx("Fuel", "5000", self.fuel, date(2026, 3, 3))

        response = self.client.get(f"{TRANSACTIONS_URL}suggestions/", {"q": "MIL"})
        self.assertEqual(response.status_code, 200)
        # Case-insensitive dedupe; the other household's "Milk from Bob" is not visible.
        self.assertEqual(len(response.data), 1)
        suggestion = response.data[0]
        self.assertEqual(suggestion["title"], "milk")  # most recent wins
        self.assertEqual(suggestion["category_id"], self.bills.id)
        self.assertEqual(suggestion["category_group_name"], "Home")
        self.assertTrue(suggestion["is_fixed"])
        self.assertEqual(Decimal(suggestion["last_amount"]), Decimal("120"))

        self.assertEqual(self.client.get(f"{TRANSACTIONS_URL}suggestions/").data, [])

    def test_suggestions_skip_inactive_categories(self):
        self._tx("Milk", "100", self.food, date(2026, 3, 1))
        self.food.is_active = False
        self.food.save()
        self.assertEqual(self.client.get(f"{TRANSACTIONS_URL}suggestions/", {"q": "milk"}).data, [])

    def test_breakdown_by_group_then_by_category(self):
        self._tx("Bread", "10", self.food, date(2026, 3, 1))
        self._tx("Power", "30", self.bills, date(2026, 3, 1))
        self._tx("Diesel", "25", self.fuel, date(2026, 3, 1))
        self._tx(
            "Salary", "1000", self.bills, date(2026, 3, 1), transaction_type=Transaction.INCOME
        )

        data = self.client.get(f"{TRANSACTIONS_URL}breakdown/").data
        self.assertEqual(data["group_by"], "category_group")
        self.assertEqual(
            [(r["name"], Decimal(r["total"])) for r in data["results"]], [("Home", 40), ("Car", 25)]
        )
        self.assertEqual(Decimal(data["total"]), Decimal("65"))

        data = self.client.get(
            f"{TRANSACTIONS_URL}breakdown/", {"category_group": self.home.id}
        ).data
        self.assertEqual(data["group_by"], "category")
        self.assertEqual(
            [(r["name"], Decimal(r["total"])) for r in data["results"]],
            [("Bills", 30), ("Food", 10)],
        )

        data = self.client.get(f"{TRANSACTIONS_URL}breakdown/", {"transaction_type": "income"}).data
        self.assertEqual(
            [(r["name"], Decimal(r["total"])) for r in data["results"]], [("Home", 1000)]
        )

    def test_balance_history_fills_every_day(self):
        self._tx(
            "Salary", "1000", self.bills, date(2026, 3, 1), transaction_type=Transaction.INCOME
        )
        self._tx("Bread", "100", self.food, date(2026, 3, 1))
        self._tx("Diesel", "300", self.fuel, date(2026, 3, 3))

        data = self.client.get(
            f"{TRANSACTIONS_URL}balance-history/", {"end_date": "2026-03-04"}
        ).data
        self.assertEqual(data["start_date"], "2026-03-01")  # defaults to the opening date
        self.assertEqual(
            [(d["date"], Decimal(d["balance"])) for d in data["results"]],
            [("2026-03-01", 900), ("2026-03-02", 900), ("2026-03-03", 600), ("2026-03-04", 600)],
        )

    def test_balance_history_validation(self):
        url = f"{TRANSACTIONS_URL}balance-history/"
        response = self.client.get(url, {"start_date": "2026-03-05", "end_date": "2026-03-01"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get(url, {"start_date": "nope"}).status_code, 400)
        Account.objects.filter(household=self.alice_household).delete()
        self.assertEqual(self.client.get(url).data["results"], [])  # no accounts at all
