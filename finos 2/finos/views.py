from django.shortcuts import render

def landing(request):
    return render(request, 'finos/landing.html')

def investor(request):
    return render(request, 'finos/investor.html')

def trader(request):
    return render(request, 'finos/trader.html')

def simulations(request):
    return render(request, 'finos/simulations.html')

def trader_simulations(request):
    return render(request, 'finos/trader_simulations.html')

def investor_simulations(request):
    return render(request, 'finos/investor_simulations.html')
