def get_lines(filepath, start, end):
    with open(filepath, 'r') as f:
        lines = f.readlines()
    return ''.join(lines[start-1:end])

tra = 'templates/finos/trader_simulations.html'
inv = 'templates/finos/investor_simulations.html'

tra_cards = get_lines(tra, 162, 287).replace('class="sim-card"', 'class="sim-card sc-tra"')
inv_cards = get_lines(inv, 169, 293).replace('class="sim-card"', 'class="sim-card sc-inv"')
tra_sims = get_lines(tra, 401, 782)
inv_sims = get_lines(inv, 381, 764)
tra_js = get_lines(tra, 785, 1227)

css = get_lines(tra, 5, 143)
css = css.replace('var(--r)', '#a78bff').replace('rgba(255,45,107', 'rgba(124,58,255')

result = '''{% extends 'finos/base.html' %}
{% block title %}FIN-OS — Market Crisis Simulator{% endblock %}
{% block extra_head %}
<style>
.mode-btn{padding:.6rem 1.4rem;border-radius:10px;font-family:var(--fM);font-size:.6rem;letter-spacing:1px;cursor:pointer;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:var(--mu);transition:all .2s}
.mode-btn.on-inv{background:rgba(0,255,136,.08);border-color:rgba(0,255,136,.25);color:var(--g)}
.mode-btn.on-tra{background:rgba(255,45,107,.08);border-color:rgba(255,45,107,.25);color:var(--r)}
.mode-btn:hover:not(.on-inv):not(.on-tra){background:rgba(255,255,255,.06);color:var(--txt)}
''' + css + '''
</style>
{% endblock %}

{% block content %}
<div class="tra-sim-page">
<div class="bg-grid"></div>

<div class="sim-header" style="text-align:center;padding:2rem 0 1.75rem;border-bottom:1px solid rgba(124,58,255,.08);margin-bottom:3rem">
  <div class="sim-eyebrow">THE MIND GYM</div>
  <h1 class="sim-title">MARKET CRISIS<br>SIMULATOR</h1>
  <p class="sim-subtitle">Live through India's biggest financial crises. Feel the panic, make real decisions under pressure, and discover what your brain actually does when money is on the line.</p>
  <div style="display:flex;gap:.75rem;justify-content:center;margin-top:1.5rem">
    <button class="mode-btn on-inv" id="modInv" onclick="setMode('inv')">📈 INVESTOR BRAIN</button>
    <button class="mode-btn" id="modTra" onclick="setMode('tra')">📊 TRADER BRAIN</button>
    <button class="mode-btn" id="modBoth" onclick="setMode('both')">🧠 ALL SIMS</button>
  </div>
</div>

<div class="sim-grid" id="simGrid">
''' + inv_cards + tra_cards + '''
</div>
</div>

<!-- SIMULATION MODAL -->
<div id="simModal" class="modal">
  <div class="modal-content">
    <div class="modal-header">
      <div class="modal-title-wrap">
        <h2 id="modalTitle">Loading Simulation...</h2>
        <p class="modal-subtitle" id="modalSubtitle">Get ready</p>
      </div>
      <button class="close-btn" onclick="closeModal()">×</button>
    </div>
    <div class="sim-interface">
      <div class="main-panel">
        <div id="phaseIndicator" class="phase-indicator phase-setup">🎯 LOADING</div>
        <div id="chartSection" class="hidden">
          <div class="chart-container">
            <canvas id="liveChart"></canvas>
            <div class="chart-price" id="chartPrice">
              <div id="currentPrice">₹485.50</div>
              <div class="chart-change" id="currentChange">+0.0%</div>
            </div>
          </div>
        </div>
        <div id="scenarioText" class="scenario-text"></div>
        <div id="questionContainer" class="question-container"></div>
        <div id="resultContainer" class="result-container"></div>
      </div>
      <div class="metrics-panel">
        <div class="position-display" id="traderPanel">
          <div class="position-label">CURRENT POSITION</div>
          <div id="positionStatus" class="position-value">NO POSITION</div>
          <div class="position-grid">
            <div class="position-item"><div id="entryPrice" class="position-item-value">--</div><div class="position-item-label">ENTRY</div></div>
            <div class="position-item"><div id="stopLoss" class="position-item-value">--</div><div class="position-item-label">STOP LOSS</div></div>
            <div class="position-item"><div id="currentPnL" class="position-item-value">₹0</div><div class="position-item-label">P&L</div></div>
            <div class="position-item"><div id="riskReward" class="position-item-value">--</div><div class="position-item-label">R:R</div></div>
          </div>
        </div>
        <div class="portfolio-display hidden" id="investorPanel" style="background:linear-gradient(135deg,rgba(0,255,136,.05),rgba(0,212,255,.05));border:1px solid rgba(0,255,136,.2);border-radius:16px;padding:1.5rem">
          <div class="portfolio-label" style="font-family:var(--fM);font-size:.65rem;color:var(--mu);letter-spacing:2px;margin-bottom:.35rem">PORTFOLIO VALUE</div>
          <div id="portfolioValue" style="font-size:1.4rem;font-weight:700;letter-spacing:.5px;margin-bottom:.15rem">₹50,00,000</div>
          <div id="portfolioChange" class="text-green" style="font-size:.9rem">+0.0%</div>
        </div>
        <div class="metric-card">
          <div class="metric-header">
            <div class="metric-title">EXECUTION CLARITY</div>
            <div id="clarityValue" class="metric-value">100%</div>
          </div>
          <div class="metric-bar"><div id="clarityBar" class="metric-fill" style="width:100%"></div></div>
        </div>
        <div class="metric-card">
          <div class="metric-header"><div class="metric-title">EMOTIONAL STATE</div></div>
          <div class="emotion-tracker">
            <div class="emotion-item"><span class="emotion-label">Fear</span><span id="fearLevel" class="emotion-level level-low">LOW</span></div>
            <div class="emotion-item"><span class="emotion-label">Greed</span><span id="greedLevel" class="emotion-level level-low">LOW</span></div>
            <div class="emotion-item"><span class="emotion-label">Revenge/Panic</span><span id="revengeLevel" class="emotion-level level-low">LOW</span></div>
            <div class="emotion-item"><span class="emotion-label">Discipline</span><span id="disciplineLevel" class="emotion-level level-medium">MEDIUM</span></div>
          </div>
        </div>
        <div class="metric-card">
          <div class="metric-title" style="margin-bottom:1rem">DECISION LOG</div>
          <div class="trade-log" id="tradeLog">
            <div class="log-item"><span class="log-time">--:--</span><span class="log-action">Simulation starting...</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<input type="hidden" name="csrfmiddlewaretoken" value="{{ csrf_token }}">
{% endblock %}

{% block extra_js %}
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
function setMode(m){
  document.getElementById('modInv').className='mode-btn'+(m==='inv'?' on-inv':'');
  document.getElementById('modTra').className='mode-btn'+(m==='tra'?' on-tra':'');
  document.getElementById('modBoth').className='mode-btn'+(m==='both'?' on-inv':'');
  document.querySelectorAll('.sim-card').forEach(c=>{
    if(m==='both') c.style.display='';
    else if(m==='inv') c.style.display=c.classList.contains('sc-inv')?'':'none';
    else c.style.display=c.classList.contains('sc-tra')||c.classList.contains('sc-both')?'':'none';
  });
}

const SIMULATIONS = {
''' + inv_sims + ''',
''' + tra_sims + '''
};

''' + tra_js + '''

// Patch: show/hide investor vs trader panel based on sim type
const _origStart = startSimulation;
startSimulation = function(simId) {
  const sim = SIMULATIONS[simId];
  if (!sim) { console.warn('Sim not found:', simId); return; }
  const isInvestor = sim.initialValue !== undefined;
  document.getElementById('traderPanel').classList.toggle('hidden', isInvestor);
  document.getElementById('investorPanel').classList.toggle('hidden', !isInvestor);
  if (isInvestor) {
    // investor sims use portfolioValue display
    const pv = sim.initialValue || 5000000;
    document.getElementById('portfolioValue').textContent = '₹' + (pv/100000).toFixed(1) + 'L';
    document.getElementById('portfolioChange').textContent = '+0.0%';
  }
  _origStart(simId);
};
</script>
{% endblock %}
'''

with open('templates/finos/simulations.html', 'w') as f:
    f.write(result)
print("Done! Lines:", len(result.splitlines()))
