from rest_framework import serializers
from django.contrib.auth import get_user_model
from users.models import Household

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    role = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'full_name', 'timezone', 'language', 'currency',
            'onboarding_completed', 'onboarding_step', 'date_joined',
            'last_activity', 'role',
        ]
        read_only_fields = ['id', 'date_joined', 'last_activity']
    
    def get_role(self, obj):
        household = obj.households.first()
        if household:
            if household.owner == obj:
                return 'owner'
            return 'member'
        return None


class UserDetailSerializer(UserSerializer):
    households = serializers.SerializerMethodField()
    
    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ['households']
    
    def get_households(self, obj):
        return HouseholdSerializer(obj.households.all(), many=True, context=self.context).data


class HouseholdSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(read_only=True)
    owner = UserSerializer(read_only=True)
    user_role = serializers.SerializerMethodField()
    
    class Meta:
        model = Household
        fields = ['id', 'name', 'owner', 'member_count', 'user_role', 'created_at', 'updated_at']
        read_only_fields = ['id', 'owner', 'created_at', 'updated_at']
    
    def get_user_role(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            if obj.owner == request.user:
                return 'owner'
            if obj.members.filter(id=request.user.id).exists():
                return 'member'
        return None


class HouseholdCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Household
        fields = ['id', 'name']
        read_only_fields = ['id']
    
    def validate(self, attrs):
        user = self.context['request'].user
        if user.owned_households.exists():
            raise serializers.ValidationError('You can only create one household.')
        return attrs
    
    def create(self, validated_data):
        user = self.context['request'].user
        household = Household.objects.create(owner=user, **validated_data)
        household.members.add(user)
        return household


class HouseholdUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Household
        fields = ['name']


class InviteMemberSerializer(serializers.Serializer):
    email = serializers.EmailField()
    
    def validate_email(self, value):
        # Check if user exists
        try:
            user = User.objects.get(email=value)
        except User.DoesNotExist:
            raise serializers.ValidationError('User with this email does not exist.')
        
        # Check if already a member
        household = self.context['household']
        if household.members.filter(id=user.id).exists():
            raise serializers.ValidationError('User is already a member of this household.')
        
        return value