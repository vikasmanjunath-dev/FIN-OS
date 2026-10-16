// Consent records on this phone: the same shape and rules as FinosPrivacy.consent in js/finos-privacy.js (key finos_consents).
// DPDP-style: default is "no"; a record holds when it changed and which wording version it applied to, so a changed purpose
// never inherits an old yes. Only purposes that could send something are listed: nothing on the phone sends anything today.
// Pure: no storage, no React Native.

export const CONSENT_KEY = 'finos_consents';
export const CONSENT_VERSION = 1;

export interface Purpose { id: 'feedback' | 'usage'; title: string; detail: string }

/** Wording shown next to each switch. Change the text -> bump CONSENT_VERSION so old yes answers stop counting. */
export const PURPOSES: Purpose[] = [
  {
    id: 'feedback',
    title: 'Allow my saved feedback to be sent to the FIN·OS team',
    detail: 'Feedback is always saved on this phone first. There is no team inbox yet, so nothing is sent whatever this says. If one is added in a later version, feedback you save is sent only if this is on. Amounts, numbers, e-mails and links are removed before anything is saved.',
  },
  {
    id: 'usage',
    title: 'Count which screens I open (kept on this phone)',
    detail: 'Adds one to a counter for the name of the screen you open: never what you typed, never an amount. Kept for 90 days, shown on the Diagnostics screen, and nothing is sent. If a team inbox is added later, these counts could be sent only while this is on and only when you tap Send.',
  },
];

export type ConsentMap = Record<string, { granted: boolean; at: string; v: number }>;

export function parseConsents(raw: string | null | undefined): ConsentMap {
  try {
    const v = JSON.parse(raw ?? '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: ConsentMap = {};
    for (const [k, r] of Object.entries(v as Record<string, any>)) {
      if (r && typeof r === 'object') out[k] = { granted: r.granted === true, at: typeof r.at === 'string' ? r.at : '', v: Number(r.v) || 0 };
    }
    return out;
  } catch { return {}; }
}

const known = (id: string) => PURPOSES.some(p => p.id === id);

/** true only for a recorded yes, for a known purpose, at the current wording version. */
export function hasConsent(map: ConsentMap, id: string): boolean {
  if (!known(id)) return false;
  const r = map[id];
  return !!(r && r.granted === true && r.v === CONSENT_VERSION);
}

export function withConsent(map: ConsentMap, id: string, granted: boolean, now: Date = new Date()): ConsentMap {
  if (!known(id)) return map;
  return { ...map, [id]: { granted: granted === true, at: now.toISOString(), v: CONSENT_VERSION } };
}

/** Everything back to "no" (used by "turn everything off" and by erase). */
export function withdrawAll(map: ConsentMap, now: Date = new Date()): ConsentMap {
  return PURPOSES.reduce((m, p) => withConsent(m, p.id, false, now), map);
}
