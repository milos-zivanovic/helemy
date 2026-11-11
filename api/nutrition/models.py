from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _


class Food(models.Model):
    household = models.ForeignKey(
        'users.Household',
        on_delete=models.CASCADE,
        related_name='foods',
    )
    name = models.CharField(_('name'), max_length=200)
    description = models.CharField(_('description'), max_length=255, blank=True)

    # Macros per 100g
    calories = models.PositiveIntegerField(_('calories (per 100g)'))
    protein = models.IntegerField(_('protein (g per 100g)'))
    carbs = models.IntegerField(_('carbs (g per 100g)'))
    fat = models.IntegerField(_('fat (g per 100g)'))

    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    def get_macros_for_quantity(self, quantity_grams):
        """Calculate macros for a specific quantity in grams."""
        factor = quantity_grams / 100
        return {
            'calories': round(self.calories * factor),
            'protein': round(self.protein * factor),
            'carbs': round(self.carbs * factor),
            'fat': round(self.fat * factor),
        }


class Consumption(models.Model):
    household = models.ForeignKey(
        'users.Household',
        on_delete=models.CASCADE,
        related_name='consumptions',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='consumptions',
    )
    food = models.ForeignKey(
        Food,
        on_delete=models.PROTECT,
        related_name='consumptions',
    )
    quantity_grams = models.IntegerField(_('quantity (grams)'))
    date = models.DateField(_('date'), db_index=True)
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f'{self.food.name} ({self.quantity_grams}g)'

    @property
    def calories(self):
        return int(round(self.food.calories * self.quantity_grams / 100))

    @property
    def protein(self):
        return int(round(self.food.protein * self.quantity_grams / 100))

    @property
    def carbs(self):
        return int(round(self.food.carbs * self.quantity_grams / 100))

    @property
    def fat(self):
        return int(round(self.food.fat * self.quantity_grams / 100))
