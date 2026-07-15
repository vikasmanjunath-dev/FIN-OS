# ─────────────────────────────────────────────────────────────────────────────
# api/admin.py — Django Admin Registration (Expense Tracker Backend)
# ─────────────────────────────────────────────────────────────────────────────
# This file connects the Transaction model to Django's built-in /admin/ panel.
# One line of code gives us a full CRUD interface for free.
#
# WHAT THIS GIVES YOU AT http://localhost:8000/admin/:
#   ┌─────────────────────────────────────────────────────────┐
#   │ API › Transactions                                      │
#   │                                                         │
#   │ [+ Add Transaction]  [Action ▼] [Go]                    │
#   │                                                         │
#   │ □  Transaction                          Date            │
#   │ □  Swiggy dinner - ₹450.00 (WANT)      July 15, 2026   │
#   │ □  EMI payment - ₹5000.00 (DEBT_GOOD)  July 14, 2026   │
#   └─────────────────────────────────────────────────────────┘
#
# HOW TO ACCESS THE ADMIN:
#   1. python manage.py createsuperuser
#   2. python manage.py runserver
#   3. Visit http://localhost:8000/admin/
#   4. Log in with your superuser credentials
#   5. Click "Transactions" under the "API" section
#
# ENHANCED ADMIN (add to this file to improve the UI):
#
#   @admin.register(Transaction)
#   class TransactionAdmin(admin.ModelAdmin):
#       list_display   = ['id', 'title', 'amount', 'category', 'date']
#       list_filter    = ['category', 'date']         # Add filter sidebar
#       search_fields  = ['title']                    # Add search bar
#       ordering       = ['-date']                    # Newest first
#       date_hierarchy = 'date'                       # Drill-down by date
#       list_per_page  = 50                           # Pagination size
#
# WHY admin.site.register() vs @admin.register()?
#   Both are equivalent. @admin.register(Transaction) is a decorator syntax
#   for the same operation — a matter of style preference.
# ─────────────────────────────────────────────────────────────────────────────
from django.contrib import admin
from .models import Transaction

# admin.site is the global AdminSite instance Django creates.
# register() adds Transaction to the admin panel with default settings:
#   - List view shows __str__ output: "Swiggy dinner - ₹450.00 (WANT)"
#   - Edit view shows all fields as a form
#   - Delete option available per row and in bulk actions
admin.site.register(Transaction)
