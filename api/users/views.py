from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema, extend_schema_view

from common.mixins import HouseholdModelViewSet
from common.permissions import IsHouseholdMember, IsHouseholdOwner
from users.models import Household
from users.serializers import (
    UserSerializer, UserDetailSerializer, HouseholdSerializer,
    HouseholdCreateSerializer, HouseholdUpdateSerializer,
    InviteMemberSerializer,
)

User = get_user_model()


@extend_schema_view(
    list=extend_schema(tags=['Users']),
    retrieve=extend_schema(tags=['Users']),
    partial_update=extend_schema(tags=['Users']),
)
class UserViewSet(mixins.RetrieveModelMixin,
                  mixins.UpdateModelMixin,
                  viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer
    
    def get_object(self):
        return self.request.user
    
    def get_serializer_class(self):
        if self.action == 'retrieve':
            return UserDetailSerializer
        return UserSerializer
    
    @action(detail=False, methods=['get'], url_path='me')
    def me(self, request):
        serializer = UserDetailSerializer(request.user, context={'request': request})
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(tags=['Households']),
    create=extend_schema(tags=['Households']),
    retrieve=extend_schema(tags=['Households']),
    partial_update=extend_schema(tags=['Households']),
    destroy=extend_schema(tags=['Households']),
)
class HouseholdViewSet(HouseholdModelViewSet):
    queryset = Household.objects.all()
    serializer_class = HouseholdSerializer
    permission_classes = [IsAuthenticated, IsHouseholdMember]
    
    def get_serializer_class(self):
        if self.action == 'create':
            return HouseholdCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return HouseholdUpdateSerializer
        return HouseholdSerializer
    
    def get_queryset(self):
        return self.request.user.households.all()
    
    @action(detail=True, methods=['get'], url_path='members')
    def members(self, request, pk=None):
        household = self.get_object()
        members = household.members.all()
        serializer = UserSerializer(members, many=True, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'], url_path='invite')
    def invite_member(self, request, pk=None):
        household = self.get_object()
        
        # Check permission - only owner can invite
        if not request.user.is_household_owner(household):
            return Response(
                {'detail': 'Only the household owner can invite members.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = InviteMemberSerializer(data=request.data, context={'household': household})
        serializer.is_valid(raise_exception=True)
        
        user = User.objects.get(email=serializer.validated_data['email'])
        
        household.add_member(user)
        
        return Response(
            UserSerializer(user, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )
    
    @action(detail=True, methods=['delete'], url_path='members/(?P<user_id>[^/.]+)')
    def remove_member(self, request, pk=None, user_id=None):
        household = self.get_object()
        
        # Check permission - only owner can remove
        if not request.user.is_household_owner(household):
            return Response(
                {'detail': 'Only the household owner can remove members.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Cannot remove owner
        if household.owner_id == int(user_id):
            return Response(
                {'detail': 'Cannot remove the household owner.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        user = get_object_or_404(User, id=user_id)
        
        if not household.members.filter(id=user.id).exists():
            return Response(
                {'detail': 'User is not a member of this household.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        household.remove_member(user)
        
        return Response(status=status.HTTP_204_NO_CONTENT)