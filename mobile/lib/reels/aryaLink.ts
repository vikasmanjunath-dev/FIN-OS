// The bridge between Arya (the assistant) and the money reels, in both directions, with nothing leaving the phone.
//
//   Arya -> reel: `reelFor` looks at a question the person asked Arya and, only when one reel clearly explains it, returns that reel so the
//   answer can carry one small "Watch a 30-second reel on this" chip. Precision over recall: no reel is better than a wrong reel. It is silent for
//   anything the guardrails refuse or flag, for advice questions, for a named stock, fund or company, for questions about the person's own figures
//   (Arya's phone tools answer those), and for a reel the person has already watched or marked known.
//   Reel -> Arya: `aryaRoute` / `parseAryaParams` / `aryaPrefill` carry a reel to the Arya screen. Only a reel id (checked against the library) and
//   a yes/no flag travel in the route; the figures are looked up again on the receiving side. Nothing about the person is in a route.
//
// Pure (no storage, no network, no clock), so every rule is tested with made-up people. Education, not advice.
import { apply as applyGuardrails, REFUSAL } from '@/lib/aryaGuardrails';
import { isAdviceRequest, matchIntent, symbolIn, type Intent } from '@/lib/aryaIntent';
import { contextBase, type Base } from '@/lib/reels/ask';
import type { Watched } from '@/lib/reels/journey';
import { LIBRARY } from '@/lib/reels/library';
import { metaOf } from '@/lib/reels/meta';
import { TOPIC_LIST, type ReelsProfile } from '@/lib/reels/reelsProfile';
import type { Signals } from '@/lib/reels/signals';
import { activeTriggers } from '@/lib/reels/triggers';
import type { L, Reel, Topic } from '@/lib/reels/types';

/** What can be asked about: a sentence the person typed, a topic, or an intent Arya already worked out (with the sentence, when there is one). */
export type ReelQuery = string | { topic: string } | { intent: Intent; text?: string };

export interface ReelContext {
  /** The reels the person has watched. Optional: without it only "marked known" is excluded. */
  watched?: Watched;
  /** Arya's answer, when it exists, so a reply the guardrails flagged never gets a chip. */
  answer?: string;
}

const l = (en: string, hi: string): L => ({ en, hi });

/** The chip text. */
export const CHIP_LABEL: L = l('Watch a 30-second reel on this', 'इस पर 30 सेकंड की रील देखें');
/** The row in the reel's Ask sheet that opens Arya. */
export const ASK_ARYA_LABEL: L = l('Ask Arya more', 'Arya से और पूछें');
export const ASK_ARYA_HINT: L = l('Opens Arya with this reel’s example numbers in the message box. Nothing is sent until you press send.', 'Arya खुलेगी, संदेश-बॉक्स में इस रील के उदाहरण वाले आँकड़ों के साथ। जब तक आप भेजें नहीं दबाते, कुछ नहीं भेजा जाता।');
export const USE_MY_NUMBERS_LABEL: L = l('Ask Arya with my numbers', 'अपने आँकड़ों के साथ Arya से पूछें');
export const USE_MY_NUMBERS_HINT: L = l('Puts the figures you entered in this app into the message box, read on this phone. They go to Arya only if you press send, and then online if Arya is set to answer online.', 'इस ऐप में डाले आपके आँकड़े संदेश-बॉक्स में भर जाएँगे, फ़ोन पर ही पढ़े जाते हैं। वे Arya तक तभी जाते हैं जब आप भेजें दबाएँ, और अगर Arya ऑनलाइन जवाब देने पर सेट है तो ऑनलाइन।');
/** Said on the Arya screen when it opens from a reel. */
export const PREFILL_NOTE: L = l('Filled in from the reel. Change it if you like, then send.', 'रील से भरा गया है। चाहें तो बदलें, फिर भेजें।');
export const PREFILL_NOTE_MINE: L = l('Filled in from the reel with your own numbers, read on this phone. Change or clear it if you like. Pressing send shares it with Arya, online if Arya is set that way.', 'रील से, आपके अपने आँकड़ों के साथ भरा गया है, जो फ़ोन पर ही पढ़े गए। चाहें तो बदलें या मिटा दें। भेजें दबाने पर यह Arya तक जाएगा, और अगर Arya ऑनलाइन पर सेट है तो ऑनलाइन।');

// ── what is safe to suggest ──────────────────────────────────────────────────────────────────────────────────────

const ID = /^[a-z0-9-]{1,40}$/;
const byId = (id: string): Reel | undefined => LIBRARY.find(r => r.id === id);
const GENERIC_CAPS = new Set(['ULIP', 'CIBIL', 'OTP', 'CVV', 'QR', 'NSC', 'SCSS', 'SGB', 'BNPL', 'VPF', 'ELSS', 'CTC', 'ITR', 'TDS', 'GST', 'PAN', 'UPI', 'NAV', 'SIP', 'EMI', 'FD', 'RD', 'PPF', 'NPS', 'EPF', 'HRA', 'ETF', 'IPO', 'KYC', 'LTCG', 'STCG', 'RBI', 'SEBI', 'AMFI', 'SIM', 'GDP', 'CPI', 'ROI', 'CAGR', 'IRR', 'XIRR', 'AUM', 'TER', 'CAS', 'NFO', 'FPI', 'FII', 'DII', 'MCLR', 'HUF', 'NRI', 'OCI', 'ESOP', 'RSU', 'NRE', 'NRO', 'DTAA', 'USA', 'NSE', 'BSE', 'SMS', 'ATM', 'PIN', 'AI', 'FY']);   // ideas and forms; a company such as ITC or an insurer such as LIC is a product and is not listed
/** A company, bank, broker or fund house by name: a question about it is about a product, not an idea a reel can teach. */
const BRAND = /\b(hdfc|icici|sbi|axis|kotak|nippon|mirae|parag parikh|ppfas|quant|uti|lic|tata|bajaj|aditya birla|dsp|franklin|motilal|edelweiss|invesco|hsbc|canara|whiteoak|bandhan|navi|zerodha|groww|upstox|paytm|phonepe|angel one|reliance|adani|infosys|wipro|zomato|swiggy|yes bank|indusind|idfc|pnb|jeevan|flexi ?cap|bluechip|blue chip)\b|एचडीएफसी|आईसीआईसीआई|एसबीआई|एलआईसी|रिलायंस|अडानी|पेटीएम|ज़ेरोधा|ग्रो\b|टाटा/i;

/** True when the text names a particular stock, fund, company or product. */
export function namesAProduct(text: string): boolean {
  const caps = String(text ?? '').match(/\b[A-Z][A-Z0-9&-]{1,14}\b/g) ?? [];
  const shouting = !/[a-z]/.test(String(text ?? ''));           // a question typed in capitals names nothing in particular
  if (!shouting && caps.some(c => !GENERIC_CAPS.has(c) && c !== 'I' && !/^\d+$/.test(c) && c.length >= 3 && c === c.toUpperCase() && !/^(THE|AND|FOR|WHAT|HOW|WHY|IS|ARE|DO|CAN|MY)$/.test(c))) return true;
  const sym = symbolIn(shouting ? String(text ?? '').toLowerCase() : text);
  if (sym && !GENERIC_CAPS.has(sym)) return true;
  return BRAND.test(text);
}

const SCAMMY = /\b(scam|scams|scammer|fraud|fraudster|phishing|cheat|cheated|fake|spam|suspicious|otp|cvv|upi pin|hacked|digital arrest|lottery|lucky draw|telegram|whatsapp group|guaranteed|assured returns?)\b|ठग|धोखा|धोखाधड़ी|फ्रॉड|स्कैम|ओटीपी|फर्जी|नकली|डिजिटल अरेस्ट/i;
export const isScamTalk = (text: string): boolean => SCAMMY.test(text);

// ── the table: which words mean which reel ───────────────────────────────────────────────────────────────────────

/** Devanagari has no \b: a term counts when no other Devanagari letter touches it. */
const dv = (...terms: string[]) => `(?<![\\u0900-\\u097F])(?:${terms.join('|')})(?![\\u0900-\\u097F])`;

interface Entry {
  /** Words that mean this idea (English, Hinglish and Hindi), tested on the lower-cased question. */
  re: RegExp;
  /** Reels that explain it, best fit first. Reels in one inner list fit about equally: the playable one is preferred, then one that is timely. */
  tiers: string[][];
  /** Two ideas that overlap (tax saving and ELSS): matching both is fine. Different groups in a "versus" question are ambiguous and get no chip. */
  group: string;
  /** This entry is the answer to a comparison ("EPF or PPF") and wins over the entries for the single ideas. */
  compare?: boolean;
}

const E = (group: string, re: RegExp, ...tiers: string[][]): Entry => ({ group, re, tiers });
const C = (group: string, re: RegExp, ...tiers: string[][]): Entry => ({ group, re, tiers, compare: true });

/** Most specific first: the first entry that matches decides. */
const TABLE: Entry[] = [
  // scams: every entry needs words about being cheated, so a plain question never lands on a scam reel
  E('digital-arrest', /digital arrest|arrest.{0,30}(video call|whatsapp|cbi|police)|(cbi|police|customs|narcotics).{0,40}(video call|parcel|arrest)/, ['digital-arrest']),
  E('digital-arrest', new RegExp(dv('डिजिटल अरेस्ट')), ['digital-arrest']),
  E('otp', /\botp\b.{0,40}(share|give|tell|asked|asks|ask|caller|stranger|scam|fraud|safe|someone|forward)|(share|give|tell|asked|asks|ask|forward).{0,40}\botp\b|\bcvv\b|upi pin.{0,30}(share|receive|get money)/, ['otp-never-share']),
  E('otp', new RegExp(`${dv('ओटीपी')}.{0,30}(${dv('शेयर', 'बता', 'बताना', 'माँग', 'मांग', 'फ्रॉड', 'ठग', 'सुरक्षित')})`), ['otp-never-share']),
  E('upi-scam', /(receive|get|getting|receiving).{0,15}money.{0,25}(pin|scan)|collect request|upi.{0,25}(scam|fraud|cheat)|(scam|fraud|cheat).{0,25}upi|request money.{0,20}(pin|accept)/, ['upi-collect-scam', 'myths-upi']),
  E('qr-scam', /qr( code)?.{0,25}(scan|scam|fraud|receive|pay)|scan.{0,15}qr/, ['qr-code-scam']),
  E('kyc-scam', /kyc.{0,40}(expire|expired|expiring|update|updat|link|sms|message|block|suspend|call|asked)|(sms|message|link|call).{0,30}kyc/, ['spot-kyc-sms', 'fake-kyc-links']),
  E('kyc-scam', new RegExp(`${dv('केवाईसी')}.{0,30}(${dv('अपडेट', 'एक्सपायर', 'लिंक', 'मैसेज', 'ब्लॉक', 'कॉल')})`), ['spot-kyc-sms', 'fake-kyc-links']),
  E('pan-scam', /pan.{0,30}(deactivat|block|suspend|expire|update.{0,10}(link|sms|message))/, ['spot-pan-update']),
  E('care-scam', /(customer care|helpline|support) number.{0,30}(google|search|fake|fraud|scam|online)|(google|searched).{0,25}(customer care|helpline)/, ['fake-customer-care']),
  E('invest-scam', /(telegram|whatsapp|group|tipster|influencer).{0,40}(tip|profit|invest|trading|stock|return)|(?=.*\b(whatsapp|telegram|group|message|sms|offer(ing|ed)?|promis\w*|someone|stranger|agent|influencer|tipster|caller)\b).*(guaranteed|assured|sure[- ]?shot)\b.{0,25}(return|profit|tip)|ponzi|(send|pay).{0,15}(one|1).{0,15}(get|receive).{0,10}(two|2)|crypto.{0,20}(double|multiply)/, ['spot-invest-group', 'investment-scam', 'spot-crypto-double'], ['myths-scams']),
  E('job-scam', /(task|telegram|whatsapp|youtube|like).{0,30}(job|earn|pay|income)|(job|earn|income|pay).{0,45}(task|telegram|whatsapp)|earn.{0,10}from home.{0,30}(scam|fraud|fake|task|advance|fee)/, ['fake-job-task-scam', 'spot-job-whatsapp']),
  E('loan-app', /(instant|quick|loan|lending|digital) app.{0,40}(harass|threat|contacts|photos|fraud|scam|red flag|safe|trust|blackmail)|loan app/, ['spot-loan-app', 'loan-app-red-flags']),
  E('family-call', /(papa|mummy|mom|dad|son|daughter|relative|friend).{0,30}(in trouble|accident|arrested|hospital).{0,30}(money|urgent|number|call)|(new|unknown) number.{0,30}(papa|mummy|mom|dad|son|daughter|friend|family)/, ['spot-new-number-family', 'family-emergency-call']),
  E('parcel-scam', /(parcel|courier|delivery|package).{0,40}(fee|charge|held|stuck|customs|pay)/, ['spot-parcel-fee', 'fake-delivery-fee']),
  E('sim-swap', /sim.{0,6}swap|sim.{0,20}(suddenly|no signal|lost signal|stopped working|blocked)|no (network|signal).{0,25}(suddenly|otp)/, ['sim-swap-signs']),
  E('lottery', /lottery|lucky draw|won a prize|prize money|kbc/, ['spot-lottery-win']),
  E('reward-scam', /reward points?.{0,25}(expire|expiring|redeem|claim|link)/, ['spot-reward-points']),
  E('electricity-scam', /(electricity|power).{0,25}(bill|cut|disconnect).{0,30}(sms|message|call|link|pay now)/, ['spot-electricity-sms']),
  E('refund-scam', /refund.{0,25}(call|link|anydesk|teamviewer|screen share)|(anydesk|teamviewer|screen share)/, ['spot-refund-call']),
  E('bank-manager', /bank (manager|officer|executive).{0,30}(call|called|asking|asked)|(call|called).{0,20}(from|saying).{0,15}(my )?bank/, ['spot-bank-manager-call']),
  E('scam', new RegExp(`\\b(scam|scams|scammer|fraud|fraudster|phishing|cheated|spam (call|message|sms)|fake (call|message|sms|link|website|app)|suspicious (call|message|link|sms))\\b|${dv('ठग', 'ठगी', 'धोखाधड़ी', 'फ्रॉड', 'स्कैम', 'फर्जी')}`), ['myths-scams'], ['phone-safety-checklist']),

  // basics
  E('inflation', new RegExp(`\\b(inflation|mehngai|mehangai|price rise|cost of living)\\b|${dv('महंगाई', 'मंहगाई', 'महँगाई')}`), ['inflation-slide', 'inflation', 'slide-rent-power']),
  E('salary', new RegExp(`salary slip|pay ?slip|\\bctc\\b|in[- ]hand|take[- ]home|gross (vs|and|or) net|${dv('सैलरी स्लिप', 'पे स्लिप', 'इन-हैंड')}`), ['salary-slip-decoded']),
  E('cash-flow', /cash ?flow/, ['cash-flow']),
  E('pay-first', /pay yourself first/, ['pay-yourself-first']),
  E('creep', /lifestyle (creep|inflation)|every (raise|hike).{0,25}(spent|gone|vanish)|(raise|hike).{0,25}(spent|spend it all)/, ['lifestyle-creep'], ['path-first-raise']),
  E('needs-wants', new RegExp(`needs?.{0,12}wants?|50[/-]30[/-]20|\\bzaroorat\\b|${dv('ज़रूरत', 'जरूरत')}.{0,12}${dv('चाह', 'शौक', 'इच्छा')}`), ['sort-needs-wants', 'needs-wants-wealth']),
  E('first-salary', /(first|1st) (salary|paycheck|pay check|job)/, ['order-first-salary']),
  E('budget', new RegExp(`\\b(make|making|build|build(ing)?|create|plan(ning)?|set up|keep|track)\\b.{0,12}\\b(a |my )?(monthly )?(budget|expenses)\\b|how to budget|budgeting|${dv('बजट')}.{0,12}${dv('बनाना', 'बनाएँ', 'बनाएं', 'कैसे')}`), ['sort-needs-wants', 'needs-wants-wealth']),
  E('save-money', /(how|ways?) (to|can i|do i) save (more )?money|\bbachat\b.{0,20}(kaise|tips|karein|kare|karna)|saving habit|save (more )?(every|each) month/, ['pay-yourself-first', 'needs-wants-wealth'], ['myths-saving']),
  E('save-money', new RegExp(`${dv('बचत')}.{0,15}${dv('कैसे', 'आदत')}|${dv('पैसे')}.{0,10}${dv('बचाने', 'बचाएँ', 'बचाएं')}`), ['pay-yourself-first', 'needs-wants-wealth']),

  // emergency and protection
  E('emergency', new RegExp(`emergency (fund|corpus|money|savings|cushion)|rainy[- ]day|${dv('इमरजेंसी फंड', 'इमरजेंसी फ़ंड', 'इमरजेंसी फण्ड', 'आपातकालीन निधि')}`), ['where-keep-fund']),   // refined below by the question
  E('nominee', new RegExp(`\\bnominee|\\bnomination\\b|${dv('नॉमिनी', 'नामांकित')}`), ['nominee-basics']),
  E('term-ulip', /\bulip\b|term (plan|insurance|cover).{0,20}(vs|or|versus|better)|(vs|or|versus).{0,12}term (plan|insurance)/, ['term-vs-ulip']),
  E('insurance-claim', /claim.{0,25}(health|hospital|mediclaim|insurance|cashless)|(health|hospital|mediclaim|insurance|cashless).{0,25}claim/, ['order-claim-steps', 'insurance-claim-steps']),
  E('health-parents', new RegExp(`(health|medical|mediclaim).{0,25}(parents?|mother|father|in-laws?)|(parents?|mother|father).{0,25}(health|medical|mediclaim)|${dv('माता-पिता', 'मम्मी-पापा', 'माँ-बाप')}.{0,20}${dv('स्वास्थ्य', 'हेल्थ')}`), ['parents-health-cover']),
  E('top-up', /super top[- ]?up|top[- ]?up (cover|plan|policy)/, ['super-top-up']),
  E('health', new RegExp(`health (insurance|cover|policy|plan)|mediclaim|${dv('हेल्थ इंश्योरेंस', 'स्वास्थ्य बीमा', 'हेल्थ बीमा', 'मेडिक्लेम')}`), ['health-cover-gotchas'], ['guess-medical-20y']),
  E('life-cover', new RegExp(`(life|term) (cover|insurance|plan).{0,25}(how much|enough|amount|need)|how much.{0,15}(life|term) (cover|insurance)|${dv('टर्म')}.{0,12}${dv('इंश्योरेंस', 'बीमा')}.{0,15}${dv('कितना')}`), ['life-cover']),
  E('insurance', new RegExp(`\\binsurance\\b|\\bbima\\b|\\bbeema\\b|${dv('बीमा', 'इंश्योरेंस')}`), ['insurance-basics'], ['myths-insurance'], ['sort-protect-or-grow']),

  // loans and credit
  E('no-cost-emi', /no[- ]cost emi|zero[- ]cost emi|0% emi/, ['no-cost-emi']),
  E('bnpl', /\bbnpl\b|buy now,? pay later|pay later/, ['bnpl-late-fees']),
  E('card', new RegExp(`minimum (due|payment|amount)|min(imum)? due|credit card.{0,25}(interest|bill|dues|unpaid|late|revolv)|card (interest|dues|bill).{0,15}(unpaid|late|minimum)|${dv('मिनिमम ड्यू', 'क्रेडिट कार्ड')}.{0,20}${dv('ब्याज', 'बिल')}`), ['guess-card-dues', 'slide-card-wait', 'card-interest-trap'], ['path-card-bill']),
  E('utilisation', /utili[sz]ation|credit limit.{0,25}(use|using|percent|%|ratio)/, ['credit-utilisation']),
  E('credit-report', /credit report/, ['credit-report-read']),
  E('enquiries', /(enquir|inquir|hard pull|many loan applications|multiple loan applications)/, ['credit-enquiries']),
  E('credit-score', new RegExp(`credit score|cibil|credit rating|${dv('क्रेडिट स्कोर', 'सिबिल')}`), ['credit-score-basics'], ['myths-credit-score']),
  E('prepay', /prepay|part[- ]?payment|foreclos|pre-pay/, ['prepay-vs-invest', 'home-loan-prepay']),
  E('floating', /floating.{0,12}(vs|or|versus|and|rate)|fixed rate.{0,12}(vs|or|versus|loan)|(floating|fixed) (interest )?rate/, ['floating-vs-fixed']),
  E('emi-rate', new RegExp(`(repo rate|rbi|rate (hike|cut|change)|interest rate (goes|rises|rise|increase|falls|changes)).{0,40}\\b(emi|loan)\\b|\\b(emi|loan)\\b.{0,40}(repo rate|rbi|rate (hike|cut|change))|${dv('रेपो रेट', 'आरबीआई')}.{0,25}${dv('ईएमआई', 'लोन')}`), ['emi-rate-slide', 'rbi-and-emi']),
  E('home-loan-tax', /home loan.{0,30}(tax|80c|24\(?b\)?|deduction|interest deduction)|section 24/, ['home-loan-tax-benefit']),
  E('loan-tenure', /loan (tenure|term)|tenure.{0,20}(loan|emi)|20 years? or 30|longer (loan|tenure)|(15|20|25|30) ?years? (home )?loan/, ['slide-emi-tenure', 'home-loan-tenure']),
  E('afford', /(how (big|much|large)).{0,25}(home )?loan.{0,25}(afford|safe|take|eligible|can i get)|loan eligibility|home loan.{0,15}afford/, ['home-loan-affordability']),
  E('home-loan', new RegExp(`home loan|housing loan|mortgage|${dv('होम लोन', 'हाउसिंग लोन')}`), ['guess-home-interest', 'home-loan-costs', 'home-loan-affordability']),
  E('car', new RegExp(`car loan|vehicle loan|buying a car|car emi|${dv('कार लोन', 'गाड़ी का लोन')}`), ['slide-car-loan-rate', 'path-car-payment', 'car-buying-math']),
  E('good-debt', /good debt|bad debt/, ['good-bad-debt']),
  E('loan-myths', /loan myth/, ['myths-loans']),
  E('emi', new RegExp(`\\bemis?\\b|equated monthly|${dv('ईएमआई', 'ईएमआइ')}`), ['guess-emi', 'emi-trap']),

  // investing: comparisons first
  C('retire-compare', /\b(epf|ppf|nps|vpf)\b.{0,25}\b(vs|or|and|versus|better|compare)\b.{0,25}\b(epf|ppf|nps|vpf)\b|difference between (epf|ppf|nps).{0,10}(and|&)/, ['epf-ppf-nps-compare']),
  E('sip-lump', /sip.{0,20}(lump ?sum|vs|versus)|lump ?sum.{0,20}sip/, ['sip-vs-lumpsum']),
  E('sip-dip', /(market|sensex|nifty|stock market).{0,25}(fall|falls|falling|crash|crashes|down|dip|drop).{0,40}sip|sip.{0,40}(market|nifty|sensex).{0,20}(fall|falls|falling|crash|down|dip|drop)|sip.{0,25}(negative|loss|losing)/, ['market-dips-sip']),
  E('sip-stepup', /step[- ]?up|(increase|raise|hike|top[- ]?up).{0,12}(my )?sip|sip.{0,15}(increase|raise|hike|every year)/, ['guess-step-up', 'slide-step-up-rate', 'goal-step-up']),
  E('sip-myth', new RegExp(`sip.{0,20}(myth|true that|safe|risky|guaranteed|loss)|is sip (safe|risky|guaranteed)|${dv('एसआईपी', 'सिप')}.{0,25}${dv('जोखिम', 'सुरक्षित', 'रिस्क', 'गारंटी', 'नुकसान')}`), ['myths-sip']),
  E('sip-early', /(early|earlier|young|in (my )?(20s|twenties)|as soon as).{0,25}\bsip\b|\bsip\b.{0,25}(early|earlier|young)/, ['start-early', 'delay-cost', 'slide-start-late']),
  E('sip-late', new RegExp(`(late|delay|wait|waiting|too late|postpone|deri|der se).{0,30}\\bsip\\b|\\bsip\\b.{0,30}(late|delay|waiting|too late|postpone|deri\\b|der se)|${dv('देर')}.{0,25}${dv('एसआईपी', 'सिप')}|${dv('एसआईपी', 'सिप')}.{0,25}${dv('देर')}`), ['delay-cost', 'slide-start-late']),
  E('sip-start', /(start|begin|first|set up|open).{0,15}\b(a )?sip\b|\bsip\b.{0,15}(start|begin|first|set up)|sip kaise (shuru|start)/, ['first-sip-habit'], ['guess-small-sip']),
  E('sip', new RegExp(`\\bsips?\\b|systematic investment|${dv('एसआईपी', 'सिप', 'एस आई पी')}`), ['guess-sip', 'guess-small-sip', 'start-early', 'slide-sip-length']),
  E('direct-regular', /direct (plan|fund|mutual fund)|regular plan|expense ratio|distributor commission|trail commission/, ['direct-vs-regular'], ['guess-fee-gap']),
  E('risk-label', /riskometer|risk[- ]?o[- ]?meter|risk label|risk level of (a |the )?(mutual )?fund/, ['mf-risk-label']),
  E('index-fund', new RegExp(`index fund|nifty ?50 (index )?fund|${dv('इंडेक्स फंड', 'इंडेक्स फ़ंड')}`), ['index-fund-basics']),
  E('etf', /\betfs?\b|exchange traded fund/, ['etf-basics']),
  E('elss', /\belss\b/, ['elss-basics']),
  E('debt-fund', /debt (mutual )?funds?/, ['debt-funds-basics']),
  E('nav', /\bnav\b|net asset value|\bunits?\b.{0,20}(fund|mutual)|(fund|mutual).{0,20}\bunits?\b/, ['mf-units-nav']),
  E('mf', new RegExp(`mutual funds?|\\bmfs?\\b|${dv('म्यूचुअल फंड', 'म्यूचुअल फ़ंड', 'म्यूचुअल फण्ड')}`), ['mf-units-nav'], ['myths-mutual-funds'], ['mf-risk-label']),
  E('gold', new RegExp(`\\bgold\\b|\\bsovereign gold\\b|\\bsona\\b|${dv('सोना', 'सोने', 'गोल्ड')}`), ['gold-basics'], ['myths-gold']),
  E('rebalance', /rebalanc/, ['rebalancing']),
  E('diversify', new RegExp(`diversif|eggs in (one|a single) basket|all (my )?money in one|${dv('डाइवर्सिफ', 'अलग-अलग जगह')}`), ['diversification'], ['sort-risk-ladder']),
  E('rule72', new RegExp(`rule of 72|years? to double|money (to )?double|double my money|${dv('दोगुना', 'दुगुना', 'डबल')}`), ['rule-of-72']),
  E('compounding', new RegExp(`compound(ing)?|power of compounding|${dv('चक्रवृद्धि', 'कंपाउंडिंग', 'कंपाउंड')}`), ['rule-of-72'], ['start-early', 'guess-small-sip']),
  E('hundred-age', /100 minus (my )?age|hundred minus age|equity.{0,20}(percent|allocation|share).{0,10}age/, ['hundred-minus-age']),
  E('ipo', new RegExp(`\\bipos?\\b|initial public offering|${dv('आईपीओ')}`), ['ipo-basics']),
  E('demat', new RegExp(`\\bdemat\\b|\\bkyc\\b|${dv('डीमैट', 'केवाईसी')}`), ['demat-kyc-basics']),
  E('stock', new RegExp(`what (is|are) (a |an |the )?(share|stock)s?( market)?\\b|how (does|do) (the )?(share|stock)s?( market)? work|stock market (basics|work|kya)|share market (kya|work|basics)|how (do )?(shares?|stocks?) work|${dv('शेयर बाज़ार', 'शेयर बाजार', 'शेयर मार्केट', 'स्टॉक')}.{0,12}${dv('क्या', 'कैसे')}`), ['stock-basics']),
  E('fd-tax', /(fd|fixed deposit).{0,25}(tax|tds)|(tax|tds).{0,15}(fd|fixed deposit)/, ['fd-interest-tax']),
  E('fd-ladder', /(fd|fixed deposit).{0,10}ladder|ladder.{0,10}(fd|fixed deposit)/, ['fd-ladder']),
  E('fd', new RegExp(`\\bfds?\\b|fixed deposits?|${dv('एफडी', 'फिक्स्ड डिपॉज़िट', 'फिक्स्ड डिपॉजिट')}`), ['real-return-fd'], ['fd-ladder']),

  // tax
  E('tax-regime', new RegExp(`(old|new).{0,12}(tax )?regime|tax regime|which regime|regime.{0,12}(old|new)|${dv('रिजीम', 'रीजीम', 'टैक्स रेजीम')}`), ['tax-regimes', 'slide-tax-income'], ['sort-regime-items']),
  E('s80c', /\b80 ?c\b|section 80 ?c|80c limit/, ['section-80c']),
  E('s80d', /\b80 ?d\b|section 80 ?d|health premium.{0,15}(deduction|tax)/, ['section-80d']),
  E('hra', new RegExp(`\\bhra\\b|house rent allowance|rent receipts?|${dv('एचआरए')}`), ['hra-basics']),
  E('std-deduction', /standard deduction/, ['standard-deduction']),
  E('form16', /form[- ]?16\b/, ['form-16-decoded']),
  E('tds', new RegExp(`\\btds\\b|tax refund|refund.{0,15}(tax|itr|return)|${dv('टीडीएस')}`), ['tds-refund']),
  E('harvest', /tax[- ]loss harvest|harvest(ing)? (a )?loss|set ?off.{0,15}(loss|gain)|loss.{0,25}(offset|reduce|cut).{0,15}(gain|tax)/, ['tax-loss-harvesting']),
  E('cap-gains', new RegExp(`capital gains?|\\bltcg\\b|\\bstcg\\b|${dv('कैपिटल गेन', 'कैपिटल गेन्स')}`), ['capital-gains']),
  E('tax-proofs', /tax proofs?|proofs? (to|for) (submit|claim|give)|investment proofs?/, ['tax-proofs-checklist']),
  E('tax-dates', new RegExp(`(tax|itr|return|advance tax).{0,20}(due date|last date|deadline|dates?)|(due date|last date|deadline).{0,20}(tax|itr|return)|advance tax|${dv('अंतिम तारीख', 'अंतिम तिथि', 'आख़िरी तारीख')}.{0,15}${dv('आईटीआर', 'रिटर्न', 'टैक्स')}`), ['tax-dates']),
  E('itr-form', /which (itr|form)|itr[- ]?[1-4]\b/, ['itr-which-form']),
  E('itr', new RegExp(`\\bitr\\b|income tax return|(file|filing|fill).{0,10}(my )?(tax |income tax )?return|${dv('आईटीआर')}|${dv('रिटर्न')}.{0,10}${dv('भर', 'भरना', 'भरें')}`), ['order-itr-steps', 'itr-filing-steps']),
  E('tax-myths', /tax.{0,12}myths?|myths?.{0,12}tax/, ['myths-tax']),
  E('tax-save', new RegExp(`(save|saving|reduce|lower|cut) (income )?tax|tax[- ]saving|tax planning|${dv('टैक्स')}.{0,10}${dv('बचा', 'बचत', 'बचाने', 'बचाएँ')}|${dv('कर बचत')}`), ['tax-regimes', 'section-80c']),

  // retirement
  E('annuity', new RegExp(`annuit|${dv('एन्युटी', 'एनुइटी')}`), ['annuity-basics']),
  E('withdrawal', /withdrawal rate|safe withdrawal|4% rule|how long (will|does|can) (my )?(corpus|savings|retirement (money|fund)) last|swp/, ['withdrawal-rate', 'corpus-spend-slide', 'slide-corpus-small']),
  E('retire-buckets', /bucket strateg|retirement bucket|three buckets/, ['retirement-buckets']),
  E('retire-health', /(healthcare|medical|health) (costs?|expenses?|cover).{0,20}(retire|old age|senior)|(retire|old age|senior).{0,25}(healthcare|medical|health)/, ['healthcare-in-retirement']),
  E('retire-myths', /retire(ment)? myths?|myths?.{0,12}retire/, ['myths-retirement']),
  E('nps', new RegExp(`\\bnps\\b|national pension|${dv('एनपीएस')}`), ['nps-basics']),
  E('ppf', new RegExp(`\\bppf\\b|public provident|${dv('पीपीएफ')}`), ['ppf-basics', 'guess-ppf-15']),
  E('epf', new RegExp(`\\bepf\\b|\\bepfo\\b|employees'? provident|${dv('ईपीएफ')}`), ['epf-basics']),
  E('retire', new RegExp(`retire(ment)?|\\bpension\\b|${dv('रिटायरमेंट', 'रिटायर', 'पेंशन')}`), ['corpus-spend-slide', 'retire-corpus'], ['retire-number-steps']),

  // goals
  E('goal-sip', new RegExp(`(how much|monthly|per month|every month|kitna).{0,25}(goal|target).{0,25}(sip|invest|save|monthly)|work(ing)? backwards? from (a |my )?goal|goal.{0,20}(sip|monthly amount)|${dv('लक्ष्य')}.{0,20}${dv('एसआईपी', 'हर महीने', 'मासिक')}`), ['goal-sip-slide', 'goal-sip-needed', 'slide-goal-years']),
  E('goal-inflation', /goal.{0,25}inflation|inflation.{0,25}goal/, ['goal-inflation']),
  E('goal-priority', /which goal first|prioriti[sz]e (my )?goals|goal priorit/, ['goal-priority']),
  E('goal-time', /short[- ]term.{0,20}long[- ]term|time horizon|match.{0,15}(money|investment).{0,15}(time|goal)|money i need in (1|2|3|one|two|three) years?/, ['goal-time-buckets', 'path-two-year-goal']),
  E('child-edu', new RegExp(`(child|kid|son|daughter)'?s?.{0,12}(education|college|studies)|education (fund|goal)|${dv('बच्चों की पढ़ाई', 'बच्चे की पढ़ाई', 'बच्चे की शिक्षा')}`), ['child-education-fund']),
  E('wedding', /wedding (fund|saving|budget|expenses|cost)|saving for (a |my |the )?wedding/, ['wedding-fund']),
  E('downpayment', /down ?payment|saving for (a |my |the |our )?(first )?(home|house|flat)/, ['first-home-downpayment']),
  E('sabbatical', /sabbatical|career break/, ['sabbatical-fund']),
  E('irregular', new RegExp(`irregular (income|salary)|variable (income|salary)|freelanc|${dv('अनियमित आय')}`), ['irregular-income-buffer']),
  E('sinking', /sinking fund|yearly (shock|expenses)|annual expenses.{0,15}(plan|save)/, ['sinking-funds']),
  E('windfall', new RegExp(`\\bbonus\\b|windfall|inheritance|lump ?sum (received|arrives)|${dv('बोनस')}`), ['choose-bonus', 'windfall-plan']),
  E('yearly-review', /yearly (goal )?(check|review)|annual (goal )?review/, ['yearly-goal-review']),
];

/** Every reel id the table can suggest. A test holds it to the library, so a renamed or removed reel cannot leave a dead suggestion. */
export const LINKED_IDS: string[] = Array.from(new Set(TABLE.flatMap(e => e.tiers.flat()).concat(['where-keep-fund', 'emergency-target', 'order-emergency-steps', 'emergency-fund', 'sort-emergency-or-not'])));

/** Words for the emergency fund idea that choose between its reels. */
const EMERGENCY_HOW_MUCH = new RegExp(`how (much|many)|target|what number|enough|${dv('कितना', 'कितने', 'कितनी')}`);
const EMERGENCY_WHERE = new RegExp(`\\bwhere\\b|which (account|instrument)|park (it|my|the)|${dv('कहाँ', 'कहां', 'कहीं')}`);

const COMPARE = /\b(vs|versus|or|better than|difference between|compare|comparison|ya|या)\b/;

/** Reels that are played with a finger or a guess in the middle. They teach by doing, so they come first among reels that fit equally. */
const playable = (r: Reel): boolean => !!r.poke;

// ── choosing ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** True when the question is one the chip must never answer, whatever it is about. */
function refused(text: string, intent: Intent): boolean {
  if (!text.trim()) return true;
  const g = applyGuardrails(text, '');
  if (g.blocked || g.flags.length > 0) return true;                 // evasion and forgery are refused; an advice question gets Arya's soft note, not a chip
  if (isAdviceRequest(text) || intent.kind === 'advice') return true;
  if (namesAProduct(text)) return true;
  return false;
}

/** True when Arya's own reply was flagged by the guardrails or is the refusal text. */
function answerFlagged(question: string, answer: string | undefined): boolean {
  if (!answer) return false;
  if (answer.includes(REFUSAL.slice(0, 40))) return true;            // Arya's refusal of an illegal request
  const g = applyGuardrails(question, answer);
  return g.blocked || g.flags.length > 0;
}

/** The first reel in the tiers that this person can be shown, or null. */
function choose(tiers: string[][], signals: Signals, profile: ReelsProfile, watched: Watched, scamOk: boolean): Reel | null {
  const triggers = activeTriggers(signals);
  for (const tier of tiers) {
    const options: { reel: Reel; score: number }[] = [];
    tier.forEach((id, i) => {
      const reel = byId(id);
      if (!reel) return;                                              // not in the library (a draft not yet live): skip
      const meta = metaOf(id);
      if (watched[id] || profile.known.includes(id)) return;          // already seen or known
      if (signals.strain && meta.growth) return;                      // never "put in more" to someone under money strain
      if (reel.topic === 'safety' && !scamOk) return;                 // a scam reel only for a question about being cheated
      const timely = (meta.triggers ?? []).some(t => triggers.has(t)) ? 1 : 0;
      const need = signals.weakest ? (meta.needs[signals.weakest] ?? 0) : 0;
      options.push({ reel, score: (playable(reel) ? 10 : 0) + timely * 3 + need * 2 - i * 0.01 });
    });
    if (options.length) return options.sort((a, b) => b.score - a.score)[0].reel;
  }
  return null;
}

/** Tiers for the emergency fund idea, chosen by what is asked. */
function emergencyTiers(text: string): string[][] {
  if (EMERGENCY_WHERE.test(text)) return [['where-keep-fund']];
  if (EMERGENCY_HOW_MUCH.test(text)) return [['emergency-target'], ['order-emergency-steps', 'emergency-fund']];
  return [['emergency-fund'], ['sort-emergency-or-not', 'order-emergency-steps']];
}

/**
 * The reel that best explains a question, or null. `query` is the sentence the person typed, a topic, or an intent Arya already worked out.
 * Rules, in order: a refused, advice or product question gets nothing; a question about the person's own figures or a calculator gets nothing
 * (Arya's phone tools answer it); a "this versus that" question about two different ideas gets nothing; then the table picks the best reel the
 * person has not watched or marked known, playable first, never a "put in more" reel under money strain and never a scam reel for a question
 * that is not about being cheated. Pure and deterministic.
 */
export function reelFor(query: ReelQuery, signals: Signals, profile: ReelsProfile, ctx: ReelContext = {}): Reel | null {
  const watched = ctx.watched ?? {};

  // A topic: the entry-level reel of that topic. Only the nine known topics; anything else is "I do not know this one".
  if (typeof query === 'object' && 'topic' in query) {
    const topic = query.topic;
    if (typeof topic !== 'string' || !(TOPIC_LIST as string[]).includes(topic)) return null;
    const pool = LIBRARY.filter(r => r.topic === (topic as Topic) && metaOf(r.id).level === 'concept');
    return choose([pool.map(r => r.id)], signals, profile, watched, topic === 'safety');
  }

  let text: string, intent: Intent;
  if (typeof query === 'string') { text = query; intent = matchIntent(query); }
  else { text = query.text ?? ''; intent = query.intent; if (!text) return null; }
  text = String(text).slice(0, 500);
  if (refused(text, intent)) return null;
  if (answerFlagged(text, ctx.answer)) return null;
  if (intent.kind === 'tool' || intent.kind === 'ambiguous') return null;   // a number or a record was asked for

  const t = text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
  const hits = TABLE.filter(e => e.re.test(t));
  if (!hits.length) return null;
  const first = hits[0];
  const groups = new Set(hits.map(h => h.group));
  if (!first.compare && groups.size > 1 && COMPARE.test(t)) return null;   // "SIP or FD?": two ideas, no single reel

  const tiers = first.group === 'emergency' ? emergencyTiers(t) : first.tiers;
  return choose(tiers, signals, profile, watched, isScamTalk(t) || first.group.includes('scam') || SCAM_GROUPS.has(first.group));
}

const SCAM_GROUPS = new Set(['digital-arrest', 'otp', 'upi-scam', 'qr-scam', 'kyc-scam', 'pan-scam', 'care-scam', 'invest-scam', 'job-scam', 'loan-app', 'family-call', 'parcel-scam', 'sim-swap', 'lottery', 'reward-scam', 'electricity-scam', 'refund-scam', 'bank-manager', 'scam']);

// ── Arya -> reel ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The route the chip opens. Only a library id can be in it. */
export function reelRoute(id: string): string | null {
  return ID.test(id) && byId(id) ? `/learn/reels?id=${id}` : null;
}

/** The chip's text for a language, and a longer spoken label that names the reel. */
export function chipLabels(reel: Reel, lang: 'en' | 'hi'): { text: string; a11y: string } {
  return { text: CHIP_LABEL[lang], a11y: `${CHIP_LABEL[lang]}: ${reel.title[lang]}` };
}

// ── reel -> Arya ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What goes in the route from a reel to the Arya screen, and nothing else:
 *   reel  the id of a library reel (letters, digits and hyphens, at most 40 characters, and it must exist)
 *   mine  "1" only when the person tapped "Ask Arya with my numbers" on a reel built from their own figures; absent otherwise
 * No figure, name, amount or text is ever a route parameter. The screen works out the topic and the example from the reel id itself, and reads
 * the person's own figures from this phone only when `mine` is "1".
 */
export interface AryaParams { reel: string; mine?: '1' }

/** The reels whose example has figures the person's own can replace (see contextBase in ask.ts). */
export const MINE_REELS: string[] = ['start-early', 'guess-sip', 'emi-trap', 'guess-emi'];

/** The Arya route for a reel. `useMine` is honoured only for a reel that has figures of the person's own. */
export function aryaRoute(reelId: string, useMine = false): string | null {
  if (!ID.test(reelId) || !byId(reelId)) return null;
  const mine = useMine && MINE_REELS.includes(reelId);
  return `/(tabs)/arya?reel=${reelId}${mine ? '&mine=1' : ''}`;
}

/** Reads route parameters back, trusting nothing: an unknown id, a repeated value, extra text or a stray `mine` gives null (or drops the flag). */
export function parseAryaParams(raw: Record<string, unknown> | null | undefined): { reel: Reel; mine: boolean } | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.reel, flag = raw.mine;
  if (typeof id !== 'string' || !ID.test(id)) return null;
  const reel = byId(id);
  if (!reel) return null;
  const mine = flag === '1' && MINE_REELS.includes(id);
  return { reel, mine };
}

/** Whole rupees in the Indian way, for the prefilled question. */
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** The reel's example as a sentence the Arya screen can read: "SIP of ₹5,000 at 12% for 30 years". Null for a reel with no calculator in it. */
export function exampleSentence(base: Base | null): string | null {
  if (!base) return null;
  const yrs = Number.isInteger(base.years) ? base.years : Math.round(base.years * 10) / 10;
  if (base.tool === 'sip_calc') return `SIP of ${inr(base.amount)} a month at ${base.rate}% for ${yrs} years`;
  if (base.tool === 'emi_calc') return `EMI on ${inr(base.amount)} at ${base.rate}% for ${yrs} years`;
  return `inflation of ${base.rate}% for ${yrs} years on ${inr(base.amount)}`;
}

/**
 * The question the Arya screen starts with (the person can edit it before sending). Built from the reel's title and, if the reel has one, its
 * EXAMPLE figures. When `mine` is true and the reel has figures of the person's own, those are used instead, read on this phone by the caller.
 */
export function aryaPrefill(reel: Reel, lang: 'en' | 'hi', mineBase: Base | null = null): string {
  const base = mineBase ?? contextBase({ ...reel, mine: false }, {});
  const ex = exampleSentence(base);
  const title = reel.title[lang];
  if (lang === 'hi') return ex ? `मैंने रील “${title}” देखी। उदाहरण: ${ex}. इसे और समझाइए।` : `मैंने रील “${title}” देखी। इसे और समझाइए।`;
  return ex ? `I watched the reel “${title}”. Example: ${ex}. Can you explain it more?` : `I watched the reel “${title}”. Can you explain it more?`;
}
