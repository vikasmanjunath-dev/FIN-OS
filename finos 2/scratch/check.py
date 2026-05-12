import subprocess

# Use line-based extraction to get exact content
def get_lines(filepath, start, end):
    with open(filepath, 'r') as f:
        lines = f.readlines()
    return ''.join(lines[start-1:end])

# ------ Extract Trader SIMULATIONS data (lines 400-783) ------
tra_sims = get_lines('templates/finos/trader_simulations.html', 401, 783)
# trim trailing '};'
tra_sims = tra_sims.rstrip()
if tra_sims.endswith('};'):
    tra_sims = tra_sims[:-2].rstrip()

# ------ Extract Investor SIMULATIONS data (lines 381-765) ------
inv_sims = get_lines('templates/finos/investor_simulations.html', 381, 765)
inv_sims = inv_sims.rstrip()
if inv_sims.endswith('};'):
    inv_sims = inv_sims[:-2].rstrip()

# ------ Extract Trader JS logic (lines 785-1227) ------
tra_js = get_lines('templates/finos/trader_simulations.html', 785, 1227)

# ------ Extract Investor JS logic we uniquely need (lines 767-1093) ------
inv_js = get_lines('templates/finos/investor_simulations.html', 767, 1093)

# ------ Extract Trader Cards (lines 161-287) ------
tra_cards = get_lines('templates/finos/trader_simulations.html', 162, 287)
tra_cards = tra_cards.replace('class="sim-card"', 'class="sim-card sc-tra"')

# ------ Extract Investor Cards (lines 169-293) ------
inv_cards = get_lines('templates/finos/investor_simulations.html', 169, 293)
inv_cards = inv_cards.replace('class="sim-card"', 'class="sim-card sc-inv"')

print("Trader sims length:", len(tra_sims))
print("Investor sims length:", len(inv_sims))
print("Trader JS length:", len(tra_js))
print("Trader cards length:", len(tra_cards))
print("Investor cards length:", len(inv_cards))
print("First 200 of tra_sims:", tra_sims[:200])
print("First 200 of inv_sims:", inv_sims[:200])
