from datetime import date, timedelta
from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from common.testing import HouseholdAPITestCase
from finances.models import Budget, Category, CategoryGroup, Transaction

TRANSACTIONS_URL = "/api/v1/finances/transactions/"
CATEGORIES_URL = "/api/v1/finances/categories/"
BUDGETS_URL = "/api/v1/finances/budgets/"


class FinancesAPITests(HouseholdAPITestCase):
    def setUp(self):
        super().setUp()
        self.alice_group = CategoryGroup.objects.create(household=self.alice_household, name="Home")
        self.alice_category = Category.objects.create(
            household=self.alice_household, category_group=self.alice_group, name="Groceries"
        )
        bob_group = CategoryGroup.objects.create(household=self.bob_household, name="Bob home")
        self.bob_category = Category.objects.create(
            household=self.bob_household, category_group=bob_group, name="Bob groceries"
        )
        self.bob_transaction = Transaction.objects.create(
            household=self.bob_household,
            user=self.bob,
            category=self.bob_category,
            title="Bob secret",
            amount=Decimal("100"),
        )

    def _create_transaction(self, **overrides):
        payload = {
            "transaction_type": "expense",
            "title": "Milk",
            "amount": "120.50",
            "category_id": self.alice_category.id,
        }
        payload.update(overrides)
        return self.client.post(TRANSACTIONS_URL, payload, format="json")

    # --- household isolation -------------------------------------------------

    def test_create_sets_household_and_user(self):
        response = self._create_transaction()
        self.assertEqual(response.status_code, 201, response.data)
        transaction = Transaction.objects.get(id=response.data["id"])
        self.assertEqual(transaction.household, self.alice_household)
        self.assertEqual(transaction.user, self.alice)

    def test_list_does_not_show_other_household_data(self):
        self._create_transaction()
        response = self.client.get(TRANSACTIONS_URL)
        self.assertEqual(response.status_code, 200)
        titles = [t["title"] for t in self.results(response)]
        self.assertEqual(titles, ["Milk"])
        self.assertEqual(response.data["total_expenses"], Decimal("120.50"))

    def test_cannot_retrieve_update_or_delete_other_household_object(self):
        url = f"{TRANSACTIONS_URL}{self.bob_transaction.id}/"
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(
            self.client.patch(url, {"title": "hacked"}, format="json").status_code, 404
        )
        self.assertEqual(self.client.delete(url).status_code, 404)
        self.bob_transaction.refresh_from_db()
        self.assertEqual(self.bob_transaction.title, "Bob secret")
        self.assertFalse(self.bob_transaction.is_deleted)

    def test_cannot_reference_other_household_category(self):
        response = self._create_transaction(category_id=self.bob_category.id)
        self.assertEqual(response.status_code, 400)
        self.assertIn("category_id", response.data)

    def test_cannot_create_category_in_other_household_group(self):
        bob_group = self.bob_category.category_group
        response = self.client.post(
            CATEGORIES_URL, {"name": "X", "category_group_id": bob_group.id}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_unauthenticated_request_is_rejected(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(TRANSACTIONS_URL).status_code, 401)

    # --- transaction date & soft delete --------------------------------------

    def test_transaction_can_be_backdated_and_filtered_by_date(self):
        yesterday = timezone.localdate() - timedelta(days=1)
        self._create_transaction(title="Yesterday", date=yesterday.isoformat())
        self._create_transaction(title="Today")

        response = self.client.get(TRANSACTIONS_URL, {"end_date": yesterday.isoformat()})
        self.assertEqual([t["title"] for t in self.results(response)], ["Yesterday"])

    def test_delete_is_soft(self):
        transaction_id = self._create_transaction().data["id"]
        response = self.client.delete(f"{TRANSACTIONS_URL}{transaction_id}/")
        self.assertEqual(response.status_code, 204)
        self.assertTrue(Transaction.objects.get(id=transaction_id).is_deleted)
        self.assertEqual(self.results(self.client.get(TRANSACTIONS_URL)), [])

    def test_category_list_includes_group_name_without_extra_queries(self):
        other_group = CategoryGroup.objects.create(household=self.alice_household, name="Car")
        Category.objects.create(
            household=self.alice_household, category_group=other_group, name="Fuel"
        )
        with self.assertNumQueries(4):  # 2 household lookups + count + one list query (with group)
            response = self.client.get(CATEGORIES_URL)
        labels = {f"{c['category_group_name']} / {c['name']}" for c in self.results(response)}
        self.assertEqual(labels, {"Home / Groceries", "Car / Fuel"})

    def test_category_counts_are_annotated(self):
        self._create_transaction(amount="10")
        self._create_transaction(amount="5")
        response = self.client.get(f"{CATEGORIES_URL}{self.alice_category.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["transactions_count"], 2)
        self.assertEqual(Decimal(response.data["total_amount"]), Decimal("15"))

    # --- budgets -------------------------------------------------------------

    def _budget_payload(self, **overrides):
        today = timezone.localdate()
        payload = {
            "category_id": self.alice_category.id,
            "amount": "1000",
            "start_date": (today - timedelta(days=5)).isoformat(),
            "end_date": (today + timedelta(days=5)).isoformat(),
        }
        payload.update(overrides)
        return payload

    def test_budget_spent_and_unpaginated_list(self):
        self.assertEqual(
            self.client.post(BUDGETS_URL, self._budget_payload(), format="json").status_code, 201
        )
        self._create_transaction(amount="250")
        self._create_transaction(amount="50", transaction_type="income")  # income doesn't count

        response = self.client.get(BUDGETS_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(Decimal(response.data["results"][0]["spent"]), Decimal("250"))
        self.assertEqual(Decimal(response.data["results"][0]["percentage"]), Decimal("25"))

    def test_budget_list_has_totals_and_is_sorted_by_percentage(self):
        today = timezone.localdate()
        rent = Category.objects.create(
            household=self.alice_household, category_group=self.alice_group, name="Rent"
        )
        fun = Category.objects.create(
            household=self.alice_household, category_group=self.alice_group, name="Fun"
        )
        for category, amount in [(self.alice_category, 1000), (rent, 500), (fun, 2000)]:
            Budget.objects.create(
                household=self.alice_household,
                category=category,
                amount=amount,
                start_date=today,
                end_date=today,
            )
        self._create_transaction(amount="100")  # Groceries: 10 %
        self._create_transaction(amount="250", category_id=rent.id)  # Rent: 50 %

        data = self.client.get(BUDGETS_URL).data
        self.assertEqual(
            [b["category"]["name"] for b in data["results"]], ["Rent", "Groceries", "Fun"]
        )
        self.assertEqual(Decimal(data["total_amount"]), Decimal("3500"))
        self.assertEqual(Decimal(data["total_spent"]), Decimal("350"))
        self.assertEqual(Decimal(data["percentage"]), Decimal("10"))

    def test_all_budgets_can_be_filtered_by_year(self):
        Budget.objects.create(
            household=self.alice_household,
            category=self.alice_category,
            amount=1,
            start_date=date(2024, 12, 1),
            end_date=date(2025, 1, 31),
        )
        Budget.objects.create(
            household=self.alice_household,
            category=self.alice_category,
            amount=1,
            start_date=date(2026, 3, 1),
            end_date=date(2026, 3, 31),
        )
        self.assertEqual(self.client.get(f"{BUDGETS_URL}all/", {"year": 2025}).data["count"], 1)
        self.assertEqual(self.client.get(f"{BUDGETS_URL}all/", {"year": 2023}).data["count"], 0)

    def test_budget_list_query_count_does_not_grow_with_budgets(self):
        today = timezone.localdate()
        for i in range(5):
            category = Category.objects.create(
                household=self.alice_household, category_group=self.alice_group, name=f"C{i}"
            )
            Budget.objects.create(
                household=self.alice_household,
                category=category,
                amount=100,
                start_date=today,
                end_date=today,
            )
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(BUDGETS_URL)
        self.assertEqual(len(response.data["results"]), 5)
        self.assertLess(len(ctx.captured_queries), 6)

    def test_all_budgets_is_paginated(self):
        self.client.post(BUDGETS_URL, self._budget_payload(), format="json")
        response = self.client.get(f"{BUDGETS_URL}all/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)

    def test_overlapping_budget_is_rejected(self):
        self.client.post(BUDGETS_URL, self._budget_payload(), format="json")
        response = self.client.post(BUDGETS_URL, self._budget_payload(amount="5"), format="json")
        self.assertEqual(response.status_code, 400)
