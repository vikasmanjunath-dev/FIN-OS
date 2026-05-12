from django.urls import path
from . import views

urlpatterns = [
    path('overview/', views.get_budget_overview, name='budget-overview'),
]