"""
Messages of third-party packages that we translate ourselves.

DRF and SimpleJWT ship no Serbian translations, and one of Django's Serbian (Latin) auth messages
needs a better wording with our field names. Our catalog (locale/sr_Latn/LC_MESSAGES/django.po) translates them, but
`makemessages` only keeps msgids it finds in our code: listing them here keeps their translations
from being dropped as obsolete. This module is never imported; it only exists to be extracted.

Each msgid must match the package's source character for character (an upgrade can change one;
common/tests/test_translations.py checks that they are all still there).
"""

from django.utils.translation import gettext_noop

DRF = (
    # rest_framework/fields.py
    gettext_noop("This field may not be blank."),
    gettext_noop("This field may not be null."),
    gettext_noop("Not a valid string."),
    gettext_noop("Ensure this field has no more than {max_length} characters."),
    gettext_noop("Ensure this field has at least {min_length} characters."),
    gettext_noop("A valid integer is required."),
    gettext_noop("A valid number is required."),
    gettext_noop("Ensure this value is less than or equal to {max_value}."),
    gettext_noop("Ensure this value is greater than or equal to {min_value}."),
    gettext_noop("String value too large."),
    gettext_noop("Ensure that there are no more than {max_digits} digits in total."),
    gettext_noop("Ensure that there are no more than {max_decimal_places} decimal places."),
    gettext_noop(
        "Ensure that there are no more than {max_whole_digits} digits before the decimal point."
    ),
    gettext_noop("Date has wrong format. Use one of these formats instead: {format}."),
    gettext_noop("Datetime has wrong format. Use one of these formats instead: {format}."),
    gettext_noop("Expected a date but got a datetime."),
    gettext_noop("Must be a valid boolean."),
    gettext_noop('"{input}" is not a valid choice.'),
    gettext_noop('Expected a list of items but got type "{input_type}".'),
    gettext_noop("This list may not be empty."),
    gettext_noop("This selection may not be empty."),
    gettext_noop("Invalid data. Expected a dictionary, but got {datatype}."),
    gettext_noop("The submitted data was not a file. Check the encoding type on the form."),
    gettext_noop("No filename could be determined."),
    # rest_framework/relations.py
    gettext_noop('Invalid pk "{pk_value}" - object does not exist.'),
    gettext_noop("Incorrect type. Expected pk value, received {data_type}."),
    # rest_framework/validators.py
    gettext_noop("This field must be unique."),
    gettext_noop("The fields {field_names} must make a unique set."),
    # rest_framework/exceptions.py
    gettext_noop("A server error occurred."),
    gettext_noop("Invalid input."),
    gettext_noop("Malformed request."),
    gettext_noop("Incorrect authentication credentials."),
    gettext_noop("Authentication credentials were not provided."),
    gettext_noop("You do not have permission to perform this action."),
    gettext_noop("Not found."),
    gettext_noop('Method "{method}" not allowed.'),
    gettext_noop('Unsupported media type "{media_type}" in request.'),
    gettext_noop("Request was throttled."),
    # rest_framework/pagination.py
    gettext_noop("Invalid page."),
)

SIMPLE_JWT = (
    gettext_noop("No active account found with the given credentials"),
    gettext_noop("Given token not valid for any token type"),
    gettext_noop("Token is invalid or expired"),
    gettext_noop("Token is blacklisted"),
    gettext_noop("User not found"),
    gettext_noop("User is inactive"),
    gettext_noop("Token contained no recognizable user identification"),
    gettext_noop("Authorization header must contain two space-delimited values"),
)

DJANGO_AUTH = (
    # django/contrib/auth/password_validation.py. Translated by Django, but with our field names it
    # reads "previše slična email adresa", which isn't Serbian grammar; ours names the field.
    gettext_noop("The password is too similar to the %(verbose_name)s."),
)
