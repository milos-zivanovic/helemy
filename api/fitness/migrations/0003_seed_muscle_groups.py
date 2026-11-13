"""
Seed the global muscle groups (the same set as in the old wallet app).

MuscleGroup is read-only through the API, so without this a fresh database has none and
exercises/trainings can't reference any. Later changes go through the Django admin.
"""

from django.db import migrations

MUSCLE_GROUPS = ["Grudi", "Leđa", "Ramena", "Biceps", "Triceps", "Noge", "Stomak", "Kardio"]


def seed(apps, schema_editor):
    MuscleGroup = apps.get_model("fitness", "MuscleGroup")
    for order, name in enumerate(MUSCLE_GROUPS, start=1):
        # get_or_create: keeps groups that already exist (e.g. added by hand) untouched
        MuscleGroup.objects.get_or_create(name=name, defaults={"order": order})


class Migration(migrations.Migration):
    dependencies = [
        ("fitness", "0002_initial"),
    ]

    # Reverse is a no-op: groups may already be used by exercises (PROTECT) or edited in the admin.
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
