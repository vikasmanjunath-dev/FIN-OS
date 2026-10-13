// Financial DNA quiz: nine questions, five scores (risk, security, status, discipline, growth).
// The questions are a copy of js/finos-dna-steps.js (__tests__/dna.parity.test.mts fails if they drift) and the saved shape is the
// website's FINOS_CORE_DNA, so a quiz taken on either side is read by the other.
// A reflective exercise with hand-set weights, not a validated psychometric test: the screen says so.

export interface DnaOption { text: string; impact: number[] }
export interface DnaStep { lvl: string; id: string; q: string; options: DnaOption[] }
export const DNA_KEY = 'FINOS_CORE_DNA';
export const DIMENSIONS = ['Risk', 'Security', 'Status', 'Discipline', 'Growth'] as const;
export const START: number[] = [50, 50, 50, 50, 50];

export const STEPS: DnaStep[] = [
  {
    lvl: "LEVEL_00", id: "age",
    q: "How many orbits have you completed? (Age)",
    options: [
      { text: "18-24 (Gen Z / Rookie)", impact: [10, -5, 5, -10, 20] },
      { text: "25-35 (Early Career)", impact: [5, 5, 10, 5, 10] },
      { text: "36-49 (Peak Earning)", impact: [-5, 15, 0, 10, -2] },
      { text: "50+ (Exit Planning)", impact: [-15, 25, -5, 15, -15] },
    ],
  },
  {
    lvl: "LEVEL_01", id: "origin",
    q: "What did money represent in your house growing up?",
    options: [
      { text: "The Hisaab Mindset (Scarcity/Safety)", impact: [-10, 30, -10, 20, -10] },
      { text: "The Showroom Mindset (Status/Weddings)", impact: [5, -10, 30, -10, 5] },
      { text: "The Comfort Mindset (Needs met)", impact: [0, 10, 0, 5, 5] },
      { text: "The Taboo Mindset (Never discussed)", impact: [0, 0, 0, -20, 0] },
    ],
  },
  {
    lvl: "LEVEL_02", id: "emotion",
    q: "Does checking your bank statement feel like a horror movie?",
    options: [
      { text: "Zen (I am in total control)", impact: [5, 10, 0, 20, 5] },
      { text: "Anxious (I avoid looking at it)", impact: [-5, 15, 0, -15, 0] },
      { text: "Stressed (It's never enough)", impact: [0, 20, 5, -5, 0] },
      { text: "Focused (Motivated to grow)", impact: [10, 0, 5, 15, 15] },
    ],
  },
  {
    lvl: "LEVEL_03", id: "freedom",
    q: "What does 'Financial Freedom' look like to you?",
    options: [
      { text: "Resigning from the 9-to-5 (Time)", impact: [15, -5, 0, 10, 20] },
      { text: "Zero Debt & Large FD (Security)", impact: [-20, 30, -10, 20, -10] },
      { text: "The ability to buy Luxury (Status)", impact: [10, -10, 30, -10, 10] },
      { text: "Supporting family comfortably", impact: [-5, 20, 5, 10, 0] },
    ],
  },
  {
    lvl: "LEVEL_04", id: "patience",
    q: "Can you wait 10 years for a Banyan Tree to grow?",
    options: [
      { text: "Short-term (I need results in months)", impact: [20, -10, 10, -20, 5] },
      { text: "Medium-term (1-5 years)", impact: [5, 5, 5, 5, 10] },
      { text: "Long-term (10+ years)", impact: [-10, 15, -5, 30, 20] },
    ],
  },
  {
    lvl: "LEVEL_05", id: "risk",
    q: "Portfolio drops 20% (₹1 Lakh becomes ₹80k). Your move?",
    options: [
      { text: "Panic Sell (Protect what's left)", impact: [-30, 30, -10, -10, -20] },
      { text: "Wait & Pray (Do nothing)", impact: [0, 10, 0, 5, 0] },
      { text: "Buy the Dip (Alpha move)", impact: [30, -10, 5, 15, 25] },
    ],
  },
  {
    lvl: "LEVEL_06", id: "involvement",
    q: "How do you want to drive your financial car?",
    options: [
      { text: "Pilot (I want full control)", impact: [15, 0, 5, 10, 15] },
      { text: "Co-Pilot (I need guidance)", impact: [5, 5, 5, 10, 10] },
      { text: "Passenger (Automate everything)", impact: [-10, 15, 0, 20, 5] },
    ],
  },
  {
    lvl: "LEVEL_07", id: "social",
    q: "The 'Sharma-ji' Comparison Index: Do you feel behind?",
    options: [
      { text: "Frequently (Social pressure is real)", impact: [5, -10, 25, -5, 5] },
      { text: "Occasionally", impact: [0, 0, 5, 0, 0] },
      { text: "Never (I run my own race)", impact: [-5, 15, -10, 20, 10] },
    ],
  },
  {
    lvl: "LEVEL_08", id: "learning",
    q: "How do you prefer to absorb financial data?",
    options: [
      { text: "Visual Charts & Unreal UI", impact: [0, 0, 0, 0, 0] },
      { text: "Real-life Desi Stories", impact: [0, 0, 0, 0, 0] },
      { text: "Hard Numbers & Logic", impact: [0, 0, 0, 0, 0] },
    ],
  },
];

const clamp = (v: number) => Math.min(100, Math.max(0, v));
export const apply = (scores: number[], impact: number[]): number[] => scores.map((v, i) => clamp(v + (impact[i] || 0)));

/** Scores from saved answers ({ LEVEL_00: 'answer text' }); unknown answers are ignored. */
export function scoresFor(responses: Record<string, string> | null | undefined): number[] {
  let s = START.slice();
  STEPS.forEach(step => {
    const opt = step.options.find(o => o.text === responses?.[step.lvl]);
    if (opt) s = apply(s, opt.impact);
  });
  return s;
}

export interface Saved { responses: Record<string, string>; scores: number[] }

/** Reads the website's saved object defensively. Scores are recomputed from the answers when they are present. */
export function normalise(raw: unknown): Saved | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  const responses: Record<string, string> = {};
  if (r.responses && typeof r.responses === 'object') STEPS.forEach(s => { if (typeof r.responses[s.lvl] === 'string') responses[s.lvl] = r.responses[s.lvl]; });
  const answered = Object.keys(responses).length;
  const stored = Array.isArray(r.scores) && r.scores.length === 5 && r.scores.every((v: unknown) => typeof v === 'number' && Number.isFinite(v)) ? (r.scores as number[]).map(clamp) : null;
  if (!answered && !stored) return null;
  return { responses, scores: answered ? scoresFor(responses) : stored! };
}

/** The next unanswered question, or -1 when the quiz is finished. */
export const nextIndex = (responses: Record<string, string>): number => STEPS.findIndex(s => !(s.lvl in responses));
export const isComplete = (responses: Record<string, string>) => nextIndex(responses) === -1;

export const DESCRIBE: Record<(typeof DIMENSIONS)[number], { high: string; low: string }> = {
  Risk: { high: 'You are comfortable with swings for the chance of more growth.', low: 'You prefer certainty and dislike losing what you have.' },
  Security: { high: 'Safety and a cushion matter a lot to you.', low: 'You are relaxed about buffers and may under-insure.' },
  Status: { high: 'How things look to others pulls on your spending.', low: 'You spend with little regard for what others think.' },
  Discipline: { high: 'You follow a plan and let time do the work.', low: 'You tend to act on mood, so automation will help you.' },
  Growth: { high: 'You are oriented to building wealth over the long run.', low: 'You lean towards keeping what you have over growing it.' },
};

/** Behaviour points for the Health Score (0-15): the Discipline score, scaled. Same rule as the website. */
export const behaviourPoints = (discipline: number): number => Math.max(0, Math.min(15, Math.round(discipline * 0.15)));
