from django.db import migrations


class Migration(migrations.Migration):
    """The old transfer table: its rows are transaction pairs since 0009."""

    dependencies = [
        ("finances", "0009_transfers_to_transactions"),
    ]

    operations = [
        migrations.DeleteModel(name="Transfer"),
    ]
