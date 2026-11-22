"""Weight units: each exercise has its own (kg / lb), training totals use the user's unit."""

from datetime import date
from decimal import Decimal

from common.testing import HouseholdAPITestCase
from common.units import convert_weight
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

    def test_changing_the_unit_converts_every_set_of_the_exercise(self):
        exercise = Exercise.objects.create(household=self.alice_household, name="Bench press")
        training = Training.objects.create(
            household=self.alice_household, user=self.alice, date=date(2026, 11, 1)
        )
        heavy = training.add_set(exercise, weight=Decimal("80"), reps=5)
        bodyweight = training.add_set(exercise, weight=None, reps=10)
        url = f"/api/fitness/exercises/{exercise.id}/"

        response = self.client.patch(url, {"weight_unit": "lb"})

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["weight_unit"], "lb")
        heavy.refresh_from_db()
        bodyweight.refresh_from_db()
        self.assertEqual(heavy.weight, Decimal("176.37"))
        self.assertIsNone(bodyweight.weight)

        # And back: the 2-decimal rounding doesn't drift.
        self.client.patch(url, {"weight_unit": "kg"})
        heavy.refresh_from_db()
        self.assertEqual(heavy.weight, Decimal("80.00"))

    def test_other_fields_leave_the_sets_alone(self):
        exercise = Exercise.objects.create(household=self.alice_household, name="Squat")
        training = Training.objects.create(
            household=self.alice_household, user=self.alice, date=date(2026, 11, 1)
        )
        training_set = training.add_set(exercise, weight=Decimal("100"), reps=5)

        self.client.patch(f"/api/fitness/exercises/{exercise.id}/", {"name": "Back squat"})
        self.client.patch(f"/api/fitness/exercises/{exercise.id}/", {"weight_unit": "kg"})

        training_set.refresh_from_db()
        self.assertEqual(training_set.weight, Decimal("100.00"))

    def test_a_change_that_would_not_fit_the_weight_field_is_refused(self):
        exercise = Exercise.objects.create(household=self.alice_household, name="Sled")
        training = Training.objects.create(
            household=self.alice_household, user=self.alice, date=date(2026, 11, 1)
        )
        training.add_set(exercise, weight=Decimal("9000"), reps=1)  # 19841.6 lb: too big

        response = self.client.patch(
            f"/api/fitness/exercises/{exercise.id}/", {"weight_unit": "lb"}
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("weight_unit", response.data)
        exercise.refresh_from_db()
        self.assertEqual(exercise.weight_unit, "kg")
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


class ConvertWeightTests(HouseholdAPITestCase):
    def test_conversions(self):
        self.assertEqual(convert_weight(Decimal("80"), "kg", "lb"), Decimal("176.37"))
        self.assertEqual(convert_weight(Decimal("45"), "lb", "kg"), Decimal("20.41"))
        self.assertEqual(convert_weight(Decimal("12.5"), "kg", "kg"), Decimal("12.50"))
