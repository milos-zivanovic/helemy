from datetime import date

from django.db.models import Q, Sum
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework.decorators import action
from rest_framework.response import Response

from common.mixins import HouseholdModelViewSet
from common.pagination import StandardResultsSetPagination
from common.permissions import IsHouseholdMember
from finances.models import Budget, Category, CategoryGroup, Transaction
from finances.serializers import (
    BudgetSerializer,
    CategoryGroupSerializer,
    CategoryListSerializer,
    CategorySerializer,
    TransactionCreateSerializer,
    TransactionSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['Finances - Categories']),
    create=extend_schema(tags=['Finances - Categories']),
    retrieve=extend_schema(tags=['Finances - Categories']),
    partial_update=extend_schema(tags=['Finances - Categories']),
    destroy=extend_schema(tags=['Finances - Categories']),
)
class CategoryGroupViewSet(HouseholdModelViewSet):
    queryset = CategoryGroup.objects.all()
    serializer_class = CategoryGroupSerializer
    permission_classes = [IsHouseholdMember]
    pagination_class = StandardResultsSetPagination
    ordering = ['name']
    ordering_fields = ['name', 'created_at']
    filterset_fields = ['is_active']
    search_fields = ['name']


@extend_schema_view(
    list=extend_schema(tags=['Finances - Categories']),
    create=extend_schema(tags=['Finances - Categories']),
    retrieve=extend_schema(tags=['Finances - Categories']),
    partial_update=extend_schema(tags=['Finances - Categories']),
    destroy=extend_schema(tags=['Finances - Categories']),
)
class CategoryViewSet(HouseholdModelViewSet):
    queryset = Category.objects.select_related('category_group').all()
    serializer_class = CategorySerializer
    permission_classes = [IsHouseholdMember]
    pagination_class = StandardResultsSetPagination
    ordering = ['category_group', 'name']
    ordering_fields = ['name', 'created_at']
    filterset_fields = ['category_group', 'is_active']
    search_fields = ['name']

    def get_serializer_class(self):
        if self.action == 'list':
            return CategoryListSerializer
        return CategorySerializer


@extend_schema_view(
    list=extend_schema(
        tags=['Finances - Transactions'],
        parameters=[
            OpenApiParameter('start_date', OpenApiTypes.DATE, description='Filter: created on or after (YYYY-MM-DD)'),
            OpenApiParameter('end_date', OpenApiTypes.DATE, description='Filter: created on or before (YYYY-MM-DD)'),
            OpenApiParameter('category', OpenApiTypes.INT, description='Category ID'),
            OpenApiParameter('is_fixed', OpenApiTypes.BOOL, description='Filter by is_fixed'),
            OpenApiParameter('transaction_type', OpenApiTypes.STR, enum=['income', 'expense']),
            OpenApiParameter('search', OpenApiTypes.STR, description='Search in title/description'),
        ],
        responses={200: TransactionSerializer},
    ),
    create=extend_schema(tags=['Finances - Transactions']),
    retrieve=extend_schema(tags=['Finances - Transactions']),
    partial_update=extend_schema(tags=['Finances - Transactions']),
    destroy=extend_schema(tags=['Finances - Transactions']),
)
class TransactionViewSet(HouseholdModelViewSet):
    queryset = Transaction.objects.select_related('category', 'category__category_group', 'user').all()
    serializer_class = TransactionSerializer
    permission_classes = [IsHouseholdMember]
    pagination_class = StandardResultsSetPagination
    ordering = ['-created_at']
    ordering_fields = ['amount', 'created_at']
    filterset_fields = ['transaction_type', 'category', 'is_fixed']
    search_fields = ['title', 'description']

    def get_serializer_class(self):
        if self.action == 'create':
            return TransactionCreateSerializer
        return TransactionSerializer

    def get_queryset(self):
        queryset = super().get_queryset().filter(is_deleted=False)

        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')

        if start_date:
            queryset = queryset.filter(created_at__date__gte=start_date)
        if end_date:
            queryset = queryset.filter(created_at__date__lte=end_date)

        return queryset

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())

        totals = queryset.aggregate(
            total_income=Sum('amount', filter=Q(transaction_type=Transaction.INCOME)),
            total_expense=Sum('amount', filter=Q(transaction_type=Transaction.EXPENSE)),
        )
        total_income = totals['total_income'] or 0
        total_expense = totals['total_expense'] or 0

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            response = self.get_paginated_response(serializer.data)
            response.data['total_incomes'] = total_income
            response.data['total_expenses'] = total_expense
            response.data['total'] = total_income - total_expense
            return response

        serializer = self.get_serializer(queryset, many=True)
        return Response({
            'total_incomes': total_income,
            'total_expenses': total_expense,
            'total': total_income - total_expense,
            'results': serializer.data,
        })


@extend_schema_view(
    list=extend_schema(tags=['Finances - Budgets']),
    create=extend_schema(tags=['Finances - Budgets']),
    retrieve=extend_schema(tags=['Finances - Budgets']),
    partial_update=extend_schema(tags=['Finances - Budgets']),
    destroy=extend_schema(tags=['Finances - Budgets']),
)
class BudgetViewSet(HouseholdModelViewSet):
    queryset = Budget.objects.select_related('category', 'category__category_group').all()
    serializer_class = BudgetSerializer
    permission_classes = [IsHouseholdMember]
    pagination_class = None
    ordering = ['-start_date', 'category__name']
    ordering_fields = ['start_date', 'amount', 'created_at']
    filterset_fields = ['category']
    search_fields = ['category__name', 'description']

    def get_pagination_class(self):
        if self.action == 'all_budgets':
            return StandardResultsSetPagination
        return None

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == 'list':
            today = date.today()
            queryset = queryset.filter(start_date__lte=today, end_date__gte=today)
        return queryset

    @extend_schema(
        tags=['Finances - Budgets'],
        parameters=[
            OpenApiParameter('category', OpenApiTypes.INT, description='Category ID'),
            OpenApiParameter(name='page', type=int, description='Page number'),
            OpenApiParameter(name='page_size', type=int, description='Results per page'),
            OpenApiParameter('ordering', OpenApiTypes.STR, description='Order by start_date, amount, created_at'),
            OpenApiParameter('search', OpenApiTypes.STR, description='Search in category__name, description'),
        ],
    )
    @action(detail=False, methods=['get'], url_path='all')
    def all_budgets(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
