"""PUT/DELETE /api/auth/me/avatar/ (profile picture) and `avatar_url` in the profile."""

import shutil
import tempfile
from io import BytesIO

from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image

from common.testing import HouseholdAPITestCase

AVATAR_URL = "/api/auth/me/avatar/"
ME_URL = "/api/auth/me/"

MEDIA_ROOT = tempfile.mkdtemp()  # files never land in api/media during tests


def image_upload(fmt="PNG", size=(400, 300), name="photo.png"):
    buffer = BytesIO()
    Image.new("RGB", size, "red").save(buffer, fmt)
    return SimpleUploadedFile(name, buffer.getvalue())


@override_settings(MEDIA_ROOT=MEDIA_ROOT)
class AvatarTests(HouseholdAPITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)
        super().tearDownClass()

    def upload(self, file):
        return self.client.put(AVATAR_URL, {"avatar": file}, format="multipart")

    def test_upload_stores_a_256_square_webp_and_returns_the_profile(self):
        response = self.upload(image_upload(size=(400, 300)))

        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("households", response.data)  # the whole profile, like GET /me/
        self.assertTrue(response.data["avatar_url"].startswith("http://testserver/media/avatars/"))
        self.alice.refresh_from_db()
        with default_storage.open(self.alice.avatar.name) as stored, Image.open(stored) as image:
            self.assertEqual((image.format, image.size), ("WEBP", (256, 256)))

    def test_new_picture_replaces_and_deletes_the_old_one(self):
        self.upload(image_upload())
        self.alice.refresh_from_db()
        old = self.alice.avatar.name

        self.upload(image_upload(fmt="JPEG", name="photo.jpg"))
        self.alice.refresh_from_db()
        self.assertNotEqual(self.alice.avatar.name, old)
        self.assertFalse(default_storage.exists(old))

    def test_delete_removes_the_picture(self):
        self.upload(image_upload())
        self.alice.refresh_from_db()
        name = self.alice.avatar.name

        response = self.client.delete(AVATAR_URL)
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["avatar_url"])
        self.assertFalse(default_storage.exists(name))

    def test_rejects_what_is_not_an_allowed_image(self):
        not_an_image = SimpleUploadedFile("notes.png", b"definitely not a picture")
        gif = image_upload(fmt="GIF", name="anim.gif")
        for upload in [not_an_image, gif]:
            response = self.upload(upload)
            self.assertEqual(response.status_code, 400)
            self.assertIn("avatar", response.data)
        self.alice.refresh_from_db()
        self.assertFalse(self.alice.avatar)

    @override_settings(DATA_UPLOAD_MAX_MEMORY_SIZE=None)
    def test_rejects_a_file_over_5_mb(self):
        big = SimpleUploadedFile("big.png", b"0" * (5 * 1024 * 1024 + 1))
        response = self.upload(big)
        self.assertEqual(response.status_code, 400)
        self.assertIn("avatar", response.data)

    def test_only_changes_the_requesting_user_and_shows_in_members(self):
        self.upload(image_upload())
        self.bob.refresh_from_db()
        self.assertFalse(self.bob.avatar)

        household = self.alice.get_active_household()
        members = self.client.get(f"/api/auth/households/{household.id}/members/").data
        self.assertIsNotNone(members[0]["avatar_url"])

    def test_requires_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.upload(image_upload()).status_code, 401)
        self.assertEqual(self.client.delete(AVATAR_URL).status_code, 401)
