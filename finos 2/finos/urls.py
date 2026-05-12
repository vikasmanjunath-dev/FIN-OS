from django.urls import path
from . import views

app_name = 'finos'

urlpatterns = [
    path('', views.landing, name='landing'),
    path('investor/', views.investor, name='investor'),
    path('trader/', views.trader, name='trader'),
    path('simulations/', views.simulations, name='simulations'),
    path('investor-simulations/', views.investor_simulations, name='investor_simulations'),
    path('trader-simulations/', views.trader_simulations, name='trader_simulations'),
]
