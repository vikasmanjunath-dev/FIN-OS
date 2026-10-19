// Money reels: short animated explainers drawn in code. A reel is DATA (scenes, captions in two languages, one quiz); the player turns the
// data into pictures. Nothing here is a video file, so a reel costs a few kilobytes, works offline, follows the app's language and text
// size, and a wrong number is fixed by editing one line.
import type { Lang } from '@/lib/i18nCore';
import type { CastId } from '@/lib/reels/cast';
export type { CastId };

/** Text in both app languages. Both are required: a reel never falls back to a language the person did not choose. */
export type L = Record<Lang, string>;

/** How Mitra the owl looks in a scene. */
export type Mood = 'happy' | 'think' | 'worry' | 'surprised' | 'cheer';

export type Tone = 'cyan' | 'teal' | 'gold' | 'purple' | 'red';

/** What is drawn beside Mitra. Every prop is a pure function of how far through its scene the reel is (0..1). */
export type Prop =
  | { kind: 'counter'; from: number; to: number; format: 'inr' | 'plain'; /** shown under a plain number, e.g. years or units */ unit?: L; label?: L; tone?: Tone }
  | { kind: 'bars'; items: { label: L; value: number; text: L; tone: Tone }[] }
  | { kind: 'line'; points: number[]; label?: L; tone?: Tone }
  | { kind: 'donut'; parts: { value: number; label: L; tone: Tone }[]; centre?: L }
  | { kind: 'coins'; count: number; label?: L }
  | { kind: 'shield'; text: L; sub?: L }
  | { kind: 'steps'; items: L[] };


export interface Scene {
  /** How long the scene stays on screen, in milliseconds. */
  ms: number;
  mood: Mood;
  /** The sentence on screen (and read aloud when sound is on). */
  say: L;
  /** A few big words above the picture. */
  big?: L;
  /** A cast member stands in the picture instead of Mitra. */
  who?: CastId;
  prop?: Prop;
}

export interface Quiz { q: L; options: L[]; answer: number; why: L }

/** The maths behind a what-if slider. The slider moves `x`; lib/reels/beats.ts turns it into a figure with the tested functions in figures.ts. */
export type SliderModel =
  | { kind: 'sip-years'; monthly: number; rate: number }                       // x = years invested
  | { kind: 'sip-delay'; monthly: number; rate: number; horizon: number }     // x = years you wait before starting, out of `horizon`
  | { kind: 'inflation-years'; amount: number; rate: number }                 // x = years from now
  | { kind: 'emi-rate'; principal: number; years: number; rate0: number }     // x = the loan's yearly rate (%); `rate0` is the reference rate
  | { kind: 'emi-tenure'; principal: number; rate: number }                   // x = tenure in years
  | { kind: 'goal-sip'; target: number; rate: number }                        // x = years to the goal; the figure is the monthly SIP it needs
  | { kind: 'step-up'; monthly: number; rate: number; years: number }         // x = how much the SIP goes up each year (%)
  | { kind: 'tax-income'; deduction: number }                                 // x = yearly gross income (₹): new regime tax against old regime tax with `deduction`
  | { kind: 'corpus-spend'; corpus: number; rate: number }                    // x = monthly withdrawal (₹); the figure is how many years the corpus lasts
  | { kind: 'card-interest'; balance: number; monthlyPct: number };           // x = months the balance is left unpaid

/** An interaction: the reel pauses and asks the viewer to do something, then goes on. At most one per reel, about 10 seconds. */
export type Beat =
  | { kind: 'guess'; q: L; min: number; max: number; answer: number; /** what the answer teaches, shown with the answer */ reveal: L }
  | { kind: 'slider'; q: L; label: L; unit: L; /** show the slider's own value as rupees (₹15 lakh) instead of a plain number */ xFormat?: 'plain' | 'inr'; min: number; max: number; step: number; start: number; model: SliderModel; takeaway: L }
  | { kind: 'myth'; q: L; cards: { s: L; fact: boolean; why: L }[] }
  /** A realistic message in pieces; the viewer taps the pieces that look suspicious. A piece with `flag` is a red flag, and `flag` says why. */
  | { kind: 'spot'; q: L; from: L; parts: { t: L; flag?: L }[]; /** what to do, shown after the reveal */ todo: L }
  /** A decision with no cost: the viewer picks what the person in the story does, and each path shows what it leads to. `clear` is true only when one path really is the better one for nearly everyone. */
  | { kind: 'path'; q: L; setup: L; options: { label: L; result: L }[]; verdict: L; clear?: boolean }
  /** Cards sorted one at a time into 2 or 3 bins (needs, wants, wealth...). Each card says which bin it belongs in and why. No penalty. */
  | { kind: 'sort'; q: L; bins: L[]; cards: { t: L; bin: number; why: L }[] }
  /** Items put in order by tapping them one after another. `items` are listed in the CORRECT order; the screen shows them shuffled. */
  | { kind: 'order'; q: L; items: { t: L; why: L }[] };

export interface Poke {
  /** The reel pauses after this scene (0-based) and plays on when the beat is done or skipped. */
  after: number;
  beat: Beat;
}

/** What a reel is about, for the topic chips on the feed. */
export type Topic = 'basics' | 'invest' | 'loans' | 'protect' | 'tax' | 'retire' | 'credit' | 'safety' | 'goals';

export interface Reel {
  id: string;
  topic: Topic;
  title: L;
  /** The lesson in Learn this reel is based on, when there is one. */
  lesson?: string;
  tags: string[];
  scenes: Scene[];
  quiz: Quiz;
  /** An optional interaction in the middle of the reel (guess, slider or myth cards). Reels without one play exactly as before. */
  poke?: Poke;
  /** True when the script was built from this person's own figures (see lib/reels/mine.ts); the player says so. */
  mine?: boolean;
}
