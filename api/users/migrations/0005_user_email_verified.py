from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0004_remove_onboarding_fields"),
    ]

    operations = [
        # Users who exist already (signed up before verification, or migrated from wallet) are
        # verified: added with default=True, then the default changes to False for new users.
        migrations.AddField(
            model_name="user",
            name="email_verified",
            field=models.BooleanField(default=True, verbose_name="email verified"),
        ),
        migrations.AlterField(
            model_name="user",
            name="email_verified",
            field=models.BooleanField(default=False, verbose_name="email verified"),
        ),
    ]
