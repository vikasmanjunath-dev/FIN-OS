import re

def extract_between(text, start_marker, end_marker):
    start = text.find(start_marker)
    if start == -1: return ""
    start += len(start_marker)
    end = text.find(end_marker, start)
    if end == -1: return ""
    return text[start:end]

with open('templates/finos/investor_simulations.html', 'r') as f:
    inv_html = f.read()

with open('templates/finos/trader_simulations.html', 'r') as f:
    tra_html = f.read()

with open('templates/finos/simulations.html', 'r') as f:
    sim_html = f.read()

# Extract Cards
inv_cards = extract_between(inv_html, '<div class="sim-grid">', '  </div>\n</div>\n\n<!-- SIMULATION MODAL -->')
tra_cards = extract_between(tra_html, '<div class="sim-grid">', '  </div>\n</div>\n\n<!-- SIMULATION MODAL -->')

# Add sc-inv and sc-tra classes to the cards for filtering
inv_cards = inv_cards.replace('class="sim-card"', 'class="sim-card sc-inv"')
tra_cards = tra_cards.replace('class="sim-card"', 'class="sim-card sc-tra"')

# Extract SIMULATIONS object
inv_sims = extract_between(inv_html, 'const SIMULATIONS = {', '};\n\n  let currentSim = null;')
tra_sims = extract_between(tra_html, 'const SIMULATIONS = {', '};\n\n  let currentSim = null;')

# Extract CSS and Modal from trader_simulations.html
css = extract_between(tra_html, '<style>', '</style>')
# Let's adjust the modal theme to be purple instead of red for the unified page
css = css.replace('var(--r)', '#a78bff').replace('rgba(255,45,107', 'rgba(124,58,255')

modal_html = extract_between(tra_html, '<!-- SIMULATION MODAL -->', '<script>')

js_logic = extract_between(tra_html, '  let currentSim = null;', '</script>')

# Build the new simulations.html
header_html = extract_between(sim_html, '<!-- ─── HEADER ─── -->', '<!-- SIMULATION CARDS -->')

new_html = f"""{{% extends 'finos/base.html' %}}
{{% block title %}}FIN-OS — Market Crisis Simulator{{% endblock %}}
{{% block extra_head %}}
<style>
{css}
</style>
{{% endblock %}}

{{% block content %}}
<div class="tra-sim-page">
  <div class="bg-grid"></div>

<!-- ─── HEADER ─── -->
{header_html}
<!-- SIMULATION CARDS -->
  <div class="sim-grid" id="simGrid">
{inv_cards}
{tra_cards}
  </div>
</div>

<!-- SIMULATION MODAL -->
{modal_html}

<!-- CSRF Token -->
<input type="hidden" name="csrfmiddlewaretoken" value="{{{{ csrf_token }}}}">

{{% endblock %}}

{{% block extra_js %}}
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
// ─── MODE FILTER ───
function setMode(m){{
  document.getElementById('modInv').className = 'mode-btn' + (m==='inv'?' on-inv':'');
  document.getElementById('modTra').className = 'mode-btn' + (m==='tra'?' on-tra':'');
  document.getElementById('modBoth').className = 'mode-btn' + (m==='both'?' on-inv':'');
  document.querySelectorAll('.sim-card').forEach(c=>{{
    if(m==='both') c.style.display='';
    else if(m==='inv') c.style.display = c.classList.contains('sc-inv')?'':'none';
    else c.style.display = c.classList.contains('sc-tra')||c.classList.contains('sc-both')?'':'none';
  }});
}}

  const SIMULATIONS = {{
{inv_sims},
{tra_sims}
  }};

  let currentSim = null;
{js_logic}
</script>
{{% endblock %}}
"""

with open('templates/finos/simulations.html', 'w') as f:
    f.write(new_html)

print("Merged successfully!")
