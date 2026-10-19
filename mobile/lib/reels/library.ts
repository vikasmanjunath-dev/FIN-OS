// The whole reel library the app plays: the main reels plus the playable ones. content.ts, content-tax.ts and content-life.ts hold the
// lessons; content-play.ts holds the reels with a guess, a slider or myth cards in the middle. The feed, Home card and share text read from here.
import { REELS } from '@/lib/reels/content';
import { PLAY_REELS } from '@/lib/reels/content-play';
import { ACT_MORE } from '@/lib/reels/act-more';
import { ACT, type Act } from '@/lib/reels/journey';
import type { L, Reel } from '@/lib/reels/types';

const l = (en: string, hi: string): L => ({ en, hi });

export const LIBRARY: Reel[] = [...REELS, ...PLAY_REELS];
export const libraryById = (id: string): Reel | undefined => LIBRARY.find(r => r.id === id);

/** The tool each playable reel opens. A scam reel points at no tool, as for the other scam reels: the lesson is what to refuse. */
export const PLAY_ACT: Record<string, Act> = {
  'guess-sip': { href: '/tools/calc/sip', label: l('Try the SIP calculator with your numbers', 'अपने आँकड़ों से SIP कैलकुलेटर आज़माएँ') },
  'guess-emi': { href: '/tools/prepay', label: l('See what prepaying would save you', 'देखें प्रीपेमेंट से कितनी बचत होगी') },
  'delay-cost': { href: '/tools/calc/sip', label: l('See what starting now is worth for you', 'देखें आज शुरू करना आपके लिए कितना मायने रखता है') },
  'inflation-slide': { href: '/tools/calc/inflationimpact', label: l('See what your expenses will cost later', 'देखें आपका ख़र्च आगे कितना होगा') },
  'choose-bonus': { href: '/tools/windfall', label: l('Plan what to do with your own windfall', 'अपनी रकम का हिसाब लगाएँ और योजना बनाएँ') },
  'sort-needs-wants': { href: '/tracker/budget', label: l('Sort your own spending', 'अपना ख़र्च ख़ुद छाँटें') },
  'order-first-salary': { href: '/tools/score', label: l('See where your money stands', 'देखें आपका पैसा कहाँ खड़ा है') },
  'emi-rate-slide': { href: '/tools/homeloan', label: l('Check your own loan', 'अपना लोन जाँचें') },
  'goal-sip-slide': { href: '/tools/goalopt', label: l('Work out your own goal', 'अपना लक्ष्य निकालें') },
  'corpus-spend-slide': { href: '/tools/retirement', label: l('Check your retirement plan', 'अपनी रिटायरमेंट योजना जाँचें') },
  'myths-money': { href: '/tools/leak', label: l('Find where your money leaks', 'देखें आपका पैसा कहाँ बहता है') },
};
export const ACT_ALL: Record<string, Act> = { ...ACT, ...PLAY_ACT, ...ACT_MORE };
