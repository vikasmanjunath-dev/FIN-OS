// First-run flow as a small state machine: what the person has seen, where they stopped, and whether it should open on its own.
// Rules (kept true by __tests__/onboarding.test.mts):
//   - It opens by itself at most twice (the second time resumes where they stopped), then never again unprompted.
//   - Skipping, or finishing, ends it for good; Settings can re-open it on demand, and that run never auto-opens later.
//   - Someone who already has data on the phone (an update, a restore) never gets it unprompted.
//   - It never blocks use: it is a screen you can leave, not a gate. Direct links and deep links do not go through it.
//   - It writes only what the person actually answered. A skipped answer leaves the stored value exactly as it was.
// Pure: no storage, no React Native; "now" is a parameter.
import { validate, PROFILE_KEYS, type Profile } from '@/lib/profile';
import { dayOf } from '@/lib/usage';

export const ONBOARDING_KEY = 'finos_onboarding_mobile';
export const STEPS = ['welcome', 'profile', 'dna', 'reminders', 'lock', 'look', 'done'] as const;
export type StepId = typeof STEPS[number];
export type Status = 'new' | 'in_progress' | 'done' | 'skipped';

export interface OnboardingState {
  v: 1;
  status: Status;
  step: StepId;
  /** How many times it opened by itself. */
  autoShown: number;
  /** True when the person re-opened it from Settings: it then never opens on its own. */
  manual: boolean;
  /** Steps whose own action the person took (for the summary at the end). */
  did: StepId[];
  day: string | null;
  via?: 'existing-data';
}

export const MAX_AUTO_SHOWS = 2;
export const NEW_STATE: OnboardingState = { v: 1, status: 'new', step: 'welcome', autoShown: 0, manual: false, did: [], day: null };

const isStep = (s: unknown): s is StepId => (STEPS as readonly string[]).includes(s as string);
const isStatus = (s: unknown): s is Status => s === 'new' || s === 'in_progress' || s === 'done' || s === 'skipped';

export function normalise(raw: unknown): OnboardingState {
  const r: any = raw && typeof raw === 'object' ? raw : {};
  if (r.v !== 1 || !isStatus(r.status)) return { ...NEW_STATE };
  return {
    v: 1,
    status: r.status,
    step: isStep(r.step) ? r.step : 'welcome',
    autoShown: Number.isInteger(r.autoShown) && r.autoShown >= 0 ? Math.min(r.autoShown, 99) : 0,
    manual: r.manual === true,
    did: Array.isArray(r.did) ? r.did.filter(isStep).filter((s: StepId, i: number, a: StepId[]) => a.indexOf(s) === i) : [],
    day: typeof r.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.day) ? r.day : null,
    ...(r.via === 'existing-data' ? { via: 'existing-data' as const } : {}),
  };
}

/** Keys that exist on a phone that has never been used: written by the app itself, not by the person. */
const NOT_USER_DATA = /^(finos_(streak|lang|theme_mobile|host_ip|tracker_sync_meta|session|onboarding_mobile|persona_mobile|consents|usage|feedback_log|diag_|applock|search_recent|holdings_last_sync|holdings_owner|holdings_tombstones_v1|reminders_mobile|alerts_state|nudges_dismissed))/;

/** Does the phone already hold something the person entered? Then the welcome flow is not for them. */
export function isEstablished(keys: readonly string[]): boolean {
  return keys.some(k => /^finos_/.test(k) && !NOT_USER_DATA.test(k));
}

/** Should the app open the flow on its own right now? */
export function shouldAutoOpen(s: OnboardingState): boolean {
  if (s.status === 'done' || s.status === 'skipped') return false;
  if (s.manual) return false;
  return s.autoShown < MAX_AUTO_SHOWS;
}

/** Called when the flow opens on its own: counts it, and starts it on the first time. */
export function autoOpened(s: OnboardingState, now: Date): OnboardingState {
  return { ...s, status: 'in_progress', autoShown: s.autoShown + 1, day: s.day ?? dayOf(now) };
}

/** Re-open from Settings: starts again at the welcome, whatever happened before, and never auto-opens later. */
export function reopen(s: OnboardingState, now: Date): OnboardingState {
  return { ...s, status: 'in_progress', step: 'welcome', manual: true, did: [], day: dayOf(now) };
}

export const stepIndex = (s: StepId) => STEPS.indexOf(s);
export const next = (s: OnboardingState): OnboardingState => {
  const i = Math.min(STEPS.length - 1, stepIndex(s.step) + 1);
  return { ...s, step: STEPS[i] };
};
export const back = (s: OnboardingState): OnboardingState => ({ ...s, step: STEPS[Math.max(0, stepIndex(s.step) - 1)] });
export const goto = (s: OnboardingState, step: StepId): OnboardingState => ({ ...s, step });
export const markDid = (s: OnboardingState, step: StepId): OnboardingState => (s.did.includes(step) ? s : { ...s, did: [...s.did, step] });
export const finish = (s: OnboardingState, now: Date): OnboardingState => ({ ...s, status: 'done', step: 'done', day: s.day ?? dayOf(now) });
/** "Skip for now" on any step. */
export const skipAll = (s: OnboardingState, now: Date): OnboardingState => ({ ...s, status: 'skipped', day: s.day ?? dayOf(now) });
/** Silently done: the phone already has the person's data. */
export const alreadyEstablished = (now: Date): OnboardingState => ({ ...NEW_STATE, status: 'done', step: 'done', day: dayOf(now), via: 'existing-data' });

/** Resumable: a flow left in progress comes back on the step it stopped at. Only the last step is not a place to resume. */
export const resumeStep = (s: OnboardingState): StepId => (s.step === 'done' ? 'welcome' : s.step);

/**
 * Profile answers -> the storage writes. ONLY fields the person filled in and that are valid are written; an empty field writes
 * nothing and deletes nothing (unlike Profile -> Save, which clears a field on purpose). Invalid fields are reported, not written.
 */
export function profileWrites(input: Profile): { pairs: [string, string][]; errors: Partial<Record<keyof Profile, string>> } {
  const c = validate(input);
  const pairs: [string, string][] = [];
  (Object.keys(PROFILE_KEYS) as (keyof Profile)[]).forEach(k => {
    if (c.errors[k]) return;
    if (c.clean[k] !== '') pairs.push([PROFILE_KEYS[k], c.clean[k]]);
  });
  return { pairs, errors: c.errors };
}

/** What the "done" step lists: only what the person really did. */
export function summaryLines(s: OnboardingState, facts: { profileFields: number; lockOn: boolean; remindersOn: boolean; dnaDone: boolean }): string[] {
  const out: string[] = [];
  if (facts.profileFields > 0) out.push(`Profile: ${facts.profileFields} of 4 details saved`);
  if (facts.dnaDone) out.push('Money personality quiz done');
  if (facts.remindersOn) out.push('Reminders are on');
  if (facts.lockOn) out.push('App lock is on');
  if (s.did.includes('look')) out.push('Language and appearance chosen');
  return out;
}
