from datetime import date
from decimal import Decimal

from django.utils import timezone

from common.testing import HouseholdAPITestCase
from finances.models import Account, Budget, Category, CategoryGroup, Transaction
from finances.services import create_transfer, transfer_category

TRANSFERS_URL = "/api/finances/transfers/"
TRANSACTIONS_URL = "/api/finances/transactions/"
CATEGORIES_URL = "/api/finances/categories/"
ACCOUNTS_URL = "/api/finances/accounts/"


class TransferTestCase(HouseholdAPITestCase):
    """Alice's accounts (bank, savings, cash) and a category, with helpers to add rows."""

    def setUp(self):
        super().setUp()
        group = CategoryGroup.objects.create(household=self.alice_household, name="Home")
        self.category = Category.objects.create(
            household=self.alice_household, category_group=group, name="Food"
        )
        self.bank = Account.objects.create(household=self.alice_household, name="Bank")
        self.savings = Account.objects.create(household=self.alice_household, name="Savings")
        self.cash = Account.objects.create(household=self.alice_household, name="Cash")

    def _tx(self, amount, day, transaction_type=Transaction.EXPENSE, **fields):
        return Transaction.objects.create(
            household=self.alice_household,
            user=self.alice,
            account=fields.pop("account", self.bank),
            category=fields.pop("category", self.category),
            title=fields.pop("title", "Tx"),
            amount=Decimal(amount),
            date=day,
            transaction_type=transaction_type,
            **fields,
        )

    def _transfer(self, amount, day, source, target, **fields):
        return create_transfer(
            household=self.alice_household,
            user=self.alice,
            from_account=source,
            to_account=target,
            amount=Decimal(amount),
            date=day,
            **fields,
        )

    def _legs(self):
        return list(
            Transaction.objects.filter(transfer_pair__isnull=False)
            .order_by("transaction_type")
            .values_list("transaction_type", "account__name", "title", "amount", "is_deleted")
        )


class TransferWriteTests(TransferTestCase):
    """transfers/: a transfer is two linked transactions, written together."""

    def test_create_makes_two_linked_legs_in_the_transfer_category(self):
        payload = {
            "from_account_id": self.bank.id,
            "to_account_id": self.savings.id,
            "amount": "1000",
            "date": "2026-03-04",
            "description": "Monthly",
        }
        response = self.client.post(TRANSFERS_URL, payload)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["from_account"]["name"], "Bank")
        self.assertEqual(response.data["to_account"]["name"], "Savings")

        outgoing = Transaction.objects.get(pk=response.data["id"])
        incoming = Transaction.objects.get(pk=response.data["incoming_id"])
        self.assertEqual((outgoing.transfer_pair, incoming.transfer_pair), (incoming, outgoing))
        self.assertEqual(
            self._legs(),
            [
                ("expense", "Bank", "Prenos na Savings", Decimal("1000.00"), False),
                ("income", "Savings", "Prenos sa Bank", Decimal("1000.00"), False),
            ],
        )
        for leg in (outgoing, incoming):
            self.assertEqual((leg.household, leg.user), (self.alice_household, self.alice))
            self.assertEqual((leg.date, leg.description), (date(2026, 3, 4), "Monthly"))
        # The transfer category is created on first use, in "Ostalo".
        category = outgoing.category
        self.assertEqual((category.name, category.category_group.name), ("Prenos", "Ostalo"))
        self.assertTrue(category.is_transfer)
        self.assertEqual(incoming.category, category)

    def test_either_leg_opens_and_changes_the_whole_transfer(self):
        outgoing = self._transfer("100", date(2026, 3, 1), self.bank, self.savings)
        incoming = outgoing.transfer_pair
        self.assertEqual(self.client.get(f"{TRANSFERS_URL}{incoming.id}/").data["id"], outgoing.id)

        response = self.client.patch(
            f"{TRANSFERS_URL}{incoming.id}/",
            {
                "amount": "250",
                "date": "2026-03-05",
                "description": "Fixed",
                "to_account_id": self.cash.id,
            },
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            self._legs(),
            [
                ("expense", "Bank", "Prenos na Cash", Decimal("250.00"), False),
                ("income", "Cash", "Prenos sa Bank", Decimal("250.00"), False),
            ],
        )
        self.assertEqual(
            set(Transaction.objects.values_list("date", "description")),
            {(date(2026, 3, 5), "Fixed")},
        )

    def test_deleting_either_leg_deletes_both(self):
        first = self._transfer("100", date(2026, 3, 1), self.bank, self.savings)
        self.assertEqual(self.client.delete(f"{TRANSFERS_URL}{first.id}/").status_code, 204)
        second = self._transfer("50", date(2026, 3, 1), self.bank, self.savings)
        url = f"{TRANSACTIONS_URL}{second.transfer_pair_id}/"  # the incoming leg, as a transaction
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertEqual(list(Transaction.objects.values_list("is_deleted", flat=True)), [True] * 4)
        self.assertEqual(self.client.get(f"{TRANSFERS_URL}{first.id}/").status_code, 404)

    def test_validation(self):
        payload = {"from_account_id": self.bank.id, "to_account_id": self.bank.id, "amount": "1"}
        response = self.client.post(TRANSFERS_URL, payload)
        self.assertEqual(response.status_code, 400)
        self.assertIn("to_account_id", response.data)
        response = self.client.post(
            TRANSFERS_URL, {**payload, "to_account_id": self.cash.id, "amount": "0"}
        )
        self.assertIn("amount", response.data)

        transfer = self._transfer("1", date(2026, 3, 1), self.bank, self.cash)
        response = self.client.patch(
            f"{TRANSFERS_URL}{transfer.id}/", {"from_account_id": self.cash.id}
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("to_account_id", response.data)

    def test_archived_account_takes_no_new_transfers_but_old_ones_stay_editable(self):
        transfer = self._transfer("1", date(2026, 3, 1), self.bank, self.cash)
        self.cash.is_active = False
        self.cash.save()
        url = f"{TRANSFERS_URL}{transfer.id}/"
        self.assertEqual(self.client.patch(url, {"amount": "2"}).status_code, 200)
        response = self.client.post(
            TRANSFERS_URL,
            {"from_account_id": self.bank.id, "to_account_id": self.cash.id, "amount": "1"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("to_account_id", response.data)

    def test_a_leg_cant_be_edited_as_a_transaction(self):
        transfer = self._transfer("100", date(2026, 3, 1), self.bank, self.savings)
        response = self.client.patch(f"{TRANSACTIONS_URL}{transfer.id}/", {"amount": "5"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Transaction.objects.get(pk=transfer.pk).amount, Decimal("100"))

    def test_transfer_category_is_only_for_transfers(self):
        category = transfer_category(self.alice_household)
        response = self.client.post(
            TRANSACTIONS_URL,
            {
                "transaction_type": "expense",
                "title": "Sneaky",
                "amount": "1",
                "category_id": category.id,
                "account_id": self.bank.id,
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("category_id", response.data)

        url = f"{CATEGORIES_URL}{category.id}/"
        self.assertEqual(self.client.patch(url, {"is_active": False}).status_code, 400)
        self.assertEqual(self.client.patch(url, {"name": "Transfers"}).status_code, 200)
        self.assertTrue(self.client.get(url).data["is_transfer"])
        # Renamed, it's still the one transfers use.
        legs = self._transfer("1", date(2026, 3, 1), self.bank, self.cash)
        self.assertEqual(legs.category.name, "Transfers")

    def test_renaming_an_account_renames_the_legs_that_name_it(self):
        self._transfer("1", date(2026, 3, 1), self.bank, self.savings)
        response = self.client.patch(f"{ACCOUNTS_URL}{self.savings.id}/", {"name": "Rainy day"})
        self.assertEqual(response.status_code, 200)
        titles = [title for _, _, title, *_ in self._legs()]
        self.assertEqual(titles, ["Prenos na Rainy day", "Prenos sa Bank"])

    def test_list_has_one_row_per_transfer(self):
        to_savings = self._transfer("500", date(2026, 3, 2), self.bank, self.savings)
        from_savings = self._transfer("50", date(2026, 3, 3), self.savings, self.cash)
        self._transfer("10", date(2026, 3, 4), self.bank, self.cash)

        rows = self.results(self.client.get(TRANSFERS_URL, {"account": self.savings.id}))
        self.assertEqual([row["id"] for row in rows], [from_savings.id, to_savings.id])
        self.assertEqual(len(self.results(self.client.get(TRANSFERS_URL))), 3)


class TransferInTotalsTests(TransferTestCase):
    """The legs are in the transaction list and the balances, not in income/expense or reports."""

    def test_list_shows_both_legs_and_keeps_them_out_of_income_and_expenses(self):
        self._tx("300", date(2026, 3, 1), Transaction.INCOME)
        self._tx("20", date(2026, 3, 1), account=self.savings)
        transfer = self._transfer("1000", date(2026, 3, 2), self.bank, self.savings)
        self._transfer("50", date(2026, 3, 3), self.savings, self.bank)

        everything = self.client.get(TRANSACTIONS_URL).data
        self.assertEqual(everything["count"], 6)
        self.assertEqual(
            (
                everything["total_incomes"],
                everything["total_expenses"],
                everything["total_transfers"],
                everything["total"],
            ),
            ("300.00", "20.00", "0.00", "280.00"),
        )
        leg = next(row for row in everything["results"] if row["id"] == transfer.id)
        self.assertEqual(
            leg["transfer"],
            {
                "id": transfer.transfer_pair_id,
                "account": {"id": self.savings.id, "name": "Savings"},
            },
        )

        bank = self.client.get(TRANSACTIONS_URL, {"account": self.bank.id}).data
        self.assertEqual(
            (bank["total_incomes"], bank["total_expenses"], bank["total_transfers"], bank["total"]),
            ("300.00", "0.00", "-950.00", "-650.00"),
        )
        savings = self.client.get(TRANSACTIONS_URL, {"account": self.savings.id}).data
        self.assertEqual((savings["total_transfers"], savings["total"]), ("950.00", "930.00"))

    def test_list_shows_the_incoming_leg_above_the_outgoing_one(self):
        # Newest first, and the incoming leg is created after the outgoing one. Legs with the same
        # created_at (transfers converted by migration 0009) are ordered by id, incoming first too.
        transfer = self._transfer("1000", date(2026, 3, 2), self.bank, self.savings)
        self._transfer("50", date(2026, 3, 2), self.savings, self.bank)
        Transaction.objects.filter(pk__in=[transfer.pk, transfer.transfer_pair_id]).update(
            created_at=timezone.now() - timezone.timedelta(days=1)
        )
        rows = [
            (row["account"]["name"], row["transaction_type"], row["type_sign"], row["amount"])
            for row in self.client.get(TRANSACTIONS_URL).data["results"]
        ]
        self.assertEqual(
            rows,
            [
                ("Bank", "income", "+", "50.00"),
                ("Savings", "expense", "-", "50.00"),
                ("Savings", "income", "+", "1000.00"),
                ("Bank", "expense", "-", "1000.00"),
            ],
        )

    def test_type_filter(self):
        expense = self._tx("10", date(2026, 3, 1))
        transfer = self._transfer("500", date(2026, 3, 2), self.bank, self.savings)

        def ids(params):
            return {row["id"] for row in self.results(self.client.get(TRANSACTIONS_URL, params))}

        self.assertEqual(ids({"transaction_type": "expense"}), {expense.id})
        self.assertEqual(ids({"transaction_type": "income"}), set())
        self.assertEqual(
            ids({"transaction_type": "transfer"}), {transfer.id, transfer.transfer_pair_id}
        )

    def test_search_finds_legs_by_account_name(self):
        self._tx("10", date(2026, 3, 1), title="Bread")
        transfer = self._transfer("100", date(2026, 3, 3), self.bank, self.savings)
        rows = self.results(self.client.get(TRANSACTIONS_URL, {"search": "saving"}))
        self.assertEqual([row["id"] for row in rows], [transfer.id])  # "Prenos na Savings"

    def test_balances_count_transfers(self):
        self._transfer("200", timezone.localdate(), self.bank, self.cash)
        balances = {a["name"]: a["balance"] for a in self.client.get(ACCOUNTS_URL).data}
        self.assertEqual(balances, {"Bank": "-200.00", "Cash": "200.00", "Savings": "0.00"})

    def test_reports_budgets_and_suggestions_leave_transfers_out(self):
        today = timezone.localdate()
        self._tx("10", today, title="Prenos sa kase")  # a real expense whose title looks alike
        self._transfer("500", today, self.bank, self.savings)

        breakdown = self.client.get(f"{TRANSACTIONS_URL}breakdown/").data
        self.assertEqual(
            [(r["name"], r["total"]) for r in breakdown["results"]], [("Home", "10.00")]
        )
        income = self.client.get(
            f"{TRANSACTIONS_URL}breakdown/", {"transaction_type": "income"}
        ).data
        self.assertEqual(income["results"], [])

        category = transfer_category(self.alice_household)
        budget = Budget.objects.create(
            household=self.alice_household,
            category=category,
            amount=Decimal("100"),
            start_date=today,
            end_date=today,
        )
        self.assertEqual(Budget.objects.with_spent().get(pk=budget.pk).spent_amount, 0)
        self.assertEqual(budget.total_spent, 0)

        suggestions = self.client.get(f"{TRANSACTIONS_URL}suggestions/", {"q": "prenos"}).data
        self.assertEqual([s["title"] for s in suggestions], ["Prenos sa kase"])

    def test_account_with_transfers_cant_be_deleted(self):
        self._transfer("1", date(2026, 3, 2), self.bank, self.cash)
        self.assertEqual(self.client.delete(f"{ACCOUNTS_URL}{self.cash.id}/").status_code, 400)


class TransferIsolationTests(TransferTestCase):
    def test_household_isolation(self):
        bob_bank = Account.objects.create(household=self.bob_household, name="Bob bank")
        bob_cash = Account.objects.create(household=self.bob_household, name="Bob cash")
        bob_transfer = create_transfer(
            household=self.bob_household,
            user=self.bob,
            from_account=bob_bank,
            to_account=bob_cash,
            amount=Decimal("5"),
        )
        self.assertEqual(self.results(self.client.get(TRANSFERS_URL)), [])
        self.assertEqual(self.results(self.client.get(TRANSACTIONS_URL)), [])
        for leg in (bob_transfer.id, bob_transfer.transfer_pair_id):
            url = f"{TRANSFERS_URL}{leg}/"
            self.assertEqual(self.client.get(url).status_code, 404)
            self.assertEqual(self.client.patch(url, {"amount": "1"}).status_code, 404)
            self.assertEqual(self.client.delete(url).status_code, 404)

        response = self.client.post(
            TRANSFERS_URL,
            {"from_account_id": self.bank.id, "to_account_id": bob_bank.id, "amount": "1"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("to_account_id", response.data)
        # Bob's transfer category isn't Alice's.
        self._transfer("1", date(2026, 3, 1), self.bank, self.cash)
        self.assertEqual(Category.objects.filter(is_transfer=True).count(), 2)
