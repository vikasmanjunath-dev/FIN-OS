// What the ranker needs to know about each reel beyond its script: how deep it goes (the knowledge ladder), which Money Score pillars it
// speaks to, what moments make it timely, and whether it nudges the person to put in more money. Kept apart from the scripts so the
// scripts stay plain data; a test fails if a reel has no entry here, or an entry has no reel.
import type { PillarId } from '@/lib/reels/journey';
import { DRAFT_META } from '@/lib/reels/drafts-meta';
import { isLive } from '@/lib/reels/review';

/** The four rungs of the ladder: what people wrongly believe, how it works, choosing with your numbers, and the move. */
export type Level = 'myth' | 'concept' | 'decision' | 'action';
export const LEVELS: Level[] = ['myth', 'concept', 'decision', 'action'];

export interface Meta {
  level: Level;
  /** How much the reel speaks to each Money Score pillar, 0 to 1. */
  needs: Partial<Record<PillarId, number>>;
  /** Moments that make this reel timely: `cal:*`, `event:*` or `state:*` (see lib/reels/triggers.ts). */
  triggers?: string[];
  /** True when the reel's message is "put in more": it is held back for a person under money strain. */
  growth?: boolean;
}

const m = (level: Level, needs: Meta['needs'], triggers?: string[], growth?: boolean): Meta => ({ level, needs, ...(triggers ? { triggers } : {}), ...(growth ? { growth } : {}) });

export const META: Record<string, Meta> = {
  // basics
  'inflation': m('concept', { savings: 0.6, wealth: 0.5 }),
  'cash-flow': m('concept', { savings: 1, emergency: 0.4 }),
  'inflation-slide': m('decision', { savings: 0.5, wealth: 0.5 }),
  'myths-money': m('myth', { savings: 0.7, debt: 0.3 }),
  // investing
  'start-early': m('concept', { investing: 1, wealth: 0.6 }, undefined, true),
  'rule-of-72': m('concept', { wealth: 0.8, investing: 0.5 }),
  'mf-units-nav': m('concept', { investing: 0.8 }),
  'direct-vs-regular': m('decision', { investing: 0.9 }),
  'hundred-minus-age': m('decision', { wealth: 1, investing: 0.5 }),
  'guess-sip': m('concept', { investing: 1, wealth: 0.6 }, undefined, true),
  'delay-cost': m('decision', { investing: 1, wealth: 0.7 }, undefined, true),
  // loans
  'emi-trap': m('concept', { debt: 1 }, ['state:has-loan']),
  'good-bad-debt': m('decision', { debt: 0.9 }, ['state:has-loan']),
  'rbi-and-emi': m('concept', { debt: 0.8 }, ['state:has-loan']),
  'guess-emi': m('concept', { debt: 1 }, ['state:has-loan']),
  'home-loan-affordability': m('decision', { debt: 0.7 }, ['event:home']),
  'home-loan-tenure': m('decision', { debt: 0.7 }, ['event:home']),
  'home-loan-prepay': m('action', { debt: 0.9 }, ['state:has-loan', 'event:windfall']),
  'home-loan-costs': m('concept', { debt: 0.5 }, ['event:home']),
  // credit
  'credit-score-basics': m('concept', { debt: 0.6 }),
  'credit-utilisation': m('decision', { debt: 0.7 }),
  'card-interest-trap': m('myth', { debt: 0.9 }),
  'credit-enquiries': m('myth', { debt: 0.4 }),
  // protection
  'emergency-fund': m('concept', { emergency: 1, savings: 0.3 }, ['state:fund-low', 'event:job_loss']),
  'insurance-basics': m('concept', { insurance: 1 }),
  'life-cover': m('decision', { insurance: 1 }, ['event:marriage', 'event:child']),
  // tax
  'tax-regimes': m('decision', { savings: 0.4, wealth: 0.3 }, ['cal:regime-choice', 'cal:tax-season', 'event:job_change']),
  'section-80c': m('decision', { savings: 0.4, investing: 0.3 }, ['cal:tax-season']),
  'tds-refund': m('concept', { savings: 0.3 }, ['cal:filing-season']),
  'capital-gains': m('concept', { investing: 0.4, wealth: 0.3 }, ['cal:tax-season']),
  'tax-dates': m('action', { savings: 0.3 }, ['cal:advance-tax', 'cal:tax-season', 'cal:filing-season']),
  // retirement
  'retire-corpus': m('decision', { wealth: 0.9 }),
  'epf-basics': m('concept', { wealth: 0.6 }, ['event:job_change']),
  'nps-basics': m('concept', { wealth: 0.6, investing: 0.3 }, ['cal:tax-season']),
  'ppf-basics': m('concept', { wealth: 0.5, savings: 0.3 }),
  'withdrawal-rate': m('decision', { wealth: 0.8 }),
  // safety
  'otp-never-share': m('myth', { savings: 0.4 }),
  'upi-collect-scam': m('myth', { savings: 0.4 }),
  'digital-arrest': m('myth', { savings: 0.4 }),
  'investment-scam': m('myth', { investing: 0.5, savings: 0.3 }),
  'fake-kyc-links': m('myth', { savings: 0.4 }),
  'myths-scams': m('myth', { savings: 0.5 }),
  'spot-kyc-sms': m('myth', { savings: 0.5 }),
  'spot-invest-group': m('myth', { investing: 0.5, savings: 0.4 }),
  'sort-needs-wants': m('concept', { savings: 1 }),
  'order-first-salary': m('action', { savings: 0.8, emergency: 0.5, debt: 0.4 }, ['event:job_change']),
  'emi-rate-slide': m('decision', { debt: 0.8 }, ['state:has-loan']),
  'goal-sip-slide': m('decision', { investing: 0.7, wealth: 0.5 }, ['event:child', 'event:marriage'], true),
  'corpus-spend-slide': m('decision', { wealth: 0.9 }),
  'choose-bonus': m('decision', { savings: 0.5, debt: 0.5, emergency: 0.5 }, ['event:windfall']),
  // goals
  'goal-sip-needed': m('decision', { investing: 0.8, wealth: 0.5 }, ['event:child', 'event:education', 'event:marriage', 'event:home'], true),
  'goal-time-buckets': m('concept', { wealth: 0.6 }, ['event:marriage', 'event:child']),
  'goal-inflation': m('concept', { wealth: 0.5, savings: 0.4 }, ['event:education']),
  'goal-step-up': m('action', { investing: 0.9 }, ['event:windfall', 'event:job_change'], true),
  // basics, added with the second content batch
  'salary-slip-decoded': m('concept', { savings: 0.6 }, ['event:job_change']),
  'needs-wants-wealth': m('concept', { savings: 1 }),
  'pay-yourself-first': m('action', { savings: 1, emergency: 0.4 }),
  'lifestyle-creep': m('myth', { savings: 0.9 }),
  // investing, second content batch
  'sip-vs-lumpsum': m('decision', { investing: 0.8 }),
  'index-fund-basics': m('concept', { investing: 0.8 }),
  'elss-basics': m('concept', { investing: 0.6, savings: 0.3 }, ['cal:tax-season']),
  'gold-basics': m('concept', { wealth: 0.5, investing: 0.4 }),
  'debt-funds-basics': m('concept', { investing: 0.6 }),
  'mf-risk-label': m('concept', { investing: 0.7 }),
  'rebalancing': m('decision', { wealth: 0.7, investing: 0.5 }),
  'first-sip-habit': m('action', { investing: 1, savings: 0.4 }, undefined, true),
  'market-dips-sip': m('concept', { investing: 0.8 }, undefined, true),
  'diversification': m('concept', { wealth: 0.6, investing: 0.6 }),
  'real-return-fd': m('concept', { savings: 0.7, wealth: 0.5 }),
  // loans, credit and protection, second content batch (wave 2, part B)
  'floating-vs-fixed': m('concept', { debt: 0.7 }, ['state:has-loan', 'event:home']),
  'prepay-vs-invest': m('decision', { debt: 0.8, investing: 0.4 }, ['state:has-loan', 'event:windfall']),
  'no-cost-emi': m('myth', { debt: 0.7, savings: 0.3 }),
  'bnpl-late-fees': m('myth', { debt: 0.8 }),
  'term-vs-ulip': m('decision', { insurance: 1 }, ['event:marriage', 'event:child']),
  'health-cover-gotchas': m('concept', { insurance: 1 }),
  'parents-health-cover': m('decision', { insurance: 0.8 }),
  'nominee-basics': m('action', { insurance: 0.5 }, ['event:marriage', 'event:child']),
  'super-top-up': m('decision', { insurance: 0.8 }),
  'emergency-target': m('action', { emergency: 1 }, ['state:fund-low', 'event:job_loss']),
  'where-keep-fund': m('concept', { emergency: 0.8 }, ['state:fund-low']),
  // tax and retirement, second content batch (wave 2, part C)
  'hra-basics': m('decision', { savings: 0.5 }, ['cal:tax-season', 'cal:regime-choice', 'event:job_change']),
  'itr-filing-steps': m('action', { savings: 0.3 }, ['cal:filing-season']),
  'form-16-decoded': m('concept', { savings: 0.3 }, ['cal:filing-season']),
  'fd-interest-tax': m('concept', { savings: 0.5, wealth: 0.3 }, ['cal:filing-season']),
  'tax-loss-harvesting': m('decision', { investing: 0.4, wealth: 0.3 }, ['cal:tax-season']),
  'section-80d': m('decision', { insurance: 0.5, savings: 0.3 }, ['cal:tax-season']),
  'home-loan-tax-benefit': m('decision', { debt: 0.5 }, ['cal:tax-season', 'event:home']),
  'tax-proofs-checklist': m('action', { savings: 0.3 }, ['cal:tax-season', 'cal:regime-choice']),
  'standard-deduction': m('concept', { savings: 0.3 }, ['cal:regime-choice', 'event:job_change']),
  'retire-number-steps': m('action', { wealth: 1 }),
  'annuity-basics': m('concept', { wealth: 0.7 }),
  'epf-ppf-nps-compare': m('decision', { wealth: 0.7, savings: 0.3 }, ['event:job_change']),
  'healthcare-in-retirement': m('concept', { wealth: 0.6, insurance: 0.6 }),
  'retirement-buckets': m('decision', { wealth: 0.8 }),
  // scams and goals, second content batch (wave 2, part D)
  'phone-safety-checklist': m('action', { savings: 0.4 }),
  'sim-swap-signs': m('concept', { savings: 0.3 }),
  'fake-job-task-scam': m('myth', { savings: 0.4 }),
  'qr-code-scam': m('myth', { savings: 0.4 }),
  'fake-customer-care': m('myth', { savings: 0.4 }),
  'fake-delivery-fee': m('myth', { savings: 0.3 }),
  'family-emergency-call': m('myth', { savings: 0.3 }),
  'loan-app-red-flags': m('myth', { debt: 0.5, savings: 0.3 }),
  'wedding-fund': m('decision', { wealth: 0.6, investing: 0.5 }, ['event:marriage'], true),
  'child-education-fund': m('decision', { wealth: 0.6, investing: 0.5 }, ['event:child', 'event:education']),
  'first-home-downpayment': m('decision', { wealth: 0.5, investing: 0.5, debt: 0.3 }, ['event:home'], true),
  'car-buying-math': m('decision', { debt: 0.6, savings: 0.3 }),
  'sabbatical-fund': m('concept', { emergency: 0.5, savings: 0.4 }, ['event:job_change']),
  'irregular-income-buffer': m('concept', { emergency: 0.9, savings: 0.5 }),
  'goal-priority': m('decision', { wealth: 0.5, savings: 0.5 }),
  'yearly-goal-review': m('action', { wealth: 0.6, investing: 0.4 }, undefined, true),
  'sinking-funds': m('action', { savings: 0.8 }),
  'windfall-plan': m('decision', { debt: 0.7, emergency: 0.5 }, ['event:windfall']),
  // wave 3: spot the scam, myth decks, guess first, sliders, choose your path, explainers
  'spot-electricity-sms': m('myth', { savings: 0.3 }),
  'spot-refund-call': m('myth', { savings: 0.3 }),
  'spot-job-whatsapp': m('myth', { savings: 0.3 }),
  'spot-parcel-fee': m('myth', { savings: 0.3 }),
  'spot-pan-update': m('myth', { savings: 0.3 }),
  'spot-reward-points': m('myth', { savings: 0.3 }),
  'spot-new-number-family': m('myth', { savings: 0.3 }),
  'spot-marketplace-buyer': m('myth', { savings: 0.3 }),
  'spot-crypto-double': m('myth', { savings: 0.3 }),
  'spot-lottery-win': m('myth', { savings: 0.3 }),
  'spot-bank-manager-call': m('myth', { savings: 0.3 }),
  'spot-ipo-allotment': m('myth', { investing: 0.4, savings: 0.3 }),
  'spot-loan-app': m('myth', { debt: 0.4, savings: 0.3 }),
  'myths-sip': m('myth', { investing: 0.8 }),
  'myths-credit-score': m('myth', { debt: 0.6 }),
  'myths-insurance': m('myth', { insurance: 0.9 }),
  'myths-tax': m('myth', { savings: 0.4, wealth: 0.3 }, ['cal:tax-season']),
  'myths-loans': m('myth', { debt: 0.8 }, ['state:has-loan']),
  'myths-retirement': m('myth', { wealth: 0.8 }),
  'myths-upi': m('myth', { savings: 0.4 }),
  'myths-gold': m('myth', { wealth: 0.4, investing: 0.4 }),
  'myths-mutual-funds': m('myth', { investing: 0.8 }),
  'myths-saving': m('myth', { savings: 0.9, emergency: 0.3 }),
  'guess-card-dues': m('concept', { debt: 0.9 }),
  'guess-small-sip': m('concept', { investing: 0.8, wealth: 0.4 }, undefined, true),
  'guess-rent-20y': m('concept', { savings: 0.5, wealth: 0.4 }),
  'guess-fee-gap': m('decision', { investing: 0.8 }),
  'guess-ppf-15': m('concept', { wealth: 0.6, savings: 0.3 }),
  'guess-home-interest': m('concept', { debt: 0.7 }, ['event:home']),
  'guess-medical-20y': m('concept', { insurance: 0.7 }),
  'guess-step-up': m('decision', { investing: 0.8 }, undefined, true),
  'slide-start-late': m('decision', { investing: 0.9, wealth: 0.6 }, undefined, true),
  'slide-sip-length': m('concept', { investing: 0.8 }, undefined, true),
  'slide-rent-power': m('concept', { savings: 0.6, wealth: 0.4 }),
  'slide-cash-cupboard': m('concept', { savings: 0.6, wealth: 0.5 }),
  'path-first-raise': m('decision', { savings: 0.9 }),
  'path-card-bill': m('decision', { debt: 0.9 }, ['state:has-loan']),
  'path-car-payment': m('decision', { debt: 0.7 }),
  'path-two-year-goal': m('decision', { wealth: 0.5, investing: 0.4 }),
  'path-spare-monthly': m('decision', { debt: 0.6, investing: 0.5 }, ['state:has-loan']),
  'stock-basics': m('concept', { investing: 0.7 }),
  'ipo-basics': m('concept', { investing: 0.6 }),
  'etf-basics': m('concept', { investing: 0.7 }),
  'demat-kyc-basics': m('concept', { investing: 0.5 }),
  'credit-report-read': m('action', { debt: 0.6 }),
  'insurance-claim-steps': m('action', { insurance: 0.8 }),
  'itr-which-form': m('action', { savings: 0.3 }, ['cal:filing-season']),
  'fd-ladder': m('decision', { savings: 0.5, emergency: 0.4 }),
  // wave 3b: sort it, put in order, more sliders
  'sort-protect-or-grow': m('concept', { insurance: 0.6, investing: 0.4 }),
  'sort-scam-or-real': m('myth', { savings: 0.4 }),
  'sort-regime-items': m('concept', { savings: 0.4 }, ['cal:regime-choice', 'cal:tax-season']),
  'sort-emergency-or-not': m('concept', { emergency: 0.9, savings: 0.3 }, ['state:fund-low']),
  'sort-risk-ladder': m('concept', { investing: 0.6, wealth: 0.4 }),
  'sort-debt-kinds': m('decision', { debt: 0.8 }, ['state:has-loan']),
  'order-emergency-steps': m('action', { emergency: 1 }, ['state:fund-low', 'event:job_loss']),
  'order-claim-steps': m('action', { insurance: 0.8 }),
  'order-compare-loans': m('action', { debt: 0.7 }, ['event:home', 'state:has-loan']),
  'order-itr-steps': m('action', { savings: 0.3 }, ['cal:filing-season']),
  'slide-emi-tenure': m('decision', { debt: 0.8 }, ['event:home', 'state:has-loan']),
  'slide-goal-years': m('decision', { investing: 0.7, wealth: 0.5 }, ['event:child', 'event:education', 'event:marriage', 'event:home'], true),
  'slide-step-up-rate': m('action', { investing: 0.8 }, ['event:windfall', 'event:job_change'], true),
  'slide-tax-income': m('decision', { savings: 0.4 }, ['cal:regime-choice', 'cal:tax-season', 'event:job_change']),
  'slide-card-wait': m('myth', { debt: 0.9 }),
  'slide-car-loan-rate': m('decision', { debt: 0.7 }),
  'slide-corpus-small': m('decision', { wealth: 0.8 }),
};

// Draft reels join only once they are live (signed off, or a review build), so the tests never see an entry for a reel that is not in the library.
for (const id of Object.keys(DRAFT_META)) if (isLive(id)) META[id] = DRAFT_META[id];

/** The entry for a reel; a reel with none (new content not yet described) is treated as a plain concept reel with no particular need. */
export const metaOf = (id: string): Meta => META[id] ?? { level: 'concept', needs: {} };
export const levelIndex = (l: Level): number => LEVELS.indexOf(l);
