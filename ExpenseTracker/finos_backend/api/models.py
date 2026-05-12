from django.db import models

class Transaction(models.Model):
    # The FIN-OS Behavioral Categories
    CATEGORY_CHOICES = [
        ('NEED', 'Need (Survival)'),
        ('WANT', 'Want (Lifestyle)'),
        ('INVESTMENT', 'Asset/Investment (Future)'),
        ('DEBT_GOOD', 'Good Debt (Leverage)'),
        ('DEBT_BAD', 'Bad Debt (Wealth Destroyer)'),
    ]

    title = models.CharField(max_length=100, help_text="What did you buy?")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    date = models.DateField(auto_now_add=True)

    def __str__(self):
        return f"{self.title} - ₹{self.amount} ({self.category})"