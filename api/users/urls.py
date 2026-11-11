from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from users.views import (
    UserViewSet, HouseholdViewSet,
)

router = DefaultRouter()
router.register(r'households', HouseholdViewSet, basename='household')

urlpatterns = [
    # Auth endpoints
    path('token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # User endpoints
    path('me/', UserViewSet.as_view({'get': 'me'}), name='user-me'),
    
    # Router endpoints
    path('', include(router.urls)),
]