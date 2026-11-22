"""PUT/DELETE /api/fitness/exercises/{id}/image/ and `image_url` where exercises are shown."""

import shutil
import tempfile
from datetime import date
from io import BytesIO

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image

from common.testing import HouseholdAPITestCase
from fitness.models import Exercise, Training, TrainingItem

MEDIA_ROOT = tempfile.mkdtemp()  # files never land in api/media during tests


def image_upload(fmt="PNG", size=(800, 600), name="photo.png"):
    buffer = BytesIO()
    Image.new("RGB", size, "blue").save(buffer, fmt)
    return SimpleUploadedFile(name, buffer.getvalue())


@override_settings(MEDIA_ROOT=MEDIA_ROOT)
class ExerciseImageTests(HouseholdAPITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        super().setUp()
        self.exercise = Exercise.objects.create(household=self.alice_household, name="Bench press")
        self.url = f"/api/fitness/exercises/{self.exercise.id}/image/"

    def upload(self, file, url=None):
        return self.client.put(url or self.url, {"image": file}, format="multipart")

    def test_upload_stores_a_512_square_webp_and_returns_the_exercise(self):
        response = self.upload(image_upload())

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["name"], "Bench press")
        self.assertTrue(response.data["image_url"].startswith("http://testserver/media/exercises/"))
        self.exercise.refresh_from_db()
        with (
            default_storage.open(self.exercise.image.name) as stored,
            Image.open(stored) as image,
        ):
            self.assertEqual((image.format, image.size), ("WEBP", (512, 512)))

    def test_replace_deletes_the_old_file_and_delete_removes_it(self):
        self.upload(image_upload())
        self.exercise.refresh_from_db()
        first = self.exercise.image.name

        self.upload(image_upload(fmt="JPEG", name="photo.jpg"))
        self.exercise.refresh_from_db()
        second = self.exercise.image.name
        self.assertFalse(default_storage.exists(first))

        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["image_url"])
        self.assertFalse(default_storage.exists(second))

    def test_rejects_what_is_not_an_image(self):
        response = self.upload(SimpleUploadedFile("x.png", b"not a picture"))
        self.assertEqual(response.status_code, 400)
        self.assertIn("image", response.data)

    def test_an_existing_image_is_shown_as_it_is(self):
        # Images stored before (e.g. migrated ones) keep working without a new upload.
        self.exercise.image.save("old.jpg", ContentFile(b"jpeg bytes"), save=True)
        response = self.client.get(f"/api/fitness/exercises/{self.exercise.id}/")
        self.assertTrue(response.data["image_url"].endswith(self.exercise.image.url))

    def test_image_url_in_the_list_and_on_the_training(self):
        self.upload(image_upload())
        listed = self.results(self.client.get("/api/fitness/exercises/"))
        self.assertIsNotNone(listed[0]["image_url"])

        training = Training.objects.create(
            household=self.alice_household, user=self.alice, date=date(2026, 11, 1)
        )
        TrainingItem.objects.create(training=training, exercise=self.exercise, order=1)
        detail = self.client.get(f"/api/fitness/trainings/{training.id}/").data
        self.assertIsNotNone(detail["items"][0]["exercise"]["image_url"])

    def test_other_household_cannot_change_or_remove_it(self):
        self.client.force_authenticate(self.bob)
        self.assertEqual(self.upload(image_upload()).status_code, 404)
        self.assertEqual(self.client.delete(self.url).status_code, 404)
        self.exercise.refresh_from_db()
        self.assertFalse(self.exercise.image)

    def test_image_is_not_writable_through_the_exercise_itself(self):
        response = self.client.patch(
            f"/api/fitness/exercises/{self.exercise.id}/",
            {"image": image_upload()},
            format="multipart",
        )
        self.assertEqual(response.status_code, 200)
        self.exercise.refresh_from_db()
        self.assertFalse(self.exercise.image)
