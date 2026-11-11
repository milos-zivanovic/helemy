from rest_framework import mixins, viewsets
from rest_framework.permissions import IsAuthenticated
from common.permissions import IsHouseholdMember


class HouseholdMixin:
    """
    Mixin to automatically filter queryset by user's household
    and set household on create.
    """
    
    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        
        if user.is_authenticated:
            household = user.households.first()
            if household:
                return queryset.filter(household=household)
        
        return queryset.none()
    
    def perform_create(self, serializer):
        household = self.request.user.households.first()
        if household:
            serializer.save(household=household)


class UserMixin:
    """
    Mixin to automatically filter queryset by user
    and set user on create.
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
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
    HouseholdMixin,
):
    """
    ViewSet for models that belong to a household.
    Automatically filters by household and sets household on create.
    """
    permission_classes = [IsAuthenticated, IsHouseholdMember]
    pagination_class = None  # Will be set per viewset


class UserModelViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
    UserMixin,
):
    """
    ViewSet for models that belong to a user.
    Automatically filters by user and sets user on create.
    """
    permission_classes = [IsAuthenticated]
    pagination_class = None  # Will be set per viewset