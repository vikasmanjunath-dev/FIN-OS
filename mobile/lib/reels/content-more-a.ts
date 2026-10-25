// Second wave, part A: basics and investing. Figures come from lib/reels/figures.ts and lib/taxcore.ts.
import { STD_NEW, taxNew } from '@/lib/taxcore';
import { averageCost, driftedShare, fill, lumpsumValue, money, pctOf, potLoss, realReturn, sipFutureValue, sipThenHold, taxAtSlab } from '@/lib/reels/figures';
import { lakhDec, sc, t } from '@/lib/reels/kit';
import type { Reel } from '@/lib/reels/types';

const pct1 = (n: number) => String(Math.round(n * 10) / 10);

// ── Basics ───────────────────────────────────────────────────────────────────────────────────────────────────────
const CTC_YEAR = 1_200_000, BASIC = CTC_YEAR * 0.4, PF = BASIC * 0.12, PT = 2_400;
const cutTax = taxNew(CTC_YEAR - PF - STD_NEW);
const inHandMonth = Math.round((CTC_YEAR - PF - PF - PT - cutTax) / 12), ctcMonth = CTC_YEAR / 12;
const salarySlip: Reel = {
  id: 'salary-slip-decoded', topic: 'basics', tags: ['salary', 'CTC', 'in-hand'],
  title: t('CTC is not what you take home', 'CTC वह नहीं जो हाथ में आता है'),
  scenes: [
    sc('surprised', t('An offer says ₹12 lakh a year. Your account will not get ₹1 lakh every month.', 'ऑफ़र में साल का ₹12 लाख लिखा है। आपके खाते में हर महीने ₹1 लाख नहीं आएगा।'), { big: t('CTC ≠ in-hand', 'CTC ≠ हाथ में') }),
    sc('think', t('CTC is the total cost to the company. It includes things you do not receive as cash each month.', 'CTC कंपनी का कुल ख़र्च है। इसमें वे चीज़ें भी हैं जो आपको हर महीने नक़द नहीं मिलतीं।'), { prop: { kind: 'steps', items: [t('Employer’s PF share', 'नियोक्ता का PF हिस्सा'), t('Gratuity, insurance', 'ग्रैच्युटी, बीमा'), t('Bonus, variable pay', 'बोनस, वेरिएबल पे')] } }),
    sc('happy', fill(t('Rough example: {c} a month CTC, with a basic of 40% and PF at 12% of basic, comes to about {h} in hand.', 'मोटा उदाहरण: {c} महीना CTC, बेसिक 40% और बेसिक का 12% PF हो, तो हाथ में लगभग {h} आता है।'), { c: money(ctcMonth), h: money(inHandMonth) }),
      { prop: { kind: 'bars', items: [{ label: t('CTC', 'CTC'), value: ctcMonth, text: money(ctcMonth), tone: 'gold' }, { label: t('In hand', 'हाथ में'), value: inHandMonth, text: money(inHandMonth), tone: 'teal' }] } }),
    sc('worry', t('Your payslip may differ: it depends on your pay structure, your tax regime and your state. Read yours.', 'आपकी पेस्लिप अलग हो सकती है: यह वेतन ढाँचे, टैक्स रिजीम और राज्य पर निर्भर है। अपनी पढ़ें।')),
    sc('cheer', t('Plan your rent, EMIs and savings on the in-hand figure, never on CTC.', 'किराया, EMI और बचत की योजना हाथ में आने वाली रकम पर बनाएँ, CTC पर नहीं।')),
  ],
  quiz: { q: t('Which figure should you plan monthly spending on?', 'महीने के ख़र्च की योजना किस रकम पर बनाएँ?'),
    options: [t('The CTC divided by twelve', 'CTC को बारह से भाग देकर'), t('The in-hand salary', 'हाथ में आने वाली सैलरी'), t('The employer’s PF share', 'नियोक्ता का PF हिस्सा')], answer: 1,
    why: t('Only the in-hand pay reaches your account. Everything else is not spendable each month.', 'सिर्फ़ हाथ की सैलरी खाते में आती है। बाक़ी हर महीने ख़र्च करने लायक़ नहीं।') },
};

const TAKE = 50_000;
const needsWants: Reel = {
  id: 'needs-wants-wealth', topic: 'basics', tags: ['budget', '50/30/20'],
  title: t('Needs, wants and wealth', 'ज़रूरतें, चाहतें और संपत्ति'),
  scenes: [
    sc('think', t('Every rupee you earn does one of three jobs: a need, a want, or building wealth.', 'आपकी कमाई का हर रुपया तीन में से एक काम करता है: ज़रूरत, चाहत, या संपत्ति बनाना।'), { big: t('Three jobs', 'तीन काम') }),
    sc('happy', fill(t('A popular illustration is 50/30/20. On {t} a month: {n} for needs, {w} for wants, {s} for saving.', 'एक लोकप्रिय उदाहरण 50/30/20 है। {t} महीने पर: ज़रूरतों के {n}, चाहतों के {w}, बचत के {s}।'), { t: money(TAKE), n: money(pctOf(TAKE, 50)), w: money(pctOf(TAKE, 30)), s: money(pctOf(TAKE, 20)) }),
      { prop: { kind: 'donut', parts: [{ value: 50, label: t('Needs', 'ज़रूरतें'), tone: 'cyan' }, { value: 30, label: t('Wants', 'चाहतें'), tone: 'gold' }, { value: 20, label: t('Saving', 'बचत'), tone: 'teal' }], centre: t('50/30/20', '50/30/20') } }),
    sc('worry', t('It is a starting illustration, not a law. In an expensive city, rent alone can break it.', 'यह शुरुआती उदाहरण है, कोई क़ानून नहीं। महँगे शहर में सिर्फ़ किराया ही इसे तोड़ सकता है।')),
    sc('think', t('A need is something you cannot do without. A want is something you would miss but could live without.', 'ज़रूरत वह है जिसके बिना काम नहीं चलता। चाहत वह है जिसकी कमी खलेगी पर जिसके बिना जिया जा सकता है।')),
    sc('cheer', t('Track a month of spending, then set your own split.', 'एक महीने का ख़र्च देखें, फिर अपना बँटवारा तय करें।')),
  ],
  quiz: { q: t('How should you treat the 50/30/20 split?', '50/30/20 के बँटवारे को कैसे लें?'),
    options: [t('As a fixed rule for everyone', 'सबके लिए तय नियम की तरह'), t('As a starting point to adjust', 'एक शुरुआती बिंदु की तरह, जिसे बदला जा सके'), t('As advice from the government', 'सरकार की सलाह की तरह')], answer: 1,
    why: t('Your own costs and goals decide the split. The numbers are only an illustration.', 'आपके अपने ख़र्च और लक्ष्य बँटवारा तय करते हैं। संख्याएँ सिर्फ़ उदाहरण हैं।') },
};

const FIRST = 5_000, FIRST_RATE = 10, FIRST_YEARS = 10;
const first = sipFutureValue(FIRST, FIRST_RATE, FIRST_YEARS);
const payFirst: Reel = {
  id: 'pay-yourself-first', topic: 'basics', tags: ['saving', 'automation'],
  title: t('Pay yourself first', 'पहले ख़ुद को दें'),
  scenes: [
    sc('worry', t('Most people save what is left at month end. Often, nothing is left.', 'ज़्यादातर लोग महीने के अंत में जो बचे वही बचाते हैं। अक्सर कुछ नहीं बचता।'), { big: t('What is left?', 'क्या बचा?') }),
    sc('happy', t('Flip it: move a fixed amount to savings the day your salary arrives, then spend the rest.', 'इसे उलटें: सैलरी आते ही तय रकम बचत में डालें, फिर बाक़ी ख़र्च करें।'), { prop: { kind: 'steps', items: [t('Salary arrives', 'सैलरी आती है'), t('Savings move first', 'बचत पहले जाती है'), t('You spend the rest', 'बाक़ी आप ख़र्च करें')] } }),
    sc('surprised', fill(t('Example: {a} a month for {y} years at an assumed {r}% grows to about {v}.', 'उदाहरण: {a} महीना, {y} साल, मान लें {r}% सालाना, लगभग {v} बनता है।'), { a: money(FIRST), y: FIRST_YEARS, r: FIRST_RATE, v: money(first) }),
      { prop: { kind: 'counter', from: 0, to: Math.round(first), format: 'inr', tone: 'teal', label: t('after 10 years (assumption)', '10 साल बाद (अनुमान)') } }),
    sc('think', t('Automate it with a standing instruction or a SIP on the day after payday. No willpower needed.', 'पे-डे के अगले दिन स्टैंडिंग इंस्ट्रक्शन या SIP से इसे ऑटोमैटिक करें। इच्छाशक्ति नहीं चाहिए।')),
    sc('cheer', t('Start with an amount that feels almost too small. Raise it later.', 'ऐसी रकम से शुरू करें जो लगभग बहुत छोटी लगे। बाद में बढ़ाएँ।')),
  ],
  quiz: { q: t('What does “pay yourself first” mean?', '“पहले ख़ुद को दें” का मतलब क्या है?'),
    options: [t('Spend on yourself before bills', 'बिलों से पहले अपने ऊपर ख़र्च करें'), t('Move savings out as soon as salary arrives', 'सैलरी आते ही बचत अलग कर दें'), t('Pay off every loan first', 'पहले सारे लोन चुका दें')], answer: 1,
    why: t('Saving first stops the money from being spent before it can be saved.', 'पहले बचत करने से पैसा बचने से पहले ख़र्च नहीं होता।') },
};

const UPGRADE = 5_000, UP_YEARS = 10, UP_RATE = 12;
const upgradeFv = sipFutureValue(UPGRADE, UP_RATE, UP_YEARS);
const creep: Reel = {
  id: 'lifestyle-creep', topic: 'basics', tags: ['spending', 'raise'],
  title: t('When every raise gets spent', 'जब हर इन्क्रीमेंट ख़र्च हो जाए'),
  scenes: [
    sc('think', t('You get a raise, and a nicer phone, a bigger flat and more dining out follow. That is lifestyle creep.', 'इन्क्रीमेंट मिलता है, और फिर बेहतर फ़ोन, बड़ा फ़्लैट, ज़्यादा बाहर खाना। इसे लाइफ़स्टाइल क्रीप कहते हैं।'), { big: t('Lifestyle creep', 'लाइफ़स्टाइल क्रीप') }),
    sc('surprised', fill(t('A {a} monthly upgrade, invested instead for {y} years at an assumed {r}%, would be about {v}.', '{a} महीने का अपग्रेड, अगर {y} साल मान लें {r}% पर निवेश होता, तो लगभग {v} बनता।'), { a: money(UPGRADE), y: UP_YEARS, r: UP_RATE, v: lakhDec(upgradeFv) }),
      { prop: { kind: 'counter', from: 0, to: Math.round(upgradeFv), format: 'inr', tone: 'gold', label: t('if invested instead (assumption)', 'अगर निवेश होता (अनुमान)') } }),
    sc('happy', t('This is not about never enjoying money. Enjoying it is the point of earning it.', 'बात पैसे का आनंद न लेने की नहीं है। कमाने का मक़सद ही आनंद है।')),
    sc('think', t('A simple middle path: when your pay rises, put part of the raise to savings first, and enjoy the rest.', 'एक सीधा बीच का रास्ता: आय बढ़े तो बढ़त का एक हिस्सा पहले बचत में डालें, बाक़ी का आनंद लें।')),
    sc('cheer', t('Decide the split before the raise arrives.', 'इन्क्रीमेंट आने से पहले बँटवारा तय कर लें।')),
  ],
  quiz: { q: t('What is a sensible way to handle a raise?', 'इन्क्रीमेंट को सँभालने का समझदार तरीक़ा क्या है?'),
    options: [t('Decide in advance how much of it goes to savings', 'पहले से तय करें कि कितना बचत में जाएगा'), t('Spend all of it on day one', 'पहले दिन ही सब ख़र्च कर दें'), t('Hide it from your family', 'परिवार से छिपा लें')], answer: 0,
    why: t('A plan made before the money arrives is easier to follow than willpower after it does.', 'पैसा आने से पहले बनी योजना, आने के बाद की इच्छाशक्ति से निभाना आसान है।') },
};

export const BASICS_MORE: Reel[] = [salarySlip, needsWants, payFirst, creep];

// ── Investing ────────────────────────────────────────────────────────────────────────────────────────────────────
const LUMP = 1_200_000, MONTH = 100_000, SL_RATE = 12, SL_YEARS = 10;
const lump = lumpsumValue(LUMP, SL_RATE, SL_YEARS), spread = sipThenHold(MONTH, SL_RATE, 1, SL_YEARS);
const sipLump: Reel = {
  id: 'sip-vs-lumpsum', topic: 'invest', tags: ['SIP', 'lump sum'],
  title: t('SIP or lump sum?', 'SIP या एकमुश्त?'),
  scenes: [
    sc('think', t('You have a large amount. Invest it all now, or spread it over a year?', 'आपके पास बड़ी रकम है। सब अभी लगाएँ, या साल भर में बाँटकर?'), { big: t('All now or spread?', 'सब अभी या बाँटकर?') }),
    sc('happy', fill(t('Example: {l} now, against {m} a month for 12 months. Both then grow to year {y}, at an assumed {r}%.', 'उदाहरण: अभी {l}, या 12 महीने तक {m} महीना। दोनों फिर साल {y} तक बढ़ते हैं, मान लें {r}%।'), { l: money(LUMP), m: money(MONTH), y: SL_YEARS, r: SL_RATE })),
    sc('surprised', fill(t('If returns are steady, the lump sum ends near {a} and the spread plan near {b}. Longer in the market grows more.', 'अगर रिटर्न स्थिर रहें, तो एकमुश्त लगभग {a} और बाँटी हुई योजना लगभग {b} पर पहुँचती है। ज़्यादा समय बाज़ार में रहा पैसा ज़्यादा बढ़ता है।'), { a: money(lump), b: money(spread) }),
      { prop: { kind: 'bars', items: [{ label: t('All now', 'सब अभी'), value: lump, text: money(lump), tone: 'teal' }, { label: t('Spread', 'बाँटकर'), value: spread, text: money(spread), tone: 'gold' }] } }),
    sc('worry', t('But markets do not move steadily. Spreading means you do not put everything in just before a fall.', 'पर बाज़ार स्थिर नहीं चलता। बाँटने का मतलब है कि गिरावट से ठीक पहले सब न लग जाए।')),
    sc('cheer', t('Most people invest from monthly pay, so a SIP fits. With a lump sum, pick a plan you can stick to.', 'ज़्यादातर लोग मासिक आय से निवेश करते हैं, इसलिए SIP जमती है। एकमुश्त हो तो ऐसी योजना चुनें जिस पर टिक सकें।')),
  ],
  quiz: { q: t('Why might someone spread a lump sum over months?', 'कोई एकमुश्त रकम को महीनों में क्यों बाँट सकता है?'),
    options: [t('To avoid putting it all in just before a fall', 'गिरावट से ठीक पहले सब न लगाने के लिए'), t('Because it always earns more', 'क्योंकि वह हमेशा ज़्यादा कमाती है'), t('Because it is tax free', 'क्योंकि वह टैक्स-मुक्त है')], answer: 0,
    why: t('Spreading evens out the entry price. In a steadily rising market, investing early usually does better.', 'बाँटने से ख़रीद का भाव औसत होता है। लगातार बढ़ते बाज़ार में जल्दी लगाना आम तौर पर बेहतर रहता है।') },
};

const IDX = 1_000_000, IDX_YEARS = 20, GROSS = 12, LOW_COST = 0.2, HIGH_COST = 1.5;
const lowEnd = lumpsumValue(IDX, GROSS - LOW_COST, IDX_YEARS), highEnd = lumpsumValue(IDX, GROSS - HIGH_COST, IDX_YEARS);
const indexFund: Reel = {
  id: 'index-fund-basics', topic: 'invest', tags: ['index fund', 'Nifty 50', 'costs'],
  title: t('What is an index fund?', 'इंडेक्स फ़ंड क्या है?'),
  scenes: [
    sc('think', t('An index is a list of companies, like the Nifty 50: 50 large listed companies.', 'इंडेक्स कंपनियों की सूची है, जैसे निफ़्टी 50: 50 बड़ी लिस्टेड कंपनियाँ।'), { big: t('An index', 'एक इंडेक्स') }),
    sc('happy', t('An index fund simply copies that list. No manager picks stocks, so it usually costs less.', 'इंडेक्स फ़ंड बस उस सूची की नक़ल करता है। कोई मैनेजर शेयर नहीं चुनता, इसलिए आम तौर पर ख़र्च कम होता है।')),
    sc('surprised', fill(t('Costs add up. {a} over {y} years at an assumed {g}% before costs: near {l} at {lc}% cost, near {h} at {hc}%.', 'ख़र्च जुड़ते हैं। {a}, {y} साल, ख़र्च से पहले मान लें {g}%: {lc}% ख़र्च पर लगभग {l}, {hc}% पर लगभग {h}।'), { a: money(IDX), y: IDX_YEARS, g: GROSS, l: money(lowEnd), lc: LOW_COST, h: money(highEnd), hc: HIGH_COST }),
      { prop: { kind: 'bars', items: [{ label: t('Low cost', 'कम ख़र्च'), value: lowEnd, text: money(lowEnd), tone: 'teal' }, { label: t('High cost', 'ज़्यादा ख़र्च'), value: highEnd, text: money(highEnd), tone: 'gold' }] } }),
    sc('worry', t('An index fund still goes up and down with the market. Low cost is not low risk.', 'इंडेक्स फ़ंड भी बाज़ार के साथ ऊपर-नीचे होता है। कम ख़र्च का मतलब कम जोखिम नहीं।')),
    sc('cheer', t('Whether you choose an index or a managed fund, compare costs and read what it holds.', 'इंडेक्स चुनें या मैनेज्ड फ़ंड, ख़र्च की तुलना करें और देखें उसमें क्या है।')),
  ],
  quiz: { q: t('What does an index fund do?', 'इंडेक्स फ़ंड क्या करता है?'),
    options: [t('Copies a market index', 'किसी मार्केट इंडेक्स की नक़ल करता है'), t('Promises a fixed return', 'तय रिटर्न का वादा करता है'), t('Avoids all market risk', 'बाज़ार का सारा जोखिम टालता है')], answer: 0,
    why: t('It holds what the index holds, so it moves with the market, usually at a lower cost.', 'वह वही रखता है जो इंडेक्स में है, इसलिए बाज़ार के साथ चलता है, आम तौर पर कम ख़र्च पर।') },
};

const ELSS_CAP = 150_000, elssSaved = Math.round(taxAtSlab(ELSS_CAP, 30));
const elss: Reel = {
  id: 'elss-basics', topic: 'invest', tags: ['ELSS', '80C', 'tax saving'],
  title: t('ELSS: tax saving with market risk', 'ELSS: टैक्स बचत, बाज़ार के जोखिम के साथ'),
  scenes: [
    sc('think', t('An ELSS is an equity mutual fund that can count towards Section 80C in the old regime.', 'ELSS एक इक्विटी म्यूचुअल फ़ंड है जो पुराने रिजीम में सेक्शन 80C में गिना जा सकता है।'), { big: t('ELSS', 'ELSS') }),
    sc('surprised', t('It has a lock-in of 3 years, the shortest among the common 80C options.', 'इसमें 3 साल का लॉक-इन है, जो आम 80C विकल्पों में सबसे छोटा है।'), { prop: { kind: 'counter', from: 0, to: 3, format: 'plain', unit: t('years', 'साल'), tone: 'cyan', label: t('lock-in', 'लॉक-इन') } }),
    sc('happy', fill(t('Up to {c} a year counts. In the 30% slab, that can save about {s} of tax.', 'साल में {c} तक गिना जाता है। 30% स्लैब में इससे लगभग {s} का टैक्स बच सकता है।'), { c: money(ELSS_CAP), s: money(elssSaved) })),
    sc('worry', t('It invests in shares, so its value can fall, even below what you put in. Nothing is promised.', 'यह शेयरों में लगता है, इसलिए कीमत गिर सकती है, लगाई रकम से नीचे भी। कुछ वादा नहीं है।'), { prop: { kind: 'shield', text: t('Market risk', 'बाज़ार जोखिम'), sub: t('not guaranteed', 'गारंटी नहीं') } }),
    sc('cheer', t('Choose it for the investment, not only for the tax saving.', 'इसे निवेश के लिए चुनें, सिर्फ़ टैक्स बचत के लिए नहीं।')),
  ],
  quiz: { q: t('How long is the lock-in on an ELSS fund?', 'ELSS फ़ंड का लॉक-इन कितना है?'),
    options: [t('3 years', '3 साल'), t('15 years', '15 साल'), t('There is none', 'कोई नहीं')], answer: 0,
    why: t('Each instalment is locked for 3 years from its own date.', 'हर किस्त अपनी तारीख़ से 3 साल के लिए बँधी रहती है।') },
};

const MAKING = 12, JEWEL = 100_000;
const gold: Reel = {
  id: 'gold-basics', topic: 'invest', tags: ['gold', 'diversification'],
  title: t('Gold as part of the mix', 'मिश्रण के एक हिस्से के रूप में सोना'),
  scenes: [
    sc('think', t('Many families hold gold. Some investors keep a small share of it to balance other assets.', 'कई परिवार सोना रखते हैं। कुछ निवेशक दूसरी संपत्तियों को संतुलित करने के लिए उसका छोटा हिस्सा रखते हैं।'), { big: t('Gold', 'सोना') }),
    sc('happy', t('You can hold it in a few ways, and the costs differ.', 'आप इसे कई तरीक़ों से रख सकते हैं, और ख़र्च अलग होते हैं।'), { prop: { kind: 'steps', items: [t('Jewellery', 'गहने'), t('Gold ETF or fund', 'गोल्ड ETF या फ़ंड'), t('Digital gold', 'डिजिटल गोल्ड')] } }),
    sc('surprised', fill(t('Jewellery often carries making charges. At about {m}% on {j}, that is about {c} you may not get back.', 'गहनों में अक्सर मेकिंग चार्ज लगता है। {j} पर लगभग {m}% मतलब लगभग {c}, जो शायद वापस न मिले।'), { m: MAKING, j: money(JEWEL), c: money(pctOf(JEWEL, MAKING)) }),
      { prop: { kind: 'counter', from: 0, to: pctOf(JEWEL, MAKING), format: 'inr', tone: 'red', label: t('making charge (illustration)', 'मेकिंग चार्ज (उदाहरण)') } }),
    sc('worry', t('Gold prices rise and fall too. Check who regulates the way you buy it, and what it charges.', 'सोने के भाव भी ऊपर-नीचे होते हैं। देखें कि जिस तरह आप ख़रीदते हैं उसे कौन नियंत्रित करता है, और वह क्या शुल्क लेता है।')),
    sc('cheer', t('Keep it a small part of your plan, and compare the costs of each way.', 'इसे अपनी योजना का छोटा हिस्सा रखें, और हर तरीक़े के ख़र्च की तुलना करें।')),
  ],
  quiz: { q: t('What is a cost of buying jewellery as an investment?', 'गहने निवेश के रूप में ख़रीदने की एक लागत क्या है?'),
    options: [t('Making charges', 'मेकिंग चार्ज'), t('A lock-in of 3 years', '3 साल का लॉक-इन'), t('There are no costs', 'कोई लागत नहीं')], answer: 0,
    why: t('Making charges are paid on top of the gold value, and are often not returned when you sell.', 'मेकिंग चार्ज सोने की कीमत के ऊपर देना पड़ता है, और बेचने पर अक्सर वापस नहीं मिलता।') },
};

const debtFunds: Reel = {
  id: 'debt-funds-basics', topic: 'invest', tags: ['debt funds', 'interest rates'],
  title: t('Debt funds are not FDs', 'डेट फ़ंड FD नहीं हैं'),
  scenes: [
    sc('think', t('A debt fund lends your money to the government and to companies, and earns interest.', 'डेट फ़ंड आपका पैसा सरकार और कंपनियों को उधार देता है और ब्याज कमाता है।'), { big: t('Debt funds', 'डेट फ़ंड') }),
    sc('worry', t('It is not a bank FD. Look at what can go wrong.', 'यह बैंक FD नहीं है। देखें क्या गड़बड़ हो सकती है।'), { prop: { kind: 'steps', items: [t('NAV can fall if rates rise', 'दरें बढ़ें तो NAV गिर सकता है'), t('A borrower can default', 'कोई उधारकर्ता चूक सकता है'), t('No fixed return promised', 'तय रिटर्न का वादा नहीं')] } }),
    sc('happy', t('Funds that lend for shorter periods usually swing less than ones that lend for longer.', 'कम अवधि के लिए उधार देने वाले फ़ंड आम तौर पर लंबी अवधि वाले से कम हिलते हैं।')),
    sc('think', t('Read the fund’s risk label, the quality of its borrowers and the length of its loans.', 'फ़ंड का जोखिम लेबल, उसके उधारकर्ताओं की गुणवत्ता और उसके उधार की अवधि पढ़ें।')),
    sc('cheer', t('Use them for goals that need steadier money, and match the fund to your timeline.', 'उन लक्ष्यों के लिए उपयोग करें जिन्हें ज़्यादा स्थिर पैसा चाहिए, और फ़ंड को अपनी समय-सीमा से मिलाएँ।')),
  ],
  quiz: { q: t('Which is true of a debt fund?', 'डेट फ़ंड के बारे में कौन-सी बात सही है?'),
    options: [t('Its NAV can fall, for example when interest rates rise', 'उसका NAV गिर सकता है, जैसे दरें बढ़ने पर'), t('It always pays a fixed rate like an FD', 'वह FD की तरह हमेशा तय दर देता है'), t('It cannot lose money', 'उसमें पैसा घट नहीं सकता')], answer: 0,
    why: t('Debt funds hold bonds whose prices move with rates, and a borrower can fail to pay.', 'डेट फ़ंड बॉन्ड रखते हैं जिनके भाव दरों के साथ चलते हैं, और उधारकर्ता चुकाने में चूक सकता है।') },
};

const riskLabel: Reel = {
  id: 'mf-risk-label', topic: 'invest', tags: ['riskometer', 'mutual fund'],
  title: t('Read the riskometer', 'रिस्कोमीटर पढ़ें'),
  scenes: [
    sc('think', t('Every mutual fund shows a riskometer. It tells you how risky the fund’s holdings are.', 'हर म्यूचुअल फ़ंड एक रिस्कोमीटर दिखाता है। वह बताता है कि फ़ंड की होल्डिंग कितनी जोखिम भरी है।'), { big: t('Riskometer', 'रिस्कोमीटर'), ms: 5000 }),
    sc('happy', t('It has six levels, from low to very high.', 'इसके छह स्तर हैं, कम से बहुत ज़्यादा तक।'), { prop: { kind: 'steps', items: [t('Low, low to moderate', 'कम, कम से मध्यम'), t('Moderate', 'मध्यम'), t('Moderately high, high', 'मध्यम से ज़्यादा, ज़्यादा'), t('Very high', 'बहुत ज़्यादा')] } }),
    sc('worry', t('A higher level means bigger swings, up and down. It does not mean higher returns.', 'ऊँचे स्तर का मतलब बड़े उतार-चढ़ाव है। ऊँचे रिटर्न नहीं।')),
    sc('think', t('Match the level to your goal date and to how you would feel in a fall.', 'स्तर को अपने लक्ष्य की तारीख़ और गिरावट में अपनी बेचैनी से मिलाएँ।')),
    sc('cheer', t('Check it before you invest, and again every year.', 'निवेश से पहले देखें, और हर साल फिर देखें।'), { ms: 3600 }),
  ],
  quiz: { q: t('What does a higher riskometer level mean?', 'ऊँचे रिस्कोमीटर स्तर का क्या मतलब है?'),
    options: [t('Bigger swings in value are possible', 'कीमत में बड़े उतार-चढ़ाव संभव हैं'), t('Higher returns are promised', 'ऊँचे रिटर्न का वादा है'), t('The fund is government backed', 'फ़ंड को सरकार का समर्थन है')], answer: 0,
    why: t('It describes how much the value can move, not the return you get.', 'यह बताता है कि कीमत कितनी हिल सकती है, आपका रिटर्न नहीं।') },
};

const [eq0, debt0] = [60, 40], [shareEq] = driftedShare([eq0, debt0], [30, 5]);
const rebalance: Reel = {
  id: 'rebalancing', topic: 'invest', tags: ['asset allocation', 'rebalance'],
  title: t('Why rebalance?', 'रीबैलेंस क्यों?'),
  scenes: [
    sc('think', t('You plan a mix, say 60% shares and 40% safer assets. Markets then move it for you.', 'आप एक मिश्रण तय करते हैं, मान लें 60% शेयर और 40% सुरक्षित। फिर बाज़ार उसे बदल देता है।'), { big: t('Drift', 'खिसकना') }),
    sc('surprised', fill(t('Say shares rise 30% and the safer part 5% in a year. Your 60/40 becomes about {s}/{d}.', 'मान लें शेयर साल में 30% और सुरक्षित हिस्सा 5% बढ़ा। आपका 60/40 लगभग {s}/{d} हो जाता है।'), { s: Math.round(shareEq), d: Math.round(100 - shareEq) }),
      { prop: { kind: 'donut', parts: [{ value: shareEq, label: t('Shares', 'शेयर'), tone: 'cyan' }, { value: 100 - shareEq, label: t('Safer', 'सुरक्षित'), tone: 'gold' }], centre: t('now', 'अब') } }),
    sc('worry', t('You now carry more risk than you planned, without choosing to.', 'अब आप बिना चुने, योजना से ज़्यादा जोखिम उठा रहे हैं।')),
    sc('happy', t('Rebalancing brings it back: move some money across, or send new money to the part that has fallen behind.', 'रीबैलेंसिंग उसे वापस लाती है: कुछ पैसा इधर-उधर करें, या नया पैसा पीछे रह गए हिस्से में डालें।')),
    sc('cheer', t('Check once or twice a year. Mind the tax and costs of selling.', 'साल में एक-दो बार देखें। बेचने के टैक्स और ख़र्च का ध्यान रखें।')),
  ],
  quiz: { q: t('Why do portfolios drift from their plan?', 'पोर्टफ़ोलियो अपनी योजना से क्यों खिसकते हैं?'),
    options: [t('Different parts grow at different speeds', 'अलग-अलग हिस्से अलग रफ़्तार से बढ़ते हैं'), t('Banks change them', 'बैंक उन्हें बदल देते हैं'), t('They never drift', 'वे कभी नहीं खिसकते')], answer: 0,
    why: t('A part that grows faster becomes a bigger share, so the mix changes without you doing anything.', 'तेज़ बढ़ने वाला हिस्सा बड़ा हो जाता है, इसलिए आपके कुछ किए बिना मिश्रण बदल जाता है।') },
};

const SIP_SMALL = 2_000, SMALL_YEARS = 5, SMALL_RATE = 12, smallEnd = sipFutureValue(SIP_SMALL, SMALL_RATE, SMALL_YEARS);
const firstSip: Reel = {
  id: 'first-sip-habit', topic: 'invest', tags: ['SIP', 'habit'],
  title: t('Your first SIP, set up right', 'आपकी पहली SIP, सही तरीक़े से'),
  scenes: [
    sc('happy', t('You do not need a lot to start. Many funds let you begin with a few hundred rupees.', 'शुरू करने के लिए ज़्यादा नहीं चाहिए। कई फ़ंड कुछ सौ रुपये से शुरू करने देते हैं।'), { big: t('Start small', 'छोटी शुरुआत') }),
    sc('surprised', fill(t('Example: {a} a month for {y} years at an assumed {r}%. You put in {p}, and it grows to about {v}.', 'उदाहरण: {a} महीना, {y} साल, मान लें {r}%। आप {p} डालते हैं, और यह बढ़कर लगभग {v} होता है।'), { a: money(SIP_SMALL), y: SMALL_YEARS, r: SMALL_RATE, p: money(SIP_SMALL * 12 * SMALL_YEARS), v: money(smallEnd) }),
      { prop: { kind: 'bars', items: [{ label: t('You put in', 'आपने डाला'), value: SIP_SMALL * 12 * SMALL_YEARS, text: money(SIP_SMALL * 12 * SMALL_YEARS), tone: 'gold' }, { label: t('It grows to', 'बढ़कर'), value: smallEnd, text: money(smallEnd), tone: 'teal' }] } }),
    sc('think', t('Set it up like this:', 'इसे ऐसे सेट करें:'), { prop: { kind: 'steps', items: [t('Pick the day after payday', 'पे-डे के अगले दिन की तारीख़'), t('Link your bank mandate', 'बैंक मैंडेट जोड़ें'), t('Keep an eye on costs', 'ख़र्च पर नज़र रखें')] } }),
    sc('worry', t('Returns are an assumption. Do not stop the SIP at the first fall.', 'रिटर्न एक अनुमान है। पहली गिरावट पर SIP बंद न करें।')),
    sc('cheer', t('A small SIP you keep going beats a big one you stop.', 'जो छोटी SIP चलती रहे वह उस बड़ी से बेहतर है जो बंद हो जाए।')),
  ],
  quiz: { q: t('What matters most in a first SIP?', 'पहली SIP में सबसे अहम क्या है?'),
    options: [t('Starting small and keeping it going', 'छोटी शुरुआत और उसे चलाए रखना'), t('Starting with all your savings', 'अपनी सारी बचत से शुरू करना'), t('Stopping at the first fall', 'पहली गिरावट पर रुक जाना')], answer: 0,
    why: t('Consistency over years does the work. The amount can grow later.', 'सालों की निरंतरता काम करती है। रकम बाद में बढ़ाई जा सकती है।') },
};

const NAVS = [50, 40, 25, 40, 50], AMT = 5_000, ac = averageCost(AMT, NAVS);
const dips: Reel = {
  id: 'market-dips-sip', topic: 'invest', tags: ['SIP', 'rupee cost averaging'],
  title: t('What a SIP does in a market fall', 'बाज़ार गिरने पर SIP क्या करती है'),
  scenes: [
    sc('worry', t('The market falls and your SIP shows a loss. The urge is to stop it.', 'बाज़ार गिरता है और आपकी SIP घाटा दिखाती है। रोक देने का मन करता है।'), { big: t('A fall', 'गिरावट') }),
    sc('think', fill(t('Say a fund’s NAV goes {a}. A fixed {m} a month buys more units when the NAV is low.', 'मान लें फ़ंड का NAV {a} चलता है। तय {m} महीना, NAV कम होने पर ज़्यादा यूनिट ख़रीदता है।'), { a: t(NAVS.map(n => '₹' + n).join(', '), NAVS.map(n => '₹' + n).join(', ')), m: money(AMT) }),
      { prop: { kind: 'line', points: NAVS.map(n => n / 50), tone: 'red', label: t('NAV over five months (example)', 'पाँच महीने में NAV (उदाहरण)') } }),
    sc('surprised', fill(t('Five months, {i} in all, buys {u} units. Your cost per unit is about {c}, less than the average NAV of {n}.', 'पाँच महीने, कुल {i}, से {u} यूनिट मिलीं। आपकी प्रति यूनिट लागत लगभग {c} है, औसत NAV {n} से कम।'), { i: money(ac.invested), u: Math.round(ac.units), c: money(Math.round(ac.perUnit)), n: money(Math.round(ac.avgNav)) }),
      { prop: { kind: 'bars', items: [{ label: t('Average NAV', 'औसत NAV'), value: ac.avgNav, text: money(Math.round(ac.avgNav)), tone: 'gold' }, { label: t('Your cost', 'आपकी लागत'), value: ac.perUnit, text: money(Math.round(ac.perUnit)), tone: 'teal' }] } }),
    sc('worry', t('This does not guarantee a profit. It only evens out your buying price.', 'इससे मुनाफ़े की गारंटी नहीं मिलती। यह सिर्फ़ ख़रीद का भाव औसत करती है।')),
    sc('cheer', t('Keep the SIP going if your goal date is still far away.', 'अगर लक्ष्य की तारीख़ अभी दूर है, तो SIP चालू रखें।')),
  ],
  quiz: { q: t('What does a fixed SIP do when the NAV is low?', 'NAV कम होने पर तय SIP क्या करती है?'),
    options: [t('Buys more units for the same money', 'उतने ही पैसे में ज़्यादा यूनिट ख़रीदती है'), t('Buys fewer units', 'कम यूनिट ख़रीदती है'), t('Stops automatically', 'अपने आप रुक जाती है')], answer: 0,
    why: t('A fixed amount buys more units at a lower price, which lowers your average cost.', 'तय रकम कम भाव पर ज़्यादा यूनिट ख़रीदती है, जिससे आपकी औसत लागत घटती है।') },
};

const diversify: Reel = {
  id: 'diversification', topic: 'invest', tags: ['diversification', 'risk'],
  title: t('Do not put it all in one basket', 'सब कुछ एक टोकरी में न रखें'),
  scenes: [
    sc('think', t('Diversification means spreading money so that one bad bet does not sink you.', 'विविधीकरण का मतलब पैसा बाँटना है ताकि एक ग़लत दाँव आपको डुबो न दे।'), { big: t('Spread it', 'बाँटें') }),
    sc('worry', fill(t('If everything is in one stock and it falls by half, you lose about {a}% of your money.', 'अगर सब कुछ एक शेयर में है और वह आधा गिरे, तो आप अपने पैसे का लगभग {a}% खो देते हैं।'), { a: potLossText(100, 50) })),
    sc('surprised', fill(t('Spread equally over five holdings and one falls by half: you lose about {b}% of the total.', 'पाँच बराबर हिस्सों में बाँटें और एक आधा गिरे: आप कुल का लगभग {b}% खोते हैं।'), { b: potLossText(20, 50) }),
      { prop: { kind: 'bars', items: [{ label: t('One stock', 'एक शेयर'), value: 50, text: t('50%', '50%'), tone: 'red' }, { label: t('Five spread', 'पाँच में बाँटा'), value: 10, text: t('10%', '10%'), tone: 'teal' }] } }),
    sc('think', t('Spread across kinds of assets too: shares, safer assets and, if you like, gold.', 'संपत्तियों के प्रकारों में भी बाँटें: शेयर, सुरक्षित निवेश और चाहें तो सोना।')),
    sc('cheer', t('Spreading limits the damage. It does not remove risk.', 'बाँटने से नुक़सान सीमित होता है। जोखिम ख़त्म नहीं होता।')),
  ],
  quiz: { q: t('What does spreading money across holdings do?', 'पैसा कई जगह बाँटने से क्या होता है?'),
    options: [t('Limits the damage if one holding falls', 'एक होल्डिंग गिरे तो नुक़सान सीमित होता है'), t('Removes all risk', 'सारा जोखिम ख़त्म हो जाता है'), t('Guarantees higher returns', 'ऊँचे रिटर्न की गारंटी देता है')], answer: 0,
    why: t('One fall hurts less when it is a small part of the whole. The market can still fall.', 'एक गिरावट तब कम चोट करती है जब वह कुल का छोटा हिस्सा हो। बाज़ार फिर भी गिर सकता है।') },
};
function potLossText(weight: number, drop: number): string { return pct1(potLoss(weight, drop)); }

const FD = 7, INFL = 6, SLAB = 30, real = realReturn(FD, INFL, SLAB);
const realFd: Reel = {
  id: 'real-return-fd', topic: 'invest', tags: ['FD', 'inflation', 'tax'],
  title: t('What an FD really earns', 'FD असल में कितना कमाती है'),
  scenes: [
    sc('think', t('An FD pays a fixed rate. But what matters is what is left after tax and rising prices.', 'FD तय दर देती है। पर मायने यह रखता है कि टैक्स और बढ़ती कीमतों के बाद क्या बचता है।'), { big: t('Real return', 'असली रिटर्न') }),
    sc('happy', fill(t('Example: an FD at {f}%. In the {s}% slab the interest is taxed, leaving about {a}% (cess left out).', 'उदाहरण: {f}% की FD। {s}% स्लैब में ब्याज पर टैक्स लगता है, और लगभग {a}% बचता है (सेस छोड़कर)।'), { f: FD, s: SLAB, a: pct1(FD * (1 - SLAB / 100)) })),
    sc('surprised', fill(t('With an assumed {i}% inflation, the real return is about {r}%. Your money buys a little less each year.', 'मान लें {i}% महँगाई, तो असली रिटर्न लगभग {r}% है। आपका पैसा हर साल थोड़ा कम ख़रीदता है।'), { i: INFL, r: pct1(real) }),
      { prop: { kind: 'bars', items: [{ label: t('After tax', 'टैक्स के बाद'), value: FD * (1 - SLAB / 100), text: t(`${pct1(FD * (1 - SLAB / 100))}%`, `${pct1(FD * (1 - SLAB / 100))}%`), tone: 'gold' }, { label: t('Inflation', 'महँगाई'), value: INFL, text: t(`${INFL}%`, `${INFL}%`), tone: 'red' }] } }),
    sc('think', t('This does not make FDs bad. They give safety and a known amount, which some goals need.', 'इसका मतलब FD बुरी नहीं है। वे सुरक्षा और तय रकम देती हैं, जो कुछ लक्ष्यों को चाहिए।')),
    sc('cheer', t('Use an FD for safety and goals that are near. For long goals, compare other options too.', 'सुरक्षा और नज़दीकी लक्ष्यों के लिए FD रखें। लंबे लक्ष्यों के लिए दूसरे विकल्प भी तौलें।')),
  ],
  quiz: { q: t('What is a “real return”?', '“असली रिटर्न” क्या है?'),
    options: [t('The return after tax and inflation', 'टैक्स और महँगाई के बाद का रिटर्न'), t('The rate printed on the receipt', 'रसीद पर छपी दर'), t('The return a bank promises you', 'जो रिटर्न बैंक वादा करे')], answer: 0,
    why: t('It shows how much more you can actually buy, not just the number of rupees.', 'यह दिखाता है कि आप असल में कितना ज़्यादा ख़रीद सकते हैं, सिर्फ़ रुपयों की संख्या नहीं।') },
};

export const INVEST_MORE: Reel[] = [sipLump, indexFund, elss, gold, debtFunds, riskLabel, rebalance, firstSip, dips, diversify, realFd];
