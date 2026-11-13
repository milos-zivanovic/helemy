from django.contrib.auth import get_user_model
from django.test import TestCase

from users.models import Household

User = get_user_model()

PASSWORD = "Str0ng-pass-word"


class AdminTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password=PASSWORD)
        self.client.force_login(self.admin)

    def test_pages_render(self):
        household = self.admin.get_active_household()
        for url in (
            "/admin/users/user/",
            "/admin/users/user/?q=admin",
            "/admin/users/user/add/",
            f"/admin/users/user/{self.admin.pk}/change/",
            f"/admin/users/user/{self.admin.pk}/password/",
            "/admin/users/household/",
            f"/admin/users/household/{household.pk}/change/",
        ):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 200)

    def test_add_user_with_email_only(self):
        response = self.client.post(
            "/admin/users/user/add/",
            {
                "email": "New.User@Example.com",
                "usable_password": "true",
                "password1": PASSWORD,
                "password2": PASSWORD,
            },
        )
        self.assertEqual(response.status_code, 302)
        user = User.objects.get(email="new.user@example.com")
        self.assertTrue(user.check_password(PASSWORD))
        self.assertTrue(Household.objects.filter(owner=user).exists())

    def test_muscle_group_admin(self):
        self.assertEqual(self.client.get("/admin/fitness/musclegroup/").status_code, 200)
        response = self.client.post("/admin/fitness/musclegroup/add/", {"name": "Vrat", "order": 9})
        self.assertEqual(response.status_code, 302)
