from rest_framework import serializers


class HouseholdPrimaryKeyRelatedField(serializers.PrimaryKeyRelatedField):
    """
    PrimaryKeyRelatedField limited to objects of the requesting user's household.

    Prevents referencing another household's objects by ID (e.g. attaching a
    transaction to a foreign category). The related model must have a
    `household` field.
    """

    def get_queryset(self):
        queryset = super().get_queryset()
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            return queryset.none()
        household = user.get_active_household()
        if household is None:
            return queryset.none()
        return queryset.filter(household=household)
