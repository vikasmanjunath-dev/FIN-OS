// Story series: five to eight reels with one person's story and one end move. A series only orders existing reels and adds a line that
// frames each in the story, so it costs a few lines of data and every reel still stands on its own. Pure functions of the data and the watched record.
import { DRAFT_IDS } from '@/lib/reels/drafts';
import { isLive } from '@/lib/reels/review';
import type { L } from '@/lib/reels/types';

const l = (en: string, hi: string): L => ({ en, hi });

export interface Episode { reel: string; /** What is happening in the story when this episode starts. */ intro: L }
export interface Series {
  id: string;
  icon: string;
  title: L;
  /** The person the story follows. The reels themselves do not name them; the series screen does. */
  cast: { name: string; line: L };
  premise: L;
  episodes: Episode[];
  endMove: { text: L; href: string };
  /** Calendar months (1-12) when this series is timely. Absent means always on. */
  months?: number[];
}

const BASE_SERIES: Series[] = [
  {
    id: 'first-salary', icon: '🎓', title: l('First Salary', 'पहली सैलरी'),
    cast: { name: 'Aarav', line: l('22, just got his first job offer', '22 साल का, पहली नौकरी का ऑफ़र मिला है') },
    premise: l('From offer letter to a budget, a safety cushion and a first SIP.', 'ऑफ़र लेटर से बजट, सुरक्षा-गद्दी और पहली SIP तक।'),
    episodes: [
      { reel: 'salary-slip-decoded', intro: l('Aarav’s offer says ₹12 lakh. What will actually reach his account?', 'आरव के ऑफ़र में ₹12 लाख लिखा है। उसके खाते में असल में कितना आएगा?') },
      { reel: 'needs-wants-wealth', intro: l('Salary day. Where should each rupee go?', 'सैलरी का दिन। हर रुपया कहाँ जाए?') },
      { reel: 'cash-flow', intro: l('A friend earns more than Aarav, yet is always broke. Why?', 'एक दोस्त आरव से ज़्यादा कमाता है, फिर भी हमेशा तंग रहता है। क्यों?') },
      { reel: 'emergency-fund', intro: l('His phone breaks and rent is due. Aarav wishes he had a cushion.', 'फ़ोन टूटा और किराया बाक़ी है। आरव को गद्दी की कमी खलती है।') },
      { reel: 'pay-yourself-first', intro: l('He tries something new: saving before spending.', 'वह कुछ नया आज़माता है: ख़र्च से पहले बचत।') },
      { reel: 'first-sip-habit', intro: l('Aarav sets up his first SIP.', 'आरव अपनी पहली SIP शुरू करता है।') },
    ],
    endMove: { text: l('Set a budget and start a first SIP', 'बजट बनाएँ और पहली SIP शुरू करें'), href: '/tracker/budget' },
  },
  {
    id: 'safety-net-30', icon: '🛟', title: l('Safety Net in 30 Days', '30 दिन में सुरक्षा-जाल'),
    cast: { name: 'Meera', line: l('32, a single earner for her family', '32 साल की, परिवार की इकलौती कमाने वाली') },
    premise: l('Build an emergency fund target and the cover that protects it.', 'आपातकालीन फ़ंड का लक्ष्य और उसे बचाने वाला कवर बनाएँ।'),
    episodes: [
      { reel: 'emergency-fund', intro: l('Meera’s colleague loses a job overnight. She starts to wonder.', 'मीरा की सहकर्मी की नौकरी रातों-रात चली जाती है। मीरा सोचने लगती है।') },
      { reel: 'emergency-target', intro: l('How much is “enough”? Meera lists what she must pay each month.', '“काफ़ी” कितना है? मीरा हर महीने के अनिवार्य ख़र्च गिनती है।') },
      { reel: 'where-keep-fund', intro: l('Where should the money sit so it is safe and ready?', 'पैसा कहाँ रहे कि सुरक्षित भी हो और तैयार भी?') },
      { reel: 'health-cover-gotchas', intro: l('A hospital bill is the other way to lose a fund. She reads her policy.', 'अस्पताल का बिल फ़ंड गँवाने का दूसरा रास्ता है। वह अपनी पॉलिसी पढ़ती है।') },
      { reel: 'insurance-basics', intro: l('What is insurance really for?', 'बीमा असल में किसलिए है?') },
      { reel: 'life-cover', intro: l('Her family depends on her income. How much cover is right?', 'परिवार उसकी आय पर निर्भर है। कितना कवर ठीक है?') },
      { reel: 'sinking-funds', intro: l('Last step: yearly bills stop breaking her month.', 'आख़िरी क़दम: सालाना बिल अब उसका महीना नहीं बिगाड़ते।') },
    ],
    endMove: { text: l('Set your emergency fund target', 'अपना आपातकालीन फ़ंड लक्ष्य तय करें'), href: '/tracker/emergency' },
  },
  {
    id: 'scam-proof', icon: '🛡️', title: l('Scam-Proof', 'ठगी से सुरक्षित'),
    cast: { name: 'Imran', line: l('45, runs a small shop and uses UPI all day', '45 साल का, छोटी दुकान चलाता है और दिन भर UPI इस्तेमाल करता है') },
    premise: l('Seven tricks that take real money, and a five-minute phone check.', 'सात चालें जो असली पैसा ले जाती हैं, और पाँच मिनट की फ़ोन जाँच।'),
    episodes: [
      { reel: 'otp-never-share', intro: l('A “bank officer” calls Imran. He asks for an OTP.', 'एक “बैंक अफ़सर” इमरान को कॉल करता है। वह OTP माँगता है।') },
      { reel: 'upi-collect-scam', intro: l('A buyer says the money is sent. He just has to approve.', 'ख़रीदार कहता है पैसे भेज दिए। बस मंज़ूरी देनी है।') },
      { reel: 'qr-code-scam', intro: l('Another buyer sends a QR “to receive payment”.', 'एक और ख़रीदार “पेमेंट पाने के लिए” QR भेजता है।') },
      { reel: 'fake-kyc-links', intro: l('An SMS says his account will be blocked today.', 'एक SMS कहता है आज उसका खाता बंद हो जाएगा।') },
      { reel: 'digital-arrest', intro: l('A video call from “police” says he is in a case.', '“पुलिस” की वीडियो कॉल कहती है वह किसी केस में है।') },
      { reel: 'fake-customer-care', intro: l('A refund goes wrong and he googles the helpline.', 'रिफ़ंड गड़बड़ होता है और वह हेल्पलाइन गूगल करता है।') },
      { reel: 'phone-safety-checklist', intro: l('Imran decides to lock his phone down, once and for all.', 'इमरान तय करता है कि फ़ोन को एक बार में पक्का सुरक्षित करेगा।') },
    ],
    endMove: { text: l('Finish the phone safety check', 'फ़ोन सुरक्षा जाँच पूरी करें'), href: '/security' },
  },
  {
    id: 'tax-ready', icon: '🧾', title: l('Tax-Ready', 'टैक्स के लिए तैयार'),
    cast: { name: 'Kavya', line: l('29, salaried, files her return for the third time', '29 साल की, नौकरीपेशा, तीसरी बार रिटर्न भर रही है') },
    premise: l('Choose a regime, collect proofs and never miss a date.', 'रिजीम चुनें, प्रूफ़ जुटाएँ और कोई तारीख़ न चूकें।'),
    episodes: [
      { reel: 'tax-regimes', intro: l('Kavya’s employer asks: old regime or new?', 'कव्या का नियोक्ता पूछता है: पुराना रिजीम या नया?') },
      { reel: 'standard-deduction', intro: l('She finds a deduction that needs no bills.', 'उसे एक ऐसी कटौती मिलती है जिसमें बिल नहीं चाहिए।') },
      { reel: 'hra-basics', intro: l('She pays rent. How much of her HRA is tax-free?', 'वह किराया देती है। उसका HRA कितना टैक्स-मुक्त है?') },
      { reel: 'section-80c', intro: l('The old regime offers 80C. What counts?', 'पुराना रिजीम 80C देता है। क्या गिना जाता है?') },
      { reel: 'form-16-decoded', intro: l('Form 16 arrives. She learns to read it.', 'फ़ॉर्म 16 आता है। वह उसे पढ़ना सीखती है।') },
      { reel: 'tax-dates', intro: l('Last, the dates she must not miss.', 'आख़िर में, वे तारीख़ें जो उसे नहीं चूकनी।') },
    ],
    endMove: { text: l('Pick your regime and add the dates to your calendar', 'रिजीम चुनें और तारीख़ें कैलेंडर में जोड़ें'), href: '/tools/calendar' },
    months: [1, 2, 3, 6, 7, 8, 9],
  },
  {
    id: 'home-loan-zero', icon: '🏠', title: l('Home Loan from Zero', 'होम लोन, शून्य से'),
    cast: { name: 'Rohan', line: l('31, wants to buy his first flat', '31 साल का, पहला फ़्लैट ख़रीदना चाहता है') },
    premise: l('From “can I?” to a loan plan that fits his life.', '“क्या मैं ले सकता हूँ?” से अपनी ज़िंदगी में फ़िट होने वाली लोन योजना तक।'),
    episodes: [
      { reel: 'credit-score-basics', intro: l('Rohan’s bank will look at his credit score first.', 'रोहन का बैंक पहले उसका क्रेडिट स्कोर देखेगा।') },
      { reel: 'home-loan-affordability', intro: l('How big a loan is safe for his salary?', 'उसकी सैलरी पर कितना बड़ा लोन सुरक्षित है?') },
      { reel: 'home-loan-costs', intro: l('The flat is one price. The real cost is another.', 'फ़्लैट की एक क़ीमत है। असली लागत कुछ और।') },
      { reel: 'floating-vs-fixed', intro: l('The bank offers two types of rate.', 'बैंक दो तरह की दर देता है।') },
      { reel: 'rbi-and-emi', intro: l('The RBI changes its rate. What happens to his EMI?', 'RBI अपनी दर बदलता है। उसकी EMI का क्या होगा?') },
      { reel: 'home-loan-tenure', intro: l('Twenty years or thirty?', 'बीस साल या तीस?') },
      { reel: 'home-loan-prepay', intro: l('A bonus arrives. What would prepaying do?', 'बोनस आता है। प्रीपे करने से क्या होगा?') },
      { reel: 'prepay-vs-invest', intro: l('Or should the bonus be invested instead?', 'या बोनस को निवेश करना चाहिए?') },
    ],
    endMove: { text: l('Save your affordability and prepay plan', 'अपनी क्षमता और प्रीपे योजना सहेजें'), href: '/tools/homeloan' },
  },
  {
    id: 'retire-number', icon: '🏖️', title: l('Retire at Your Number', 'अपने नंबर पर रिटायर हों'),
    cast: { name: 'Devika', line: l('38, wants to stop working by 58', '38 साल की, 58 तक काम बंद करना चाहती है') },
    premise: l('Find the number, know the tools and make it last.', 'नंबर निकालें, साधन जानें और उसे टिकाऊ बनाएँ।'),
    episodes: [
      { reel: 'retire-corpus', intro: l('Devika asks: how much is enough?', 'देविका पूछती है: कितना काफ़ी है?') },
      { reel: 'epf-ppf-nps-compare', intro: l('She lists the tools she already has or could use.', 'वह गिनती है कि उसके पास कौन-से साधन हैं या हो सकते हैं।') },
      { reel: 'healthcare-in-retirement', intro: l('Medical costs, the cost she forgot.', 'इलाज का ख़र्च, जो वह भूल गई थी।') },
      { reel: 'annuity-basics', intro: l('Could an annuity give her a steady income?', 'क्या एन्युटी उसे स्थिर आय दे सकती है?') },
      { reel: 'withdrawal-rate', intro: l('And how fast can she safely spend it?', 'और वह कितनी तेज़ी से सुरक्षित ख़र्च कर सकती है?') },
      { reel: 'retire-number-steps', intro: l('Now she works out her own number.', 'अब वह अपना नंबर ख़ुद निकालती है।') },
    ],
    endMove: { text: l('Work out and save your retirement number', 'अपना रिटायरमेंट नंबर निकालें और सहेजें'), href: '/tools/retirement' },
  },
];


/** Draft series: built on draft reels, so each is shown only when every one of its episodes is live (signed off, or a review build). */
export const DRAFT_SERIES: Series[] = [
  {
    id: 'married-money', icon: '💞', title: l('Married and Money', 'शादी और पैसा'),
    cast: { name: 'Neel and Isha', line: l('newly married, with two incomes and two habits', 'नए शादीशुदा, दो आय और दो आदतों के साथ') },
    premise: l('From a first honest talk to one shared plan.', 'पहली ईमानदार बातचीत से एक साझा योजना तक।'),
    episodes: [
      { reel: 'couples-money-talk', intro: l('Neel and Isha sit down to talk about money for the first time.', 'नील और ईशा पहली बार पैसों पर बात करने बैठते हैं।') },
      { reel: 'sort-own-or-owe', intro: l('First, what does each of them own, and what do they owe?', 'पहले, दोनों के पास क्या है, और उन पर क्या बकाया है?') },
      { reel: 'sort-fixed-or-variable', intro: l('Then, which costs stay put and which move?', 'फिर, कौन-से ख़र्च टिके रहते हैं और कौन-से बदलते हैं?') },
      { reel: 'emergency-target', intro: l('They decide how big a shared cushion should be.', 'वे तय करते हैं कि साझा गद्दी कितनी बड़ी हो।') },
      { reel: 'life-cover', intro: l('Each depends on the other. How much cover is right?', 'दोनों एक-दूसरे पर निर्भर हैं। कितना कवर ठीक है?') },
      { reel: 'goal-priority', intro: l('And which goal comes first, together?', 'और साथ में कौन-सा लक्ष्य पहले?') },
    ],
    endMove: { text: l('Hold your first money date and set up a shared budget', 'पहली मनी डेट रखें और साझा बजट बनाएँ'), href: '/tracker/budget' },
  },
  {
    id: 'new-parent', icon: '🍼', title: l('New Parent', 'नए माता-पिता'),
    cast: { name: 'Sana', line: l('expecting her first child in a few months', 'कुछ महीनों में पहले बच्चे की उम्मीद') },
    premise: l('Get the money side ready before the baby arrives.', 'बच्चे के आने से पहले पैसों का पक्ष तैयार करें।'),
    episodes: [
      { reel: 'new-baby-costs', intro: l('Sana makes a list of what is coming.', 'सना आने वाले ख़र्चों की सूची बनाती है।') },
      { reel: 'health-cover-gotchas', intro: l('She reads her health policy for maternity terms.', 'वह अपनी हेल्थ पॉलिसी में मातृत्व की शर्तें पढ़ती है।') },
      { reel: 'life-cover', intro: l('Her family will depend on her income. Is the cover enough?', 'परिवार उसकी आय पर निर्भर होगा। क्या कवर काफ़ी है?') },
      { reel: 'nominee-basics', intro: l('She updates the names on every account.', 'वह हर खाते में नाम अपडेट करती है।') },
      { reel: 'goal-inflation', intro: l('She learns what a future fee will really cost.', 'वह जानती है कि भविष्य की फ़ीस असल में कितनी होगी।') },
      { reel: 'child-education-fund', intro: l('And she starts a fund for the years ahead.', 'और वह आगे के सालों के लिए फ़ंड शुरू करती है।') },
    ],
    endMove: { text: l('Start a child fund and update your nominees', 'बच्चे का फ़ंड शुरू करें और नॉमिनी अपडेट करें'), href: '/tracker/goals' },
  },
];

const episodeLive = (reel: string): boolean => !DRAFT_IDS.has(reel) || isLive(reel);
export const SERIES: Series[] = [...BASE_SERIES, ...DRAFT_SERIES.filter(sr => sr.episodes.every(e => episodeLive(e.reel)))];

export const seriesById = (id: string): Series | undefined => SERIES.find(s => s.id === id);

type Watched = Record<string, { at: string; correct: boolean }>;
export interface SeriesProgress { done: number; total: number; next: number | null; complete: boolean; right: number }

/** How far through a series the person is: finished episodes, the first one still to watch, and how many questions they got right. */
export function seriesProgress(s: Series, watched: Watched): SeriesProgress {
  let done = 0, right = 0, next: number | null = null;
  s.episodes.forEach((e, i) => { const w = watched[e.reel]; if (w) { done++; if (w.correct) right++; } else if (next === null) next = i; });
  return { done, total: s.episodes.length, next, complete: done === s.episodes.length, right };
}

/** Whether a series is timely now (always, unless it has months). */
export const inSeason = (s: Series, now: Date): boolean => !s.months || s.months.includes(now.getMonth() + 1);
