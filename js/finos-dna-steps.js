/* finos-dna-steps.js — the Financial DNA questions and how an answer moves the five scores.
 *
 *   FinosDNA.STEPS                      → [{ lvl, id, q, options:[{ text, impact:[risk, security, status, discipline, growth] }] }]
 *   FinosDNA.START                      → [50, 50, 50, 50, 50]
 *   FinosDNA.apply(scores, impact)      → new scores, each clamped to 0–100
 *   FinosDNA.scoresFor(responses)       → scores from { LEVEL_xx: answer text } (unknown answers are ignored)
 *
 * A reflective exercise with hand-set weights, not a validated psychometric test. The "36-49" age band was missing, so
 * people in that range had to pick a wrong answer; its weights sit between the 25-35 and 50+ rows.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosDNA = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const STEPS = [
      {
          lvl: "LEVEL_00",
          id: "age",
          q: "How many orbits have you completed? (Age)",
          options: [
              { text: "18-24 (Gen Z / Rookie)", impact: [10, -5, 5, -10, 20] },
              { text: "25-35 (Early Career)", impact: [5, 5, 10, 5, 10] },
              { text: "36-49 (Peak Earning)", impact: [-5, 15, 0, 10, -2] },
      { text: "50+ (Exit Planning)", impact: [-15, 25, -5, 15, -15] }
          ]
      },
      {
          lvl: "LEVEL_01",
          id: "origin",
          q: "What did money represent in your house growing up?",
          options: [
              { text: "The Hisaab Mindset (Scarcity/Safety)", impact: [-10, 30, -10, 20, -10] },
              { text: "The Showroom Mindset (Status/Weddings)", impact: [5, -10, 30, -10, 5] },
              { text: "The Comfort Mindset (Needs met)", impact: [0, 10, 0, 5, 5] },
              { text: "The Taboo Mindset (Never discussed)", impact: [0, 0, 0, -20, 0] }
          ]
      },
      {
          lvl: "LEVEL_02",
          id: "emotion",
          q: "Does checking your bank statement feel like a horror movie?",
          options: [
              { text: "Zen (I am in total control)", impact: [5, 10, 0, 20, 5] },
              { text: "Anxious (I avoid looking at it)", impact: [-5, 15, 0, -15, 0] },
              { text: "Stressed (It's never enough)", impact: [0, 20, 5, -5, 0] },
              { text: "Focused (Motivated to grow)", impact: [10, 0, 5, 15, 15] }
          ]
      },
      {
          lvl: "LEVEL_03",
          id: "freedom",
          q: "What does 'Financial Freedom' look like to you?",
          options: [
              { text: "Resigning from the 9-to-5 (Time)", impact: [15, -5, 0, 10, 20] },
              { text: "Zero Debt & Large FD (Security)", impact: [-20, 30, -10, 20, -10] },
              { text: "The ability to buy Luxury (Status)", impact: [10, -10, 30, -10, 10] },
              { text: "Supporting family comfortably", impact: [-5, 20, 5, 10, 0] }
          ]
      },
      {
          lvl: "LEVEL_04",
          id: "patience",
          q: "Can you wait 10 years for a Banyan Tree to grow?",
          options: [
              { text: "Short-term (I need results in months)", impact: [20, -10, 10, -20, 5] },
              { text: "Medium-term (1-5 years)", impact: [5, 5, 5, 5, 10] },
              { text: "Long-term (10+ years)", impact: [-10, 15, -5, 30, 20] }
          ]
      },
      {
          lvl: "LEVEL_05",
          id: "risk",
          q: "Portfolio drops 20% (₹1 Lakh becomes ₹80k). Your move?",
          options: [
              { text: "Panic Sell (Protect what's left)", impact: [-30, 30, -10, -10, -20] },
              { text: "Wait & Pray (Do nothing)", impact: [0, 10, 0, 5, 0] },
              { text: "Buy the Dip (Alpha move)", impact: [30, -10, 5, 15, 25] }
          ]
      },
      {
          lvl: "LEVEL_06",
          id: "involvement",
          q: "How do you want to drive your financial car?",
          options: [
              { text: "Pilot (I want full control)", impact: [15, 0, 5, 10, 15] },
              { text: "Co-Pilot (I need guidance)", impact: [5, 5, 5, 10, 10] },
              { text: "Passenger (Automate everything)", impact: [-10, 15, 0, 20, 5] }
          ]
      },
      {
          lvl: "LEVEL_07",
          id: "social",
          q: "The 'Sharma-ji' Comparison Index: Do you feel behind?",
          options: [
              { text: "Frequently (Social pressure is real)", impact: [5, -10, 25, -5, 5] },
              { text: "Occasionally", impact: [0, 0, 5, 0, 0] },
              { text: "Never (I run my own race)", impact: [-5, 15, -10, 20, 10] }
          ]
      },
      {
          lvl: "LEVEL_08",
          id: "learning",
          q: "How do you prefer to absorb financial data?",
          options: [
              { text: "Visual Charts & Unreal UI", impact: [0, 0, 0, 0, 0] },
              { text: "Real-life Desi Stories", impact: [0, 0, 0, 0, 0] },
              { text: "Hard Numbers & Logic", impact: [0, 0, 0, 0, 0] }
          ]
      }
  ];

  const START = [50, 50, 50, 50, 50];
  const clamp = (v) => Math.min(100, Math.max(0, v));
  function apply(scores, impact) { return scores.map((v, i) => clamp(v + (impact[i] || 0))); }
  function scoresFor(responses) {
    let s = START.slice();
    STEPS.forEach((step) => {
      const text = responses && responses[step.lvl];
      const opt = step.options.find((o) => o.text === text);
      if (opt) s = apply(s, opt.impact);
    });
    return s;
  }
  return { STEPS, START, apply, scoresFor };
});
