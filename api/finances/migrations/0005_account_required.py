import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    # Separate from 0004: PostgreSQL can't alter a column in the transaction that just updated its
    # rows ("pending trigger events").

    dependencies = [
        ("finances", "0004_accounts"),
    ]

    operations = [
        migrations.AlterField(
            model_name="transaction",
            name="account",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="transactions",
                to="finances.account",
            ),
        ),
    ]
