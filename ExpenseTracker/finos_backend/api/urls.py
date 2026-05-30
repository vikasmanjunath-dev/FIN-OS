from django.urls import path
from . import views

urlpatterns = [
    path('overview/',         views.get_budget_overview,    name='budget-overview'),
    path('forecast/',         views.forecast_budget,         name='budget-forecast'),
    path('wealth-sim/',       views.run_wealth_simulation,   name='wealth-simulation'),
]