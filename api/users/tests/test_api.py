from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from common.testing import HouseholdAPITestCase

User = get_user_model()

HOUSEHOLDS_URL = "/api/auth/households/"
REGISTER_URL = "/api/auth/register/"
TOKEN_URL = "/api/auth/token/"
REFRESH_URL = "/api/auth/token/refresh/"
LOGOUT_URL = "/api/auth/logout/"
ME_URL = "/api/auth/me/"
PASSWORD = "Str0ng-pass-word"


class HouseholdAPITests(HouseholdAPITestCase):
    def test_new_user_gets_personal_household(self):
        self.assertIsNotNone(self.alice_household)
        self.assertEqual(self.alice_household.owner, self.alice)

    def test_list_and_retrieve_only_own_households(self):
        response = self.client.get(HOUSEHOLDS_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([h["id"] for h in self.results(response)], [self.alice_household.id])

        self.assertEqual(
            self.client.get(f"{HOUSEHOLDS_URL}{self.alice_household.id}/").status_code, 200
        )
        self.assertEqual(
            self.client.get(f"{HOUSEHOLDS_URL}{self.bob_household.id}/").status_code, 404
        )

    def test_owner_can_rename_member_cannot(self):
        url = f"{HOUSEHOLDS_URL}{self.alice_household.id}/"
        self.assertEqual(self.client.patch(url, {"name": "Home"}, format="json").status_code, 200)

        self.alice_household.add_member(self.bob)
        self.client.force_authenticate(self.bob)
        self.assertEqual(self.client.patch(url, {"name": "Hacked"}, format="json").status_code, 403)

    def test_invite_and_remove_member(self):
        base = f"{HOUSEHOLDS_URL}{self.alice_household.id}"
        response = self.client.post(f"{base}/invite/", {"email": "bob@example.com"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertFalse(self.alice_household.members.filter(id=self.bob.id).exists())

        self.client.force_authenticate(self.bob)
        response = self.client.post(f"/api/auth/invitations/{response.data['id']}/accept/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(self.alice_household.members.filter(id=self.bob.id).exists())

        self.client.force_authenticate(self.alice)
        response = self.client.delete(f"{base}/members/{self.bob.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(self.alice_household.members.filter(id=self.bob.id).exists())

    def test_remove_unknown_member_returns_404(self):
        response = self.client.delete(f"{HOUSEHOLDS_URL}{self.alice_household.id}/members/999999/")
        self.assertEqual(response.status_code, 404)


class RegisterAPITests(APITestCase):
    def test_register_creates_user_with_household_and_returns_tokens(self):
        payload = {"email": "Ana@Example.com", "password": PASSWORD, "first_name": "Ana"}
        response = self.client.post(REGISTER_URL, payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["user"]["email"], "ana@example.com")
        self.assertNotIn("password", response.data["user"])

        user = User.objects.get(email="ana@example.com")
        self.assertTrue(user.check_password(PASSWORD))
        self.assertEqual(user.get_active_household().owner, user)

        # The returned access token works right away
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        self.assertEqual(self.client.get(ME_URL).data["email"], "ana@example.com")

    def test_register_rejects_duplicate_email_case_insensitive(self):
        User.objects.create_user(email="ana@example.com", password=PASSWORD)
        response = self.client.post(
            REGISTER_URL, {"email": "ANA@example.com", "password": PASSWORD}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)

    def test_register_rejects_weak_password(self):
        response = self.client.post(
            REGISTER_URL, {"email": "ana@example.com", "password": "123"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.data)
        self.assertFalse(User.objects.filter(email="ana@example.com").exists())

    def test_register_ignores_stale_authorization_header(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer not-a-valid-token")
        response = self.client.post(
            REGISTER_URL, {"email": "ana@example.com", "password": PASSWORD}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)


class LoginLogoutAPITests(APITestCase):
    def setUp(self):
        User.objects.create_user(email="ana@example.com", password=PASSWORD)

    def _login(self, email="ana@example.com"):
        return self.client.post(TOKEN_URL, {"email": email, "password": PASSWORD}, format="json")

    def test_login_email_is_case_insensitive(self):
        self.assertEqual(self._login("Ana@Example.COM").status_code, 200)

    def test_logout_blacklists_refresh_token(self):
        refresh = self._login().data["refresh"]

        response = self.client.post(LOGOUT_URL, {"refresh": refresh}, format="json")
        self.assertEqual(response.status_code, 204)

        response = self.client.post(REFRESH_URL, {"refresh": refresh}, format="json")
        self.assertEqual(response.status_code, 401)
        # A second logout with the same token is rejected too
        response = self.client.post(LOGOUT_URL, {"refresh": refresh}, format="json")
        self.assertEqual(response.status_code, 401)

    def test_logout_rejects_invalid_token(self):
        response = self.client.post(LOGOUT_URL, {"refresh": "garbage"}, format="json")
        self.assertEqual(response.status_code, 401)


class UserManagerTests(APITestCase):
    def test_create_superuser_without_username(self):
        admin = User.objects.create_superuser(email="Admin@Example.com", password=PASSWORD)
        self.assertTrue(admin.is_staff and admin.is_superuser)
        self.assertEqual(admin.email, "admin@example.com")
        self.assertFalse(hasattr(admin, "username") and admin.username)
