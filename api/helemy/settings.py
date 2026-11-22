from datetime import timedelta
from pathlib import Path

import environ

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Environment variables
env = environ.Env(
    DEBUG=(bool, False),
    SECRET_KEY=(str, ""),
    ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
    DATABASE_URL=(str, f'sqlite:///{BASE_DIR / "data" / "db.sqlite3"}'),
    CORS_ALLOWED_ORIGINS=(list, ["http://localhost:3000", "http://127.0.0.1:3000"]),
    CORS_ALLOWED_ORIGIN_REGEXES=(list, []),
    CSRF_TRUSTED_ORIGINS=(list, []),
    HTTPS=(bool, False),
    SECURE_HSTS_SECONDS=(int, 0),
    DB_CONN_MAX_AGE=(int, 0),
    NUM_PROXIES=(int, None),
    MEDIA_BUCKET_NAME=(str, ""),
    MEDIA_ENDPOINT_URL=(str, ""),
    MEDIA_ACCESS_KEY_ID=(str, ""),
    MEDIA_SECRET_ACCESS_KEY=(str, ""),
    MEDIA_CUSTOM_DOMAIN=(str, ""),
    JWT_ACCESS_TOKEN_LIFETIME_MINUTES=(int, 15),
    JWT_REFRESH_TOKEN_LIFETIME_DAYS=(int, 7),
    JWT_ROTATE_REFRESH_TOKENS=(bool, True),
    JWT_BLACKLIST_AFTER_ROTATION=(bool, True),
    SPECTACULAR_TITLE=(str, "Helemy API"),
    SPECTACULAR_DESCRIPTION=(
        str,
        "API for Helemy - Personal finance, fitness, and nutrition tracking",
    ),
    SPECTACULAR_VERSION=(str, "1.0.0"),
    EMAIL_URL=(str, "consolemail://"),
    DEFAULT_FROM_EMAIL=(str, "Helemy <noreply@localhost>"),
    PASSWORD_RESET_URL=(str, "http://localhost:3000/reset-password?uid={uid}&token={token}"),
    EMAIL_VERIFICATION_URL=(str, "http://localhost:3000/verify-email?token={token}"),
)

# Read .env file if exists
environ.Env.read_env(BASE_DIR / ".env")

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = env("SECRET_KEY")

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = env("DEBUG")

ALLOWED_HOSTS = env("ALLOWED_HOSTS")

# Behind an HTTPS proxy (Cloud Run / Cloudflare in production). The proxy ends TLS and talks plain HTTP
# to gunicorn, so Django learns the original scheme from X-Forwarded-Proto. Without it every request
# looks like http and the admin login fails the CSRF origin check. Only turn it on behind a proxy
# that sets this header itself, otherwise a client could fake it.
if env("HTTPS"):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = env("SECURE_HSTS_SECONDS")

# Origins whose POSTs the admin accepts when they differ from the API's own host (rarely needed)
CSRF_TRUSTED_ORIGINS = env("CSRF_TRUSTED_ORIGINS")

# Application definition
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "drf_spectacular",
    "corsheaders",
    # Local apps
    "common",
    "users",
    "finances",
    "fitness",
    "nutrition",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    # Serves collected static files (admin CSS/JS) when DEBUG=0, e.g. under gunicorn
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    # Picks the language of each request from its Accept-Language header (after sessions, before
    # common, as Django requires); error messages and emails then come in that language.
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "helemy.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "helemy.wsgi.application"

# Database
DATABASES = {
    "default": env.db("DATABASE_URL"),
}
# Seconds a connection is reused between requests (0 = a new one per request). A pooler (Supabase)
# in front of PostgreSQL makes new connections cheap; health checks drop a connection it closed.
DATABASES["default"]["CONN_MAX_AGE"] = env("DB_CONN_MAX_AGE")
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True

# Tests: same runner as Django default, plus a fast password hasher (see common/test_runner.py)
TEST_RUNNER = "common.test_runner.FastPasswordTestRunner"

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Internationalization
# The API answers in the client's language (Accept-Language, see LocaleMiddleware), English when
# it sends none or an unsupported one. "sr-latn" is Serbian in Latin script: Django's plain "sr"
# translations are Cyrillic. A client that asks for "sr" gets sr-latn too (the only Serbian here).
LANGUAGE_CODE = "en"
LANGUAGES = [("en", "English"), ("sr-latn", "Srpski")]
# Our translations (locale/sr_Latn/LC_MESSAGES/django.po): our own messages plus Serbian for the
# DRF and SimpleJWT messages, which ship without it. Takes priority over Django's own catalogs.
LOCALE_PATHS = [BASE_DIR / "locale"]
TIME_ZONE = "Europe/Belgrade"
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

# Media files
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

# Uploaded files on S3-compatible storage (Cloudflare R2 in production) when a bucket is set,
# otherwise on the local disk (MEDIA_ROOT). Cloud Run has no persistent disk, so production needs
# the bucket. Files are then served from MEDIA_CUSTOM_DOMAIN (the bucket's public domain).
if env("MEDIA_BUCKET_NAME"):
    STORAGES["default"] = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": env("MEDIA_BUCKET_NAME"),
            "endpoint_url": env("MEDIA_ENDPOINT_URL"),
            "access_key": env("MEDIA_ACCESS_KEY_ID"),
            "secret_key": env("MEDIA_SECRET_ACCESS_KEY"),
            "custom_domain": env("MEDIA_CUSTOM_DOMAIN") or None,
            "region_name": "auto",  # R2 has no regions
            "signature_version": "s3v4",
            "default_acl": None,  # R2 has no per-object ACLs; access is set on the bucket
            "querystring_auth": False,  # public bucket: plain URLs, no expiring signatures
            "file_overwrite": False,  # same name uploaded twice gets a suffix, not replaced
        },
    }

# Default primary key field type
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Custom user model
AUTH_USER_MODEL = "users.User"

# Django REST Framework
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "common.pagination.StandardResultsSetPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.OrderingFilter",
        "rest_framework.filters.SearchFilter",
    ),
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "100/day",
        "user": "1000/hour",
        "burst": "60/minute",
        "password_reset": "5/hour",
        "email_verification": "5/hour",
    },
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    # Proxies in front of the API: throttling then takes the client IP from X-Forwarded-For,
    # counting this many entries from the right. None = no proxy count, the whole header is used.
    "NUM_PROXIES": env("NUM_PROXIES"),
}

# SimpleJWT
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env("JWT_ACCESS_TOKEN_LIFETIME_MINUTES")),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env("JWT_REFRESH_TOKEN_LIFETIME_DAYS")),
    "ROTATE_REFRESH_TOKENS": env("JWT_ROTATE_REFRESH_TOKENS"),
    "BLACKLIST_AFTER_ROTATION": env("JWT_BLACKLIST_AFTER_ROTATION"),
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "VERIFYING_KEY": None,
    "AUDIENCE": None,
    "ISSUER": None,
    "JWK_URL": None,
    "LEEWAY": 0,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_HEADER_NAME": "HTTP_AUTHORIZATION",
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "USER_AUTHENTICATION_RULE": "rest_framework_simplejwt.authentication.default_user_authentication_rule",
    # Login: also refuses users who haven't confirmed their email yet.
    "TOKEN_OBTAIN_SERIALIZER": "users.serializers.TokenObtainSerializer",
    "AUTH_TOKEN_CLASSES": ("rest_framework_simplejwt.tokens.AccessToken",),
    "TOKEN_TYPE_CLAIM": "token_type",
    "TOKEN_USER_CLASS": "rest_framework_simplejwt.models.TokenUser",
    "JTI_CLAIM": "jti",
    "SLIDING_TOKEN_REFRESH_EXP_CLAIM": "refresh_exp",
    "SLIDING_TOKEN_LIFETIME": timedelta(minutes=5),
    "SLIDING_TOKEN_REFRESH_LIFETIME": timedelta(days=1),
}

# CORS
CORS_ALLOWED_ORIGINS = env("CORS_ALLOWED_ORIGINS")
# Regexes for origins that can't be listed, e.g. Cloudflare Pages previews (<id>.helemy.pages.dev)
CORS_ALLOWED_ORIGIN_REGEXES = env("CORS_ALLOWED_ORIGIN_REGEXES")
CORS_ALLOW_CREDENTIALS = True

# DRF Spectacular
SPECTACULAR_SETTINGS = {
    "TITLE": env("SPECTACULAR_TITLE"),
    "DESCRIPTION": env("SPECTACULAR_DESCRIPTION"),
    "VERSION": env("SPECTACULAR_VERSION"),
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    # users.serializers.ROLE_FIELD is used by both User.role and Household.user_role
    "ENUM_NAME_OVERRIDES": {
        "HouseholdRoleEnum": ["owner", "member"],
        # kg / lb on users, exercises and training totals: one WeightUnitEnum in the client's types.
        "WeightUnitEnum": "common.units.WeightUnit",
    },
    "SCHEMA_PATH_PREFIX": "/api",
    "TAGS": [
        {"name": "Authentication", "description": "User authentication and authorization"},
        {"name": "Users", "description": "User management and households"},
        {"name": "Finances", "description": "Transactions, categories, budgets"},
        {"name": "Fitness", "description": "Exercises, trainings, sets"},
        {"name": "Nutrition", "description": "Foods, consumptions"},
    ],
}

# Logging
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {process:d} {thread:d} {message}",
            "style": "{",
        },
        "simple": {
            "format": "{levelname} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "django.db.backends": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
    },
}

# Email. EMAIL_URL examples: consolemail:// (prints to the log, default),
# smtp+tls://user:password@smtp.example.com:587
vars().update(env.email_url("EMAIL_URL"))
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL")

# Password reset: the email links to the client (web/mobile) app, which posts uid + token +
# new_password to /api/auth/password/reset/confirm/. {uid} and {token} are filled in.
PASSWORD_RESET_URL = env("PASSWORD_RESET_URL")
PASSWORD_RESET_TIMEOUT = 60 * 60  # seconds a reset link stays valid (Django's default is 3 days)

# Email verification: the sign up email links to the client app, which posts the token back.
EMAIL_VERIFICATION_URL = env("EMAIL_VERIFICATION_URL")
EMAIL_VERIFICATION_TIMEOUT = 48 * 60 * 60  # seconds a verification link stays valid
