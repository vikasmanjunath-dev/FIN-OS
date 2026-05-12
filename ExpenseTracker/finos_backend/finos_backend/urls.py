from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/budget/', include('api.urls')), # This links our new endpoints
]