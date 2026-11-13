"""Shared helpers for API tests."""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

User = get_user_model()


class HouseholdAPITestCase(APITestCase):
    """
    Two users, each in their own (auto-created) household.
    `self.client` is authenticated as `self.alice`.
    """

    def setUp(self):
        self.alice = User.objects.create_user(email="alice@example.com", password="pw")
        self.bob = User.objects.create_user(email="bob@example.com", password="pw")
        self.alice_household = self.alice.get_active_household()
        self.bob_household = self.bob.get_active_household()
        self.client.force_authenticate(self.alice)

    def results(self, response):
        """Return the list of items from a paginated or plain list response."""
        data = response.data
        return data["results"] if isinstance(data, dict) and "results" in data else data
