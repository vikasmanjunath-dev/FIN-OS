# ─────────────────────────────────────────────────────────────────────────────
# finos/admin.py — Django Admin Registration (FIN-OS Core Server)
# ─────────────────────────────────────────────────────────────────────────────
# This file controls which models appear in Django's built-in /admin/ panel.
# Currently empty (no models registered) because the 'finos' app has no
# database models yet — it only serves HTML templates.
#
# HOW IT WORKS:
#   1. `python manage.py createsuperuser` → creates your admin login
#   2. Visit http://localhost:8000/admin/ and log in
#   3. Django shows all models registered with admin.site.register()
#
# WHEN MODELS ARE ADDED TO THIS APP:
#   Example — if you add a UserProfile model to finos/models.py:
#
#     from .models import UserProfile
#
#     # Basic registration — shows all fields in a simple list
#     admin.site.register(UserProfile)
#
#   Or with a custom admin class for better control:
#
#     @admin.register(UserProfile)
#     class UserProfileAdmin(admin.ModelAdmin):
#         list_display  = ['user', 'mode', 'risk_level', 'created_at']
#         list_filter   = ['mode', 'risk_level']
#         search_fields = ['user__username', 'user__email']
#         ordering      = ['-created_at']
#
# CURRENT STATE:
#   No models are registered here — this is correct for a template-only app.
#   The admin panel will still work for built-in Django models (users, sessions).
# ─────────────────────────────────────────────────────────────────────────────
from django.contrib import admin

# Register your models here.
