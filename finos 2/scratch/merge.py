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
inv_sims = extract_between(inv_html, 'const SIMULATIONS = {', '};\n\n  let currentSimId')
tra_sims = extract_between(tra_html, 'const SIMULATIONS = {', '};\n\n  let currentSimId')

# Extract CSS and Modal from trader_simulations.html (it's the same structure as investor)
css = extract_between(tra_html, '<style>', '</style>')
# Let's adjust the modal theme to be purple instead of red for the unified page
css = css.replace('var(--r)', '#a78bff').replace('rgba(255,45,107', 'rgba(124,58,255')

modal_html = extract_between(tra_html, '<!-- SIMULATION MODAL -->', '<!-- CSRF Token -->')

js_logic = extract_between(tra_html, '  let currentSimId = null;', '</script>')

# Build the new simulations.html
# We will use the header from simulations.html, and the grid logic
header_html = extract_between(sim_html, '<!-- ─── HEADER ─── -->', '<!-- ─── BRAIN METER ─── -->')

# We need the mode-btn CSS from simulations.html
mode_btn_css = """
.mode-btn{
  padding:.6rem 1.4rem;border-radius:10px;font-family:var(--fM);font-size:.6rem;
  letter-spacing:1px;cursor:pointer;border:1px solid rgba(255,255,255,.08);
  background:rgba(255,255,255,.03);color:var(--mu);transition:all .2s;
}
.mode-btn.on-inv{background:rgba(0,255,136,.08);border-color:rgba(0,255,136,.25);color:var(--g)}
.mode-btn.on-tra{background:rgba(255,45,107,.08);border-color:rgba(255,45,107,.25);color:var(--r)}
.mode-btn:hover:not(.on-inv):not(.on-tra){background:rgba(255,255,255,.06);color:var(--txt)}

.sh-left .sh-eye{font-family:var(--fM);font-size:.58rem;color:#a78bff;letter-spacing:3px;display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem}
.sh-left .sh-eye::before{content:'';width:16px;height:1px;background:#a78bff}
.sh-title{font-family:var(--fD);font-size:clamp(2.4rem,5vw,4.5rem);letter-spacing:3px;line-height:1}
.sh-title span{background:linear-gradient(90deg,#a78bff,var(--c));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.sh-sub{font-size:.88rem;color:rgba(240,237,255,.55);line-height:1.75;max-width:520px;margin-top:.75rem}

.sh-right{display:flex;gap:.75rem;flex-shrink:0}
.sim-header{margin-bottom:3rem;display:flex;align-items:flex-end;justify-content:space-between;gap:2rem}
"""

new_html = f"""{{% extends 'finos/base.html' %}}
{{% block title %}}FIN-OS — Market Crisis Simulator{{% endblock %}}
{{% block extra_head %}}
<style>
{mode_btn_css}
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

  let currentSimId = null;
{js_logic}
</script>
{{% endblock %}}
"""

with open('templates/finos/simulations.html', 'w') as f:
    f.write(new_html)

print("Merged successfully!")
