"""Weight units: each exercise has its own (kg / lb), training totals use the user's unit."""

from datetime import date
from decimal import Decimal

from common.testing import HouseholdAPITestCase
from fitness.models import Exercise, Training, TrainingSet


class ExerciseUnitTests(HouseholdAPITestCase):
    def test_a_new_exercise_takes_the_users_unit_unless_one_is_given(self):
        self.alice.weight_unit = "lb"
        self.alice.save(update_fields=["weight_unit"])

        default = self.client.post("/api/fitness/exercises/", {"name": "Leg press"})
        chosen = self.client.post(
            "/api/fitness/exercises/", {"name": "Bench press", "weight_unit": "kg"}
        )

        self.assertEqual(default.status_code, 201, default.data)
        self.assertEqual(default.data["weight_unit"], "lb")
        self.assertEqual(chosen.data["weight_unit"], "kg")

    def test_unknown_unit_is_rejected(self):
        response = self.client.post(
            "/api/fitness/exercises/", {"name": "Row", "weight_unit": "stone"}
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("weight_unit", response.data)

    def test_changing_the_unit_only_relabels_the_sets(self):
        exercise = Exercise.objects.create(household=self.alice_household, name="Bench press")
        training = Training.objects.create(
            household=self.alice_household, user=self.alice, date=date(2026, 11, 1)
        )
        heavy = training.add_set(exercise, weight=Decimal("80"), reps=5)
        bodyweight = training.add_set(exercise, weight=None, reps=10)

        response = self.client.patch(
            f"/api/fitness/exercises/{exercise.id}/", {"weight_unit": "lb"}
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["weight_unit"], "lb")
        heavy.refresh_from_db()
        bodyweight.refresh_from_db()
        self.assertEqual(heavy.weight, Decimal("80.00"))  # now 80 lb
        self.assertIsNone(bodyweight.weight)
        # The training total follows: 80 lb × 5 in a kg user's total is 181.4 kg.
        detail = self.client.get(f"/api/fitness/trainings/{training.id}/")
        self.assertEqual(detail.data["total_volume"], 181.4)

    def test_a_heavy_set_does_not_block_a_unit_change(self):
        exercise = Exercise.objects.create(household=self.alice_household, name="Sled")
        training = Training.objects.create(
            household=self.alice_household, user=self.alice, date=date(2026, 11, 1)
        )
        training.add_set(exercise, weight=Decimal("9000"), reps=1)

        response = self.client.patch(
            f"/api/fitness/exercises/{exercise.id}/", {"weight_unit": "lb"}
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(TrainingSet.objects.get().weight, Decimal("9000.00"))

    def test_another_household_cannot_change_the_unit(self):
        exercise = Exercise.objects.create(household=self.alice_household, name="Curl")
        self.client.force_authenticate(self.bob)
        response = self.client.patch(
            f"/api/fitness/exercises/{exercise.id}/", {"weight_unit": "lb"}
        )
        self.assertEqual(response.status_code, 404)
        exercise.refresh_from_db()
        self.assertEqual(exercise.weight_unit, "kg")


class TrainingTotalTests(HouseholdAPITestCase):
    def setUp(self):
        super().setUp()
        kg_machine = Exercise.objects.create(
            household=self.alice_household, name="Chest press", weight_unit="kg"
        )
        lb_machine = Exercise.objects.create(
            household=self.alice_household, name="Lat pulldown", weight_unit="lb"
        )
        self.training = Training.objects.create(
            household=self.alice_household, user=self.alice, date=date(2026, 11, 1)
        )
        self.training.add_set(kg_machine, weight=Decimal("100"), reps=5)  # 500 kg
        self.training.add_set(lb_machine, weight=Decimal("100"), reps=10)  # 1000 lb

    def totals(self):
        detail = self.client.get(f"/api/fitness/trainings/{self.training.id}/").data
        listed = self.results(self.client.get("/api/fitness/trainings/"))[0]
        return detail, listed

    def test_totals_are_in_kg_for_a_kg_user(self):
        detail, listed = self.totals()
        # 500 kg + 1000 lb (453.59237 kg)
        self.assertEqual((detail["total_volume"], detail["volume_unit"]), (953.6, "kg"))
        self.assertEqual((listed["total_volume"], listed["volume_unit"]), (953.6, "kg"))

    def test_totals_are_in_lb_for_a_lb_user(self):
        self.alice.weight_unit = "lb"
        self.alice.save(update_fields=["weight_unit"])

        detail, _ = self.totals()

        # 500 kg (1102.31 lb) + 1000 lb
        self.assertEqual((detail["total_volume"], detail["volume_unit"]), (2102.3, "lb"))

    def test_sets_and_exercise_totals_stay_in_the_exercises_unit(self):
        items = self.client.get(f"/api/fitness/trainings/{self.training.id}/").data["items"]
        by_name = {item["exercise"]["name"]: item for item in items}
        pulldown = by_name["Lat pulldown"]
        self.assertEqual(pulldown["exercise"]["weight_unit"], "lb")
        self.assertEqual(pulldown["sets"][0]["weight"], "100.00")
        self.assertEqual(pulldown["total_volume"], 1000.0)
