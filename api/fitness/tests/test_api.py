from datetime import date

from django.utils import timezone

from common.testing import HouseholdAPITestCase
from fitness.models import Exercise, MuscleGroup, Training

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
