from rest_framework import mixins, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated

from common.pagination import StandardResultsSetPagination
from common.permissions import IsHouseholdMember


def get_request_household(request):
    """Return the active household of the request's user, or None."""
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        return None
    return user.get_active_household()


class HouseholdMixin:
    """
    Mixin to automatically filter queryset by user's household
    and set household on create.

    Must come BEFORE the DRF generic classes in the bases list, otherwise
    GenericAPIView.get_queryset / CreateModelMixin.perform_create win in the MRO.
    """

    def get_household(self):
        return get_request_household(self.request)

    def get_queryset(self):
        queryset = super().get_queryset()
        household = self.get_household()
        if household is None:
            return queryset.none()
        return queryset.filter(household=household)

    def perform_create(self, serializer):
        household = self.get_household()
        if household is None:
            raise PermissionDenied("You do not belong to any household.")
        serializer.save(household=household)


class UserMixin:
    """
    Mixin to automatically filter queryset by user
    and set user on create. Must come BEFORE the DRF generic classes.
    """

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.is_authenticated:
            return queryset.filter(user=user)
        return queryset.none()

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class HouseholdModelViewSet(
    HouseholdMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    ViewSet for models that belong to a household.
    Automatically filters by household and sets household on create.
    """

    permission_classes = [IsAuthenticated, IsHouseholdMember]
    pagination_class = StandardResultsSetPagination


class UserModelViewSet(
    UserMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    ViewSet for models that belong to a user.
    Automatically filters by user and sets user on create.
    """

    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
