/* ═══════════════════════════════════════════════════════════
   TRADEBOOK PRO — HUB_FIX.JS
   Fixes Tools Hub, Analytics Hub & Psychology Hub not
   rendering stats/charts when tabs are clicked.

   ROOT CAUSES FIXED:
   1. hub_upgrades.js wraps switchHubTab inside DOMContentLoaded
      — by then fixes.js has already captured a stale reference,
      breaking the entire patch chain.
   2. fixes.js wraps switchHubTab at parse-time before
      hub_upgrades.js analytics/psych hooks are in place.
   3. The safe fix: replace all brittle function-wrap chains with
      a single authoritative switchHubTab defined AFTER all
      scripts load (window 'load' event), plus a central
      post-render dispatcher.
   ═══════════════════════════════════════════════════════════ */
'use strict';

(function () {

  /* ── Central post-switch renderer ─────────────────────── */
  function afterSwitch(hub, panel) {
    var T = function() {
      try { return JSON.parse(localStorage.getItem('tradebook_trades') || '[]'); } catch { return []; }
    };

    /* ── Analytics Hub ─────────────────────────────────── */
    if (hub === 'analytics-hub') {
      setTimeout(function () {
        var trades = T();
        if (panel === 'overview' || panel === 'default') {
          window.renderAnalyticsHub  && window.renderAnalyticsHub();
          window.renderRiskMetrics   && window.renderRiskMetrics();
          window.renderStrategyComparison && window.renderStrategyComparison();
          window.renderIntradayHeatmap    && window.renderIntradayHeatmap();
        }
        if (panel === 'insights') {
          window.renderInsights && window.renderInsights(trades);
        }
        if (panel === 'deep') {
          window.renderDeepDive && window.renderDeepDive(trades);
        }
        if (panel === 'patterns') {
          window.renderMaeMfeChart      && window.renderMaeMfeChart(trades);
          window.renderEntryQualityChart && window.renderEntryQualityChart(trades);
          window.renderRevengeDeeep     && window.renderRevengeDeeep(trades);
          window.renderConfluence       && window.renderConfluence(trades);
          window.renderSlippageReport   && window.renderSlippageReport(trades);
          // hub_upgrades.js exposes renderAnalyticsHub which covers all patterns
          if (!window.renderMaeMfeChart) window.renderAnalyticsHub && window.renderAnalyticsHub();
        }
        if (panel === 'timeanalysis') {
          window.renderDurationScatter   && window.renderDurationScatter(trades);
          window.renderEntryTimeWr       && window.renderEntryTimeWr(trades);
          window.renderCapitalEfficiency && window.renderCapitalEfficiency(trades);
          if (!window.renderDurationScatter) window.renderAnalyticsHub && window.renderAnalyticsHub();
        }
        if (panel === 'regimes') {
          window.renderRegimeMatrix      && window.renderRegimeMatrix(trades);
          window.renderRegimeWrRadar     && window.renderRegimeWrRadar(trades);
          window.renderStratRegimeHeatmap && window.renderStratRegimeHeatmap(trades);
          window.renderRegimeTimeline    && window.renderRegimeTimeline(trades);
          if (!window.renderRegimeMatrix) window.renderAnalyticsHub && window.renderAnalyticsHub();
        }
        if (panel === 'probability') {
          window.renderProbabilityDashboard && window.renderProbabilityDashboard(trades);
          window.renderPnlHistogram         && window.renderPnlHistogram(trades);
          window.renderConsecLoss           && window.renderConsecLoss(trades);
          window.renderForwardSim           && window.renderForwardSim(trades);
          if (!window.renderProbabilityDashboard) window.renderAnalyticsHub && window.renderAnalyticsHub();
        }
        // Always run overview charts on the overview panel
        if (panel === 'overview') {
          window.renderAnalyticsHub && window.renderAnalyticsHub();
        }
      }, 120);
    }

    /* ── Psychology Hub ────────────────────────────────── */
    if (hub === 'psych-hub') {
      // Show/hide the "Add Rule" button depending on panel
      var ruleBtn = document.getElementById('psych-hub-btn-rule');
      if (ruleBtn) ruleBtn.style.display = (panel === 'discipline') ? 'inline-flex' : 'none';

      setTimeout(function () {
        var trades = T();
        if (panel === 'psych') {
          window.renderPsychHub && window.renderPsychHub();
        }
        if (panel === 'discipline') {
          window.renderRulesList && window.renderRulesList();
          window.renderPsychHub  && window.renderPsychHub();
        }
        if (panel === 'biases') {
          window.renderBiasScanner  && window.renderBiasScanner(trades);
          window.renderLossAversion && window.renderLossAversion(trades);
          window.renderRecencyBias  && window.renderRecencyBias(trades);
          if (!window.renderBiasScanner) window.renderPsychHub && window.renderPsychHub();
        }
        if (panel === 'emotions') {
          window.renderEmotionMatrix && window.renderEmotionMatrix(trades);
          window.renderEmoWrRadar    && window.renderEmoWrRadar(trades);
          window.renderEmoVolChart   && window.renderEmoVolChart(trades);
          window.renderPTSDContainer && window.renderPTSDContainer(trades);
          if (!window.renderEmotionMatrix) window.renderPsychHub && window.renderPsychHub();
        }
        if (panel === 'report') {
          window.renderPsychReport       && window.renderPsychReport(trades);
          window.renderRuleStreak        && window.renderRuleStreak(trades);
          window.renderRuleROI           && window.renderRuleROI(trades);
          window.renderWeeklyPsychScorecard && window.renderWeeklyPsychScorecard(trades);
          if (!window.renderPsychReport) window.renderPsychHub && window.renderPsychHub();
        }
      }, 120);
    }

    /* ── Tools Hub ─────────────────────────────────────── */
    if (hub === 'tools-hub') {
      setTimeout(function () {
        if (panel === 'protools') {
          window.calcKelly          && window.calcKelly();
          window.calcPositionSizer  && window.calcPositionSizer();
          window.renderOptionsGreeks && window.renderOptionsGreeks();
          window.renderFreezeWidget  && window.renderFreezeWidget();
        }
        if (panel === 'simulator') {
          window.runSimulation && window.runSimulation();
        }
        if (panel === 'tags') {
          window.renderTagSystem && window.renderTagSystem();
        }
        if (panel === 'challenges') {
          window.renderChallenges && window.renderChallenges();
        }
        if (panel === 'heatmap') {
          window.renderHeatmap && window.renderHeatmap();
        }
        if (panel === 'propfirm') {
          window.renderPropFirmTracker && window.renderPropFirmTracker();
        }
      }, 120);
    }

    /* ── Institutional Hub ─────────────────────────────── */
    if (hub === 'institutional-hub') {
      setTimeout(function () {
        if (panel === 'attribution') {
          window.renderRollingMetrics   && window.renderRollingMetrics();
          window.renderAttributionTable && window.renderAttributionTable();
        }
        if (panel === 'perfReport') {
          window.renderPerfReport && window.renderPerfReport();
        }
        if (panel === 'risk') {
          window.renderRiskEngine && window.renderRiskEngine();
        }
      }, 80);
    }
  }

  /* ── Install a definitive switchHubTab after all scripts ─ */
  window.addEventListener('load', function () {

    // Build the final authoritative switchHubTab.
    // This runs AFTER every script (app.js, hub_upgrades.js, fixes.js,
    // upgrades.js) has had its chance to define or patch the function.
    // We no longer chain — we own the function outright here.
    window.switchHubTab = function (hub, panel, btn) {
      var hubEl = document.getElementById('page-' + hub);
      if (!hubEl) return;

      // Deactivate all panels in this hub
      hubEl.querySelectorAll('.hub-panel').forEach(function (p) {
        p.classList.remove('active');
      });

      // Deactivate all tab buttons in this hub
      var tabsEl = document.getElementById(hub + '-tabs');
      if (tabsEl) {
        tabsEl.querySelectorAll('.hub-tab').forEach(function (b) {
          b.classList.remove('active');
        });
      }

      // Activate the target panel and button
      var targetPanel = document.getElementById(hub + '-panel-' + panel);
      if (targetPanel) targetPanel.classList.add('active');
      if (btn) btn.classList.add('active');

      // Fire the central post-render dispatcher
      afterSwitch(hub, panel);
    };

    /* ── Also handle full page navigation ──────────────── */
    // Render hub content when navigating TO a hub page
    document.addEventListener('tb:navigate', function (e) {
      var page = e.detail && e.detail.page;
      if (!page) return;

      setTimeout(function () {
        if (page === 'analytics-hub') {
          // Find and render the currently active panel
          var activePanel = document.querySelector('#page-analytics-hub .hub-panel.active');
          var panelId = activePanel ? activePanel.id.replace('analytics-hub-panel-', '') : 'overview';
          afterSwitch('analytics-hub', panelId);
        }
        if (page === 'psych-hub') {
          var activePsychPanel = document.querySelector('#page-psych-hub .hub-panel.active');
          var psychPanelId = activePsychPanel ? activePsychPanel.id.replace('psych-hub-panel-', '') : 'psych';
          afterSwitch('psych-hub', psychPanelId);
          window.renderRulesList && window.renderRulesList();
        }
        if (page === 'tools-hub') {
          var activeToolsPanel = document.querySelector('#page-tools-hub .hub-panel.active');
          var toolsPanelId = activeToolsPanel ? activeToolsPanel.id.replace('tools-hub-panel-', '') : 'protools';
          afterSwitch('tools-hub', toolsPanelId);
        }
        if (page === 'dashboard') {
          window.renderMonthlyROI    && window.renderMonthlyROI();
          window.renderSessionTimeline && window.renderSessionTimeline();
          window.updateDashboard     && window.updateDashboard();
        }
        if (page === 'institutional-hub') {
          var activeInstPanel = document.querySelector('#page-institutional-hub .hub-panel.active');
          var instPanelId = activeInstPanel ? activeInstPanel.id.replace('institutional-hub-panel-', '') : 'risk';
          afterSwitch('institutional-hub', instPanelId);
        }
      }, 200);
    });

    /* ── Trigger initial render if a hub page is already active ── */
    var activePage = document.querySelector('.page.active');
    if (activePage) {
      var pid = activePage.id ? activePage.id.replace('page-', '') : '';
      if (pid === 'analytics-hub') {
        var ap = document.querySelector('#page-analytics-hub .hub-panel.active');
        afterSwitch('analytics-hub', ap ? ap.id.replace('analytics-hub-panel-', '') : 'overview');
      }
      if (pid === 'tools-hub') {
        var tp = document.querySelector('#page-tools-hub .hub-panel.active');
        afterSwitch('tools-hub', tp ? tp.id.replace('tools-hub-panel-', '') : 'protools');
      }
      if (pid === 'psych-hub') {
        var pp = document.querySelector('#page-psych-hub .hub-panel.active');
        afterSwitch('psych-hub', pp ? pp.id.replace('psych-hub-panel-', '') : 'psych');
      }
    }

    console.log('[hub_fix.js] ✅ switchHubTab patched — all hub renders active.');
  });

})();
