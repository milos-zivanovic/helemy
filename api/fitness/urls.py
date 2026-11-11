from django.urls import path, include
from rest_framework.routers import DefaultRouter
from fitness.views import (
    MuscleGroupViewSet, ExerciseViewSet,
    TrainingViewSet, TrainingItemViewSet, TrainingSetViewSet,
)

router = DefaultRouter()
router.register(r'muscle-groups', MuscleGroupViewSet, basename='muscle-group')
router.register(r'exercises', ExerciseViewSet, basename='exercise')
router.register(r'trainings', TrainingViewSet, basename='training')
router.register(r'training-items', TrainingItemViewSet, basename='training-item')
router.register(r'training-sets', TrainingSetViewSet, basename='training-set')

urlpatterns = [
    path('', include(router.urls)),
]