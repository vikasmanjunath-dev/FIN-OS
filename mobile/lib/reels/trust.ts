// The trust ribbon: for a reel that quotes figures, the formula behind them, what was assumed, and when this note was last checked.
// It is shown on demand ("How this is worked out") so no number in a reel has to be taken on faith. Entries sit apart from the scripts so
// a reel can be added or reworded without touching them; a test checks every entry points at a real reel and reads cleanly in both languages.
import type { L } from '@/lib/reels/types';

export interface Trust {
  /** How the figure is worked out, in words and symbols. */
  formula: L;
  /** What was assumed or chosen for the example, including that it is not a promise. */
  assumes: L;
  /** When this note was last checked against the reel's figures, YYYY-MM-DD. */
  asOf: string;
  /** What to show instead of `assumes` when the reel was rebuilt from the person's own figures. */
  assumesMine?: L;
}

const l = (en: string, hi: string): L => ({ en, hi });
const ASOF = '2026-10-19';

const SIP: L = l('Future value of a monthly SIP = monthly amount × ((1 + i)^n − 1) ÷ i, where i is the yearly rate ÷ 12 and n is the number of months. Each deposit is made at the end of the month.', 'मासिक SIP की भविष्य की क़ीमत = मासिक रकम × ((1 + i)^n − 1) ÷ i, जहाँ i सालाना दर ÷ 12 और n महीनों की संख्या है। हर जमा महीने के अंत में मानी गई है।');
const EMI: L = l('EMI = P × r × (1 + r)^n ÷ ((1 + r)^n − 1), where P is the loan, r is the yearly rate ÷ 12 and n is the number of months. Interest in a month = balance × r.', 'EMI = P × r × (1 + r)^n ÷ ((1 + r)^n − 1), जहाँ P लोन, r सालाना दर ÷ 12 और n महीनों की संख्या है। एक महीने का ब्याज = बकाया × r।');
const INFL: L = l('Buying power later = amount today ÷ (1 + inflation)^years.', 'आगे की ख़रीदने की ताक़त = आज की रकम ÷ (1 + महँगाई)^साल।');

export const TRUST: Record<string, Trust> = {
  'start-early': { formula: SIP, assumes: l('₹5,000 a month, 12% a year (an assumption, not a promise), no fees or tax, for 30 years against 20 years.', '₹5,000 हर महीने, 12% सालाना (अनुमान, वादा नहीं), कोई शुल्क या टैक्स नहीं, 30 साल बनाम 20 साल।'), asOf: ASOF },
  'guess-sip': { formula: SIP, assumes: l('₹5,000 a month for 30 years at an assumed 12% a year, no fees or tax. Real returns go up and down.', '₹5,000 हर महीने, 30 साल, अनुमानित 12% सालाना, कोई शुल्क या टैक्स नहीं। असली रिटर्न ऊपर-नीचे होते हैं।'), asOf: ASOF },
  'delay-cost': { formula: SIP, assumes: l('₹10,000 a month over a 30-year horizon at an assumed 12% a year, no fees or tax. “Waiting” removes the first years of deposits. Illustration only.', '₹10,000 हर महीने, 30 साल का समय, अनुमानित 12% सालाना, कोई शुल्क या टैक्स नहीं। “इंतज़ार” से शुरू के साल की जमा हट जाती है। सिर्फ़ उदाहरण।'), asOf: ASOF },
  'inflation': { formula: INFL, assumes: l('An assumed 6% a year for 10 years. Real inflation changes from year to year and differs by what you buy.', '10 साल तक अनुमानित 6% सालाना। असली महँगाई हर साल बदलती है और चीज़ों के हिसाब से अलग होती है।'), asOf: ASOF },
  'inflation-slide': { formula: INFL, assumes: l('₹1,00,000 and an assumed 6% a year for 0 to 30 years. Real inflation changes from year to year.', '₹1,00,000 और अनुमानित 6% सालाना, 0 से 30 साल। असली महँगाई हर साल बदलती है।'), asOf: ASOF },
  'emi-trap': { formula: EMI, assumes: l('₹10 lakh at 9% a year for 20 years, a fixed rate and equal monthly payments. Your lender’s terms may differ.', '₹10 लाख, 9% सालाना, 20 साल, तय दर और बराबर मासिक किस्तें। आपके बैंक की शर्तें अलग हो सकती हैं।'), asOf: ASOF },
  'guess-emi': { formula: l('EMI as in the EMI trap. Total paid = EMI × number of months. Interest = total paid − loan.', 'EMI वही जो “EMI का जाल” में है। कुल भुगतान = EMI × महीनों की संख्या। ब्याज = कुल भुगतान − लोन।'), assumes: l('₹10 lakh at 9% a year for 20 years, a fixed rate, no fees or prepayment.', '₹10 लाख, 9% सालाना, 20 साल, तय दर, कोई शुल्क या प्रीपेमेंट नहीं।'), asOf: ASOF },
  'rbi-and-emi': { formula: EMI, assumes: l('₹30 lakh over 20 years, comparing 8.5% with 9% a year. The gap shown is the difference between the two EMIs.', '₹30 लाख, 20 साल, 8.5% और 9% सालाना की तुलना। दिखाया गया फ़र्क़ दोनों EMI का अंतर है।'), asOf: ASOF },
  'mf-units-nav': { formula: l('Units = amount invested ÷ NAV on that day.', 'यूनिट = लगाई रकम ÷ उस दिन का NAV।'), assumes: l('₹1,000 at a NAV of ₹50, before any charges. NAV changes every day.', '₹1,000 और NAV ₹50, किसी शुल्क से पहले। NAV रोज़ बदलता है।'), asOf: ASOF },
  'direct-vs-regular': { formula: l('The SIP formula, using the yearly return after the plan’s yearly cost: return after cost = gross return − cost.', 'SIP का सूत्र, प्लान के सालाना ख़र्च के बाद के रिटर्न पर: ख़र्च के बाद रिटर्न = कुल रिटर्न − ख़र्च।'), assumes: l('₹10,000 a month for 15 years, 12% gross, with a cost of 1.5% (regular) against 0.5% (direct). These are examples; real costs differ by fund.', '₹10,000 हर महीने, 15 साल, 12% कुल रिटर्न, ख़र्च 1.5% (रेगुलर) बनाम 0.5% (डायरेक्ट)। ये उदाहरण हैं; असली ख़र्च फ़ंड के हिसाब से अलग होता है।'), asOf: ASOF },
  'rule-of-72': { formula: l('Years to double ≈ 72 ÷ yearly rate (%).', 'दोगुना होने के साल ≈ 72 ÷ सालाना दर (%)।'), assumes: l('A rule of thumb, closest for rates of about 6% to 10%. It does not predict any real investment.', 'अँगूठे का नियम, लगभग 6% से 10% की दरों पर सबसे सटीक। यह किसी असली निवेश की भविष्यवाणी नहीं है।'), asOf: ASOF },
  'hundred-minus-age': { formula: l('Share in equity (%) = 100 − age. The rest goes to safer assets.', 'इक्विटी का हिस्सा (%) = 100 − उम्र। बाक़ी सुरक्षित निवेश में।'), assumes: l('A common rule of thumb, not a plan. People adjust it for goals and comfort with risk.', 'आम अँगूठे का नियम, कोई योजना नहीं। लोग इसे लक्ष्य और जोखिम सहने की क्षमता के हिसाब से बदलते हैं।'), asOf: ASOF },
};

const MINE_SIP: L = l('Your own monthly SIP from this app, an assumed 12% a year (not a promise), no fees or tax. The rate and years are the ones shown in the reel.', 'इस ऐप में दर्ज आपकी अपनी मासिक SIP, अनुमानित 12% सालाना (वादा नहीं), कोई शुल्क या टैक्स नहीं। दर और साल वही हैं जो रील में दिखे।');
const MINE_LOAN: L = l('Your own loan balance, rate and EMI from this app, with the rate held fixed and equal monthly payments. Your lender’s terms may differ.', 'इस ऐप में दर्ज आपके लोन की बकाया रकम, दर और EMI, दर तय मानकर और बराबर मासिक किस्तों के साथ। आपके बैंक की शर्तें अलग हो सकती हैं।');
const MINE_ASSUMES: Record<string, L> = { 'start-early': MINE_SIP, 'guess-sip': MINE_SIP, 'delay-cost': MINE_SIP, 'emi-trap': MINE_LOAN, 'guess-emi': MINE_LOAN };

/** The note for a reel. For a reel built from the person's own figures the assumptions line says so instead of quoting the example's numbers. */
const GOAL_SIP: L = l('Monthly amount = goal × i ÷ ((1 + i)^n − 1), where i is the yearly rate ÷ 12 and n is the number of months. Each deposit is made at the end of the month.', 'मासिक रकम = लक्ष्य × i ÷ ((1 + i)^n − 1), जहाँ i सालाना दर ÷ 12 और n महीनों की संख्या है। हर जमा महीने के अंत में मानी गई है।');
const CORPUS: L = l('Months the corpus lasts = −ln(1 − C × r ÷ W) ÷ ln(1 + r), where C is the corpus, W the monthly withdrawal and r the yearly rate ÷ 12. If W is no more than C × r the corpus is never used up.', 'कोष कितने महीने चलता है = −ln(1 − C × r ÷ W) ÷ ln(1 + r), जहाँ C कोष, W मासिक निकासी और r सालाना दर ÷ 12 है। अगर W, C × r से ज़्यादा नहीं है तो कोष कभी ख़त्म नहीं होता।');
TRUST['emi-rate-slide'] = { formula: EMI, assumes: l('₹30 lakh over 20 years, with the rate changed on the slider (a fixed rate for the whole loan). Fees and insurance are not included.', '₹30 लाख, 20 साल, स्लाइडर पर बदली दर (पूरे लोन के लिए तय)। शुल्क और बीमा शामिल नहीं।'), asOf: ASOF };
TRUST['goal-sip-slide'] = { formula: GOAL_SIP, assumes: l('A ₹10 lakh goal at an assumed 12% a year, no fees or tax. Real growth varies.', '₹10 लाख का लक्ष्य, अनुमानित 12% सालाना, कोई शुल्क या टैक्स नहीं। असली बढ़त बदलती है।'), asOf: ASOF };
TRUST['corpus-spend-slide'] = { formula: CORPUS, assumes: l('A ₹1 crore corpus at an assumed 7% a year, no tax, a steady withdrawal. A poor early year can change the result a lot.', '₹1 करोड़ का कोष, अनुमानित 7% सालाना, कोई टैक्स नहीं, एक-सी निकासी। शुरू का एक बुरा साल नतीजा काफ़ी बदल सकता है।'), asOf: ASOF };

export function trustFor(id: string, mine = false): Trust | null {
  const t = TRUST[id];
  if (!t) return null;
  return mine ? { ...t, assumes: t.assumesMine ?? MINE_ASSUMES[id] ?? l('Your own figures from this app, worked out with the formula above. They stay on this phone.', 'इस ऐप में दर्ज आपके अपने आँकड़े, ऊपर के सूत्र से। वे इसी फ़ोन पर रहते हैं।') } : t;
}
