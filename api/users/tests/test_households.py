from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from common.testing import HouseholdAPITestCase
from finances.models import Category, CategoryGroup
from finances.services import DEFAULT_CATEGORIES
from users.models import HouseholdInvitation

User = get_user_model()

HOUSEHOLDS_URL = "/api/auth/households/"
INVITATIONS_URL = "/api/auth/invitations/"
REGISTER_URL = "/api/auth/register/"
CATEGORIES_URL = "/api/finances/categories/"
PASSWORD = "Str0ng-pass-word"


class InvitationTests(HouseholdAPITestCase):
    """Alice owns her household and invites Bob, who has his own personal household."""

    def setUp(self):
        super().setUp()
        group = CategoryGroup.objects.create(household=self.alice_household, name="G")
        Category.objects.create(
            household=self.alice_household, category_group=group, name="Alice's"
        )
        group = CategoryGroup.objects.create(household=self.bob_household, name="G")
        Category.objects.create(household=self.bob_household, category_group=group, name="Bob's")

    def invite(self, email="bob@example.com"):
        self.client.force_authenticate(self.alice)
        url = f"{HOUSEHOLDS_URL}{self.alice_household.id}/invite/"
        return self.client.post(url, {"email": email}, format="json")

    def as_bob(self, method, path=""):
        self.client.force_authenticate(self.bob)
        return getattr(self.client, method)(f"{INVITATIONS_URL}{path}")

    def category_names(self, user):
        self.client.force_authenticate(user)
        return [c["name"] for c in self.results(self.client.get(CATEGORIES_URL))]

    def test_invite_creates_pending_invitation_without_moving_the_user(self):
        response = self.invite("BOB@example.com")  # email matched case-insensitively
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["status"], "pending")
        self.assertEqual(response.data["invited_user"]["email"], "bob@example.com")

        self.assertEqual(self.bob.get_active_household(), self.bob_household)
        self.assertEqual(self.invite().status_code, 400)  # already pending

        # Both sides see it: Bob as received, Alice as sent
        ids = [i["id"] for i in self.results(self.as_bob("get"))]
        self.assertEqual(ids, [response.data["id"]])
        self.client.force_authenticate(self.alice)
        self.assertEqual(len(self.results(self.client.get(INVITATIONS_URL))), 1)

    def test_accept_moves_user_and_keeps_personal_household_inactive(self):
        invitation_id = self.invite().data["id"]

        response = self.as_bob("post", f"{invitation_id}/accept/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["id"], self.alice_household.id)

        self.assertEqual(list(self.bob.households.all()), [self.alice_household])
        self.bob_household.refresh_from_db()  # still exists, owned by Bob, without members
        self.assertEqual(self.bob_household.owner, self.bob)
        self.assertEqual(self.bob_household.members.count(), 0)
        self.assertEqual(self.category_names(self.bob), ["Alice's"])
        self.assertEqual(self.as_bob("post", f"{invitation_id}/accept/").status_code, 404)

    def test_removed_member_gets_personal_household_back_with_its_data(self):
        invitation_id = self.invite().data["id"]
        self.as_bob("post", f"{invitation_id}/accept/")

        self.client.force_authenticate(self.alice)
        url = f"{HOUSEHOLDS_URL}{self.alice_household.id}/members/{self.bob.id}/"
        self.assertEqual(self.client.delete(url).status_code, 204)

        self.assertEqual(self.bob.get_active_household(), self.bob_household)
        self.assertEqual(self.category_names(self.bob), ["Bob's"])

    def test_member_leaves_and_gets_personal_household_back(self):
        invitation_id = self.invite().data["id"]
        self.as_bob("post", f"{invitation_id}/accept/")

        self.client.force_authenticate(self.bob)
        response = self.client.post(f"{HOUSEHOLDS_URL}{self.alice_household.id}/leave/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["id"], self.bob_household.id)
        self.assertEqual(list(self.bob.households.all()), [self.bob_household])
        self.assertEqual(self.category_names(self.bob), ["Bob's"])
        self.assertEqual(list(self.alice_household.members.all()), [self.alice])

    def test_owner_cant_leave_own_household(self):
        response = self.client.post(f"{HOUSEHOLDS_URL}{self.alice_household.id}/leave/")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.alice.get_active_household(), self.alice_household)

    def test_cant_leave_foreign_household(self):
        response = self.client.post(f"{HOUSEHOLDS_URL}{self.bob_household.id}/leave/")
        self.assertEqual(response.status_code, 404)

    def test_household_cant_be_deleted(self):
        response = self.client.delete(f"{HOUSEHOLDS_URL}{self.alice_household.id}/")
        self.assertEqual(response.status_code, 405)
        self.alice_household.refresh_from_db()

    def test_decline(self):
        invitation_id = self.invite().data["id"]
        self.assertEqual(self.as_bob("post", f"{invitation_id}/decline/").status_code, 204)
        invitation = HouseholdInvitation.objects.get(id=invitation_id)
        self.assertEqual(invitation.status, HouseholdInvitation.DECLINED)
        self.assertEqual(self.bob.get_active_household(), self.bob_household)
        self.assertEqual(self.invite().status_code, 201)  # can be invited again

    def test_owner_cancels_but_cant_accept(self):
        invitation_id = self.invite().data["id"]
        url = f"{INVITATIONS_URL}{invitation_id}/"
        self.assertEqual(self.client.post(f"{url}accept/").status_code, 403)
        self.assertEqual(self.as_bob("delete", f"{invitation_id}/").status_code, 403)

        self.client.force_authenticate(self.alice)
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertFalse(HouseholdInvitation.objects.filter(id=invitation_id).exists())

    def test_cant_accept_while_own_household_has_members(self):
        carol = User.objects.create_user(email="carol@example.com", password="pw")
        self.bob_household.add_member(carol)
        invitation_id = self.invite().data["id"]

        response = self.as_bob("post", f"{invitation_id}/accept/")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.bob.get_active_household(), self.bob_household)

    def test_cant_accept_while_member_of_another_household(self):
        carol = User.objects.create_user(email="carol@example.com", password="pw")
        carol_household = carol.get_active_household()
        HouseholdInvitation.objects.create(
            household=carol_household, invited_user=self.bob, invited_by=carol
        )
        first = self.results(self.as_bob("get"))[0]["id"]
        self.assertEqual(self.as_bob("post", f"{first}/accept/").status_code, 200)

        second = self.invite().data["id"]
        self.assertEqual(self.as_bob("post", f"{second}/accept/").status_code, 400)
        self.assertEqual(self.bob.get_active_household(), carol_household)

    def test_invitations_are_isolated(self):
        invitation_id = self.invite().data["id"]
        outsider = User.objects.create_user(email="eve@example.com", password="pw")
        self.client.force_authenticate(outsider)
        self.assertEqual(self.results(self.client.get(INVITATIONS_URL)), [])
        url = f"{INVITATIONS_URL}{invitation_id}/"
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.post(f"{url}accept/").status_code, 404)
        self.assertEqual(self.client.delete(url).status_code, 404)

    def test_user_in_a_household_cant_create_another(self):
        response = self.client.post(HOUSEHOLDS_URL, {"name": "Second"}, format="json")
        self.assertEqual(response.status_code, 400)


class SignUpDefaultsTests(APITestCase):
    def test_sign_up_seeds_default_categories(self):
        response = self.client.post(
            REGISTER_URL, {"email": "ana@example.com", "password": PASSWORD}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)
        household = User.objects.get(email="ana@example.com").get_active_household()

        groups = {g.name: g for g in household.category_groups.all()}
        self.assertEqual(set(groups), set(DEFAULT_CATEGORIES))
        for group_name, category_names in DEFAULT_CATEGORIES.items():
            self.assertEqual(
                sorted(groups[group_name].categories.values_list("name", flat=True)),
                sorted(category_names),
            )
