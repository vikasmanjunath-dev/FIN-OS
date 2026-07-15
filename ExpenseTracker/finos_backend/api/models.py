# ─────────────────────────────────────────────────────────────────────────────
# api/models.py — Database Models (Expense Tracker Backend)
# ─────────────────────────────────────────────────────────────────────────────
# A Django model is a Python class that:
#   1. Defines the SCHEMA (columns/types) of a database table
#   2. Provides an ORM interface (objects.create, filter, etc.) to that table
#   3. Validates data before saving
#   4. Integrates automatically with Django admin, forms, and serializers
#
# HOW THE ORM MAPS THIS CLASS TO SQL:
#   class Transaction(models.Model) → CREATE TABLE api_transaction (...)
#
#   Django auto-names tables as: <app_label>_<model_name_lowercase>
#   App label: 'api' (from INSTALLED_APPS)
#   Model name: 'Transaction' → lowercased: 'transaction'
#   Final table name: 'api_transaction'
#
# MIGRATION FLOW:
#   This model was written → python manage.py makemigrations api
#   → Django generated api/migrations/0001_initial.py
#   → python manage.py migrate
#   → Django ran the migration SQL against db.sqlite3
#   → Table 'api_transaction' now exists with all 5 columns
#
# THE FIN-OS BEHAVIOURAL FINANCE FRAMEWORK:
#   The 5 categories below are not random — they map to the FIN-OS philosophy
#   of viewing every rupee through a behavioural finance lens:
#
#   NEED        = Survival spending (rent, food, electricity, medicines)
#                 Baseline; can't be eliminated
#
#   WANT        = Lifestyle spending (dining out, Netflix, Zomato, clothes)
#                 The primary "wealth leak" — reduce to build wealth
#
#   INVESTMENT  = Future wealth builders (SIP, PPF, stocks, FD, gold)
#                 The wealth CREATORS — maximise this
#
#   DEBT_GOOD   = Leverage with positive ROI (home loan, business loan)
#                 Interest rate < asset appreciation rate
#
#   DEBT_BAD    = Wealth destroyers (credit card revolving balance, personal loans)
#                 Interest rate > any return you'll get elsewhere
# ─────────────────────────────────────────────────────────────────────────────
from django.db import models

class Transaction(models.Model):
    # ─────────────────────────────────────────────────────────────────────────
    # CATEGORY_CHOICES — FIN-OS Behavioural Classification System
    # ─────────────────────────────────────────────────────────────────────────
    # Each tuple is (database_value, human_readable_label).
    # The DB stores the short code ('NEED', 'WANT', etc.) — compact and indexable.
    # Django admin and forms display the long label ('Need (Survival)').
    # Access the label in Python: transaction.get_category_display()
    # ─────────────────────────────────────────────────────────────────────────
    # The FIN-OS Behavioral Categories
    CATEGORY_CHOICES = [
        ('NEED', 'Need (Survival)'),           # Rent, food, utility bills, medicines
        ('WANT', 'Want (Lifestyle)'),           # Swiggy, Netflix, shopping, dining
        ('INVESTMENT', 'Asset/Investment (Future)'),  # Nifty SIP, PPF, FD, gold
        ('DEBT_GOOD', 'Good Debt (Leverage)'), # Home loan EMI (asset appreciates)
        ('DEBT_BAD', 'Bad Debt (Wealth Destroyer)'),  # Credit card interest, personal loans
    ]

    # ─────────────────────────────────────────────────────────────────────────
    # FIELDS — each becomes a column in the api_transaction table
    # ─────────────────────────────────────────────────────────────────────────

    # VARCHAR(100) NOT NULL
    # max_length=100: SQLite doesn't enforce varchar length, but Django's forms
    # and serializers DO — submissions with title > 100 chars will be rejected.
    # help_text appears in Django admin forms and DRF's browsable API.
    title = models.CharField(max_length=100, help_text="What did you buy?")

    # DECIMAL(12, 2) NOT NULL
    # max_digits=12   → stores up to 9,999,999,999.99 (nearly ₹1 crore * 100)
    # decimal_places=2 → two decimal places (paise precision: ₹450.75)
    # WHY DecimalField and NOT FloatField?
    #   Float is base-2 (binary) arithmetic. 0.1 + 0.2 = 0.30000000000000004.
    #   For money, even ₹0.01 errors compound into significant discrepancies
    #   when summing thousands of transactions. DecimalField uses Python's
    #   decimal.Decimal which is base-10 and exact.
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    # VARCHAR(20) NOT NULL
    # Stores the SHORT CODE ('NEED', 'WANT', etc.) from CATEGORY_CHOICES.
    # max_length=20 covers the longest code: 'INVESTMENT' (10 chars) + buffer.
    # choices= parameter:
    #   - Enforces validation in Django forms (not at DB level for SQLite)
    #   - Powers get_category_display() method
    #   - Shows dropdown in Django admin
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)

    # DATE NOT NULL (auto-set)
    # auto_now_add=True means Django automatically sets this field to the
    # CURRENT DATE when a Transaction is first created.
    # You NEVER pass 'date' when calling Transaction.objects.create().
    # The field is also READ-ONLY — you can't update it after creation.
    # This records WHEN the transaction was logged (not necessarily when
    # the money was actually spent — a distinction to add as a future field).
    date = models.DateField(auto_now_add=True)

    def __str__(self):
        # __str__ controls the string representation of this object.
        # This is what Django admin shows in the list view for each row.
        # Example output: "Swiggy dinner - ₹450.00 (WANT)"
        # The ₹ symbol is the Unicode rupee sign (U+20B9), not the old ₨.
        return f"{self.title} - ₹{self.amount} ({self.category})"
