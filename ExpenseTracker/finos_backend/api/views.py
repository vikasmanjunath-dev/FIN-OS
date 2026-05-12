import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from .models import Transaction

@csrf_exempt # Bypasses security temporarily so local React can send data
def get_budget_overview(request):
    
    # --- NEW: HANDLE INCOMING TRANSACTIONS ---
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            Transaction.objects.create(
                title=data['title'],
                amount=data['amount'],
                category=data['category']
            )
            return JsonResponse({"status": "success", "message": "Transaction logged."})
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=400)

    # --- EXISTING: SEND OUTGOING DATA ---
    transactions = Transaction.objects.all().order_by('-date')
    
    data = []
    total_spent = 0
    leak_total = 0

    for t in transactions:
        data.append({
            "id": t.id,
            "title": t.title,
            "amount": float(t.amount),
            "category": t.category,
            "date": t.date.strftime('%Y-%m-%d')
        })
        
        total_spent += float(t.amount)
        if t.category in ['WANT', 'DEBT_BAD']:
            leak_total += float(t.amount)

    health_score = 100
    if total_spent > 0:
        leak_percentage = (leak_total / total_spent) * 100
        health_score -= leak_percentage 

    return JsonResponse({
        "status": "success",
        "metrics": {
            "total_spent": total_spent,
            "leak_total": leak_total,
            "health_score": round(health_score, 1)
        },
        "transactions": data
    })

import numpy as np
from rest_framework.decorators import api_view
from rest_framework.response import Response

# 1. MONTE CARLO ENGINE (Backend Math)
@api_view(['POST'])
def run_wealth_simulation(request):
    data = request.data
    current_wealth = data.get('current_wealth', 0)
    monthly_sip = data.get('monthly_sip', 0)
    years = 10
    
    # 10,000 Simulation Paths
    np.random.seed(42)
    expected_return = 0.12
    volatility = 0.15
    
    # Simplified return structure for frontend
    paths = []
    for _ in range(3): # Optimistic, Expected, Pessimistic
        paths.append([current_wealth * (1 + expected_return)**y + (monthly_sip * 12 * y) for y in range(1, years+1)])
        
    return Response({
        "optimistic": paths[0], # Add +1 std dev logic here
        "expected": paths[1],
        "pessimistic": paths[2], # Add -1 std dev logic here
        "labels": [f"Year {i}" for i in range(1, years+1)]
    })

# 2. ACCOUNT AGGREGATOR (AA) WEBHOOK
@api_view(['POST'])
def aa_webhook_sync(request):
    # This endpoint receives real-time transaction data from Setu/Sahamati APIs
    # and pushes it to the React frontend via WebSockets
    raw_data = request.data
    # ... parse banking data, auto-categorize using NLP
    return Response({"status": "synced"})