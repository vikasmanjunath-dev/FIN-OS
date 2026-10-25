// Second wave, part C: tax and retirement. Tax figures use lib/taxcore.ts constants and figures.ts.
import { STD_NEW, STD_OLD } from '@/lib/taxcore';
import { annuityMonthly, fill, grownCost, hraExempt, inflatedValue, money, taxAtSlab } from '@/lib/reels/figures';
import { sc, t } from '@/lib/reels/kit';
import type { Reel } from '@/lib/reels/types';

// ── Tax ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const BASIC_M = 50_000, HRA_M = 25_000, RENT_M = 20_000;
const hraFree = hraExempt(BASIC_M, HRA_M, RENT_M, true);
const hra: Reel = {
  id: 'hra-basics', topic: 'tax', tags: ['HRA', 'rent', 'old regime'],
  title: t('HRA: tax-free rent allowance', 'HRA: किराये पर टैक्स-मुक्त भत्ता'),
  scenes: [
    sc('think', t('If you pay rent and get HRA in your salary, part of it can be tax-free in the old regime.', 'अगर आप किराया देते हैं और सैलरी में HRA मिलता है, तो पुराने रिजीम में उसका एक हिस्सा टैक्स-मुक्त हो सकता है।'), { big: t('HRA', 'HRA'), ms: 4200 }),
    sc('happy', t('The tax-free part is the least of three amounts.', 'टैक्स-मुक्त हिस्सा तीन रकमों में से सबसे कम वाली है।'), { prop: { kind: 'steps', items: [t('The HRA you receive', 'आपको मिला HRA'), t('Rent minus 10% of basic', 'किराया घटा बेसिक का 10%'), t('Half of basic (metro)', 'बेसिक का आधा (मेट्रो)')] } }),
    sc('surprised', fill(t('Illustration: basic {b}, HRA {h}, rent {r} a month, metro. The least is {e}, so {e} a month is exempt.', 'उदाहरण: बेसिक {b}, HRA {h}, किराया {r} महीना, मेट्रो में। सबसे कम {e} है, इसलिए {e} महीना मुक्त है।'), { b: money(BASIC_M), h: money(HRA_M), r: money(RENT_M), e: money(hraFree) }),
      { prop: { kind: 'counter', from: 0, to: hraFree, format: 'inr', tone: 'teal', label: t('exempt a month (example)', 'छूट महीना (उदाहरण)') } }),
    sc('worry', t('Rent receipts, and the landlord’s PAN for larger rents, may be needed. The new regime has no HRA exemption.', 'किराये की रसीदें, और बड़े किराये पर मकान-मालिक का PAN, चाहिए हो सकता है। नए रिजीम में HRA की छूट नहीं है।')),
    sc('cheer', t('Do not pay rent to a relative only for tax. Keep it real and keep the records.', 'सिर्फ़ टैक्स के लिए किसी रिश्तेदार को किराया न दें। असली रखें और रिकॉर्ड रखें।')),
  ],
  quiz: { q: t('How is the HRA exemption worked out?', 'HRA की छूट कैसे निकलती है?'),
    options: [t('The least of three amounts', 'तीन रकमों में से सबसे कम'), t('The highest of three amounts', 'तीन रकमों में से सबसे ज़्यादा'), t('Always the full HRA', 'हमेशा पूरा HRA')], answer: 0,
    why: t('The rule gives you the smallest of the HRA received, rent less 10% of basic, and the metro share of basic.', 'नियम HRA, किराया घटा बेसिक का 10%, और बेसिक के मेट्रो हिस्से में से सबसे छोटी रकम देता है।') },
};

const itrSteps: Reel = {
  id: 'itr-filing-steps', topic: 'tax', tags: ['ITR', 'filing'],
  title: t('Filing your return, step by step', 'रिटर्न भरना, क़दम-दर-क़दम'),
  scenes: [
    sc('think', t('Filing is easier than it sounds when you do it in order.', 'क्रम से करें तो रिटर्न भरना सुनने से आसान है।'), { big: t('Four steps', 'चार क़दम') }),
    sc('happy', t('Gather first, file next, then confirm.', 'पहले जुटाएँ, फिर भरें, फिर पुष्टि करें।'), { prop: { kind: 'steps', items: [t('Gather Form 16 and AIS', 'फ़ॉर्म 16 और AIS जुटाएँ'), t('Pick the right ITR form', 'सही ITR फ़ॉर्म चुनें'), t('Check and file on the portal', 'पोर्टल पर जाँचें और भरें'), t('E-verify the return', 'रिटर्न ई-वेरिफ़ाई करें')] }, ms: 5400 }),
    sc('worry', t('A return is not complete until it is verified. Do this within the time the portal allows.', 'रिटर्न तब तक पूरा नहीं जब तक वेरिफ़ाई न हो। पोर्टल की दी हुई समय-सीमा में करें।')),
    sc('think', t('Match your income with the tax department’s statements, and fix any mismatch before filing.', 'अपनी आय को आयकर विभाग के स्टेटमेंट से मिलाएँ, और भरने से पहले कोई अंतर ठीक करें।')),
    sc('cheer', t('Keep a copy of the filed return and the acknowledgement for years.', 'भरे हुए रिटर्न और पावती की कॉपी सालों तक रखें।')),
  ],
  quiz: { q: t('When is a filed return complete?', 'भरा हुआ रिटर्न कब पूरा माना जाता है?'),
    options: [t('After you verify it', 'वेरिफ़ाई करने के बाद'), t('The moment you click submit', 'सबमिट दबाते ही'), t('After you pay a fee', 'फ़ीस देने के बाद')], answer: 0,
    why: t('An unverified return can be treated as not filed, so verifying is the last step.', 'बिना वेरिफ़ाई रिटर्न को भरा हुआ न माना जा सकता है, इसलिए वेरिफ़ाई आख़िरी क़दम है।') },
};

const form16: Reel = {
  id: 'form-16-decoded', topic: 'tax', tags: ['Form 16', 'TDS'],
  title: t('Reading Form 16', 'फ़ॉर्म 16 पढ़ना'),
  scenes: [
    sc('think', t('Form 16 is the tax certificate your employer gives you for the year.', 'फ़ॉर्म 16 वह टैक्स प्रमाणपत्र है जो नियोक्ता आपको साल भर का देता है।'), { big: t('Form 16', 'फ़ॉर्म 16'), ms: 4600 }),
    sc('happy', t('It has two parts.', 'इसके दो भाग हैं।'), { prop: { kind: 'steps', items: [t('Part A: TDS cut and deposited', 'भाग A: कटा और जमा TDS'), t('Part B: salary and deductions', 'भाग B: वेतन और कटौतियाँ')] } }),
    sc('think', t('Employers usually give it by mid-June after the year ends.', 'नियोक्ता आम तौर पर साल ख़त्म होने के बाद जून के मध्य तक देते हैं।')),
    sc('worry', t('It shows only that employer’s figures. Other income, such as interest or a second job, is not in it.', 'इसमें सिर्फ़ उस नियोक्ता के आँकड़े होते हैं। दूसरी आय, जैसे ब्याज या दूसरी नौकरी, इसमें नहीं होती।')),
    sc('cheer', t('Match it with your AIS before filing, and add what is missing.', 'भरने से पहले इसे अपने AIS से मिलाएँ, और जो छूटा है उसे जोड़ें।')),
  ],
  quiz: { q: t('What does Form 16 not show?', 'फ़ॉर्म 16 में क्या नहीं दिखता?'),
    options: [t('Your income from other sources', 'दूसरे स्रोतों से आपकी आय'), t('The TDS your employer cut', 'नियोक्ता ने कितना TDS काटा'), t('Your salary', 'आपका वेतन')], answer: 0,
    why: t('It covers one employer. You must add interest, rent, capital gains and other income yourself.', 'यह एक नियोक्ता का है। ब्याज, किराया, कैपिटल गेन और दूसरी आय आपको ख़ुद जोड़नी है।') },
};

const INT = 100_000, SLAB = 30, intTax = Math.round(taxAtSlab(INT, SLAB));
const fdTax: Reel = {
  id: 'fd-interest-tax', topic: 'tax', tags: ['FD', 'interest', 'TDS'],
  title: t('Tax on FD interest', 'FD के ब्याज पर टैक्स'),
  scenes: [
    sc('think', t('The interest on an FD is added to your income and taxed at your slab rate.', 'FD का ब्याज आपकी आय में जुड़ता है और आपकी स्लैब दर पर टैक्स लगता है।'), { big: t('Interest is income', 'ब्याज भी आय') }),
    sc('surprised', fill(t('Example: {i} of interest in the {s}% slab means about {x} of tax with cess, leaving about {l}.', 'उदाहरण: {i} के ब्याज पर {s}% स्लैब में सेस सहित लगभग {x} टैक्स, और लगभग {l} बचता है।'), { i: money(INT), s: SLAB, x: money(intTax), l: money(INT - intTax) }),
      { prop: { kind: 'bars', items: [{ label: t('Interest', 'ब्याज'), value: INT, text: money(INT), tone: 'gold' }, { label: t('After tax', 'टैक्स के बाद'), value: INT - intTax, text: money(INT - intTax), tone: 'teal' }] } }),
    sc('worry', t('The bank may cut TDS once your interest crosses a yearly limit. TDS is not the final tax.', 'ब्याज साल की सीमा पार करे तो बैंक TDS काट सकता है। TDS अंतिम टैक्स नहीं है।')),
    sc('think', t('If your income is below the taxable limit, you can ask the bank not to cut TDS with a form.', 'अगर आपकी आय कर-योग्य सीमा से कम है, तो फ़ॉर्म देकर बैंक से TDS न काटने को कह सकते हैं।')),
    sc('cheer', t('Show all your interest when you file, even where no TDS was cut.', 'रिटर्न में अपना सारा ब्याज दिखाएँ, जहाँ TDS नहीं कटा वहाँ भी।')),
  ],
  quiz: { q: t('How is FD interest taxed?', 'FD के ब्याज पर टैक्स कैसे लगता है?'),
    options: [t('Added to your income, at your slab rate', 'आपकी आय में जुड़कर, आपकी स्लैब दर पर'), t('It is always tax free', 'वह हमेशा टैक्स-मुक्त है'), t('At one flat rate for everyone', 'सबके लिए एक तय दर पर')], answer: 0,
    why: t('Interest is “income from other sources”, so higher earners pay more tax on the same interest.', 'ब्याज “अन्य स्रोतों से आय” है, इसलिए ज़्यादा कमाने वाले उसी ब्याज पर ज़्यादा टैक्स देते हैं।') },
};

const GAIN = 150_000, LOSS = 50_000;
const harvest: Reel = {
  id: 'tax-loss-harvesting', topic: 'tax', tags: ['capital gains', 'loss set-off'],
  title: t('Using a loss to cut a gain’s tax', 'नुक़सान से गेन का टैक्स घटाना'),
  scenes: [
    sc('think', t('If you sold something at a loss this year, it can reduce the tax on your gains.', 'अगर इस साल कुछ घाटे में बेचा, तो वह आपके गेन का टैक्स घटा सकता है।'), { big: t('Loss set-off', 'घाटे का सेट-ऑफ') }),
    sc('surprised', fill(t('Example: a gain of {g} and a loss of {l}. You are taxed on the net, {n}.', 'उदाहरण: {g} का गेन और {l} का नुक़सान। टैक्स शुद्ध {n} पर लगता है।'), { g: money(GAIN), l: money(LOSS), n: money(GAIN - LOSS) }),
      { prop: { kind: 'bars', items: [{ label: t('Gain', 'गेन'), value: GAIN, text: money(GAIN), tone: 'teal' }, { label: t('Loss', 'नुक़सान'), value: LOSS, text: money(LOSS), tone: 'red' }, { label: t('Taxed on', 'टैक्स पर'), value: GAIN - LOSS, text: money(GAIN - LOSS), tone: 'gold' }] } }),
    sc('think', t('There are rules. A long-term loss can only be set against long-term gains.', 'इसके नियम हैं। लंबी अवधि का नुक़सान सिर्फ़ लंबी अवधि के गेन से घटता है।')),
    sc('worry', t('Do not sell a good holding only for the tax. Selling has costs, and the price can rise after.', 'सिर्फ़ टैक्स के लिए अच्छी होल्डिंग न बेचें। बेचने की लागत होती है, और बाद में भाव बढ़ सकता है।')),
    sc('cheer', t('Check your gains and losses before the year ends, then decide.', 'साल ख़त्म होने से पहले अपने गेन और नुक़सान देखें, फिर तय करें।')),
  ],
  quiz: { q: t('Do you owe tax on the gain or on the net?', 'टैक्स गेन पर लगता है या शुद्ध रकम पर?'),
    options: [t('On the net after setting off the loss', 'घाटा घटाने के बाद शुद्ध रकम पर'), t('Always on the full gain', 'हमेशा पूरे गेन पर'), t('Never', 'कभी नहीं')], answer: 0,
    why: t('A loss that can be set off reduces the gain you are taxed on, within the rules.', 'जो घाटा घटाया जा सकता है, वह नियमों के भीतर कर-योग्य गेन घटाता है।') },
};

const D_SELF = 25_000, D_PARENT = 50_000, d80 = D_SELF + D_PARENT, d80Saved = Math.round(taxAtSlab(d80, 30));
const sec80d: Reel = {
  id: 'section-80d', topic: 'tax', lesson: 'insurance', tags: ['80D', 'health insurance'],
  title: t('Section 80D: health premium deduction', 'सेक्शन 80D: हेल्थ प्रीमियम की कटौती'),
  scenes: [
    sc('think', t('In the old regime, health insurance premiums you pay can be deducted from your income.', 'पुराने रिजीम में आपके चुकाए हेल्थ बीमा प्रीमियम आपकी आय से घटाए जा सकते हैं।'), { big: t('80D', '80D') }),
    sc('happy', fill(t('A common limit is {s} for you and your family, and {p} more for senior-citizen parents.', 'आम सीमा आपके और परिवार के लिए {s} है, और वरिष्ठ नागरिक माता-पिता के लिए {p} और।'), { s: money(D_SELF), p: money(D_PARENT) }),
      { prop: { kind: 'bars', items: [{ label: t('You and family', 'आप और परिवार'), value: D_SELF, text: money(D_SELF), tone: 'cyan' }, { label: t('Senior parents', 'वरिष्ठ माता-पिता'), value: D_PARENT, text: money(D_PARENT), tone: 'gold' }] } }),
    sc('surprised', fill(t('At the 30% slab, {d} of premiums can save about {s} of tax.', '30% स्लैब में {d} के प्रीमियम से लगभग {s} का टैक्स बच सकता है।'), { d: money(d80), s: money(d80Saved) })),
    sc('worry', t('Limits can change, and the new regime does not allow it. Pay by a traceable method.', 'सीमाएँ बदल सकती हैं, और नया रिजीम इसकी अनुमति नहीं देता। भुगतान ट्रेस होने वाले तरीक़े से करें।')),
    sc('cheer', t('Buy cover for protection first. The tax saving is a bonus.', 'पहले सुरक्षा के लिए कवर लें। टैक्स बचत अतिरिक्त लाभ है।')),
  ],
  quiz: { q: t('What is 80D for?', '80D किसके लिए है?'),
    options: [t('Health insurance premiums', 'हेल्थ बीमा प्रीमियम'), t('Home loan principal', 'होम लोन का मूलधन'), t('Mutual fund gains', 'म्यूचुअल फ़ंड का गेन')], answer: 0,
    why: t('It rewards paying for health cover, within limits, in the old regime.', 'यह पुराने रिजीम में, सीमाओं के भीतर, हेल्थ कवर के भुगतान पर लाभ देता है।') },
};

const LOAN_INT = 200_000, hlSaved = Math.round(taxAtSlab(LOAN_INT, 30));
const hlTax: Reel = {
  id: 'home-loan-tax-benefit', topic: 'tax', tags: ['home loan', 'interest deduction', 'old regime'],
  title: t('Tax benefit on a home loan', 'होम लोन पर टैक्स लाभ'),
  scenes: [
    sc('think', t('In the old regime, a home loan can cut your tax in two ways.', 'पुराने रिजीम में होम लोन दो तरह से टैक्स घटा सकता है।'), { big: t('Two benefits', 'दो लाभ') }),
    sc('happy', t('Interest on a self-occupied home can be deducted, up to a limit. Principal repaid can count under 80C.', 'रहने वाले घर पर ब्याज की कटौती सीमा तक मिल सकती है। चुकाया मूलधन 80C में गिना जा सकता है।'), { prop: { kind: 'steps', items: [t('Interest: up to ₹2 lakh', 'ब्याज: ₹2 लाख तक'), t('Principal: within the 80C limit', 'मूलधन: 80C सीमा में')] } }),
    sc('surprised', fill(t('At the 30% slab, {i} of interest can save about {s} of tax.', '30% स्लैब में {i} के ब्याज से लगभग {s} का टैक्स बच सकता है।'), { i: money(LOAN_INT), s: money(hlSaved) }),
      { prop: { kind: 'counter', from: 0, to: hlSaved, format: 'inr', tone: 'teal', label: t('tax saved (example)', 'बचा टैक्स (उदाहरण)') } }),
    sc('worry', t('The loan still costs interest. A tax saving never makes a loan free, and limits can change.', 'लोन पर ब्याज फिर भी लगता है। टैक्स बचत से लोन मुफ़्त नहीं होता, और सीमाएँ बदल सकती हैं।')),
    sc('cheer', t('Ask your lender for the yearly interest certificate, and keep it with your tax papers.', 'बैंक से सालाना ब्याज प्रमाणपत्र लें और टैक्स काग़ज़ों के साथ रखें।')),
  ],
  quiz: { q: t('Does a tax saving make a home loan free?', 'क्या टैक्स बचत से होम लोन मुफ़्त हो जाता है?'),
    options: [t('No, you still pay interest', 'नहीं, ब्याज फिर भी देना पड़ता है'), t('Yes, completely', 'हाँ, पूरी तरह'), t('Only in the first year', 'सिर्फ़ पहले साल')], answer: 0,
    why: t('You save a part of the interest in tax, and you still pay the rest.', 'आप ब्याज का एक हिस्सा टैक्स में बचाते हैं, बाक़ी फिर भी देते हैं।') },
};

const proofs: Reel = {
  id: 'tax-proofs-checklist', topic: 'tax', tags: ['proofs', 'old regime', 'checklist'],
  title: t('Your tax-proof checklist', 'आपकी टैक्स-प्रूफ़ चेकलिस्ट'),
  scenes: [
    sc('think', t('If you claim deductions in the old regime, your employer asks for proofs. Do not leave it to the last week.', 'पुराने रिजीम में कटौती क्लेम करें तो नियोक्ता प्रूफ़ माँगता है। इसे आख़िरी हफ़्ते पर न छोड़ें।'), { big: t('Proofs', 'प्रूफ़') }),
    sc('happy', t('Start a folder now and add to it through the year.', 'अभी एक फ़ोल्डर बनाएँ और साल भर उसमें जोड़ते रहें।'), { prop: { kind: 'steps', items: [t('Rent receipts, landlord PAN', 'किराये की रसीदें, मकान-मालिक का PAN'), t('Insurance premium receipts', 'बीमा प्रीमियम रसीदें'), t('80C investment statements', '80C निवेश स्टेटमेंट'), t('Home loan interest certificate', 'होम लोन ब्याज प्रमाणपत्र')] }, ms: 5400 }),
    sc('worry', t('If proofs are missing, TDS may be cut on the full amount, and you claim the rest back when filing.', 'प्रूफ़ न हों तो पूरी रकम पर TDS कट सकता है, और बाक़ी आप रिटर्न भरते समय वापस माँगते हैं।')),
    sc('think', t('Choose your regime early in the year so the TDS matches what you will actually owe.', 'साल की शुरुआत में रिजीम चुनें ताकि TDS वही हो जो असल में बनेगा।')),
    sc('cheer', t('Photograph each receipt the day you get it.', 'हर रसीद मिलते ही उसकी फ़ोटो ले लें।')),
  ],
  quiz: { q: t('What if you miss giving proofs to your employer?', 'अगर आप नियोक्ता को प्रूफ़ देना चूक जाएँ तो?'),
    options: [t('Extra TDS may be cut, and you can claim it back when filing', 'ज़्यादा TDS कट सकता है, जिसे रिटर्न में वापस माँग सकते हैं'), t('Your deductions are lost forever', 'आपकी कटौतियाँ हमेशा के लिए चली जाती हैं'), t('Nothing happens', 'कुछ नहीं होता')], answer: 0,
    why: t('You can still claim eligible deductions in your return, but it is easier to avoid the extra TDS.', 'आप रिटर्न में पात्र कटौतियाँ फिर भी क्लेम कर सकते हैं, पर अतिरिक्त TDS से बचना आसान है।') },
};

const stdSaved30 = Math.round(taxAtSlab(STD_NEW, 30));
const stdDed: Reel = {
  id: 'standard-deduction', topic: 'tax', tags: ['standard deduction', 'salary'],
  title: t('The deduction you get without proof', 'वह कटौती जो बिना प्रूफ़ मिलती है'),
  scenes: [
    sc('happy', t('Salaried people get a standard deduction from their salary. You need no bills for it.', 'नौकरीपेशा लोगों को सैलरी से स्टैंडर्ड डिडक्शन मिलता है। इसके लिए कोई बिल नहीं चाहिए।'), { big: t('Standard deduction', 'स्टैंडर्ड डिडक्शन') }),
    sc('think', fill(t('For FY 2026-27 it is {n} in the new regime and {o} in the old regime.', 'FY 2026-27 में यह नए रिजीम में {n} और पुराने में {o} है।'), { n: money(STD_NEW), o: money(STD_OLD) }),
      { prop: { kind: 'bars', items: [{ label: t('New regime', 'नया रिजीम'), value: STD_NEW, text: money(STD_NEW), tone: 'teal' }, { label: t('Old regime', 'पुराना रिजीम'), value: STD_OLD, text: money(STD_OLD), tone: 'gold' }] } }),
    sc('surprised', fill(t('If you are in the 30% slab, {n} can save about {s} of tax with cess. Only higher earners are.', 'अगर आप 30% स्लैब में हैं, तो {n} से सेस सहित लगभग {s} का टैक्स बचता है। ऐसा सिर्फ़ ऊँची आय वालों के साथ है।'), { n: money(STD_NEW), s: money(stdSaved30) })),
    sc('worry', t('It is for salary and pension income, not for business income. Amounts change with Budgets.', 'यह वेतन और पेंशन की आय के लिए है, कारोबार की आय के लिए नहीं। रक़में बजट के साथ बदलती हैं।')),
    sc('cheer', t('Check that your payslip and Form 16 show it.', 'देखें कि आपकी पेस्लिप और फ़ॉर्म 16 में यह दिख रही है।')),
  ],
  quiz: { q: t('Do you need bills to claim the standard deduction?', 'स्टैंडर्ड डिडक्शन के लिए क्या बिल चाहिए?'),
    options: [t('No, it applies to salary automatically', 'नहीं, यह सैलरी पर अपने आप लगता है'), t('Yes, for every rupee', 'हाँ, हर रुपये का'), t('Only for rent', 'सिर्फ़ किराये के लिए')], answer: 0,
    why: t('It is a flat amount given on salary income, with no receipts needed.', 'यह वेतन की आय पर दी जाने वाली तय रकम है, रसीदों की ज़रूरत नहीं।') },
};

export const TAX_MORE: Reel[] = [hra, itrSteps, form16, fdTax, harvest, sec80d, hlTax, proofs, stdDed];

// ── Retirement ───────────────────────────────────────────────────────────────────────────────────────────────────
const SPEND_Y = 720_000, YRS = 25, INFL = 6, spendAtRetire = Math.round(grownCost(SPEND_Y, INFL, YRS)), corpus25 = spendAtRetire * 25;
const retireSteps: Reel = {
  id: 'retire-number-steps', topic: 'retire', tags: ['retirement', 'corpus', 'steps'],
  title: t('Find your retirement number in four steps', 'चार क़दमों में अपना रिटायरमेंट नंबर निकालें'),
  scenes: [
    sc('think', t('A retirement number is not a guess. You can work it out in four steps.', 'रिटायरमेंट नंबर अंदाज़ा नहीं है। आप इसे चार क़दमों में निकाल सकते हैं।'), { big: t('Your number', 'आपका नंबर') }),
    sc('happy', t('Take them in order.', 'इन्हें क्रम से लें।'), { prop: { kind: 'steps', items: [t('Your yearly spending today', 'आज का सालाना ख़र्च'), t('Raise it for inflation', 'महँगाई जोड़ें'), t('Subtract pensions you will get', 'मिलने वाली पेंशन घटाएँ'), t('Multiply it by 25', 'लगभग 25 से गुणा करें')] }, ms: 5400 }),
    sc('surprised', fill(t('Example: {s} a year, in {y} years at an assumed {i}% inflation, is about {r} a year. Times 25 is about {c}.', 'उदाहरण: {s} सालाना, {y} साल बाद, मान लें {i}% महँगाई, लगभग {r} सालाना। गुणा 25 पर लगभग {c}।'), { s: money(SPEND_Y), y: YRS, i: INFL, r: money(spendAtRetire), c: money(corpus25) }),
      { prop: { kind: 'counter', from: 0, to: corpus25, format: 'inr', tone: 'teal', label: t('rough number (illustration)', 'मोटा नंबर (उदाहरण)') } }),
    sc('worry', t('It ignores pensions, your other income and surprises. Treat it as a rough target, not a promise.', 'इसमें पेंशन, आपकी दूसरी आय और अनहोनी शामिल नहीं हैं। इसे मोटा लक्ष्य मानें, वादा नहीं।')),
    sc('cheer', t('Work it out for your own numbers, then save it so you can revisit it each year.', 'अपने आँकड़ों पर निकालें, फिर उसे सहेजें ताकि हर साल दोबारा देख सकें।')),
  ],
  quiz: { q: t('Why raise today’s spending for inflation?', 'आज के ख़र्च में महँगाई क्यों जोड़ें?'),
    options: [t('The same life costs more in future rupees', 'वही जीवन भविष्य के रुपयों में महँगा होगा'), t('Banks require it', 'बैंक यह माँगते हैं'), t('Taxes are higher', 'टैक्स ज़्यादा होता है')], answer: 0,
    why: t('You will spend future rupees, so the number must be in them.', 'आप भविष्य के रुपये ख़र्च करेंगे, इसलिए नंबर उन्हीं में होना चाहिए।') },
};

const ANN = 5_000_000, ANN_RATE = 6, annM = annuityMonthly(ANN, ANN_RATE), annLater = inflatedValue(annM, 6, 20);
const annuity: Reel = {
  id: 'annuity-basics', topic: 'retire', tags: ['annuity', 'pension'],
  title: t('What an annuity is', 'एन्युटी क्या है'),
  scenes: [
    sc('think', t('An annuity turns a lump sum into a regular income, usually for life. You give a sum to an insurer.', 'एन्युटी एकमुश्त रकम को नियमित आय में बदलती है, आम तौर पर उम्र भर के लिए। आप बीमा कंपनी को एक रकम देते हैं।'), { big: t('Annuity', 'एन्युटी') }),
    sc('surprised', fill(t('Example: {a} at an assumed {r}% pays about {m} a month.', 'उदाहरण: {a} पर मान लें {r}% सालाना, महीने के लगभग {m} मिलते हैं।'), { a: money(ANN), r: ANN_RATE, m: money(Math.round(annM)) }),
      { prop: { kind: 'counter', from: 0, to: Math.round(annM), format: 'inr', tone: 'teal', label: t('a month (example)', 'महीना (उदाहरण)') } }),
    sc('worry', fill(t('Many annuities stay flat while prices rise. At 6% inflation, in 20 years that buys what about {l} buys today.', 'कई एन्युटी वही रहती हैं जबकि कीमतें बढ़ती हैं। 6% महँगाई में 20 साल बाद वह आज के लगभग {l} जितना ख़रीदती है।'), { l: money(Math.round(annLater)) }),
      { prop: { kind: 'bars', items: [{ label: t('Today', 'आज'), value: annM, text: money(Math.round(annM)), tone: 'teal' }, { label: t('In 20 years', '20 साल बाद'), value: annLater, text: money(Math.round(annLater)), tone: 'red' }] } }),
    sc('think', t('The lump sum usually cannot be taken back. Compare payouts, whether the money goes to family, and any tax.', 'एकमुश्त रकम आम तौर पर वापस नहीं मिलती। भुगतान, परिवार को पैसा जाएगा या नहीं, और टैक्स की तुलना करें।')),
    sc('cheer', t('Get several quotes, and decide how much of your corpus needs this kind of certainty.', 'कई कोटेशन लें, और तय करें कि आपके कॉर्पस के कितने हिस्से को ऐसी निश्चितता चाहिए।')),
  ],
  quiz: { q: t('What is a drawback of a fixed annuity?', 'फ़िक्स्ड एन्युटी की एक कमी क्या है?'),
    options: [t('Inflation can eat into the fixed income', 'महँगाई तय आय को खा सकती है'), t('It pays nothing at all', 'वह कुछ नहीं देती'), t('You can withdraw it any time', 'आप कभी भी निकाल सकते हैं')], answer: 0,
    why: t('A payout that does not rise buys less each year as prices rise.', 'जो भुगतान बढ़ता नहीं, वह कीमतें बढ़ने पर हर साल कम ख़रीदता है।') },
};

const compare: Reel = {
  id: 'epf-ppf-nps-compare', topic: 'retire', tags: ['EPF', 'PPF', 'NPS', 'comparison'],
  title: t('EPF, PPF and NPS side by side', 'EPF, PPF और NPS साथ-साथ'),
  scenes: [
    sc('think', t('Three long-term saving options, and they work differently. Know which suits you.', 'तीन लंबी अवधि के बचत विकल्प, और तीनों अलग चलते हैं। जानें कौन आपके काम का है।'), { big: t('Three options', 'तीन विकल्प'), ms: 4800 }),
    sc('happy', t('Who can use each one:', 'हर एक कौन ले सकता है:'), { prop: { kind: 'steps', items: [t('EPF: salaried, with employer', 'EPF: नौकरीपेशा, नियोक्ता के साथ'), t('PPF: anyone', 'PPF: कोई भी'), t('NPS: anyone', 'NPS: कोई भी')] } }),
    sc('think', t('How long the money is tied up:', 'पैसा कितने समय बँधा रहता है:'), { prop: { kind: 'steps', items: [t('EPF: till retirement', 'EPF: रिटायरमेंट तक'), t('PPF: 15 years', 'PPF: 15 साल'), t('NPS: till retirement age', 'NPS: रिटायरमेंट उम्र तक')] } }),
    sc('worry', t('Rates, tax treatment and withdrawal rules differ and change. Check the latest for each.', 'दरें, टैक्स का तरीक़ा और निकासी के नियम अलग हैं और बदलते हैं। हर एक के ताज़ा नियम देखें।')),
    sc('cheer', t('Many people use more than one. Choose by lock-in, risk and how much you can set aside.', 'कई लोग एक से ज़्यादा इस्तेमाल करते हैं। लॉक-इन, जोखिम और अलग रखी जा सकने वाली रकम से चुनें।')),
  ],
  quiz: { q: t('Which of these has a 15-year lock-in?', 'इनमें किसमें 15 साल का लॉक-इन है?'),
    options: [t('PPF', 'PPF'), t('EPF', 'EPF'), t('A savings account', 'बचत खाता')], answer: 0,
    why: t('A PPF account runs for 15 years, with limited options before that.', 'PPF खाता 15 साल चलता है, उससे पहले विकल्प सीमित हैं।') },
};

const MED = 100_000, MED_RATE = 10, MED_YEARS = 20, medLater = Math.round(grownCost(MED, MED_RATE, MED_YEARS));
const medical: Reel = {
  id: 'healthcare-in-retirement', topic: 'retire', lesson: 'insurance', tags: ['healthcare', 'retirement', 'inflation'],
  title: t('Healthcare in retirement', 'रिटायरमेंट में इलाज'),
  scenes: [
    sc('worry', t('Medical costs tend to rise faster than ordinary prices, and you need care more as you age.', 'इलाज का ख़र्च आम कीमतों से तेज़ बढ़ता है, और उम्र के साथ देखभाल की ज़रूरत भी बढ़ती है।'), { big: t('Care costs', 'इलाज का ख़र्च') }),
    sc('surprised', fill(t('Say medical costs rise {r}% a year. A treatment that costs {m} today could cost about {l} in {y} years.', 'मान लें इलाज का ख़र्च साल में {r}% बढ़ता है। आज {m} का इलाज {y} साल बाद लगभग {l} का हो सकता है।'), { r: MED_RATE, m: money(MED), l: money(medLater), y: MED_YEARS }),
      { prop: { kind: 'bars', items: [{ label: t('Today', 'आज'), value: MED, text: money(MED), tone: 'gold' }, { label: t('In 20 years', '20 साल बाद'), value: medLater, text: money(medLater), tone: 'red' }] } }),
    sc('think', t('Buy health cover while you are healthy. Waiting periods and premiums both rise with age.', 'स्वस्थ रहते हुए हेल्थ कवर लें। इंतज़ार की अवधि और प्रीमियम दोनों उम्र के साथ बढ़ते हैं।')),
    sc('happy', t('Keep a separate health fund in your retirement plan, so a big bill does not force you to sell investments at a bad time.', 'रिटायरमेंट योजना में अलग हेल्थ फ़ंड रखें, ताकि बड़ा बिल आपको बुरे समय निवेश बेचने पर मजबूर न करे।')),
    sc('cheer', t('Review cover every few years as costs and your needs change.', 'ख़र्च और ज़रूरतें बदलने पर हर कुछ सालों में कवर देखें।')),
  ],
  quiz: { q: t('When is it best to buy health cover?', 'हेल्थ कवर कब लेना सबसे अच्छा है?'),
    options: [t('While you are young and healthy', 'जब आप जवान और स्वस्थ हों'), t('Only after a big illness', 'किसी बड़ी बीमारी के बाद ही'), t('Only at retirement', 'सिर्फ़ रिटायरमेंट पर')], answer: 0,
    why: t('Premiums are lower and waiting periods start earlier when you are younger.', 'कम उम्र में प्रीमियम कम होते हैं और इंतज़ार की अवधि जल्दी शुरू होती है।') },
};

const MONTHLY_SPEND = 50_000, bucket1 = MONTHLY_SPEND * 24;
const buckets: Reel = {
  id: 'retirement-buckets', topic: 'retire', tags: ['retirement income', 'buckets'],
  title: t('Three buckets for retirement income', 'रिटायरमेंट की आय के तीन बकेट'),
  scenes: [
    sc('think', t('In retirement the worry is selling investments in a market fall to pay the bills.', 'रिटायरमेंट में चिंता यह रहती है कि बिल चुकाने के लिए बाज़ार गिरने पर निवेश बेचना पड़े।'), { big: t('Buckets', 'बकेट') }),
    sc('happy', fill(t('A common idea: keep two years of spending in safe, easy-to-reach money. At {s} a month that is {b}.', 'एक आम विचार: दो साल का ख़र्च सुरक्षित, आसानी से निकलने वाले पैसे में रखें। {s} महीने पर यह {b} है।'), { s: money(MONTHLY_SPEND), b: money(bucket1) }),
      { prop: { kind: 'counter', from: 0, to: bucket1, format: 'inr', tone: 'teal', label: t('bucket 1: next 2 years', 'बकेट 1: अगले 2 साल') } }),
    sc('think', t('Then a middle bucket of safer investments for the years after, and a long-term bucket for growth.', 'फिर आगे के सालों के लिए सुरक्षित निवेश का बीच का बकेट, और बढ़त के लिए लंबी अवधि का बकेट।'), { prop: { kind: 'steps', items: [t('Now: safe and ready', 'अभी: सुरक्षित और तैयार'), t('Next years: steadier', 'आगे के साल: स्थिर'), t('Later: for growth', 'बाद में: बढ़त के लिए')] } }),
    sc('worry', t('Refill the first bucket from the others over time. It is one way to plan, not the only way.', 'पहले बकेट को समय के साथ बाक़ियों से भरते रहें। यह योजना बनाने का एक तरीक़ा है, इकलौता नहीं।')),
    sc('cheer', t('Whatever you choose, know where next year’s spending is coming from.', 'जो भी चुनें, यह जानें कि अगले साल का ख़र्च कहाँ से आएगा।')),
  ],
  quiz: { q: t('What is the first bucket for?', 'पहला बकेट किसके लिए है?'),
    options: [t('Spending in the next couple of years', 'अगले एक-दो सालों का ख़र्च'), t('The riskiest investments', 'सबसे जोखिम भरे निवेश'), t('Gifts', 'तोहफ़े')], answer: 0,
    why: t('Having near-term spending set aside means a market fall does not force you to sell.', 'नज़दीकी ख़र्च अलग रखा हो, तो बाज़ार गिरने पर बेचना नहीं पड़ता।') },
};

export const RETIRE_MORE: Reel[] = [retireSteps, annuity, compare, medical, buckets];
