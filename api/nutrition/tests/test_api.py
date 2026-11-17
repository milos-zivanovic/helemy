from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone

from common.testing import HouseholdAPITestCase
from nutrition.models import Consumption, Food

User = get_user_model()

CONSUMPTIONS_URL = "/api/nutrition/consumptions/"
FOODS_URL = "/api/nutrition/foods/"


class NutritionAPITests(HouseholdAPITestCase):
    def setUp(self):
        super().setUp()
        self.alice_food = Food.objects.create(
            household=self.alice_household, name="Oats", calories=380, protein=13, carbs=60, fat=7
        )
        self.bob_food = Food.objects.create(
            household=self.bob_household, name="Bob food", calories=100, protein=1, carbs=1, fat=1
        )

    def test_create_consumption_with_own_food(self):
        response = self.client.post(
            CONSUMPTIONS_URL,
            {
                "food_id": self.alice_food.id,
                "quantity_grams": 50,
                "date": timezone.localdate().isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            Consumption.objects.get(id=response.data["id"]).household, self.alice_household
        )

    def test_cannot_consume_other_household_food(self):
        response = self.client.post(
            CONSUMPTIONS_URL,
            {
                "food_id": self.bob_food.id,
                "quantity_grams": 50,
                "date": timezone.localdate().isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_weekly_summary_covers_the_calendar_week_with_today(self):
        today = timezone.localdate()
        Consumption.objects.create(
            household=self.alice_household,
            user=self.alice,
            food=self.alice_food,
            quantity_grams=100,
            date=today,
        )
        response = self.client.get(f"{CONSUMPTIONS_URL}weekly-summary/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 7)
        monday = today - timedelta(days=today.weekday())
        self.assertEqual(response.data[0]["date"], monday.isoformat())
        today_summary = next(d for d in response.data if d["date"] == today.isoformat())
        self.assertEqual(today_summary["calories"], 380)

    def test_weekly_summary_for_given_date_lists_every_member_each_day(self):
        carol = User.objects.create_user(
            email="carol@example.com", password="pw", first_name="Carol"
        )
        self.alice_household.add_member(carol)
        Consumption.objects.create(  # Wednesday
            household=self.alice_household,
            user=self.alice,
            food=self.alice_food,
            quantity_grams=50,
            date=date(2026, 3, 4),
        )
        Consumption.objects.create(  # previous week, must be left out
            household=self.alice_household,
            user=self.alice,
            food=self.alice_food,
            quantity_grams=50,
            date=date(2026, 3, 1),
        )

        response = self.client.get(f"{CONSUMPTIONS_URL}weekly-summary/", {"date": "2026-03-06"})
        self.assertEqual([d["date"] for d in response.data][::6], ["2026-03-02", "2026-03-08"])
        self.assertEqual(sum(d["calories"] for d in response.data), 190)
        for day in response.data:
            # full_name falls back to the email when the user has no name
            names = {u["full_name"] for u in day["by_user"]}
            self.assertEqual(names, {"alice@example.com", "Carol"})
        wednesday = {u["email"]: u["calories"] for u in response.data[2]["by_user"]}
        self.assertEqual(wednesday, {"alice@example.com": 190, "carol@example.com": 0})

        bad = self.client.get(f"{CONSUMPTIONS_URL}weekly-summary/", {"date": "06.03.2026"})
        self.assertEqual(bad.status_code, 400)

    def test_food_name_is_unique_per_household_case_insensitive(self):
        response = self.client.post(FOODS_URL, self._food_payload(name="OATS"), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.data)

        rice = self.client.post(FOODS_URL, self._food_payload(name="Rice"), format="json")
        self.assertEqual(rice.status_code, 201, rice.data)
        rename = self.client.patch(
            f"{FOODS_URL}{self.alice_food.id}/", {"name": "rice"}, format="json"
        )
        self.assertEqual(rename.status_code, 400)

        # Another household may use the same name.
        self.client.force_authenticate(self.bob)
        self.assertEqual(
            self.client.post(FOODS_URL, self._food_payload(name="Oats"), format="json").status_code,
            201,
        )

    def _food_payload(self, **overrides):
        return {"name": "X", "calories": 100, "protein": 1, "carbs": 1, "fat": 1, **overrides}

    def test_filter_consumptions_by_date_and_range(self):
        for day in (1, 2, 3):
            Consumption.objects.create(
                household=self.alice_household,
                user=self.alice,
                food=self.alice_food,
                quantity_grams=100,
                date=date(2026, 3, day),
            )

        def dates(params):
            response = self.client.get(CONSUMPTIONS_URL, params)
            self.assertEqual(response.status_code, 200, response.data)
            return sorted(c["date"] for c in self.results(response))

        self.assertEqual(dates({"date": "2026-03-02"}), ["2026-03-02"])
        self.assertEqual(
            dates({"start_date": "2026-03-02", "end_date": "2026-03-03"}),
            ["2026-03-02", "2026-03-03"],
        )
        self.assertEqual(dates({"user": self.bob.id}), [])
        self.assertEqual(self.client.get(CONSUMPTIONS_URL, {"date": "02.03.2026"}).status_code, 400)
