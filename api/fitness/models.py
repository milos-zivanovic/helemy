from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Max
from django.utils.translation import gettext_lazy as _

from common.units import WeightUnit, convert_weight, unit_factor

# A set's weight is DecimalField(max_digits=6, decimal_places=2).
MAX_WEIGHT = Decimal("9999.99")


class MuscleGroup(models.Model):
    name = models.CharField(_("name"), max_length=50, unique=True)
    order = models.PositiveIntegerField(_("order"), default=0)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        ordering = ["order", "name"]

    def __str__(self):
        return self.name


class Exercise(models.Model):
    household = models.ForeignKey(
        "users.Household",
        on_delete=models.CASCADE,
        related_name="exercises",
    )
    muscle_group = models.ForeignKey(
        MuscleGroup,
        on_delete=models.PROTECT,
        related_name="exercises",
        null=True,
        blank=True,
        db_index=True,
    )
    name = models.CharField(_("name"), max_length=100)
    description = models.TextField(_("description"), blank=True)
    # The unit of the machine (what the user reads on it): its sets are entered and shown in it.
    weight_unit = models.CharField(
        _("weight unit"), max_length=2, choices=WeightUnit.choices, default=WeightUnit.KG
    )
    image = models.ImageField(
        _("image"),
        upload_to="exercises/",
        blank=True,
        null=True,
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        ordering = ["muscle_group__order", "name"]

    def __str__(self):
        return self.name

    def heaviest_set_in(self, unit):
        """The heaviest weight of any of its sets once converted to `unit` (None without weights)."""
        heaviest = self.training_items.aggregate(heaviest=Max("sets__weight"))["heaviest"]
        return None if heaviest is None else convert_weight(heaviest, self.weight_unit, unit)

    def change_weight_unit(self, unit):
        """
        Switch to another unit (another machine, or a mistake). The weights of all its sets, in
        every member's trainings, are converted so they stay true: 80 kg becomes 176.37 lb.
        Not saved here: the caller saves the exercise, in the same transaction.
        """
        if unit == self.weight_unit:
            return
        sets = list(TrainingSet.objects.filter(training_item__exercise=self, weight__isnull=False))
        for training_set in sets:
            training_set.weight = convert_weight(training_set.weight, self.weight_unit, unit)
        TrainingSet.objects.bulk_update(sets, ["weight"])
        self.weight_unit = unit


class Training(models.Model):
    household = models.ForeignKey(
        "users.Household",
        on_delete=models.CASCADE,
        related_name="trainings",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="fitness_trainings",
    )
    muscle_groups = models.ManyToManyField(
        MuscleGroup,
        related_name="trainings",
        blank=True,
    )
    name = models.CharField(_("name"), max_length=100, blank=True)
    date = models.DateField(_("date"))
    notes = models.TextField(_("notes"), blank=True)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["household", "user", "date"], name="unique_training_per_user_per_day"
            ),
        ]

    def __str__(self):
        return self.name or f"Training {self.date}"

    def total_volume(self, unit):
        """
        Weight x reps of every set, in `unit` (the user's): each exercise's volume is converted from
        its own unit first, so kg and lb machines add up. Rounded to one decimal.
        """
        total = sum(
            Decimal(str(item.total_volume)) * unit_factor(item.exercise.weight_unit, unit)
            for item in self.items.all()
        )
        return round(float(total), 1)

    def add_set(self, exercise, weight=None, reps=1):
        """
        Add a set to an exercise in this training.
        Creates or gets the TrainingItem, then adds the next set number.
        """
        training_item, created = TrainingItem.objects.get_or_create(
            training=self,
            exercise=exercise,
            defaults={
                "order": (self.items.aggregate(order_max=Max("order"))["order_max"] or 0) + 1,
            },
        )

        # Get next set number
        last_set = training_item.sets.aggregate(max_set=Max("set_number"))["max_set"]
        next_set_number = (last_set or 0) + 1

        training_set = TrainingSet.objects.create(
            training_item=training_item,
            set_number=next_set_number,
            weight=weight,
            reps=reps,
        )

        return training_set


class TrainingItem(models.Model):
    training = models.ForeignKey(
        Training,
        on_delete=models.CASCADE,
        related_name="items",
    )
    exercise = models.ForeignKey(
        Exercise,
        on_delete=models.CASCADE,
        related_name="training_items",
        db_index=True,
    )
    order = models.PositiveSmallIntegerField(_("order"), default=1)
    notes = models.TextField(_("notes"), blank=True)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        ordering = ["order", "exercise__name"]
        unique_together = ["training", "exercise"]

    def __str__(self):
        return f"{self.training} - {self.exercise}"

    @property
    def household(self):
        """The training's household; IsHouseholdMember checks object access through it."""
        return self.training.household

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.training_id and self.exercise_id:
            if self.training.household_id != self.exercise.household_id:
                raise ValidationError(
                    _("Exercise must belong to the same household as the training.")
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    @property
    def total_volume(self):
        """In the exercise's own unit."""
        return sum(set_obj.volume for set_obj in self.sets.all())


class TrainingSet(models.Model):
    training_item = models.ForeignKey(
        TrainingItem,
        on_delete=models.CASCADE,
        related_name="sets",
    )
    set_number = models.PositiveSmallIntegerField(_("set number"))
    weight = models.DecimalField(
        _("weight"),  # in the exercise's weight_unit
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
    )
    reps = models.PositiveSmallIntegerField(_("reps"))
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        ordering = ["set_number"]
        unique_together = ["training_item", "set_number"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(reps__gt=0), name="training_set_reps_positive"
            ),
            models.CheckConstraint(
                condition=models.Q(weight__gte=0) | models.Q(weight__isnull=True),
                name="training_set_weight_non_negative",
            ),
        ]

    def __str__(self):
        unit = self.training_item.exercise.weight_unit
        weight_str = f"{self.weight}{unit} " if self.weight else ""
        return (
            f"{self.training_item.exercise} - Set {self.set_number}: {weight_str}{self.reps} reps"
        )

    @property
    def household(self):
        """The training's household; IsHouseholdMember checks object access through it."""
        return self.training_item.training.household

    @property
    def volume(self):
        if self.weight:
            return float(self.weight) * self.reps
        return 0
