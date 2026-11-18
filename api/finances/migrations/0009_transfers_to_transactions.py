from django.db import migrations

# Same values as finances.services (a migration must not import app code, which keeps changing).
TRANSFER_GROUP_NAME = "Ostalo"
TRANSFER_CATEGORY_NAME = "Prenos"
EXPENSE, INCOME = "expense", "income"


def transfers_to_transactions(apps, schema_editor):
    """Every Transfer becomes two linked transactions in the household's transfer category."""
    Transfer = apps.get_model("finances", "Transfer")
    Transaction = apps.get_model("finances", "Transaction")
    Category = apps.get_model("finances", "Category")
    CategoryGroup = apps.get_model("finances", "CategoryGroup")

    categories = {}

    def transfer_category(household_id):
        if household_id not in categories:
            category = Category.objects.filter(household_id=household_id, is_transfer=True).first()
            if category is None:
                group = CategoryGroup.objects.filter(
                    household_id=household_id, name=TRANSFER_GROUP_NAME
                ).first() or CategoryGroup.objects.create(
                    household_id=household_id, name=TRANSFER_GROUP_NAME
                )
                category = Category.objects.create(
                    household_id=household_id,
                    category_group=group,
                    name=TRANSFER_CATEGORY_NAME,
                    is_transfer=True,
                )
            categories[household_id] = category
        return categories[household_id]

    for transfer in Transfer.objects.select_related("from_account", "to_account"):
        common = {
            "household_id": transfer.household_id,
            "user_id": transfer.user_id,
            "category": transfer_category(transfer.household_id),
            "amount": transfer.amount,
            "date": transfer.date,
            "description": transfer.description,
        }
        outgoing = Transaction.objects.create(
            transaction_type=EXPENSE,
            account_id=transfer.from_account_id,
            title=f"Prenos na {transfer.to_account.name}"[:100],
            **common,
        )
        incoming = Transaction.objects.create(
            transaction_type=INCOME,
            account_id=transfer.to_account_id,
            title=f"Prenos sa {transfer.from_account.name}"[:100],
            transfer_pair=outgoing,
            **common,
        )
        outgoing.transfer_pair = incoming
        outgoing.save(update_fields=["transfer_pair"])
        # Keep the transfer's creation time (the list's tie-breaker within a day).
        Transaction.objects.filter(pk__in=[outgoing.pk, incoming.pk]).update(
            created_at=transfer.created_at
        )


def transactions_to_transfers(apps, schema_editor):
    """Undo: every live pair back into a Transfer; the legs (and the transfer categories) go."""
    Transfer = apps.get_model("finances", "Transfer")
    Transaction = apps.get_model("finances", "Transaction")
    Category = apps.get_model("finances", "Category")

    legs = Transaction.objects.filter(transfer_pair__isnull=False)
    for outgoing in legs.filter(transaction_type=EXPENSE, is_deleted=False).select_related(
        "transfer_pair"
    ):
        transfer = Transfer.objects.create(
            household_id=outgoing.household_id,
            user_id=outgoing.user_id,
            from_account_id=outgoing.account_id,
            to_account_id=outgoing.transfer_pair.account_id,
            amount=outgoing.amount,
            date=outgoing.date,
            description=outgoing.description,
        )
        Transfer.objects.filter(pk=transfer.pk).update(created_at=outgoing.created_at)
    legs.update(transfer_pair=None)
    Transaction.objects.filter(category__is_transfer=True).delete()
    Category.objects.filter(is_transfer=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("finances", "0008_transfer_pairs"),
    ]

    operations = [
        migrations.RunPython(transfers_to_transactions, transactions_to_transfers),
    ]
