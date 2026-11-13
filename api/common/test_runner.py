from django.conf import settings
from django.test.runner import DiscoverRunner


class FastPasswordTestRunner(DiscoverRunner):
    """
    Django's test runner with a fast password hasher.

    The default PBKDF2 hasher runs 1,000,000 iterations (Django 5.2), about a second per
    user on a dev machine. Every test creates users, so hashing alone would dominate the
    run time. MD5 is fine here: test passwords are throwaway values.
    """

    def setup_test_environment(self, **kwargs):
        super().setup_test_environment(**kwargs)
        settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
