import re
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from users.services import make_email_verification_token

User = get_user_model()

REGISTER_URL = "/api/auth/register/"
TOKEN_URL = "/api/auth/token/"
VERIFY_URL = "/api/auth/email/verify/"
RESEND_URL = "/api/auth/email/verify/resend/"
ME_URL = "/api/auth/me/"
PASSWORD = "Str0ng-pass-word"
VERIFY_LINK = "http://app.test/verify-email?token={token}"


@override_settings(EMAIL_VERIFICATION_URL=VERIFY_LINK)
class EmailVerificationTests(APITestCase):
    def setUp(self):
        cache.clear()  # throttle counters live in the cache and would leak between tests

    def register(self, email="ana@example.com"):
        body = {"email": email, "password": PASSWORD, "first_name": "Ana"}
        return self.client.post(REGISTER_URL, body, format="json")

    def login(self, email="ana@example.com"):
        return self.client.post(TOKEN_URL, {"email": email, "password": PASSWORD}, format="json")

    def token_from_email(self, message):
        return re.search(r"verify-email\?token=(\S+)", message.body).group(1)

    def verify(self, token):
        return self.client.post(VERIFY_URL, {"token": token}, format="json")

    def test_full_flow_sign_up_verify_log_in(self):
        self.assertEqual(self.register().status_code, 201)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["ana@example.com"])
        self.assertIn("48", mail.outbox[0].body)

        # Not confirmed yet: the right password is not enough, and the client can tell why.
        response = self.login()
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["code"], "email_not_verified")

        # The link confirms the email and logs in.
        response = self.verify(self.token_from_email(mail.outbox[0]))
        self.assertEqual(response.status_code, 200, response.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        self.assertEqual(self.client.get(ME_URL).data["email"], "ana@example.com")
        self.assertTrue(User.objects.get(email="ana@example.com").email_verified)

        self.client.credentials()
        self.assertEqual(self.login().status_code, 200)

    def test_wrong_password_of_unverified_user_does_not_reveal_the_account(self):
        self.register()
        response = self.client.post(
            TOKEN_URL, {"email": "ana@example.com", "password": "wrong"}, format="json"
        )
        self.assertEqual(response.status_code, 401)
        self.assertNotEqual(response.data.get("code"), "email_not_verified")

    def test_link_works_only_once(self):
        self.register()
        token = self.token_from_email(mail.outbox[0])
        self.assertEqual(self.verify(token).status_code, 200)

        response = self.verify(token)
        self.assertEqual(response.status_code, 400)
        self.assertIn("token", response.data)

    def test_invalid_or_tampered_token_is_rejected(self):
        self.register()
        token = self.token_from_email(mail.outbox[0])
        for bad in ["garbage", token[:-2] + "xx"]:
            response = self.verify(bad)
            self.assertEqual(response.status_code, 400)
            self.assertIn("token", response.data)
        self.assertFalse(User.objects.get(email="ana@example.com").email_verified)

    def test_expired_token_is_rejected(self):
        user = User.objects.create_user(email="ana@example.com", password=PASSWORD)
        with mock.patch("django.core.signing.time.time", return_value=0):
            token = make_email_verification_token(user)
        self.assertEqual(self.verify(token).status_code, 400)

    def test_token_stops_working_when_the_email_changes(self):
        user = User.objects.create_user(email="ana@example.com", password=PASSWORD)
        token = make_email_verification_token(user)
        user.email = "other@example.com"
        user.save()
        self.assertEqual(self.verify(token).status_code, 400)

    def test_resend_sends_a_new_link_to_an_unverified_account(self):
        self.register()
        response = self.client.post(RESEND_URL, {"email": "ANA@example.com"}, format="json")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(len(mail.outbox), 2)
        self.assertEqual(self.verify(self.token_from_email(mail.outbox[1])).status_code, 200)

    def test_resend_is_silent_for_unknown_and_verified_emails(self):
        User.objects.create_user(email="done@example.com", password=PASSWORD, email_verified=True)
        for email in ["nobody@example.com", "done@example.com"]:
            response = self.client.post(RESEND_URL, {"email": email}, format="json")
            self.assertEqual(response.status_code, 204)
        self.assertEqual(len(mail.outbox), 0)

    def test_resend_is_throttled(self):
        for _ in range(5):
            self.client.post(RESEND_URL, {"email": "ana@example.com"}, format="json")
        response = self.client.post(RESEND_URL, {"email": "ana@example.com"}, format="json")
        self.assertEqual(response.status_code, 429)

    def test_failed_email_does_not_fail_sign_up(self):
        with mock.patch("users.services.send_mail", side_effect=OSError("SMTP down")):
            with self.assertLogs("users.services", level="ERROR"):
                response = self.register()
        self.assertEqual(response.status_code, 201)
        self.assertTrue(User.objects.filter(email="ana@example.com").exists())

    def test_superuser_is_verified(self):
        admin = User.objects.create_superuser(email="admin@example.com", password=PASSWORD)
        self.assertTrue(admin.email_verified)
