from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

from common.testing import HouseholdAPITestCase
from finances.models import Account, Category, CategoryGroup, Transaction
from finances.services import create_transfer

ACCOUNTS_URL = "/api/finances/accounts/"
TRANSACTIONS_URL = "/api/finances/transactions/"
BALANCE_URL = f"{TRANSACTIONS_URL}balance-history/"


class AccountTests(HouseholdAPITestCase):
    """Accounts and the real balance (transfers in detail: test_transfers.py)."""

    def setUp(self):
        super().setUp()
        group = CategoryGroup.objects.create(household=self.alice_household, name="Home")
        self.category = Category.objects.create(
            household=self.alice_household, category_group=group, name="Food"
        )
        self.bank = Account.objects.create(
            household=self.alice_household,
            name="Bank",
            opening_balance=Decimal("1000"),
            opening_date=date(2026, 3, 1),
        )
        self.cash = Account.objects.create(
            household=self.alice_household, name="Cash", opening_date=date(2026, 3, 1)
        )
        self.bob_account = Account.objects.create(household=self.bob_household, name="Bob bank")

    def _tx(self, amount, day, account=None, transaction_type=Transaction.EXPENSE, **fields):
        return Transaction.objects.create(
            household=self.alice_household,
            user=self.alice,
            account=account or self.bank,
            category=self.category,
            title="Tx",
            amount=Decimal(amount),
            date=day,
            transaction_type=transaction_type,
            **fields,
        )

    def _transfer(self, amount, day, source, target):
        return create_transfer(
            household=self.alice_household,
            user=self.alice,
            from_account=source,
            to_account=target,
            amount=Decimal(amount),
            date=day,
        )

    def _balances(self, response):
        return {a["name"]: Decimal(a["balance"]) for a in response.data}

    # --- balance --------------------------------------------------------------

    def test_balance_counts_all_transactions(self):
        self._tx("100", date(2026, 3, 2))
        self._tx("50", date(2026, 3, 2), transaction_type=Transaction.INCOME)
        self._tx("70", date(2026, 3, 2), is_deleted=True)  # soft-deleted: ignored
        self._tx("300", date(2026, 2, 20), transaction_type=Transaction.INCOME)  # before opening
        self._transfer("200", date(2026, 3, 3), self.bank, self.cash)

        balances = self._balances(self.client.get(ACCOUNTS_URL))
        self.assertEqual(balances, {"Bank": Decimal("1050"), "Cash": Decimal("200")})

    def test_opening_balance_counts_from_the_opening_date(self):
        self.bank.opening_date = timezone.localdate() + timedelta(days=1)
        self.bank.save()
        self._tx("100", date(2026, 3, 2), transaction_type=Transaction.INCOME)
        self.assertEqual(self._balances(self.client.get(ACCOUNTS_URL))["Bank"], Decimal("100"))

    def test_future_transactions_dont_change_todays_balance(self):
        tomorrow = timezone.localdate() + timedelta(days=1)
        self._tx("100", tomorrow)
        self.assertEqual(self._balances(self.client.get(ACCOUNTS_URL))["Bank"], Decimal("1000"))

    def test_balance_history_of_all_accounts_and_of_one(self):
        self._tx("100", date(2026, 3, 2))
        self._transfer("200", date(2026, 3, 3), self.bank, self.cash)
        self._tx("50", date(2026, 2, 27))  # before opening: counts too

        params = {"start_date": "2026-02-28", "end_date": "2026-03-03"}
        data = self.client.get(BALANCE_URL, params).data
        self.assertEqual(
            [(d["date"], Decimal(d["balance"])) for d in data["results"]],
            # The older expense is in the starting balance; the opening balance appears on the
            # opening date; a transfer between the two accounts doesn't change the total.
            [("2026-02-28", -50), ("2026-03-01", 950), ("2026-03-02", 850), ("2026-03-03", 850)],
        )

        data = self.client.get(BALANCE_URL, {**params, "account": self.cash.id}).data
        self.assertEqual(
            [Decimal(d["balance"]) for d in data["results"]], [0, 0, 0, Decimal("200")]
        )

    def test_balance_history_starts_at_the_oldest_transaction_by_default(self):
        self._tx("50", date(2026, 2, 27))
        results = self.client.get(BALANCE_URL, {"end_date": "2026-03-01"}).data["results"]
        self.assertEqual(
            [(d["date"], Decimal(d["balance"])) for d in results],
            [("2026-02-27", -50), ("2026-02-28", -50), ("2026-03-01", 950)],
        )

    def test_balance_history_starts_from_the_balance_before_start(self):
        self._tx("100", date(2026, 3, 2))
        data = self.client.get(
            BALANCE_URL, {"start_date": "2026-03-05", "end_date": "2026-03-05"}
        ).data
        self.assertEqual(
            data["results"], [{"date": "2026-03-05", "net": "0.00", "balance": "900.00"}]
        )

    # --- writes and rules -----------------------------------------------------

    def test_transaction_needs_an_active_account_of_the_household(self):
        payload = {
            "transaction_type": "expense",
            "title": "Milk",
            "amount": "10",
            "category_id": self.category.id,
        }
        self.assertIn("account_id", self.client.post(TRANSACTIONS_URL, payload).data)
        response = self.client.post(
            TRANSACTIONS_URL, {**payload, "account_id": self.bob_account.id}
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("account_id", response.data)

        self.cash.is_active = False
        self.cash.save()
        response = self.client.post(TRANSACTIONS_URL, {**payload, "account_id": self.cash.id})
        self.assertEqual(response.status_code, 400)
        self.assertIn("account_id", response.data)

    def test_old_transaction_of_archived_account_can_be_edited(self):
        transaction = self._tx("10", timezone.localdate(), account=self.cash)
        self.cash.is_active = False
        self.cash.save()
        url = f"{TRANSACTIONS_URL}{transaction.id}/"
        self.assertEqual(self.client.patch(url, {"title": "Renamed"}).status_code, 200)
        response = self.client.patch(url, {"account_id": self.bank.id})
        self.assertEqual(response.status_code, 200)
        response = self.client.patch(url, {"account_id": self.cash.id})
        self.assertEqual(response.status_code, 400)

    def test_filter_transactions_by_account(self):
        self._tx("1", date(2026, 3, 2))
        self._tx("2", date(2026, 3, 2), account=self.cash)
        response = self.client.get(TRANSACTIONS_URL, {"account": self.cash.id})
        self.assertEqual([t["amount"] for t in self.results(response)], ["2.00"])
        self.assertEqual(self.results(response)[0]["account"]["name"], "Cash")

    def test_account_in_use_cant_be_deleted(self):
        self._tx("1", date(2026, 3, 2))
        self.assertEqual(self.client.delete(f"{ACCOUNTS_URL}{self.bank.id}/").status_code, 400)

    def test_unused_account_is_deleted_with_its_soft_deleted_transactions(self):
        self._tx("1", date(2026, 3, 2), account=self.cash, is_deleted=True)
        self.assertEqual(self.client.delete(f"{ACCOUNTS_URL}{self.cash.id}/").status_code, 204)
        self.assertFalse(Account.objects.filter(pk=self.cash.pk).exists())

    def test_create_account(self):
        response = self.client.post(ACCOUNTS_URL, {"name": "Savings", "opening_balance": "5000.50"})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["opening_date"], timezone.localdate().isoformat())
        account = Account.objects.get(name="Savings")
        self.assertEqual(account.household, self.alice_household)

    # --- household isolation --------------------------------------------------

    def test_household_isolation(self):
        names = [a["name"] for a in self.client.get(ACCOUNTS_URL).data]
        self.assertEqual(names, ["Bank", "Cash"])
        url = f"{ACCOUNTS_URL}{self.bob_account.id}/"
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.delete(url).status_code, 404)
        self.assertEqual(
            self.client.get(BALANCE_URL, {"account": self.bob_account.id}).status_code, 400
        )

    def test_sign_up_creates_a_default_account(self):
        self.client.force_authenticate(None)
        response = self.client.post(
            "/api/auth/register/",
            {
                "email": "new@example.com",
                "password": "Very-long-pw-123",
                "password2": "Very-long-pw-123",
            },
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            Account.objects.filter(household__members__email="new@example.com").count(), 1
        )
