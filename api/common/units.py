"""
Weight units. Each exercise keeps the unit of its machine (what the user reads on it), the user has a
preferred unit, and the training totals (volume) are converted into that one before they're added up.
"""

from decimal import ROUND_HALF_UP, Decimal

from django.db import models
from django.utils.translation import gettext_lazy as _


class WeightUnit(models.TextChoices):
    KG = "kg", _("kilograms")
    LB = "lb", _("pounds")


KG_PER_LB = Decimal("0.45359237")  # exact, by definition
CENT = Decimal("0.01")


def unit_factor(from_unit, to_unit):
    """What a weight in `from_unit` is multiplied by to get `to_unit` (1 when they're the same)."""
    if from_unit == to_unit:
        return Decimal(1)
    return KG_PER_LB if from_unit == WeightUnit.LB else 1 / KG_PER_LB


def convert_weight(value, from_unit, to_unit):
    """A weight (Decimal) in another unit, to 2 decimals like the stored weights: 80 kg → 176.37 lb."""
    return (value * unit_factor(from_unit, to_unit)).quantize(CENT, rounding=ROUND_HALF_UP)
