"""PATCH /api/auth/me/ (the user's own preferences) and the language stored at sign up."""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from common.testing import HouseholdAPITestCase

User = get_user_model()

ME_URL = "/api/auth/me/"
REGISTER_URL = "/api/auth/register/"


class UpdateMeTests(HouseholdAPITestCase):
    def test_changes_the_language_and_returns_the_profile(self):
        response = self.client.patch(ME_URL, {"language": "sr-latn"}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["language"], "sr-latn")
        self.assertIn("households", response.data)  # the same shape as GET /api/auth/me/
        self.alice.refresh_from_db()
        self.assertEqual(self.alice.language, "sr-latn")

    def test_changes_only_the_requesting_user(self):
        # The endpoint has no id: it can only ever reach request.user.
        self.client.patch(ME_URL, {"language": "sr-latn"}, format="json")

        self.bob.refresh_from_db()
        self.assertEqual(self.bob.language, "en")

    def test_rejects_an_unsupported_language(self):
        response = self.client.patch(ME_URL, {"language": "de"}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("language", response.data)

    def test_changes_name_currency_and_timezone(self):
        body = {
            "first_name": "Alice",
            "last_name": "Smith",
            "currency": "EUR",
            "timezone": "America/New_York",
        }
        response = self.client.patch(ME_URL, body, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["full_name"], "Alice Smith")
        self.alice.refresh_from_db()
        self.assertEqual(
            (self.alice.first_name, self.alice.last_name, self.alice.currency, self.alice.timezone),
            ("Alice", "Smith", "EUR", "America/New_York"),
        )

    def test_changes_the_weight_unit(self):
        response = self.client.patch(ME_URL, {"weight_unit": "lb"}, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["weight_unit"], "lb")
        self.alice.refresh_from_db()
        self.assertEqual(self.alice.weight_unit, "lb")

    def test_rejects_an_unknown_weight_unit(self):
        response = self.client.patch(ME_URL, {"weight_unit": "stone"}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("weight_unit", response.data)

    def test_name_can_be_cleared(self):
        self.client.patch(ME_URL, {"first_name": "Alice"}, format="json")
        response = self.client.patch(ME_URL, {"first_name": ""}, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.alice.refresh_from_db()
        self.assertEqual(self.alice.first_name, "")

    def test_rejects_an_unknown_currency_or_timezone(self):
        response = self.client.patch(
            ME_URL, {"currency": "XYZ", "timezone": "Mars/Olympus"}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("currency", response.data)
        self.assertIn("timezone", response.data)

    def test_other_fields_are_ignored(self):
        # Only preferences: the email (the login) can't be changed here.
        response = self.client.patch(
            ME_URL, {"email": "eve@example.com", "language": "en"}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.alice.refresh_from_db()
        self.assertEqual(self.alice.email, "alice@example.com")

    def test_requires_login(self):
        self.client.force_authenticate(None)
        response = self.client.patch(ME_URL, {"language": "en"}, format="json")
        self.assertEqual(response.status_code, 401)


class SignUpLanguageTests(APITestCase):
    def register(self, **headers):
        body = {"email": "new@example.com", "password": "Long-enough-2026!"}
        response = self.client.post(REGISTER_URL, body, format="json", headers=headers)
        self.assertEqual(response.status_code, 201)
        return User.objects.get(email="new@example.com")

    def test_stores_the_language_of_the_request(self):
        self.assertEqual(self.register(accept_language="sr-Latn").language, "sr-latn")

    def test_english_without_accept_language(self):
        self.assertEqual(self.register().language, "en")
