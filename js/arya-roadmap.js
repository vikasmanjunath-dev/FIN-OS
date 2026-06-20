/**
 * arya-roadmap.js  —  FIN·OS Personalized Roadmap & MindMap Engine  v1.0
 * ─────────────────────────────────────────────────────────────────────────
 * Three interactive visualizations driven entirely by real user data:
 *  1. ROADMAP   — priority-ordered financial journey with real numbers
 *  2. MINDMAP   — interactive SVG radial graph, pan + zoom + click
 *  3. TIMELINE  — life-stage journey with milestone photos
 */
(function AryaRoadmap(global) {
  'use strict';

  /* ── helpers ──────────────────────────────────────────────────── */
  const get  = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const getJ = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
  const n    = v => Number(v) || 0;
  const INR  = v => {
    const x = n(v);
    if (x >= 1e7) return '₹' + (x / 1e7).toFixed(1) + ' Cr';
    if (x >= 1e5) return '₹' + (x / 1e5).toFixed(1) + ' L';
    if (x >= 1e3) return '₹' + Math.round(x / 1e3) + 'K';
    return '₹' + Math.round(x).toLocaleString('en-IN');
  };
  const pct  = v => Math.max(0, Math.min(100, Math.round(n(v))));

  /* ── DNA color themes ─────────────────────────────────────────── */
  const DNA_COLORS = {
    Builder:   ['#4f7cff','#7b2ff7'], Guardian:  ['#22d3a6','#0d9488'],
    Explorer:  ['#f59e0b','#ef4444'], Optimizer: ['#c7f000','#22d3a6'],
    Achiever:  ['#a855f7','#ec4899'], Visionary: ['#00d4ff','#4f7cff'],
    Realist:   ['#fb923c','#f43f5e'],
  };

  /* ── Unsplash photo IDs for milestone images ───────────────────── */
  const PHOTOS = {
    emergency: 'photo-1554224155-6726b3ff858f',
    invest:    'photo-1611974789855-9c2a0a7236a3',
    home:      'photo-1560184897-ae75f418493e',
    retirement:'photo-1518020382113-a7e8fc38eac9',
    baby:      'photo-1555252333-9f8e92e65df9',
    car:       'photo-1494976388531-d1058494cdd8',
    travel:    'photo-1488085061387-422e29b40080',
    insurance: 'photo-1576091160550-2173dba999ef',
    tax:       'photo-1554224154-26032ffc0d07',
    education: 'photo-1523050854058-8df90110c9f1',
    business:  'photo-1507679799987-c73779587ccf',
    wealth:    'photo-1579621970563-ebec7560ff3e',
  };

  function unsplash(key, w = 400, h = 240) {
    return `https://images.unsplash.com/${PHOTOS[key] || PHOTOS.wealth}?w=${w}&h=${h}&fit=crop&crop=center&auto=format&q=80`;
  }

  /* ══════════════════════════════════════════════════════════════════
     DATA — read everything from localStorage + FINOS_USER_CONTEXT
  ══════════════════════════════════════════════════════════════════ */
  function loadUserData() {
    const ctx    = global.FINOS_USER_CONTEXT || {};
    const budget = ctx.budget_tracker || {};
    const fin    = ctx.financial     || {};
    const prof   = ctx.profile       || {};
    const id     = ctx.identity      || {};

    const income   = n(budget.income_monthly || get('finos_income', 0));
    const expenses = income * (1 - n(budget.savings_rate || get('finos_savings_rate', 0)) / 100) || income * 0.75;
    const savings  = n(budget.savings_rate  || get('finos_savings_rate', 0));
    const nw       = n(prof.net_worth       || get('finos_net_worth', 0));
    const health   = n(prof.health_score    || get('finos_health_score', 0));
    const dna      = id.financial_dna       || get('finos_financial_dna', 'Explorer');
    const name     = id.name                || get('finos_display_name', 'Investor');
    const stage    = id.life_stage          || get('finos_stage', '');
    const ef       = n(prof.emergency_fund  || budget.emergency_fund_months * expenses || 0);
    const debt     = n(budget.total_debt    || 0);
    const sipAmt   = n(budget.sip_monthly   || getJ('finos_sip_total', 0));
    const fireNum  = n(budget.fire_number   || 0);
    const fireYrs  = n(budget.fire_years_estimate || 0);
    const goals    = fin.goals              || [];
    const port     = fin.portfolio          || null;
    const tx       = fin.transactions       || null;
    const beh      = ctx.behavioral         || {};
    const taxSave  = n(beh.tax_savings_potential || 0);
    const streak   = getJ('finos_streak', { count: 0 }).count || 0;

    // Try to estimate age from stage
    const ageMap = { Student: 21, Early: 26, Growing: 32, Peak: 42, PreRetirement: 52, Retired: 62 };
    const age    = Object.keys(ageMap).find(k => stage?.includes(k)) ? ageMap[Object.keys(ageMap).find(k => stage?.includes(k))] : 30;

    return { name, dna, age, stage, income, expenses, savings, nw, health, ef, debt, sipAmt, fireNum, fireYrs, goals, port, tx, beh, taxSave, streak };
  }

  /* ══════════════════════════════════════════════════════════════════
     1. ROADMAP — priority-ordered financial journey
  ══════════════════════════════════════════════════════════════════ */
  function generateSteps(d) {
    const steps = [];
    const efMonths  = d.income > 0 ? d.ef / d.expenses : 0;
    const efStatus  = efMonths >= 6 ? 'done' : efMonths >= 3 ? 'progress' : 'todo';
    const hasTerm   = !!get('finos_term_insurance', '');
    const hasHealth = !!get('finos_health_insurance', '');
    const max80C    = 150000;
    const invested80C = n(get('finos_80c_invested', 0));
    const taxStatus = invested80C >= max80C ? 'done' : invested80C > 0 ? 'progress' : 'todo';

    // 1. Emergency Fund
    steps.push({
      id: 'emergency', category: 'Safety', icon: '🛟',
      color: '#00ffb3', imgKey: 'emergency',
      title: 'Emergency Fund',
      subtitle: '6 months of expenses',
      status: efStatus,
      progress: pct((efMonths / 6) * 100),
      stat: efMonths > 0 ? `${efMonths.toFixed(1)}mo coverage` : 'Not started',
      action: efStatus === 'done'
        ? 'Fully funded — park in liquid MF for 7.2% returns'
        : `Build ${INR(Math.max(0, d.expenses * 6 - d.ef))} more — open a liquid fund today`,
      why: 'Emergency fund is financial bedrock. Without it, one crisis unravels everything.',
      priority: efStatus === 'done' ? 1 : 10
    });

    // 2. Term Life Insurance
    steps.push({
      id: 'term', category: 'Protection', icon: '🛡️',
      color: '#4f7cff', imgKey: 'insurance',
      title: 'Term Life Insurance',
      subtitle: `${d.income > 0 ? '15-20x annual income' : 'Protect your family'}`,
      status: hasTerm ? 'done' : 'todo',
      progress: hasTerm ? 100 : 0,
      stat: d.income > 0 ? `Target: ${INR(d.income * 12 * 15)}` : 'Check coverage',
      action: hasTerm
        ? 'Term in place — review cover amount every 5 years'
        : `Get ${INR(d.income * 12 * 15)} term cover today — premium ~₹8-12K/yr for your age`,
      why: 'India\'s most underinsured risk. A ₹8K premium protects ₹1Cr+ for your family.',
      priority: hasTerm ? 2 : 9
    });

    // 3. Health Insurance
    steps.push({
      id: 'health-ins', category: 'Protection', icon: '🏥',
      color: '#ff6b9d', imgKey: 'insurance',
      title: 'Health Insurance',
      subtitle: '₹10L+ family floater',
      status: hasHealth ? 'done' : 'todo',
      progress: hasHealth ? 100 : 0,
      stat: hasHealth ? 'Cover in place' : 'Not set up',
      action: hasHealth
        ? 'Health cover active — add super top-up for ₹1K/yr extra premium'
        : 'Get ₹10L family floater — Niva Bupa / Care health plans start at ₹12K/yr',
      why: 'One hospitalisation without cover can wipe out 2-3 years of savings.',
      priority: hasHealth ? 3 : 8
    });

    // 4. High-interest Debt
    if (d.debt > 0) {
      const dtiRatio = d.income > 0 ? (d.debt / (d.income * 12)) * 100 : 0;
      const debtStatus = dtiRatio < 15 ? 'progress' : dtiRatio < 30 ? 'progress' : 'todo';
      steps.push({
        id: 'debt', category: 'Freedom', icon: '⛓️',
        color: '#ff9500', imgKey: 'wealth',
        title: 'Clear High-Interest Debt',
        subtitle: 'Credit cards & personal loans first',
        status: debtStatus,
        progress: pct(Math.max(0, 100 - dtiRatio)),
        stat: `${INR(d.debt)} outstanding`,
        action: `Pay ₹${Math.round(d.debt * 0.1 / 1000)}K extra/month — debt-free in ${Math.ceil(10 / 1)} months`,
        why: 'Credit card debt at 36-42% APR is wealth destruction. Clear it before investing.',
        priority: dtiRatio > 30 ? 7 : 5
      });
    }

    // 5. Tax Optimization
    steps.push({
      id: 'tax', category: 'Optimization', icon: '📋',
      color: '#c7f000', imgKey: 'tax',
      title: 'Tax Optimization',
      subtitle: '80C · 80D · HRA · NPS',
      status: taxStatus,
      progress: pct((invested80C / max80C) * 100),
      stat: d.taxSave > 0 ? `Save ${INR(d.taxSave)} more this FY` : `${INR(invested80C)} invested in 80C`,
      action: taxStatus === 'done'
        ? `80C maxed — add ₹50K to NPS (80CCD1B) for extra deduction`
        : `Invest ${INR(max80C - invested80C)} in ELSS to complete 80C before March 31`,
      why: 'Every rupee saved in taxes is a rupee compounding for you at 100% efficiency.',
      priority: taxStatus === 'done' ? 4 : 6
    });

    // 6. SIP / Investment
    const idealSip = d.income > 0 ? Math.round(d.income * 0.25) : 0;
    const sipStatus = d.sipAmt >= idealSip ? 'done' : d.sipAmt > 0 ? 'progress' : 'todo';
    steps.push({
      id: 'sip', category: 'Wealth', icon: '📈',
      color: '#7b2ff7', imgKey: 'invest',
      title: 'SIP Investment Machine',
      subtitle: '25% of income minimum',
      status: sipStatus,
      progress: idealSip > 0 ? pct((d.sipAmt / idealSip) * 100) : 0,
      stat: d.sipAmt > 0 ? `${INR(d.sipAmt)}/mo SIP active` : 'Not started',
      action: sipStatus === 'done'
        ? `${INR(d.sipAmt)}/mo running — increase by 10% every salary hike (step-up SIP)`
        : `Start ${INR(idealSip - d.sipAmt)}/mo more SIP — automate on salary day`,
      why: `${INR(idealSip)}/mo for 20 years at 12% CAGR = ${INR(idealSip * 12 * 20 * 4)} corpus.`,
      priority: sipStatus === 'done' ? 6 : 7
    });

    // 7. Goals
    d.goals.slice(0, 3).forEach((g, i) => {
      const gpct = pct(g.progress || 0);
      const goalStatus = gpct >= 100 ? 'done' : gpct > 10 ? 'progress' : 'todo';
      const imgKeys = ['home', 'travel', 'education', 'car', 'business'];
      steps.push({
        id: `goal-${i}`, category: 'Goals', icon: ['🏠','✈️','🎓','🚗','💼'][i % 5],
        color: ['#00d4ff','#f59e0b','#a855f7','#22d3a6','#ff6b9d'][i % 5],
        imgKey: imgKeys[i % imgKeys.length],
        title: g.name || `Goal ${i + 1}`,
        subtitle: INR(g.target),
        status: goalStatus,
        progress: gpct,
        stat: `${INR(g.saved || 0)} saved · ${gpct}% done`,
        action: gpct >= 100
          ? 'Goal achieved! Set the next one'
          : `Need ${INR((n(g.target) - n(g.saved)) / Math.max(1, 12))} /mo — automate a dedicated SIP`,
        why: `On track? At current pace: goal reached in ${Math.ceil((n(g.target) - n(g.saved)) / Math.max(1, n(g.target) * 0.08))} months.`,
        priority: 8 + i
      });
    });

    // 8. FIRE / Retirement
    steps.push({
      id: 'fire', category: 'Freedom', icon: '🔥',
      color: '#ff4444', imgKey: 'retirement',
      title: 'Financial Independence',
      subtitle: 'The ultimate goal',
      status: d.fireNum > 0 && d.nw >= d.fireNum ? 'done' : d.fireNum > 0 ? 'progress' : 'todo',
      progress: d.fireNum > 0 ? pct((d.nw / d.fireNum) * 100) : 0,
      stat: d.fireNum > 0 ? `${INR(d.nw)} / ${INR(d.fireNum)} FIRE number` : 'Calculate your FIRE number',
      action: d.fireYrs > 0
        ? `${d.fireYrs} years to FIRE — increase savings rate to 35% to shave 3 years off`
        : 'Visit FIRE calculator → set your monthly expense target → reverse-engineer SIP',
      why: 'FIRE = 25x annual expenses invested at 4% safe withdrawal rate.',
      priority: 11
    });

    // Sort by priority
    return steps.sort((a, b) => a.priority - b.priority);
  }

  /* ── CSS injection — makes engine self-contained on any page ── */
  function injectStyles() {
    if (document.getElementById('arya-rm-styles')) return;
    const s = document.createElement('style');
    s.id = 'arya-rm-styles';
    s.textContent = `
@keyframes rmFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes rmSpin{to{transform:rotate(360deg)}}
.rm-hero{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 22px;margin-bottom:20px;background:linear-gradient(135deg,rgba(0,212,255,.07),rgba(123,47,247,.06));border:1px solid rgba(0,212,255,.15);border-radius:18px;flex-wrap:wrap}
.rm-hero-text h2{font-size:clamp(15px,2vw,20px);font-weight:900;color:#fff;margin:0 0 5px}
.rm-hero-text p{font-size:12px;color:rgba(255,255,255,.4);margin:0}
.rm-hero-score{flex-shrink:0;text-align:center}
.rm-hero-score-label{font-size:10px;color:rgba(255,255,255,.4);font-weight:700;text-align:center;margin-top:4px}
.rm-steps{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr));gap:14px}
.rm-step{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;overflow:hidden;cursor:pointer;transition:transform .2s,box-shadow .2s,border-color .2s}
.rm-step:hover{transform:translateY(-3px);box-shadow:0 10px 36px rgba(0,0,0,.4)}
.rm-step.rm-done{border-color:rgba(0,255,180,.2)}.rm-step.rm-progress{border-color:rgba(255,150,0,.18)}.rm-step.rm-todo{border-color:rgba(255,255,255,.06)}.rm-step.rm-expanded{box-shadow:0 0 0 2px rgba(0,212,255,.3)}
.rm-step-img-wrap{position:relative;height:140px;overflow:hidden}
.rm-step-img{width:100%;height:100%;object-fit:cover;transition:transform .4s ease;display:block}
.rm-step:hover .rm-step-img{transform:scale(1.05)}
.rm-step-img-overlay{position:absolute;inset:0;background:linear-gradient(to bottom,transparent 30%,#0a0d15 100%)}
.rm-step-num{position:absolute;top:10px;left:10px;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#000}
.rm-step-badge{position:absolute;top:10px;right:10px;font-size:9px;font-weight:800;padding:3px 8px;border-radius:20px;backdrop-filter:blur(8px)}
.rm-step-badge.rm-done{background:rgba(0,255,180,.15);color:#00ffb3;border:1px solid rgba(0,255,180,.3)}
.rm-step-badge.rm-progress{background:rgba(255,150,0,.15);color:#ffb300;border:1px solid rgba(255,150,0,.3)}
.rm-step-badge.rm-todo{background:rgba(255,255,255,.08);color:rgba(255,255,255,.5);border:1px solid rgba(255,255,255,.12)}
.rm-step-body{padding:12px 14px 8px}
.rm-step-cat{font-size:9px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;margin-bottom:4px}
.rm-step-title{font-size:14px;font-weight:900;color:#fff;margin-bottom:2px}
.rm-step-subtitle{font-size:11px;color:rgba(255,255,255,.4);margin-bottom:8px}
.rm-step-progress-wrap{display:flex;align-items:center;gap:7px;margin-bottom:5px}
.rm-step-progress-bar{flex:1;height:4px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden}
.rm-step-progress-fill{height:100%;border-radius:3px;transition:width 1s ease}
.rm-step-pct{font-size:10px;font-weight:800;min-width:28px;text-align:right}
.rm-step-stat{font-size:11px;color:rgba(255,255,255,.45)}
.rm-step-detail{display:none;padding:0 14px 14px;animation:rmFadeIn .25s ease}
.rm-step.rm-expanded .rm-step-detail{display:block}
.rm-step-action{background:rgba(255,255,255,.03);border-left:3px solid #00d4ff;border-radius:0 9px 9px 0;padding:9px 11px;margin-bottom:9px}
.rm-action-label{font-size:9px;font-weight:800;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.8px;margin-bottom:3px}
.rm-action-text{font-size:12px;color:rgba(255,255,255,.8);line-height:1.6}
.rm-step-why{font-size:11px;color:rgba(255,255,255,.35);line-height:1.5;margin-bottom:10px;font-style:italic}
.rm-arya-btn{width:100%;padding:8px;border-radius:9px;border:1px solid rgba(0,212,255,.3);background:rgba(0,212,255,.06);color:#00d4ff;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s}
.rm-arya-btn:hover{background:rgba(0,212,255,.12)}
.mm-legend{display:flex;flex-wrap:wrap;gap:8px;padding:12px 16px;border-top:1px solid rgba(255,255,255,.05);background:rgba(255,255,255,.02)}
.mm-leg-item{display:flex;align-items:center;gap:5px;font-size:10px;color:rgba(255,255,255,.5)}
.mm-leg-dot{width:7px;height:7px;border-radius:50%}
.mm-reset-btn{position:absolute;bottom:60px;right:12px;padding:6px 12px;background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.2);border-radius:9px;color:#00d4ff;font-size:10px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s}
.mm-reset-btn:hover{background:rgba(0,212,255,.18)}
.tl-header{margin-bottom:20px}
.tl-header h2{font-size:clamp(16px,2vw,22px);font-weight:900;color:#fff;margin:0 0 5px}
.tl-header p{font-size:12px;color:rgba(255,255,255,.4);margin:0 0 12px}
.tl-age-bar-wrap{display:flex;align-items:center;gap:10px}
.tl-age-bar{flex:1;height:5px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden}
.tl-age-fill{height:100%;border-radius:3px;transition:width 1s ease}
.tl-age-label{font-size:11px;font-weight:800;color:rgba(255,255,255,.5);min-width:44px}
.tl-scroll{position:relative;overflow-x:auto;overflow-y:visible;padding:20px 0 36px;scrollbar-width:thin;scrollbar-color:rgba(0,212,255,.3) transparent;cursor:grab}
.tl-scroll:active{cursor:grabbing}
.tl-scroll::-webkit-scrollbar{height:3px}
.tl-scroll::-webkit-scrollbar-thumb{background:rgba(0,212,255,.2);border-radius:3px}
.tl-track{position:absolute;top:62px;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,rgba(0,212,255,.3) 5%,rgba(123,47,247,.3) 95%,transparent)}
.tl-milestones{display:flex;align-items:flex-start;padding:0 36px;width:max-content}
.tl-milestone{display:flex;flex-direction:column;align-items:center;width:230px;flex-shrink:0;cursor:pointer;padding:0 10px;position:relative}
.tl-milestone-dot{width:12px;height:12px;border-radius:50%;border:2px solid #0a0d15;margin-bottom:12px;flex-shrink:0;transition:transform .2s;position:relative;z-index:2}
.tl-milestone:hover .tl-milestone-dot{transform:scale(1.4)}
.tl-is-now .tl-milestone-dot{width:16px;height:16px;animation:rmSpin 4s linear infinite;border:3px dashed}
.tl-milestone-card{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden;transition:all .2s}
.tl-milestone:hover .tl-milestone-card{transform:translateY(-3px);box-shadow:0 14px 40px rgba(0,0,0,.5)}
.tl-is-now .tl-milestone-card{border-color:rgba(0,212,255,.3);box-shadow:0 0 20px rgba(0,212,255,.12)}
.tl-done .tl-milestone-card{border-color:rgba(0,255,180,.15)}
.tl-card-img-wrap{position:relative;height:120px;overflow:hidden}
.tl-card-img-wrap img{width:100%;height:100%;object-fit:cover;transition:transform .4s;display:block}
.tl-milestone:hover .tl-card-img-wrap img{transform:scale(1.06)}
.tl-card-img-overlay{position:absolute;inset:0}
.tl-card-age{position:absolute;bottom:8px;left:8px;font-size:10px;font-weight:900;padding:2px 8px;border-radius:20px;color:#000}
.tl-now-badge{position:absolute;top:8px;right:8px;font-size:9px;font-weight:800;padding:2px 8px;border-radius:20px;background:rgba(0,212,255,.2);border:1px solid rgba(0,212,255,.4);color:#00d4ff;backdrop-filter:blur(8px)}
.tl-card-body{padding:11px}
.tl-card-icon{font-size:18px;margin-bottom:3px}
.tl-card-title{font-size:11.5px;font-weight:900;margin-bottom:2px}
.tl-card-wealth{font-size:15px;font-weight:900;color:#fff;margin-bottom:4px}
.tl-card-detail{font-size:10.5px;color:rgba(255,255,255,.4);line-height:1.5;margin-bottom:5px}
.tl-card-expand-hint{font-size:9.5px;color:rgba(255,255,255,.22);margin-bottom:5px}
.tl-card-action{display:none;font-size:10.5px;color:rgba(255,255,255,.7);line-height:1.6;border-left:2px solid #00d4ff;padding:6px 9px;background:rgba(0,212,255,.04);border-radius:0 7px 7px 0;margin-bottom:7px;animation:rmFadeIn .25s ease}
.tl-arya-btn{display:none;width:100%;padding:6px;border-radius:7px;border:1px solid rgba(0,212,255,.3);background:rgba(0,212,255,.06);color:#00d4ff;font-size:10px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s;animation:rmFadeIn .3s ease}
.tl-arya-btn:hover{background:rgba(0,212,255,.12)}
.tl-expanded .tl-card-action,.tl-expanded .tl-arya-btn{display:block}
.tl-expanded .tl-card-expand-hint{display:none}
.tl-legend{display:flex;gap:16px;padding:8px 0 0}
.tl-leg{font-size:10px;color:rgba(255,255,255,.35);font-weight:600}
.tl-leg.now{color:#00d4ff}.tl-leg.done{color:#00ffb3}
[data-theme="light"] .rm-step,[data-theme="light"] .tl-milestone-card{background:rgba(0,0,0,.03);border-color:rgba(0,0,0,.08)}
[data-theme="light"] .rm-step-title,[data-theme="light"] .tl-card-title,[data-theme="light"] .tl-card-wealth,[data-theme="light"] .rm-hero-text h2{color:#0a0d15}
[data-theme="light"] .rm-hero{background:linear-gradient(135deg,rgba(0,100,200,.06),rgba(100,0,200,.04));border-color:rgba(0,100,200,.12)}
.rm-done-btn{display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:6px 12px;border-radius:8px;border:1px solid rgba(0,255,179,.3);background:rgba(0,255,179,.06);color:#00ffb3;font-size:11.5px;font-weight:700;cursor:pointer;transition:background .18s,border-color .18s}
.rm-done-btn:hover{background:rgba(0,255,179,.14);border-color:rgba(0,255,179,.5)}
.rm-done-btn.rm-done-active{background:rgba(0,255,179,.15);border-color:#00ffb3;color:#00ffb3}
.tl-card-projection{margin-top:6px;font-size:11px;padding:6px 9px;border-radius:7px;background:rgba(0,255,179,.06);border:1px solid rgba(0,255,179,.15);color:rgba(255,255,255,.65);line-height:1.55}
.tl-card-projection strong{color:#00ffb3}
[data-theme="light"] .rm-done-btn{border-color:rgba(0,150,100,.3);background:rgba(0,150,100,.05);color:#009964}
[data-theme="light"] .tl-card-projection{background:rgba(0,100,50,.04);border-color:rgba(0,100,50,.15);color:rgba(0,0,0,.55)}
    `;
    document.head.appendChild(s);
  }

  /* Render roadmap HTML */
  function renderRoadmap(container, d) {
    const steps = generateSteps(d);
    const colors = DNA_COLORS[d.dna] || DNA_COLORS.Explorer;
    const doneCount = steps.filter(s => s.status === 'done').length;
    const totalPct  = Math.round((doneCount / steps.length) * 100);

    container.innerHTML = `
      <div class="rm-hero">
        <div class="rm-hero-text">
          <h2>${d.name}'s Financial Roadmap</h2>
          <p>${d.dna} · ${d.stage || 'Building Wealth'} · Health ${Math.round(d.health)}/100</p>
        </div>
        <div class="rm-hero-progress">
          <svg width="70" height="70" viewBox="0 0 70 70">
            <circle cx="35" cy="35" r="28" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="6"/>
            <circle cx="35" cy="35" r="28" fill="none" stroke="url(#rmGrad)" stroke-width="6"
              stroke-dasharray="${(totalPct / 100 * 2 * Math.PI * 28).toFixed(1)} 200"
              stroke-linecap="round" transform="rotate(-90 35 35)"/>
            <defs><linearGradient id="rmGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="${colors[0]}"/>
              <stop offset="100%" stop-color="${colors[1]}"/>
            </linearGradient></defs>
            <text x="35" y="40" text-anchor="middle" fill="#fff" font-size="14" font-weight="900">${totalPct}%</text>
          </svg>
          <div class="rm-hero-score-label">${doneCount}/${steps.length} done</div>
        </div>
      </div>

      <div class="rm-steps" id="rm-steps-list">
        ${steps.map((s, i) => renderStep(s, i, colors)).join('')}
      </div>
    `;

    // Wire expand/collapse
    container.querySelectorAll('.rm-step').forEach(el => {
      el.addEventListener('click', () => el.classList.toggle('rm-expanded'));
    });

    // Wire Arya buttons
    container.querySelectorAll('.rm-arya-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const q = btn.dataset.q;
        if (global.AryaSidebar) {
          global.AryaSidebar.ask(q);
        }
      });
    });

    // Wire Mark-as-Done buttons — persist in localStorage + re-render
    container.querySelectorAll('.rm-done-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const stepId  = btn.dataset.stepId;
        const key     = 'finos_rm_done_' + stepId;
        const isDone  = localStorage.getItem(key) === '1';
        if (isDone) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, '1');
        }
        // Re-render roadmap to reflect the change
        container.innerHTML = '';
        renderRoadmap(container, d);
      });
    });
  }

  function renderStep(s, i, colors) {
    // Allow user manual override: if they've ticked this step done, treat as done
    const manualKey  = 'finos_rm_done_' + s.id;
    const manualDone = localStorage.getItem(manualKey) === '1';
    const effStatus  = manualDone ? 'done' : s.status;
    const statusIcon  = { done: '✅', progress: '🔄', todo: '⭕' }[effStatus] || '⭕';
    const statusLabel = { done: 'Complete', progress: 'In Progress', todo: 'To Do' }[effStatus] || 'To Do';
    const statusCls   = { done: 'rm-done', progress: 'rm-progress', todo: 'rm-todo' }[effStatus] || '';

    return `
    <div class="rm-step ${statusCls}" data-id="${s.id}">
      <div class="rm-step-img-wrap">
        <img class="rm-step-img" src="${unsplash(s.imgKey, 320, 200)}"
          alt="${s.title}" loading="lazy" onerror="this.style.display='none'"/>
        <div class="rm-step-img-overlay" style="background:linear-gradient(135deg,${s.color}22,${s.color}11)"></div>
        <div class="rm-step-num" style="background:${s.color}">${i + 1}</div>
        <div class="rm-step-badge ${statusCls}">${statusIcon} ${statusLabel}</div>
      </div>
      <div class="rm-step-body">
        <div class="rm-step-cat" style="color:${s.color}">${s.icon} ${s.category}</div>
        <div class="rm-step-title">${s.title}</div>
        <div class="rm-step-subtitle">${s.subtitle}</div>
        <div class="rm-step-progress-wrap">
          <div class="rm-step-progress-bar">
            <div class="rm-step-progress-fill" style="width:${s.progress}%;background:${s.color}"></div>
          </div>
          <span class="rm-step-pct" style="color:${s.color}">${s.progress}%</span>
        </div>
        <div class="rm-step-stat">${s.stat}</div>
      </div>
      <div class="rm-step-detail">
        <div class="rm-step-action" style="border-left-color:${s.color}">
          <div class="rm-action-label">Action Now</div>
          <div class="rm-action-text">${s.action}</div>
        </div>
        <div class="rm-step-why">${s.why}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
          <button class="rm-arya-btn" data-q="Explain my ${s.title} situation in detail with my actual numbers and give me a step-by-step action plan" style="border-color:${s.color};color:${s.color}">
            🤖 Ask Arya about ${s.title}
          </button>
          <button class="rm-done-btn ${manualDone ? 'rm-done-active' : ''}" data-step-id="${s.id}" data-manual="${manualDone ? '1' : '0'}">
            ${manualDone ? '✅ Marked Done' : '☑️ Mark as Done'}
          </button>
        </div>
      </div>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════
     2. MINDMAP — interactive SVG radial graph
  ══════════════════════════════════════════════════════════════════ */
  function renderMindmap(container, d) {
    const W = Math.min(container.clientWidth, 900);
    const H = Math.max(600, Math.min(720, window.innerHeight - 200));
    const cx = W / 2, cy = H / 2;

    const colors = DNA_COLORS[d.dna] || DNA_COLORS.Explorer;

    // Main branches (8 nodes, 45° apart)
    const branches = buildBranches(d);

    // State
    let activeNode  = null;
    let panX = 0, panY = 0, scale = 1;
    let dragging = false, lastX = 0, lastY = 0;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', H);
    svg.style.cssText = 'display:block;cursor:grab;user-select:none;touch-action:none;';

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <filter id="mmGlow"><feGaussianBlur stdDeviation="3" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/></filter>
      <linearGradient id="mmCenterGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${colors[0]}"/>
        <stop offset="100%" stop-color="${colors[1]}"/>
      </linearGradient>`;
    svg.appendChild(defs);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.id = 'mm-root';
    svg.appendChild(g);

    // Draw connections + nodes
    const R1 = Math.min(cx * 0.48, 200); // branch radius
    const R2 = Math.min(cx * 0.72, 310); // sub-node radius

    branches.forEach((branch, bi) => {
      const angle = (bi / branches.length) * 2 * Math.PI - Math.PI / 2;
      const bx = cx + R1 * Math.cos(angle);
      const by = cy + R1 * Math.sin(angle);

      // Center → branch line
      drawEdge(g, cx, cy, bx, by, branch.color, 0.35, 2);

      // Branch node
      drawNode(g, bx, by, branch.icon, branch.label, branch.color, branch.value, 'branch', bi, () => {
        toggleBranch(bi);
      });

      // Sub-nodes (shown/hidden)
      branch.children.forEach((child, ci) => {
        const spread  = branch.children.length;
        const subBase = angle - (spread - 1) * 0.22 + ci * 0.44;
        const sx = cx + R2 * Math.cos(subBase);
        const sy = cy + R2 * Math.sin(subBase);

        const subG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        subG.id    = `mm-sub-${bi}-${ci}`;
        subG.style.cssText = 'opacity:0;pointer-events:none;transition:opacity .3s ease;';

        drawEdge(subG, bx, by, sx, sy, branch.color, 0.25, 1.5);
        drawSubNode(subG, sx, sy, child.label, child.value, branch.color);
        g.appendChild(subG);
      });
    });

    // Center node (drawn last = on top)
    drawCenterNode(g, cx, cy, d, colors);

    // Tooltip div
    const tooltip = document.createElement('div');
    tooltip.id = 'mm-tooltip';
    tooltip.style.cssText = 'position:absolute;background:#0d1017;border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:10px 14px;font-size:12px;color:#fff;pointer-events:none;opacity:0;transition:opacity .2s;max-width:200px;z-index:10;line-height:1.5;';
    container.style.position = 'relative';
    container.appendChild(tooltip);

    container.appendChild(svg);

    // Legend
    const legend = document.createElement('div');
    legend.className = 'mm-legend';
    legend.innerHTML = branches.map(b => `<span class="mm-leg-item"><span style="background:${b.color}" class="mm-leg-dot"></span>${b.label}</span>`).join('');
    container.appendChild(legend);

    function toggleBranch(bi) {
      const isActive = activeNode === bi;
      // Hide all subs first
      branches.forEach((_, i) => {
        branches[i].children.forEach((_, ci) => {
          const el = document.getElementById(`mm-sub-${i}-${ci}`);
          if (el) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; }
        });
      });
      if (!isActive) {
        activeNode = bi;
        branches[bi].children.forEach((_, ci) => {
          const el = document.getElementById(`mm-sub-${bi}-${ci}`);
          if (el) { el.style.opacity = '1'; el.style.pointerEvents = 'all'; }
        });
      } else {
        activeNode = null;
      }
    }

    // Pan & zoom
    svg.addEventListener('mousedown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; svg.style.cursor = 'grabbing'; });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      panX += e.clientX - lastX; panY += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      g.setAttribute('transform', `translate(${panX},${panY}) scale(${scale})`);
    });
    window.addEventListener('mouseup', () => { dragging = false; svg.style.cursor = 'grab'; });
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      scale = Math.max(0.5, Math.min(2, scale - e.deltaY * 0.001));
      g.setAttribute('transform', `translate(${panX},${panY}) scale(${scale})`);
    }, { passive: false });

    // Touch pan
    let lastTouchX = 0, lastTouchY = 0;
    svg.addEventListener('touchstart', e => { if (e.touches.length === 1) { lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY; } });
    svg.addEventListener('touchmove', e => {
      if (e.touches.length === 1) {
        panX += e.touches[0].clientX - lastTouchX; panY += e.touches[0].clientY - lastTouchY;
        lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY;
        g.setAttribute('transform', `translate(${panX},${panY}) scale(${scale})`);
        e.preventDefault();
      }
    }, { passive: false });

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'mm-reset-btn';
    resetBtn.innerHTML = '⟳ Reset View';
    resetBtn.onclick = () => { panX = 0; panY = 0; scale = 1; g.setAttribute('transform', `translate(0,0) scale(1)`); };
    container.appendChild(resetBtn);
  }

  function drawEdge(parent, x1, y1, x2, y2, color, opacity, width) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    path.setAttribute('d', `M${x1},${y1} Q${mx},${y1} ${x2},${y2}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', String(width));
    path.setAttribute('stroke-opacity', String(opacity));
    path.setAttribute('stroke-linecap', 'round');
    parent.appendChild(path);
  }

  function drawNode(parent, x, y, icon, label, color, value, type, idx, onClick) {
    const r = type === 'branch' ? 32 : 24;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.style.cursor = 'pointer';
    g.setAttribute('class', `mm-node-${type}`);

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bg.setAttribute('cx', x); bg.setAttribute('cy', y); bg.setAttribute('r', r + 3);
    bg.setAttribute('fill', color); bg.setAttribute('opacity', '.08');
    g.appendChild(bg);

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x); circle.setAttribute('cy', y); circle.setAttribute('r', r);
    circle.setAttribute('fill', '#0d1017');
    circle.setAttribute('stroke', color); circle.setAttribute('stroke-width', '2');
    g.appendChild(circle);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x); text.setAttribute('y', y + (type === 'branch' ? 5 : 4));
    text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', type === 'branch' ? '18' : '14');
    text.textContent = icon;
    g.appendChild(text);

    const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    lbl.setAttribute('x', x); lbl.setAttribute('y', y + r + 14);
    lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('fill', color);
    lbl.setAttribute('font-size', '11'); lbl.setAttribute('font-weight', '700');
    lbl.setAttribute('font-family', '-apple-system,sans-serif');
    lbl.textContent = label;
    g.appendChild(lbl);

    if (value) {
      const val = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      val.setAttribute('x', x); val.setAttribute('y', y + r + 27);
      val.setAttribute('text-anchor', 'middle'); val.setAttribute('fill', 'rgba(255,255,255,.45)');
      val.setAttribute('font-size', '10'); val.setAttribute('font-family', '-apple-system,sans-serif');
      val.textContent = value;
      g.appendChild(val);
    }

    g.addEventListener('click', e => { e.stopPropagation(); if (onClick) onClick(); });

    // Hover glow
    g.addEventListener('mouseenter', () => { bg.setAttribute('opacity', '.18'); circle.setAttribute('stroke-width', '3'); });
    g.addEventListener('mouseleave', () => { bg.setAttribute('opacity', '.08'); circle.setAttribute('stroke-width', '2'); });

    parent.appendChild(g);
  }

  function drawSubNode(parent, x, y, label, value, color) {
    const r = 20;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.style.cursor = 'default';

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x - 55); rect.setAttribute('y', y - 14);
    rect.setAttribute('width', '110'); rect.setAttribute('height', '32');
    rect.setAttribute('rx', '8'); rect.setAttribute('fill', '#0d1017');
    rect.setAttribute('stroke', color); rect.setAttribute('stroke-opacity', '.35');
    rect.setAttribute('stroke-width', '1');
    g.appendChild(rect);

    const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    lbl.setAttribute('x', x); lbl.setAttribute('y', y - 2);
    lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('fill', 'rgba(255,255,255,.7)');
    lbl.setAttribute('font-size', '10'); lbl.setAttribute('font-weight', '600');
    lbl.setAttribute('font-family', '-apple-system,sans-serif');
    lbl.textContent = label;
    g.appendChild(lbl);

    if (value) {
      const val = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      val.setAttribute('x', x); val.setAttribute('y', y + 11);
      val.setAttribute('text-anchor', 'middle'); val.setAttribute('fill', color);
      val.setAttribute('font-size', '10'); val.setAttribute('font-weight', '800');
      val.setAttribute('font-family', '-apple-system,sans-serif');
      val.textContent = value;
      g.appendChild(val);
    }

    parent.appendChild(g);
  }

  function drawCenterNode(parent, cx, cy, d, colors) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    const glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    glow.setAttribute('cx', cx); glow.setAttribute('cy', cy); glow.setAttribute('r', '52');
    glow.setAttribute('fill', colors[0]); glow.setAttribute('opacity', '.12');
    glow.setAttribute('filter', 'url(#mmGlow)');
    g.appendChild(glow);

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', cx); circle.setAttribute('cy', cy); circle.setAttribute('r', '46');
    circle.setAttribute('fill', 'url(#mmCenterGrad)');
    g.appendChild(circle);

    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('cx', cx); ring.setAttribute('cy', cy); ring.setAttribute('r', '50');
    ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', '#fff'); ring.setAttribute('stroke-opacity', '.12');
    ring.setAttribute('stroke-width', '1.5');
    g.appendChild(ring);

    // initials
    const init = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    init.setAttribute('x', cx); init.setAttribute('y', cy - 6);
    init.setAttribute('text-anchor', 'middle'); init.setAttribute('fill', '#fff');
    init.setAttribute('font-size', '22'); init.setAttribute('font-weight', '900');
    init.setAttribute('font-family', '-apple-system,sans-serif');
    init.textContent = (d.name[0] || 'I').toUpperCase();
    g.appendChild(init);

    const nameLbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    nameLbl.setAttribute('x', cx); nameLbl.setAttribute('y', cy + 13);
    nameLbl.setAttribute('text-anchor', 'middle'); nameLbl.setAttribute('fill', 'rgba(255,255,255,.85)');
    nameLbl.setAttribute('font-size', '9'); nameLbl.setAttribute('font-weight', '700');
    nameLbl.setAttribute('font-family', '-apple-system,sans-serif');
    nameLbl.textContent = d.name.split(' ')[0].toUpperCase();
    g.appendChild(nameLbl);

    const healthLbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    healthLbl.setAttribute('x', cx); healthLbl.setAttribute('y', cy + 68);
    healthLbl.setAttribute('text-anchor', 'middle'); healthLbl.setAttribute('fill', '#fff');
    healthLbl.setAttribute('font-size', '11'); healthLbl.setAttribute('font-weight', '800');
    healthLbl.setAttribute('font-family', '-apple-system,sans-serif');
    healthLbl.textContent = `${Math.round(d.health)}/100`;
    g.appendChild(healthLbl);

    parent.appendChild(g);
  }

  function buildBranches(d) {
    const goals = d.goals.slice(0, 3);
    return [
      {
        icon: '💰', label: 'Income', color: '#00ffb3',
        value: d.income > 0 ? INR(d.income) + '/mo' : 'Set income',
        children: [
          { label: 'Monthly', value: INR(d.income) },
          { label: 'Annual', value: INR(d.income * 12) },
          { label: 'Savings', value: d.savings + '% rate' },
          { label: 'Spends', value: INR(d.expenses) + '/mo' },
        ]
      },
      {
        icon: '📈', label: 'Investing', color: '#7b2ff7',
        value: d.sipAmt > 0 ? INR(d.sipAmt) + '/mo SIP' : 'Start SIP',
        children: [
          { label: 'Monthly SIP', value: INR(d.sipAmt) },
          { label: 'Portfolio', value: d.port ? INR(d.port.total_value) : '—' },
          { label: 'P&L', value: d.port ? (d.port.pnl_pct >= 0 ? '+' : '') + d.port.pnl_pct + '%' : '—' },
          { label: 'XIRR', value: d.port?.xirr ? d.port.xirr + '%' : '—' },
        ]
      },
      {
        icon: '🎯', label: 'Goals', color: '#00d4ff',
        value: goals.length > 0 ? goals.length + ' active' : 'No goals',
        children: goals.length > 0
          ? goals.map(g => ({ label: g.name, value: pct(g.progress) + '%' }))
          : [{ label: 'Set goals', value: 'in Goals page' }]
      },
      {
        icon: '⛓️', label: 'Debt', color: '#ff9500',
        value: d.debt > 0 ? INR(d.debt) : 'Debt-free ✓',
        children: [
          { label: 'Total Debt', value: INR(d.debt) },
          { label: 'DTI Ratio', value: d.income > 0 ? Math.round(d.debt / (d.income * 12) * 100) + '%' : '—' },
          { label: 'Target', value: 'DTI < 30%' },
          { label: 'Status', value: d.debt === 0 ? 'Debt-free!' : 'Reduce now' },
        ]
      },
      {
        icon: '🛟', label: 'Safety', color: '#ff6b9d',
        value: d.ef > 0 ? INR(d.ef) + ' EF' : 'Build EF',
        children: [
          { label: 'Emergency Fund', value: INR(d.ef) },
          { label: 'Coverage', value: d.income > 0 ? (d.ef / d.expenses).toFixed(1) + ' months' : '—' },
          { label: 'Target', value: INR(d.expenses * 6) },
          { label: 'Status', value: d.ef >= d.expenses * 6 ? 'Fully funded' : 'Underfunded' },
        ]
      },
      {
        icon: '🛡️', label: 'Insurance', color: '#4f7cff',
        value: 'Review cover',
        children: [
          { label: 'Term Life', value: d.income > 0 ? 'Need ' + INR(d.income * 12 * 15) : 'Get cover' },
          { label: 'Health', value: '₹10L+ floater' },
          { label: '80D Benefit', value: '₹25K deduction' },
          { label: 'Nominee', value: 'Update now' },
        ]
      },
      {
        icon: '📋', label: 'Tax', color: '#c7f000',
        value: d.taxSave > 0 ? INR(d.taxSave) + ' to save' : 'Optimized',
        children: [
          { label: '80C Used', value: INR(n(get('finos_80c_invested', 0))) },
          { label: '80C Limit', value: '₹1.5L' },
          { label: 'Tax Savings', value: INR(d.taxSave) + ' left' },
          { label: 'NPS Extra', value: '₹50K (80CCD1B)' },
        ]
      },
      {
        icon: '🔥', label: 'FIRE', color: '#ff4444',
        value: d.fireNum > 0 ? INR(d.fireNum) + ' target' : 'Calculate',
        children: [
          { label: 'Net Worth', value: INR(d.nw) },
          { label: 'FIRE Number', value: d.fireNum > 0 ? INR(d.fireNum) : 'Set target' },
          { label: 'Progress', value: d.fireNum > 0 ? pct((d.nw / d.fireNum) * 100) + '%' : '0%' },
          { label: 'Timeline', value: d.fireYrs > 0 ? d.fireYrs + ' years' : 'Calculate' },
        ]
      },
    ];
  }

  /* ══════════════════════════════════════════════════════════════════
     CORPUS PROJECTION HELPER
  ══════════════════════════════════════════════════════════════════ */
  function projectCorpus(targetAge, d) {
    const yrs  = Math.max(0, targetAge - d.age);
    const r    = 0.12; // 12% CAGR assumption
    const sip  = d.income * (d.savings / 100) / 12;
    const corpus = d.nw * Math.pow(1+r, yrs) + sip * 12 * (Math.pow(1+r, yrs) - 1) / r;
    return Math.round(corpus);
  }

  /* ══════════════════════════════════════════════════════════════════
     3. LIFE TIMELINE — visual life journey with milestone photos
  ══════════════════════════════════════════════════════════════════ */
  function renderTimeline(container, d) {
    const currentAge = d.age;
    const retireAge  = 60;
    const colors     = DNA_COLORS[d.dna] || DNA_COLORS.Explorer;

    const milestones = buildMilestones(d, currentAge, retireAge, colors);

    container.innerHTML = `
      <div class="tl-header">
        <h2>${d.name}'s Life Journey</h2>
        <p>Age ${currentAge} → ${retireAge} · ${d.dna} DNA · Personalized milestones</p>
        <div class="tl-age-bar-wrap">
          <div class="tl-age-bar">
            <div class="tl-age-fill" style="width:${pct(((currentAge - 20) / (retireAge - 20)) * 100)}%;background:linear-gradient(90deg,${colors[0]},${colors[1]})"></div>
          </div>
          <span class="tl-age-label">Age ${currentAge}</span>
        </div>
      </div>

      <div class="tl-scroll">
        <div class="tl-track"></div>
        <div class="tl-milestones">
          ${milestones.map((m, i) => renderMilestone(m, i, m.isNow, colors, d)).join('')}
        </div>
      </div>

      <div class="tl-legend">
        <span class="tl-leg now">● You are here</span>
        <span class="tl-leg done">● Achieved</span>
        <span class="tl-leg future">● Upcoming</span>
      </div>
    `;

    // Wire expand
    container.querySelectorAll('.tl-milestone').forEach(el => {
      el.addEventListener('click', () => el.classList.toggle('tl-expanded'));
    });

    // Wire Arya
    container.querySelectorAll('.tl-arya-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (global.AryaSidebar) global.AryaSidebar.ask(btn.dataset.q);
      });
    });
  }

  function buildMilestones(d, currentAge, retireAge, colors) {
    const income = d.income;
    const nw = d.nw;
    const ms = [];

    // Past / now
    if (currentAge >= 25) ms.push({ age: 25, title: 'Financial Foundation', icon: '🌱', color: '#00ffb3', imgKey: 'invest', isNow: currentAge === 25, isDone: currentAge > 25, wealth: INR(income * 12 * 2), detail: 'Emergency fund · Term insurance · First SIP', action: 'Build your base — 3 months EF, term cover, ₹2K SIP minimum' });
    if (currentAge >= 30) ms.push({ age: 30, title: 'Wealth Acceleration', icon: '🚀', color: '#4f7cff', imgKey: 'business', isNow: currentAge === 30, isDone: currentAge > 30, wealth: INR(Math.max(nw, income * 12 * 4)), detail: 'SIP ₹20K+/mo · Home planning · 80C maximized', action: 'Increase SIP to ₹20K/mo · Lock term cover for 30 years' });

    // Now marker
    ms.push({ age: currentAge, title: 'You Are Here', icon: '📍', color: colors[0], imgKey: 'wealth', isNow: true, isDone: false, wealth: INR(nw), detail: `Health: ${Math.round(d.health)}/100 · NW: ${INR(nw)} · Savings: ${Math.round(d.savings)}%`, action: 'Focus on your top roadmap priority — click Roadmap tab' });

    // Goals as milestones
    d.goals.slice(0, 2).forEach(g => {
      const targetYr = new Date().getFullYear() + Math.ceil((n(g.target) - n(g.saved)) / (income * (d.savings / 100) * 12));
      const targetAge = currentAge + (targetYr - new Date().getFullYear());
      if (targetAge > currentAge && targetAge < retireAge) {
        ms.push({ age: targetAge, title: g.name, icon: '🎯', color: '#f59e0b', imgKey: 'travel', isNow: false, isDone: false, wealth: INR(g.target), detail: `${pct(g.progress)}% saved · Target: ${INR(g.target)}`, action: `Increase SIP by ${INR(Math.ceil((n(g.target) - n(g.saved)) / Math.max(1,(targetAge - currentAge) * 12)))} /mo to hit on time` });
      }
    });

    // Future milestones
    if (currentAge < 35) ms.push({ age: 35, title: 'Mid-Career Peak', icon: '💼', color: '#a855f7', imgKey: 'business', isNow: false, isDone: false, wealth: INR(income * 12 * 8), detail: 'NW target: 8x annual income · Full insurance cover · Portfolio diversified', action: 'Add NPS · Review portfolio allocation · Consider real estate' });
    if (currentAge < 40) ms.push({ age: 40, title: 'Wealth Milestone', icon: '💎', color: '#00d4ff', imgKey: 'wealth', isNow: false, isDone: false, wealth: INR(income * 12 * 15), detail: 'NW target: 15x income · Children education fund · Home paid', action: 'Review term cover · Start children education SIP · Estate planning' });
    if (currentAge < 50) ms.push({ age: 50, title: 'Pre-FIRE Planning', icon: '🔥', color: '#ff9500', imgKey: 'retirement', isNow: false, isDone: false, wealth: INR(d.fireNum > 0 ? d.fireNum * 0.7 : income * 12 * 25), detail: 'NW target: 25x income · Debt-free · Corpus building', action: 'Shift to lower-risk: 60% equity / 40% debt. Review SWP plan.' });
    ms.push({ age: retireAge, title: 'Financial Freedom', icon: '🌅', color: '#ff4444', imgKey: 'retirement', isNow: false, isDone: false, wealth: INR(d.fireNum > 0 ? d.fireNum : income * 12 * 30), detail: `FIRE number: ${INR(d.fireNum > 0 ? d.fireNum : income * 12 * 30)} · SWP: ${INR(income * 0.9)}/mo`, action: `Congratulations! 4% SWP gives you ${INR(d.fireNum > 0 ? d.fireNum * 0.04 / 12 : income * 0.9)}/mo forever.` });

    return ms.sort((a, b) => a.age - b.age);
  }

  function renderMilestone(m, i, isNow, colors, d) {
    const statusCls = m.isDone ? 'tl-done' : isNow ? 'tl-now' : 'tl-future';
    const dotColor  = m.isDone ? '#00ffb3' : isNow ? colors[0] : 'rgba(255,255,255,.2)';
    // Corpus projection at this milestone's age (only for future milestones)
    let projectionHTML = '';
    if (d && !m.isDone && !isNow && m.age > d.age) {
      const proj = projectCorpus(m.age, d);
      if (proj > 0) {
        projectionHTML = `<div class="tl-card-projection">📈 Projected corpus at age ${m.age}: <strong>${INR(proj)}</strong></div>`;
      }
    }
    return `
    <div class="tl-milestone ${statusCls} ${isNow ? 'tl-is-now' : ''}">
      <div class="tl-milestone-dot" style="background:${dotColor};box-shadow:0 0 ${isNow ? '16px ' + colors[0] : '0px transparent'}"></div>
      <div class="tl-milestone-card">
        <div class="tl-card-img-wrap">
          <img src="${unsplash(m.imgKey, 340, 180)}" alt="${m.title}" loading="lazy" onerror="this.style.display='none'"/>
          <div class="tl-card-img-overlay" style="background:linear-gradient(to top,#0a0d15 25%,transparent)"></div>
          <div class="tl-card-age" style="background:${m.color}">Age ${m.age}</div>
          ${isNow ? `<div class="tl-now-badge">📍 NOW</div>` : ''}
        </div>
        <div class="tl-card-body">
          <div class="tl-card-icon">${m.icon}</div>
          <div class="tl-card-title" style="color:${m.color}">${m.title}</div>
          <div class="tl-card-wealth">${m.wealth}</div>
          <div class="tl-card-detail">${m.detail}</div>
          ${projectionHTML}
          <div class="tl-card-expand-hint">↓ Tap for action plan</div>
          <div class="tl-card-action" style="border-left-color:${m.color}">${m.action}</div>
          <button class="tl-arya-btn" data-q="Give me a detailed action plan for my financial life at age ${m.age} — ${m.title} milestone — with my actual numbers" style="color:${m.color};border-color:${m.color}">
            🤖 Arya's Age ${m.age} Plan
          </button>
        </div>
      </div>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════════════ */
  global.AryaRoadmap = {
    init(roadmapEl, mindmapEl, timelineEl) {
      injectStyles();
      const d = loadUserData();
      if (roadmapEl)  renderRoadmap(roadmapEl, d);
      if (mindmapEl)  renderMindmap(mindmapEl, d);
      if (timelineEl) renderTimeline(timelineEl, d);
    },
    refresh() {
      // Re-render all containers
      const re = document.getElementById('rm-roadmap');
      const me = document.getElementById('rm-mindmap');
      const te = document.getElementById('rm-timeline');
      this.init(re, me, te);
    }
  };

  // Auto-init when finos-context loads
  global.addEventListener('finos-context-ready', () => {
    setTimeout(() => global.AryaRoadmap.refresh(), 300);
  });

}(window));
