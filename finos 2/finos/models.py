# ─────────────────────────────────────────────────────────────────────────────
# finos/models.py — Database Models (FIN-OS Core Server)
# ─────────────────────────────────────────────────────────────────────────────
# A Django "model" is a Python class that maps to a database table.
# Each attribute on the class maps to a column in the table.
# Django's ORM (Object-Relational Mapper) translates Python operations
# (Model.objects.create(), filter(), etc.) into SQL queries automatically.
#
# CURRENT STATE:
#   No models are defined here yet. The 'finos' app is currently a
#   template-serving app only — it renders HTML pages but stores no data.
#
# PLANNED MODELS FOR FIN-OS CORE:
#
#   class UserProfile(models.Model):
#       """
#       Stores FIN-OS user preferences and mode selection.
#       Linked one-to-one with Django's built-in User model.
#       """
#       user       = models.OneToOneField(User, on_delete=models.CASCADE)
#       mode       = models.CharField(max_length=10, choices=[('investor','Investor'),('trader','Trader')])
#       risk_level = models.CharField(max_length=10, choices=[('low','Low'),('medium','Medium'),('high','High')])
#       theme      = models.CharField(max_length=20, default='dark')
#       created_at = models.DateTimeField(auto_now_add=True)
#
#   After adding a model, run:
#     python manage.py makemigrations finos   ← generates migration file
#     python manage.py migrate                ← creates the DB table
#
# WHY models.Model?
#   Every model MUST inherit from django.db.models.Model.
#   This base class provides:
#     - The 'objects' Manager (gateway to database queries)
#     - auto-generated 'id' primary key (unless you define your own)
#     - __str__, __repr__ methods
#     - save(), delete() instance methods
#     - Integration with migrations, admin, forms, serializers
# ─────────────────────────────────────────────────────────────────────────────
from django.db import models

# Create your models here.
