from rest_framework import permissions


class IsOwnerOrReadOnly(permissions.BasePermission):
    """
    Object-level permission to only allow owners of an object to edit it.
    Assumes the model instance has an `owner` or `user` field.
    """

    def has_object_permission(self, request, view, obj):
        # Read permissions are allowed to any request
        if request.method in permissions.SAFE_METHODS:
            return True

        # Write permissions are only allowed to the owner
        return obj.user == request.user or getattr(obj, "owner", None) == request.user


class IsHouseholdMember(permissions.BasePermission):
    """
    Permission to only allow members of the same household to access the object.
    Assumes the object has a `household` field or the user has a `household` relation.
    """

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.households.exists()

    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False

        user_households = request.user.households.all()
        if not user_households.exists():
            return False

        # Check if object has household field
        obj_household = getattr(obj, "household", None)
        if obj_household is not None:
            return obj_household in user_households

        # Check if object has user with household
        obj_user = getattr(obj, "user", None)
        if obj_user is not None:
            return obj_user.households.filter(id__in=user_households).exists()

        return False


class IsHouseholdOwner(permissions.BasePermission):
    """
    Permission to only allow household owners to perform actions.
    """

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.households.exists()

    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False

        # Check if user is owner of the household
        user_households = request.user.households.all()
        if not user_households.exists():
            return False

        return obj in user_households and obj.owner == request.user
