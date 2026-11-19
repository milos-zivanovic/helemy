"""
WSGI config for helemy project.
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "helemy.settings")
application = get_wsgi_application()
