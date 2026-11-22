import re

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

User = get_user_model()

TOKEN_URL = "/api/auth/token/"
REFRESH_URL = "/api/auth/token/refresh/"
CHANGE_URL = "/api/auth/password/change/"
RESET_URL = "/api/auth/password/reset/"
CONFIRM_URL = "/api/auth/password/reset/confirm/"
OLD = "Old-pass-word-1"
NEW = "New-pass-word-2"
RESET_LINK = "http://app.test/reset?uid={uid}&token={token}"


class PasswordTestCase(APITestCase):
    def setUp(self):
        cache.clear()  # throttle counters live in the cache and would leak between tests
        self.user = User.objects.create_user(
            email="ana@example.com", password=OLD, email_verified=True
        )

    def login(self, password=OLD):
        return self.client.post(
            TOKEN_URL, {"email": "ana@example.com", "password": password}, format="json"
        )

    def assert_refresh_revoked(self, refresh):
        response = self.client.post(REFRESH_URL, {"refresh": refresh}, format="json")
        self.assertEqual(response.status_code, 401)


class PasswordChangeTests(PasswordTestCase):
    def test_change_password_revokes_old_tokens_and_returns_new_pair(self):
        old_refresh = self.login().data["refresh"]
        self.client.force_authenticate(self.user)

        response = self.client.post(
            CHANGE_URL, {"old_password": OLD, "new_password": NEW}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(set(response.data), {"access", "refresh"})

        self.assert_refresh_revoked(old_refresh)
        new_refresh = response.data["refresh"]
        self.assertEqual(
            self.client.post(REFRESH_URL, {"refresh": new_refresh}, format="json").status_code, 200
        )
        self.assertEqual(self.login(OLD).status_code, 401)
        self.assertEqual(self.login(NEW).status_code, 200)

    def test_wrong_old_password_is_rejected(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            CHANGE_URL, {"old_password": "nope", "new_password": NEW}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("old_password", response.data)

    def test_weak_new_password_is_rejected(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            CHANGE_URL, {"old_password": OLD, "new_password": "12345678"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("new_password", response.data)

    def test_requires_authentication(self):
        response = self.client.post(
            CHANGE_URL, {"old_password": OLD, "new_password": NEW}, format="json"
        )
        self.assertEqual(response.status_code, 401)


@override_settings(PASSWORD_RESET_URL=RESET_LINK)
class PasswordResetTests(PasswordTestCase):
    def request_reset(self, email="ana@example.com"):
        return self.client.post(RESET_URL, {"email": email}, format="json")

    def reset_params(self):
        """uid and token from the link in the last sent email."""
        match = re.search(r"uid=([\w-]+)&token=([\w-]+)", mail.outbox[-1].body)
        return {"uid": match[1], "token": match[2]}

    def test_full_reset_flow(self):
        old_refresh = self.login().data["refresh"]

        response = self.request_reset("ANA@example.com")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["ana@example.com"])

        params = self.reset_params()
        response = self.client.post(CONFIRM_URL, {**params, "new_password": NEW}, format="json")
        self.assertEqual(response.status_code, 204, response.data)

        self.assert_refresh_revoked(old_refresh)
        self.assertEqual(self.login(NEW).status_code, 200)
        # The link is single-use: the token is tied to the old password hash
        response = self.client.post(CONFIRM_URL, {**params, "new_password": OLD}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("token", response.data)

    def test_unknown_email_gets_same_answer_and_no_email(self):
        response = self.request_reset("nobody@example.com")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(len(mail.outbox), 0)

    def test_inactive_user_gets_no_email(self):
        self.user.is_active = False
        self.user.save()
        self.assertEqual(self.request_reset().status_code, 204)
        self.assertEqual(len(mail.outbox), 0)

    def test_invalid_uid_or_token_is_rejected(self):
        self.request_reset()
        params = self.reset_params()
        for bad in ({**params, "token": "bad-token"}, {**params, "uid": "bad"}):
            response = self.client.post(CONFIRM_URL, {**bad, "new_password": NEW}, format="json")
            self.assertEqual(response.status_code, 400)
            self.assertIn("token", response.data)
        self.assertEqual(self.login(OLD).status_code, 200)

    def test_weak_password_is_rejected_on_confirm(self):
        self.request_reset()
        response = self.client.post(
            CONFIRM_URL, {**self.reset_params(), "new_password": "123"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("new_password", response.data)

    def test_reset_requests_are_throttled(self):
        for _ in range(5):
            self.assertEqual(self.request_reset().status_code, 204)
        self.assertEqual(self.request_reset().status_code, 429)
