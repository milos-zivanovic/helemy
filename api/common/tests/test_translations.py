"""The API speaks the client's language (Accept-Language): English by default, Serbian (Latin)."""

import gettext
import importlib.util
import re
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase
from rest_framework.test import APITestCase

from common import third_party_messages

User = get_user_model()

REGISTER_URL = "/api/auth/register/"
LOGIN_URL = "/api/auth/token/"
ACCOUNTS_URL = "/api/finances/accounts/"
CATALOG = Path(settings.BASE_DIR) / "locale" / "sr_Latn" / "LC_MESSAGES"


class ResponseLanguageTests(APITestCase):
    def setUp(self):
        User.objects.create_user(email="taken@example.com", password="pw")

    def register_taken_email(self, **headers):
        body = {"email": "taken@example.com", "password": "Long-enough-2026!"}
        return self.client.post(REGISTER_URL, body, format="json", headers=headers)

    def test_english_without_accept_language(self):
        response = self.register_taken_email()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["email"], ["A user with this email already exists."])

    def test_serbian_latin_for_sr_latn(self):
        response = self.register_taken_email(accept_language="sr-Latn")
        self.assertEqual(response.data["email"], ["Korisnik sa ovom email adresom već postoji."])

    def test_plain_sr_gets_latin_too(self):
        # Django's own "sr" catalog is Cyrillic; "sr" must resolve to sr-latn, the only Serbian here.
        response = self.register_taken_email(accept_language="sr")
        self.assertEqual(response.data["email"], ["Korisnik sa ovom email adresom već postoji."])

    def test_unsupported_language_falls_back_to_english(self):
        response = self.register_taken_email(accept_language="de-DE,de;q=0.9")
        self.assertEqual(response.data["email"], ["A user with this email already exists."])

    def test_django_message_in_serbian(self):
        response = self.client.post(
            REGISTER_URL, {}, format="json", headers={"accept_language": "sr"}
        )
        self.assertEqual(response.data["password"], ["Ovo polje se mora popuniti."])

    def test_drf_message_in_serbian(self):
        # DRF ships no Serbian: this one comes from our catalog.
        response = self.client.get(ACCOUNTS_URL, headers={"accept_language": "sr"})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["detail"], "Niste prijavljeni.")

    def test_simplejwt_message_in_serbian(self):
        body = {"email": "taken@example.com", "password": "wrong"}
        response = self.client.post(
            LOGIN_URL, body, format="json", headers={"accept_language": "sr"}
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["detail"], "Pogrešan email ili lozinka.")

    def test_password_validator_in_serbian(self):
        body = {"email": "new@example.com", "password": "12345678"}
        response = self.client.post(
            REGISTER_URL, body, format="json", headers={"accept_language": "sr"}
        )
        self.assertIn("Ova lozinka sadrži samo cifre.", response.data["password"])

    def test_response_varies_by_language(self):
        # Caches (a CDN, the browser) must not serve one language's answer for another.
        response = self.register_taken_email(accept_language="sr")
        self.assertIn("Accept-Language", response["Vary"])


def unquote(text):
    """A .po string line without its quotes, escapes resolved: '"a\\"b\\n"' → 'a"b\n'."""
    return text[1:-1].replace('\\"', '"').replace("\\n", "\n").replace("\\\\", "\\")


def read_po(path):
    """msgid → msgstr of a .po file, header left out. Enough for makemessages' layout."""
    entries, entry, field = {}, {}, None
    for line in path.read_text(encoding="utf-8").splitlines() + [""]:
        if line.startswith(("msgid ", "msgstr ")):
            field, _, value = line.partition(" ")
            entry[field] = unquote(value)
        elif line.startswith('"') and field:
            entry[field] += unquote(line)  # a continuation line
        else:  # a blank line or a comment ends the entry
            if entry.get("msgid"):
                entries[entry["msgid"]] = entry.get("msgstr", "")
            entry, field = {}, None
    return entries


class CatalogTests(SimpleTestCase):
    def setUp(self):
        self.po = read_po(CATALOG / "django.po")
        with open(CATALOG / "django.mo", "rb") as file:
            self.mo = {k: v for k, v in gettext.GNUTranslations(file)._catalog.items() if k}

    def test_every_message_is_translated(self):
        self.assertEqual([msgid for msgid, msgstr in self.po.items() if not msgstr], [])

    def test_compiled_catalog_matches_po(self):
        # django.mo is what Django reads; a .po edit without compilemessages changes nothing.
        self.assertEqual(self.mo, self.po, "run: python manage.py compilemessages")

    def test_placeholders_match(self):
        placeholder = re.compile(r"%\(\w+\)[sd]|\{\w+\}")
        mismatched = [
            msgid
            for msgid, msgstr in self.po.items()
            if sorted(placeholder.findall(msgid)) != sorted(placeholder.findall(msgstr))
        ]
        self.assertEqual(mismatched, [])

    def test_third_party_msgids_still_exist(self):
        # After a DRF / SimpleJWT / Django upgrade a reworded message would silently lose its
        # translation: each msgid we translate must still be in the package's source.
        source = ""
        for package in ("rest_framework", "rest_framework_simplejwt", "django.contrib.auth"):
            root = Path(importlib.util.find_spec(package).origin).parent
            source += "".join(path.read_text(encoding="utf-8") for path in root.rglob("*.py"))
        messages = (
            third_party_messages.DRF
            + third_party_messages.SIMPLE_JWT
            + third_party_messages.DJANGO_AUTH
        )
        gone = [message for message in messages if message not in source]
        self.assertEqual(gone, [])
