from rest_framework import serializers
from finances.models import CategoryGroup, Category, Transaction, Budget
from users.serializers import UserSerializer


class CategoryGroupSerializer(serializers.ModelSerializer):
    categories_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = CategoryGroup
        fields = ['id', 'name', 'is_active', 'categories_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class CategorySerializer(serializers.ModelSerializer):
    category_group = CategoryGroupSerializer(read_only=True)
    category_group_id = serializers.PrimaryKeyRelatedField(
        queryset=CategoryGroup.objects.all(),
        source='category_group',
        write_only=True,
    )
    transactions_count = serializers.IntegerField(read_only=True)
    total_amount = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)
    start_month = serializers.IntegerField(required=False, allow_null=True, min_value=1, max_value=12)
    start_day = serializers.IntegerField(required=False, allow_null=True, min_value=1, max_value=31)
    end_month = serializers.IntegerField(required=False, allow_null=True, min_value=1, max_value=12)
    end_day = serializers.IntegerField(required=False, allow_null=True, min_value=1, max_value=31)
    current_budget = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = [
            'id', 'name', 'is_active',
            'category_group', 'category_group_id',
            'start_date', 'end_date', 'start_month', 'start_day', 'end_month', 'end_day',
            'transactions_count', 'total_amount', 'current_budget',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_current_budget(self, obj):
        budget = obj.current_budget()
        if budget:
            return {
                'id': budget.id,
                'amount': budget.amount,
                'start_date': budget.start_date,
                'end_date': budget.end_date,
                'description': budget.description,
                'spent': budget.total_spent,
                'percentage': budget.percentage_spent,
            }
        return None


class CategoryListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'category_group', 'is_active']


class TransactionSerializer(serializers.ModelSerializer):
    category = CategoryListSerializer(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        source='category',
        write_only=True,
    )
    user = UserSerializer(read_only=True)
    type_display = serializers.CharField(source='get_transaction_type_display', read_only=True)
    type_sign = serializers.CharField(read_only=True)

    class Meta:
        model = Transaction
        fields = [
            'id', 'transaction_type', 'type_display', 'type_sign', 'title', 'description',
            'amount', 'category', 'category_id', 'user', 'is_fixed', 'is_deleted',
            'created_at',
        ]
        read_only_fields = ['id', 'user', 'created_at']


class TransactionCreateSerializer(serializers.ModelSerializer):
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        source='category',
        write_only=True,
    )

    class Meta:
        model = Transaction
        fields = [
            'transaction_type', 'title', 'description', 'amount',
            'category_id', 'is_fixed',
        ]

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)


class BudgetSerializer(serializers.ModelSerializer):
    category = CategoryListSerializer(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        source='category',
        write_only=True,
    )
    spent = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True, source='total_spent')
    percentage = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True, source='percentage_spent')

    class Meta:
        model = Budget
        fields = [
            'id', 'description', 'amount', 'start_date', 'end_date',
            'category', 'category_id', 'spent', 'percentage',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
