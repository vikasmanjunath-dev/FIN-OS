// Versions of three reels built from the person's own figures (lib/reels/mine.ts): their SIP, their loan, their monthly spending and
// emergency fund. The picture and the story are the same as the example reel; only the numbers are theirs, computed by figures.ts.
// A reel with no usable figures keeps its example. The quiz and the "why" never contain a personal figure, so a shared lesson is the same for everyone.
import { fill, money, sipFutureValue } from '@/lib/reels/figures';
import type { Mine } from '@/lib/reels/mine';
import type { L, Reel, Scene } from '@/lib/reels/types';

const t = (en: string, hi: string): L => ({ en, hi });
const pct = (n: number) => String(Math.round(n * 100) / 100);

const SIP_RATE = 12;

function startEarlyFor(base: Reel, sip: number): Reel {
  const a = sipFutureValue(sip, SIP_RATE, 30), b = sipFutureValue(sip, SIP_RATE, 20);
  const paidA = sip * 12 * 30, paidB = sip * 12 * 20;
  const growth = Array.from({ length: 31 }, (_, y) => sipFutureValue(sip, SIP_RATE, y)).map(v => v / a);
  const scenes: Scene[] = [
    { ms: 3400, mood: 'surprised', big: t(`${money(sip).en} a month`, `${money(sip).hi} हर महीने`), say: t('Your monthly SIP. The result depends a lot on how long you keep it going.', 'आपकी मासिक SIP। नतीजा इस पर बहुत निर्भर है कि आप उसे कितने समय चलाते हैं।'), prop: { kind: 'coins', count: 5 } },
    { ms: 3800, mood: 'think', say: t('Two paths: keep going for 30 years, or start ten years later and go for 20.', 'दो रास्ते: 30 साल चलाएँ, या दस साल बाद शुरू करके 20 साल चलाएँ।'),
      prop: { kind: 'steps', items: [t('Path A: 30 years', 'रास्ता A: 30 साल'), t('Path B: 20 years', 'रास्ता B: 20 साल')] } },
    { ms: 4200, mood: 'happy', say: fill(t('You put in {a} on path A and {b} on path B.', 'रास्ता A में आप {a} लगाते हैं और रास्ता B में {b}।'), { a: money(paidA), b: money(paidB) }),
      prop: { kind: 'bars', items: [{ label: t('Path A', 'रास्ता A'), value: paidA, text: money(paidA), tone: 'cyan' }, { label: t('Path B', 'रास्ता B'), value: paidB, text: money(paidB), tone: 'gold' }] } },
    { ms: 5200, mood: 'surprised', say: fill(t('At an assumed {rate}% a year, path A ends near {a}. Path B, near {b}.', 'मान लें हर साल {rate}% रिटर्न: रास्ता A में लगभग {a}, रास्ता B में लगभग {b}।'), { rate: SIP_RATE, a: money(a), b: money(b) }),
      prop: { kind: 'bars', items: [{ label: t('Path A', 'रास्ता A'), value: a, text: money(a), tone: 'teal' }, { label: t('Path B', 'रास्ता B'), value: b, text: money(b), tone: 'gold' }] } },
    { ms: 4000, mood: 'think', say: t('Time did the heavy lifting: ten extra years of compounding.', 'भारी काम समय ने किया: 10 साल ज़्यादा चक्रवृद्धि।'), prop: { kind: 'line', points: growth, tone: 'teal', label: t('Path A over 30 years (illustration)', '30 साल में रास्ता A (उदाहरण)') } },
    base.scenes[5], base.scenes[6],
  ];
  const q = base.quiz;
  return { ...base, mine: true, scenes, quiz: { ...q, q: t('In this example, why does path A end up with more?', 'इस उदाहरण में रास्ता A के पास ज़्यादा पैसा क्यों होता है?') } };
}

function emiTrapFor(base: Reel, loan: NonNullable<Mine['loan']>): Reel {
  const interest = (loan.balance * loan.rate) / 1200, principal = loan.emi - interest, share = Math.round((interest / loan.emi) * 100);
  const scenes: Scene[] = [
    { ms: 3400, mood: 'worry', big: t('Your EMI', 'आपकी EMI'), say: t('', '') },
    { ms: 4400, mood: 'think', say: fill(t('You owe {b} at {r}%. Your EMI is {e} a month.', 'आप पर {b} बाक़ी है, {r}% ब्याज पर। आपकी EMI {e} महीना है।'), { b: money(loan.balance), r: pct(loan.rate), e: money(loan.emi) }),
      prop: { kind: 'counter', from: 0, to: loan.emi, format: 'inr', tone: 'cyan', label: t('your EMI per month', 'आपकी हर महीने की EMI') } },
    { ms: 5000, mood: 'surprised', say: fill(t('In your next EMI, about {i} is interest and {pr} reduces the loan.', 'आपकी अगली EMI में लगभग {i} ब्याज है और {pr} लोन घटाता है।'), { i: money(interest), pr: money(principal) }),
      prop: { kind: 'donut', parts: [{ value: interest, label: t('Interest', 'ब्याज'), tone: 'red' }, { value: principal, label: t('Reduces loan', 'लोन घटाता है'), tone: 'teal' }], centre: t(`${share}% interest`, `${share}% ब्याज`) } },
    base.scenes[3], base.scenes[4], base.scenes[5],
  ];
  // The loan's name is spoken in the language of the caption, so the Hindi caption gets the Hindi name.
  scenes[0] = { ...scenes[0], say: t(`Your ${loan.label.en}: how much of each EMI really reduces what you owe?`, `आपका ${loan.label.hi}: हर EMI का कितना हिस्सा सच में बकाया घटाता है?`) };
  return { ...base, mine: true, scenes };
}

function emergencyFor(base: Reel, spend: number, fund?: number): Reel {
  const lo = spend * 3, hi = spend * 6;
  const scenes: Scene[] = [
    base.scenes[0], base.scenes[1],
    { ms: 4800, mood: 'happy', say: fill(t('You spend about {s} a month, so a common guide of 3 to 6 months is {lo} to {hi}.', 'आप महीने में लगभग {s} ख़र्च करते हैं, तो 3 से 6 महीने का आम सुझाव {lo} से {hi} बनता है।'), { s: money(spend), lo: money(lo), hi: money(hi) }),
      prop: { kind: 'shield', text: t('3 to 6 months', '3 से 6 महीने'), sub: t('of your expenses', 'आपके ख़र्च के') } },
  ];
  if (fund) {
    const months = fund / spend;
    const enTxt = months >= 6 ? 'more than 6 months of your spending' : `about ${pct(Math.round(months * 10) / 10)} months of your spending`;
    const hiTxt = months >= 6 ? 'आपके ख़र्च के 6 महीने से ज़्यादा' : `आपके ख़र्च के लगभग ${pct(Math.round(months * 10) / 10)} महीने`;
    scenes.push({ ms: 5000, mood: months >= 3 ? 'cheer' : 'think', say: t(`You have ${money(fund).en} set aside: ${enTxt}.`, `आपने ${money(fund).hi} अलग रखा है: ${hiTxt}।`),
      prop: { kind: 'bars', items: [{ label: t('You have', 'आपके पास'), value: fund, text: money(fund), tone: 'cyan' }, { label: t('3 months', '3 महीने'), value: lo, text: money(lo), tone: 'gold' }, { label: t('6 months', '6 महीने'), value: hi, text: money(hi), tone: 'teal' }] } });
  }
  scenes.push(base.scenes[3], base.scenes[4]);
  return { ...base, mine: true, scenes };
}

/** The library with each personalisable reel rebuilt from `mine` when the figures for it are there. Order and ids are unchanged. */
export function personaliseReels(base: Reel[], mine: Mine): Reel[] {
  return base.map(r => {
    if (r.id === 'start-early' && mine.sip) return startEarlyFor(r, mine.sip);
    if (r.id === 'emi-trap' && mine.loan) return emiTrapFor(r, mine.loan);
    if (r.id === 'emergency-fund' && mine.spend) return emergencyFor(r, mine.spend, mine.fund);
    return r;
  });
}
