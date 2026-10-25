// The Home screen's "Today's reel" card: where the person stands with today's reels, in one calm card, and the next step. Pure: everything the
// card shows, in both languages, is decided here from state the reels already keep on the phone, so it is tested without a screen. Nothing is
// read or written here. The wording says what is, never what was missed.
import { seasonOf } from '@/lib/reels/seasons';
import type { L } from '@/lib/reels/types';

/** How many reels make a day's episode (kept equal to `EPISODE_SIZE` in episode.ts; a test checks they match). */
export const HOME_EPISODE_SIZE = 3;

export interface HomeState {
  /** The best reel for today (the episode's anchor), when there is one. */
  anchor: { title: L; reason: L | null } | null;
  /** Reels finished today, out of `size`. */
  finished: number;
  size?: number;
  /** Streak: days in the current run, and whether a rest day is being bridged right now. */
  streak: number;
  resting: boolean;
  /** Whether any reel was ever finished (a brand new person has not). */
  everDone: boolean;
  /** Pledged moves ("I'll do this"). */
  pledges: number;
  /** A fresh real receipt or milestone, not yet shown in the feed: its title. */
  celebrate: { title: L; growth: boolean } | null;
  /** Money strain (see signals.ts): no growth wording. The streak is shown to everyone: it is a habit count, not a growth cue. */
  strain: boolean;
}

export type HomeKind = 'new' | 'mid' | 'done' | 'rest';

export interface HomeCard {
  kind: HomeKind;
  /** The card's heading. */
  heading: L;
  /** The anchor reel's title (not shown once the day is done). */
  title: L | null;
  /** One line of why this reel, or a plain line when there is nothing personal to say. */
  reason: L;
  /** "1 of 3" and the like, or null for a new person. */
  progress: L | null;
  /** The streak in kind words, or null when there is no streak. */
  streak: L | null;
  /** The button text: Start, Continue or Done for today. */
  cta: L;
  ctaState: 'start' | 'continue' | 'done';
  /** "N moves on your list", linking to /learn/moves, or null. */
  moves: L | null;
  /** A single celebratory line, or null. */
  celebrate: L | null;
  /** The season badge, or null in an ordinary week. */
  season: { badge: string; label: L } | null;
  /** The spoken label for the whole card. */
  a11y: L;
}

const l = (en: string, hi: string): L => ({ en, hi });

// Words that frame money as growth: not for someone whose loan payments are already a strain.
const GROWTH_EN = /\b(sips?|invest\w*|grow\w*|returns?|wealth|compound\w*|mutual funds?)\b/i;
const GROWTH_HI = /निवेश|SIP|बढ़|रिटर्न|दौलत|अमीर/;
const growthy = (t: L) => GROWTH_EN.test(t.en) || GROWTH_HI.test(t.hi);

const joinL = (parts: (L | null)[], sep: string): L => {
  const p = parts.filter((x): x is L => !!x);
  const bare = (t: string) => t.replace(/[.。।]+$/, '');            // a sentence that ends in a full stop would double it before the separator
  return { en: p.map(x => bare(x.en)).join(sep), hi: p.map(x => bare(x.hi)).join(sep) };
};

export function homeCard(s: HomeState, now: Date): HomeCard {
  const size = Math.max(1, s.size ?? HOME_EPISODE_SIZE);
  const finished = Math.max(0, Math.min(size, Math.floor(s.finished)));
  const season = seasonOf(now);
  const seasonOut = season ? { badge: season.badge, label: season.label } : null;

  const kind: HomeKind = finished >= size ? 'done'
    : finished > 0 ? 'mid'
    : !s.everDone && s.streak === 0 ? 'new'
    : s.resting && s.streak > 0 ? 'rest'
    : 'mid';

  const calmTitle = l('A calm minute for your money', 'आपके पैसों के लिए एक शांत मिनट');
  const title: L | null = kind === 'done' ? null : s.anchor ? (s.strain && growthy(s.anchor.title) ? calmTitle : s.anchor.title) : null;

  const plainReason = kind === 'new'
    ? l('Short lessons with Mitra the owl, about 30 seconds each.', 'मित्रा उल्लू के साथ छोटे पाठ, हर एक लगभग 30 सेकंड का।')
    : l('A short lesson picked for you today.', 'आज आपके लिए चुना गया एक छोटा पाठ।');
  let reason: L;
  if (kind === 'done') reason = l('That is today’s set. Come back tomorrow for the next.', 'आज का सेट पूरा हुआ। अगला कल देखें।');
  else if (kind === 'rest') reason = l('A rest day is built in, so your streak is safe. Pick up whenever you like.', 'एक दिन का आराम पहले से जुड़ा है, इसलिए आपकी लय सुरक्षित है। जब मन हो, फिर शुरू करें।');
  else if (s.strain) reason = l('Calm and practical, picked for you today.', 'शांत और काम की बात, आज आपके लिए चुनी गई।');
  else reason = s.anchor?.reason ?? plainReason;

  const progress = kind === 'new' ? null : l(`${finished} of ${size} today`, `आज ${size} में से ${finished}`);

  const streak = s.streak <= 0 ? null
    : l(`${s.streak}-day streak`, `${s.streak} दिन की लय`);

  const ctaState = kind === 'done' ? 'done' : finished > 0 ? 'continue' : 'start';
  const cta = ctaState === 'done' ? l('Done for today', 'आज के लिए पूरा')
    : ctaState === 'continue' ? l('Continue', 'जारी रखें')
    : l('Start', 'शुरू करें');

  const moves = s.pledges > 0
    ? l(`${s.pledges} ${s.pledges === 1 ? 'move' : 'moves'} on your list`, `आपकी सूची में ${s.pledges} काम`)
    : null;

  const celebrate = s.celebrate && !(s.strain && s.celebrate.growth)
    ? l(`🎉 ${s.celebrate.title.en}`, `🎉 ${s.celebrate.title.hi}`)
    : null;

  const heading = kind === 'done' ? l('Money reels', 'मनी रील्स') : l('Today’s reel', 'आज की रील');
  const a11y = joinL([
    heading, title, kind === 'done' ? null : reason, progress, streak, cta, season ? season.label : null,
  ], '. ');

  return { kind, heading, title, reason, progress, streak, cta, ctaState, moves, celebrate, season: seasonOut, a11y };
}
