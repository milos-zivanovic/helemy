from decimal import Decimal

import django.core.validators
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """Transfers become pairs of transactions: the fields for it (data in 0009, old table in 0010)."""

    dependencies = [
        ("finances", "0007_remove_account_is_savings"),
    ]

    operations = [
        migrations.AddField(
            model_name="category",
            name="is_transfer",
            field=models.BooleanField(default=False, verbose_name="is transfer"),
        ),
        migrations.AddField(
            model_name="transaction",
            name="transfer_pair",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="finances.transaction",
            ),
        ),
        # Transfers allowed up to 12 digits; their legs are transactions now.
        migrations.AlterField(
            model_name="transaction",
            name="amount",
            field=models.DecimalField(
                decimal_places=2,
                max_digits=12,
                validators=[django.core.validators.MinValueValidator(Decimal("0.01"))],
                verbose_name="amount",
            ),
        ),
        migrations.AddConstraint(
            model_name="category",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_transfer", True)),
                fields=("household",),
                name="one_transfer_category_per_household",
            ),
        ),
    ]
