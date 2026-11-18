from datetime import date
from decimal import Decimal

from django.utils import timezone

from common.testing import HouseholdAPITestCase
from fitness.models import Exercise, MuscleGroup, Training, TrainingSet

EXERCISES_URL = "/api/fitness/exercises/"
MUSCLE_GROUPS_URL = "/api/fitness/muscle-groups/"
TRAININGS_URL = "/api/fitness/trainings/"


class FitnessAPITests(HouseholdAPITestCase):
    def setUp(self):
        super().setUp()
        self.chest = MuscleGroup.objects.create(name="Chest", order=1)
        self.alice_bench = Exercise.objects.create(
            household=self.alice_household, muscle_group=self.chest, name="Bench press"
        )
        self.bob_fly = Exercise.objects.create(
            household=self.bob_household, muscle_group=self.chest, name="Fly"
        )

    def test_muscle_groups_are_global_and_count_only_own_exercises(self):
        response = self.client.get(MUSCLE_GROUPS_URL)
        self.assertEqual(response.status_code, 200)
        groups = {g["name"]: g for g in self.results(response)}
        self.assertEqual(groups["Chest"]["exercises_count"], 1)  # bob's "Fly" is not counted

    def test_default_muscle_groups_are_seeded(self):
        # fitness/migrations/0003_seed_muscle_groups.py
        response = self.client.get(MUSCLE_GROUPS_URL)
        seeded = ["Grudi", "Leđa", "Ramena", "Biceps", "Triceps", "Noge", "Stomak", "Kardio"]
        names = [g["name"] for g in self.results(response) if g["name"] in seeded]
        self.assertEqual(names, seeded)  # all present, in their `order`

    def test_muscle_groups_are_read_only(self):
        response = self.client.post(MUSCLE_GROUPS_URL, {"name": "Vrat"}, format="json")
        self.assertEqual(response.status_code, 405)

    def test_create_training_and_append_sets(self):
        response = self.client.post(
            TRAININGS_URL,
            {"date": "2026-01-10", "muscle_group_ids": [self.chest.id]},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        training = Training.objects.get(id=response.data["id"])
        self.assertEqual(training.household, self.alice_household)

        sets_url = f"{TRAININGS_URL}{training.id}/sets/"
        response = self.client.post(
            sets_url, {"exercise_id": self.alice_bench.id, "weight": "80", "reps": 5}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["set_number"], 1)

    def test_append_set_rejects_other_household_exercise_and_bad_reps(self):
        training = Training.objects.create(
            household=self.alice_household, user=self.alice, date=date(2026, 1, 10)
        )
        sets_url = f"{TRAININGS_URL}{training.id}/sets/"
        response = self.client.post(sets_url, {"exercise_id": self.bob_fly.id}, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.client.post(
            sets_url, {"exercise_id": self.alice_bench.id, "reps": 0}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_duplicate_training_on_same_day_is_400_not_500(self):
        payload = {"date": "2026-01-10"}
        self.assertEqual(self.client.post(TRAININGS_URL, payload, format="json").status_code, 201)
        self.assertEqual(self.client.post(TRAININGS_URL, payload, format="json").status_code, 400)

    def test_moving_training_to_a_taken_date_is_400_not_500(self):
        Training.objects.create(
            household=self.alice_household, user=self.alice, date=date(2026, 1, 10)
        )
        other = Training.objects.create(
            household=self.alice_household, user=self.alice, date=date(2026, 1, 11)
        )
        url = f"{TRAININGS_URL}{other.id}/"
        self.assertEqual(
            self.client.patch(url, {"date": "2026-01-10"}, format="json").status_code, 400
        )
        # Re-saving the same date is not a conflict with itself.
        self.assertEqual(
            self.client.patch(url, {"date": "2026-01-11"}, format="json").status_code, 200
        )

    def test_training_date_defaults_to_today(self):
        response = self.client.post(TRAININGS_URL, {}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Training.objects.get(id=response.data["id"]).date, timezone.localdate())
        self.assertEqual(self.client.post(TRAININGS_URL, {}, format="json").status_code, 400)

    def test_append_set_exercise_must_match_training_muscle_groups(self):
        back = MuscleGroup.objects.create(name="Back", order=2)
        row = Exercise.objects.create(household=self.alice_household, muscle_group=back, name="Row")
        training = Training.objects.create(
            household=self.alice_household, user=self.alice, date=date(2026, 1, 10)
        )
        sets_url = f"{TRAININGS_URL}{training.id}/sets/"

        # No muscle groups on the training: any own exercise is fine.
        self.assertEqual(
            self.client.post(sets_url, {"exercise_id": row.id}, format="json").status_code, 201
        )

        training.muscle_groups.set([self.chest])
        response = self.client.post(sets_url, {"exercise_id": row.id}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("exercise_id", response.data)
        self.assertEqual(
            self.client.post(
                sets_url, {"exercise_id": self.alice_bench.id}, format="json"
            ).status_code,
            201,
        )

    def test_exercises_filter_by_several_muscle_groups(self):
        back = MuscleGroup.objects.create(name="Back", order=2)
        legs = MuscleGroup.objects.create(name="Legs", order=3)
        Exercise.objects.create(household=self.alice_household, muscle_group=back, name="Row")
        Exercise.objects.create(household=self.alice_household, muscle_group=legs, name="Squat")
        response = self.client.get(
            EXERCISES_URL, {"muscle_group__in": f"{self.chest.id},{back.id}"}
        )
        self.assertEqual(sorted(e["name"] for e in self.results(response)), ["Bench press", "Row"])

    def test_other_household_training_is_hidden(self):
        bob_training = Training.objects.create(
            household=self.bob_household, user=self.bob, date=date(2026, 1, 1)
        )
        self.assertEqual(self.results(self.client.get(TRAININGS_URL)), [])
        self.assertEqual(self.client.get(f"{TRAININGS_URL}{bob_training.id}/").status_code, 404)


SETS_URL = "/api/fitness/training-sets/"


class TrainingEditingTests(HouseholdAPITestCase):
    """Correcting and deleting sets, exercise history, protected exercises."""

    def setUp(self):
        super().setUp()
        self.chest = MuscleGroup.objects.create(name="Chest", order=1)
        self.bench = Exercise.objects.create(
            household=self.alice_household, muscle_group=self.chest, name="Bench press"
        )

    def _training(self, day, user=None, household=None):
        return Training.objects.create(
            household=household or self.alice_household, user=user or self.alice, date=day
        )

    def test_set_can_be_corrected_but_not_renumbered(self):
        training_set = self._training(date(2026, 1, 1)).add_set(self.bench, weight=80, reps=5)
        url = f"{SETS_URL}{training_set.id}/"
        response = self.client.patch(url, {"weight": "82.5", "reps": 6, "set_number": 9})
        self.assertEqual(response.status_code, 200, response.data)
        training_set.refresh_from_db()
        self.assertEqual((training_set.weight, training_set.reps), (Decimal("82.5"), 6))
        self.assertEqual(training_set.set_number, 1)

    def test_invalid_set_values_are_400(self):
        training_set = self._training(date(2026, 1, 1)).add_set(self.bench, weight=80, reps=5)
        url = f"{SETS_URL}{training_set.id}/"
        self.assertEqual(self.client.patch(url, {"reps": 0}).status_code, 400)
        self.assertEqual(self.client.patch(url, {"weight": "-1"}).status_code, 400)

    def test_deleting_a_set_renumbers_the_rest(self):
        training = self._training(date(2026, 1, 1))
        sets = [training.add_set(self.bench, weight=w, reps=5) for w in (60, 70, 80)]
        self.assertEqual(self.client.delete(f"{SETS_URL}{sets[0].id}/").status_code, 204)
        remaining = TrainingSet.objects.order_by("set_number")
        self.assertEqual(
            [(s.set_number, s.weight) for s in remaining], [(1, Decimal("70")), (2, Decimal("80"))]
        )

    def test_exercise_history(self):
        first = self._training(date(2026, 1, 1))
        first.add_set(self.bench, weight=80, reps=5)
        first.add_set(self.bench, weight=85, reps=3)
        second = self._training(date(2026, 1, 8))
        second.add_set(self.bench, weight=None, reps=10)  # bodyweight
        data = self.client.get(f"{EXERCISES_URL}{self.bench.id}/history/").data
        self.assertEqual([e["date"] for e in data], ["2026-01-01", "2026-01-08"])
        self.assertEqual(data[0]["max_weight"], "85.00")
        self.assertEqual((data[0]["total_reps"], data[0]["volume"]), (8, 655.0))
        self.assertEqual(data[1]["max_weight"], None)
        self.assertEqual(data[1]["sets"], [{"weight": None, "reps": 10}])

        data = self.client.get(
            f"{EXERCISES_URL}{self.bench.id}/history/", {"user": self.bob.id}
        ).data
        self.assertEqual(data, [])

    def test_used_exercise_cant_be_deleted(self):
        self._training(date(2026, 1, 1)).add_set(self.bench, weight=80, reps=5)
        self.assertEqual(self.client.delete(f"{EXERCISES_URL}{self.bench.id}/").status_code, 400)
        unused = Exercise.objects.create(household=self.alice_household, name="Plank")
        self.assertEqual(self.client.delete(f"{EXERCISES_URL}{unused.id}/").status_code, 204)

    def test_household_isolation(self):
        bob_exercise = Exercise.objects.create(household=self.bob_household, name="Bob row")
        bob_set = self._training(
            date(2026, 1, 1), user=self.bob, household=self.bob_household
        ).add_set(bob_exercise, weight=50, reps=5)
        self.assertEqual(
            self.client.get(f"{EXERCISES_URL}{bob_exercise.id}/history/").status_code, 404
        )
        url = f"{SETS_URL}{bob_set.id}/"
        self.assertEqual(self.client.patch(url, {"reps": 1}).status_code, 404)
        self.assertEqual(self.client.delete(url).status_code, 404)

    def test_training_item_can_be_read_and_removed(self):
        training = self._training(date(2026, 1, 1))
        training.add_set(self.bench, weight=80, reps=5)
        item = training.items.get()
        url = f"/api/fitness/training-items/{item.id}/"
        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertFalse(training.items.exists())
