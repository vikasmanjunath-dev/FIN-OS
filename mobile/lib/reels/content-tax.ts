// Tax and retirement reels. Tax figures come from lib/taxcore.ts (the same maths the tax screens use), so a reel and a screen cannot disagree.
import { CESS, STD_NEW, STD_OLD, taxNew, taxOld } from '@/lib/taxcore';
import { fill, monthsToDeplete, money, yearlyDepositsValue } from '@/lib/reels/figures';
import { sc, t } from '@/lib/reels/kit';
import type { Reel } from '@/lib/reels/types';

// ── Tax: which regime ────────────────────────────────────────────────────────────────────────────────────────────
const GROSS = 1_500_000, DEDUCT = 200_000;
const newTax = taxNew(GROSS - STD_NEW), oldTax = taxOld(GROSS - STD_OLD - DEDUCT);
const taxRegimes: Reel = {
  id: 'tax-regimes', topic: 'tax', tags: ['income tax', 'regime'],
  title: t('Old or new tax regime?', 'पुराना या नया टैक्स रिजीम?'),
  scenes: [
    sc('think', t('Two ways to work out your income tax. You pick one each year.', 'आयकर निकालने के दो तरीक़े। हर साल आप एक चुनते हैं।'), { big: t('Two regimes', 'दो रिजीम') }),
    sc('happy', t('The new regime has lower rates and few deductions. The old one has higher rates but lets you claim deductions.', 'नए रिजीम में दरें कम और कटौतियाँ कम हैं। पुराने में दरें ज़्यादा हैं, पर कटौतियाँ मिलती हैं।'),
      { prop: { kind: 'steps', items: [t('New: lower rates', 'नया: कम दरें'), t('Old: more deductions', 'पुराना: ज़्यादा कटौती')] } }),
    sc('surprised', fill(t('Example, FY 2026-27: pay {g}, deductions {d}. New regime tax is about {n}, old regime about {o}.', 'उदाहरण, FY 2026-27: आय {g}, कटौती {d}। नए रिजीम में टैक्स लगभग {n}, पुराने में लगभग {o}।'), { g: money(GROSS), d: money(DEDUCT), n: money(newTax), o: money(oldTax) }),
      { prop: { kind: 'bars', items: [{ label: t('New', 'नया'), value: newTax, text: money(newTax), tone: 'teal' }, { label: t('Old', 'पुराना'), value: oldTax, text: money(oldTax), tone: 'gold' }] } }),
    sc('think', t('With large deductions, such as a home loan and 80C, the old regime can come out ahead. It depends on you.', 'बड़ी कटौतियों, जैसे होम लोन और 80C, के साथ पुराना रिजीम आगे निकल सकता है। यह आप पर निर्भर है।')),
    sc('worry', t('Rates and limits change with each Budget. Check the current year before you choose.', 'दरें और सीमाएँ हर बजट में बदलती हैं। चुनने से पहले इस साल की जाँच लें।'), { prop: { kind: 'shield', text: t('Check this year', 'इस साल जाँचें'), sub: t('rules change', 'नियम बदलते हैं') } }),
    sc('cheer', t('Work out both with your own numbers, then pick the lower one.', 'अपने आँकड़ों से दोनों निकालें, फिर कम वाला चुनें।')),
  ],
  quiz: { q: t('Which regime always gives the lower tax?', 'कौन-सा रिजीम हमेशा कम टैक्स देता है?'),
    options: [t('The new regime, always', 'नया रिजीम, हमेशा'), t('The old regime, always', 'पुराना रिजीम, हमेशा'), t('It depends on your income and deductions', 'यह आपकी आय और कटौतियों पर निर्भर है')], answer: 2,
    why: t('Lower rates help some people; large deductions help others. Compare both on your own numbers.', 'कम दरें कुछ लोगों को फ़ायदा देती हैं, बड़ी कटौतियाँ दूसरों को। अपने आँकड़ों पर दोनों की तुलना करें।') },
};

// ── Tax: section 80C ─────────────────────────────────────────────────────────────────────────────────────────────
const C80 = 150_000, saved20 = Math.round(C80 * 0.2 * (1 + CESS)), saved30 = Math.round(C80 * 0.3 * (1 + CESS));
const sec80c: Reel = {
  id: 'section-80c', topic: 'tax', tags: ['80C', 'deduction'],
  title: t('Section 80C in 30 seconds', 'सेक्शन 80C, 30 सेकंड में'),
  scenes: [
    sc('think', t('Section 80C lets you deduct up to ₹1.5 lakh a year from your taxable income, in the old regime.', 'सेक्शन 80C पुराने रिजीम में साल के ₹1.5 लाख तक आपकी कर-योग्य आय से घटाने देता है।'), { big: t('₹1.5 lakh', '₹1.5 लाख') }),
    sc('happy', t('Many things count: your EPF, PPF, ELSS funds, life insurance premium and tuition fees.', 'कई चीज़ें गिनी जाती हैं: आपका EPF, PPF, ELSS फ़ंड, जीवन बीमा प्रीमियम और बच्चों की ट्यूशन फ़ीस।'),
      { prop: { kind: 'steps', items: [t('EPF and PPF', 'EPF और PPF'), t('ELSS funds', 'ELSS फ़ंड'), t('Life insurance premium', 'जीवन बीमा प्रीमियम'), t('Tuition fees', 'ट्यूशन फ़ीस')] } }),
    sc('surprised', fill(t('The tax you save depends on your slab. On {c}, about {a} at 20% and about {b} at 30% (with cess).', 'बचत आपके स्लैब पर निर्भर है। {c} पर 20% में लगभग {a} और 30% में लगभग {b} (सेस सहित)।'), { c: money(C80), a: money(saved20), b: money(saved30) }),
      { prop: { kind: 'bars', items: [{ label: t('20% slab', '20% स्लैब'), value: saved20, text: money(saved20), tone: 'gold' }, { label: t('30% slab', '30% स्लैब'), value: saved30, text: money(saved30), tone: 'teal' }] } }),
    sc('worry', t('Do not buy a product only to save tax. Each option locks money or carries risk.', 'सिर्फ़ टैक्स बचाने के लिए कोई प्रोडक्ट न लें। हर विकल्प में पैसा बँधता है या जोखिम होता है।')),
    sc('think', t('In the new regime 80C is not available. If you chose it, this does not apply to you.', 'नए रिजीम में 80C नहीं मिलता। अगर आपने वह चुना है, तो यह आप पर लागू नहीं होता।')),
    sc('cheer', t('Count what you already pay, like EPF, before adding anything.', 'कुछ जोड़ने से पहले गिनें कि आप पहले से क्या दे रहे हैं, जैसे EPF।')),
  ],
  quiz: { q: t('Who can use the 80C deduction?', '80C कटौती कौन ले सकता है?'),
    options: [t('Only people in the old regime', 'सिर्फ़ पुराने रिजीम वाले'), t('Everyone, in either regime', 'सभी, किसी भी रिजीम में'), t('Only people who pay no tax', 'सिर्फ़ जो टैक्स नहीं भरते')], answer: 0,
    why: t('The new regime gives up most deductions, 80C included.', 'नया रिजीम ज़्यादातर कटौतियाँ छोड़ देता है, 80C समेत।') },
};

// ── Tax: TDS and refunds ─────────────────────────────────────────────────────────────────────────────────────────
const TDS = 120_000, due = newTax, refund = TDS - due;
const tdsRefund: Reel = {
  id: 'tds-refund', topic: 'tax', tags: ['TDS', 'ITR', 'refund'],
  title: t('TDS and your refund', 'TDS और आपका रिफ़ंड'),
  scenes: [
    sc('think', t('TDS is tax cut at source, before the money reaches you.', 'TDS वह टैक्स है जो पैसा आपके पास पहुँचने से पहले ही कट जाता है।'), { big: t('TDS', 'TDS') }),
    sc('surprised', fill(t('Example: your employer cut {t}, but your real tax is {d}. The extra {r} is yours.', 'उदाहरण: नियोक्ता ने {t} काटा, पर असली टैक्स {d} है। बचा {r} आपका है।'), { t: money(TDS), d: money(due), r: money(refund) }),
      { prop: { kind: 'bars', items: [{ label: t('TDS cut', 'TDS कटा'), value: TDS, text: money(TDS), tone: 'gold' }, { label: t('Real tax', 'असली टैक्स'), value: due, text: money(due), tone: 'teal' }] } }),
    sc('happy', t('You get it back by filing your income tax return. No return, no refund.', 'यह आपको आयकर रिटर्न भरने पर वापस मिलता है। रिटर्न नहीं, तो रिफ़ंड नहीं।')),
    sc('think', t('Before you file, match your records with the tax department’s statements.', 'भरने से पहले अपने रिकॉर्ड को आयकर विभाग के स्टेटमेंट से मिलाएँ।'),
      { prop: { kind: 'steps', items: [t('Check Form 26AS and AIS', 'फ़ॉर्म 26AS और AIS देखें'), t('File your ITR', 'ITR भरें'), t('Refund to your bank', 'रिफ़ंड बैंक में')] } }),
    sc('worry', t('Your bank account must be validated on the portal, or the refund can get stuck.', 'पोर्टल पर आपका बैंक खाता वैलिडेट होना चाहिए, वरना रिफ़ंड अटक सकता है।')),
    sc('cheer', t('File on time, even if you think you owe nothing.', 'समय पर भरें, भले ही आपको लगे कि कुछ देना नहीं है।')),
  ],
  quiz: { q: t('How do you get back excess TDS?', 'ज़्यादा कटा TDS वापस कैसे मिलता है?'),
    options: [t('It comes back automatically', 'अपने आप वापस आ जाता है'), t('By filing your income tax return', 'आयकर रिटर्न भरकर'), t('By asking your employer to refund it', 'नियोक्ता से रिफ़ंड माँगकर')], answer: 1,
    why: t('The refund is worked out and paid when your return is processed.', 'रिटर्न प्रोसेस होने पर रिफ़ंड निकाला और दिया जाता है।') },
};

// ── Tax: capital gains ───────────────────────────────────────────────────────────────────────────────────────────
const BOUGHT = 100_000, SOLD = 150_000;
const capGains: Reel = {
  id: 'capital-gains', topic: 'tax', tags: ['capital gains', 'LTCG', 'STCG'],
  title: t('Capital gains in plain words', 'कैपिटल गेन आसान भाषा में'),
  scenes: [
    sc('think', t('Sell an investment for more than you paid, and the profit is a capital gain.', 'कोई निवेश खरीद से ज़्यादा में बेचें, तो जो मुनाफ़ा हो वह कैपिटल गेन है।'), { big: t('Capital gain', 'कैपिटल गेन') }),
    sc('happy', fill(t('Example: bought for {b}, sold for {s}. The gain is {g}.', 'उदाहरण: {b} में खरीदा, {s} में बेचा। गेन {g} है।'), { b: money(BOUGHT), s: money(SOLD), g: money(SOLD - BOUGHT) }),
      { prop: { kind: 'bars', items: [{ label: t('Bought', 'खरीदा'), value: BOUGHT, text: money(BOUGHT), tone: 'gold' }, { label: t('Sold', 'बेचा'), value: SOLD, text: money(SOLD), tone: 'teal' }] } }),
    sc('think', t('How long you held it decides if the gain is short term or long term.', 'आपने कितने समय रखा, इससे तय होता है कि गेन शॉर्ट टर्म है या लॉन्ग टर्म।')),
    sc('surprised', t('For listed shares and equity funds, more than 12 months is long term.', 'लिस्टेड शेयर और इक्विटी फ़ंड में, 12 महीने से ज़्यादा लॉन्ग टर्म है।'), { prop: { kind: 'counter', from: 0, to: 12, format: 'plain', unit: t('months', 'महीने'), tone: 'cyan', label: t('long term, for listed equity', 'लॉन्ग टर्म, लिस्टेड इक्विटी') } }),
    sc('worry', t('Tax rates and exemptions differ by asset and change in Budgets. Check the current ones before you sell.', 'दरें और छूट हर एसेट में अलग हैं और बजट में बदलती हैं। बेचने से पहले ताज़ा जाँचें।')),
    sc('cheer', t('Keep your buy dates and prices. They make filing easy.', 'खरीद की तारीख़ें और भाव सँभालकर रखें। इनसे रिटर्न भरना आसान होता है।')),
  ],
  quiz: { q: t('What decides short term or long term?', 'शॉर्ट टर्म या लॉन्ग टर्म क्या तय करता है?'),
    options: [t('How long you held the asset', 'आपने एसेट कितने समय रखा'), t('How much profit you made', 'कितना मुनाफ़ा हुआ'), t('Which broker you used', 'कौन-सा ब्रोकर इस्तेमाल किया')], answer: 0,
    why: t('The holding period sets the type of gain, and the type sets the tax treatment.', 'होल्डिंग अवधि गेन का प्रकार तय करती है, और प्रकार से टैक्स का तरीक़ा।') },
};

// ── Tax: dates ───────────────────────────────────────────────────────────────────────────────────────────────────
const taxDates: Reel = {
  id: 'tax-dates', topic: 'tax', tags: ['advance tax', 'ITR', 'deadline'],
  title: t('Tax dates worth remembering', 'याद रखने लायक़ टैक्स तारीख़ें'),
  scenes: [
    sc('worry', t('Missing a tax date can cost you interest and fees.', 'टैक्स की तारीख़ चूकने पर ब्याज और शुल्क लग सकता है।'), { big: t('Dates', 'तारीख़ें') }),
    sc('think', t('If your tax after TDS is over ₹10,000 a year, you pay advance tax in instalments.', 'अगर TDS के बाद आपका टैक्स साल में ₹10,000 से ज़्यादा है, तो आप एडवांस टैक्स किस्तों में देते हैं।')),
    sc('happy', t('The instalment dates are the same every year.', 'किस्तों की तारीख़ें हर साल वही रहती हैं।'), { prop: { kind: 'steps', items: [t('15 June', '15 जून'), t('15 September', '15 सितंबर'), t('15 December', '15 दिसंबर'), t('15 March', '15 मार्च')] } }),
    sc('think', t('Most salaried people file their return by 31 July of the next year.', 'ज़्यादातर नौकरीपेशा लोग अगले साल 31 जुलाई तक रिटर्न भरते हैं।')),
    sc('worry', t('Dates can be extended in some years, so confirm each year. Do not count on an extension.', 'कुछ सालों में तारीख़ें बढ़ती हैं, इसलिए हर साल पुष्टि करें। बढ़ने पर भरोसा न रखें।')),
    sc('cheer', t('Put these dates in your calendar once. The app’s calendar can remind you.', 'ये तारीख़ें एक बार कैलेंडर में डाल दें। ऐप का कैलेंडर याद दिला सकता है।')),
  ],
  quiz: { q: t('When is the usual return deadline for most salaried people?', 'ज़्यादातर नौकरीपेशा लोगों के लिए रिटर्न की आम अंतिम तारीख़ क्या है?'),
    options: [t('31 July', '31 जुलाई'), t('31 December', '31 दिसंबर'), t('15 March', '15 मार्च')], answer: 0,
    why: t('It is usually 31 July, but confirm each year because it can be extended.', 'आम तौर पर 31 जुलाई, पर हर साल पुष्टि करें क्योंकि यह बढ़ सकती है।') },
};

export const TAX_REELS: Reel[] = [taxRegimes, sec80c, tdsRefund, capGains, taxDates];

// ── Retirement: the corpus ───────────────────────────────────────────────────────────────────────────────────────
const SPEND_NOW = 50_000, YEARS_TO = 25, INFL = 6;
const spendLater = Math.round(SPEND_NOW * Math.pow(1 + INFL / 100, YEARS_TO));
const corpusNeed = spendLater * 12 * 25;
const retireCorpus: Reel = {
  id: 'retire-corpus', topic: 'retire', tags: ['retirement', 'corpus'],
  title: t('How big a retirement corpus?', 'रिटायरमेंट के लिए कितना कॉर्पस?'),
  scenes: [
    sc('think', t('How much do you need to stop working? Start from what you spend.', 'काम बंद करने के लिए कितना चाहिए? अपने ख़र्च से शुरू करें।'), { big: t('How much?', 'कितना?') }),
    sc('worry', fill(t('Say you spend {s} a month today. At an assumed {i}% inflation, in {y} years that is about {l} a month.', 'मान लें आज आपका ख़र्च {s} महीना है। {i}% महँगाई मानें तो {y} साल बाद यह लगभग {l} महीना होगा।'), { s: money(SPEND_NOW), i: INFL, y: YEARS_TO, l: money(spendLater) }),
      { prop: { kind: 'counter', from: SPEND_NOW, to: spendLater, format: 'inr', tone: 'red', label: t('monthly spend in 25 years (illustration)', '25 साल बाद का मासिक ख़र्च (उदाहरण)') } }),
    sc('happy', fill(t('A rough rule of thumb: a corpus of about 25 times your yearly spend. Here, about {c}.', 'एक मोटा अंदाज़ा: कॉर्पस आपके सालाना ख़र्च का लगभग 25 गुना। यहाँ लगभग {c}।'), { c: money(corpusNeed) }),
      { prop: { kind: 'counter', from: 0, to: corpusNeed, format: 'inr', tone: 'teal', label: t('rough corpus (illustration)', 'मोटा कॉर्पस (उदाहरण)') } }),
    sc('think', t('The rule is only a starting point. Your age, health, other income and lifestyle change the answer.', 'यह नियम सिर्फ़ शुरुआत है। आपकी उम्र, सेहत, दूसरी आमदनी और जीवनशैली जवाब बदलते हैं।')),
    sc('cheer', t('Work backwards: how much a month gets you there? A calculator can show it.', 'पीछे से चलें: हर महीने कितना लगाने से वहाँ पहुँचेंगे? कैलकुलेटर दिखा सकता है।')),
  ],
  quiz: { q: t('Why is the future monthly spend higher than today’s?', 'आगे का मासिक ख़र्च आज से ज़्यादा क्यों है?'),
    options: [t('Prices rise over the years', 'सालों में कीमतें बढ़ती हैं'), t('You will buy more things', 'आप ज़्यादा चीज़ें खरीदेंगे'), t('Banks charge more', 'बैंक ज़्यादा शुल्क लेते हैं')], answer: 0,
    why: t('Inflation makes the same lifestyle cost more every year, so plan in future rupees.', 'महँगाई से वही जीवनशैली हर साल महँगी होती है, इसलिए भविष्य के रुपयों में योजना बनाएँ।') },
};

// ── Retirement: EPF ──────────────────────────────────────────────────────────────────────────────────────────────
const BASIC = 30_000, EPF_SHARE = Math.round(BASIC * 0.12);
const epf: Reel = {
  id: 'epf-basics', topic: 'retire', tags: ['EPF', 'provident fund'],
  title: t('EPF: your quiet retirement fund', 'EPF: आपका शांत रिटायरमेंट फ़ंड'),
  scenes: [
    sc('happy', t('If you are salaried, you may already be saving for retirement through the EPF.', 'अगर आप नौकरीपेशा हैं, तो शायद आप EPF से पहले ही रिटायरमेंट के लिए बचा रहे हैं।'), { big: t('EPF', 'EPF') }),
    sc('think', fill(t('Typically 12% of your basic pay goes in each month. On a basic of {b}, that is {s} from you.', 'आम तौर पर आपकी बेसिक का 12% हर महीने जाता है। {b} की बेसिक पर यह आपकी ओर से {s} है।'), { b: money(BASIC), s: money(EPF_SHARE) }),
      { prop: { kind: 'counter', from: 0, to: EPF_SHARE, format: 'inr', tone: 'cyan', label: t('from you each month (example)', 'आपकी ओर से हर महीने (उदाहरण)') } }),
    sc('surprised', t('Your employer adds its own share too. Part of that goes to a pension scheme.', 'आपका नियोक्ता भी अपना हिस्सा जोड़ता है। उसका एक भाग पेंशन योजना में जाता है।')),
    sc('think', t('The government sets the interest rate every year, so it can go up or down.', 'ब्याज दर सरकार हर साल तय करती है, इसलिए वह ऊपर-नीचे हो सकती है।')),
    sc('worry', t('Taking money out early has rules and can mean tax. These are rough outlines, so read the EPFO rules.', 'जल्दी निकालने के नियम हैं और टैक्स भी लग सकता है। यह मोटा ख़ाका है, EPFO के नियम पढ़ें।')),
    sc('cheer', t('Check your passbook once a year. Make sure every month is there.', 'साल में एक बार अपनी पासबुक देखें। पक्का करें कि हर महीना जुड़ा है।')),
  ],
  quiz: { q: t('Who sets the EPF interest rate?', 'EPF की ब्याज दर कौन तय करता है?'),
    options: [t('The government, every year', 'सरकार, हर साल'), t('Your employer, every month', 'आपका नियोक्ता, हर महीने'), t('The rate never changes', 'दर कभी नहीं बदलती')], answer: 0,
    why: t('The rate is announced yearly, so do not assume it stays the same.', 'दर हर साल घोषित होती है, इसलिए मान न लें कि वह वही रहेगी।') },
};

// ── Retirement: NPS ──────────────────────────────────────────────────────────────────────────────────────────────
const NPS_EXTRA = 50_000, npsSaved = Math.round(NPS_EXTRA * 0.3 * (1 + CESS));
const nps: Reel = {
  id: 'nps-basics', topic: 'retire', tags: ['NPS', 'pension'],
  title: t('NPS in plain words', 'NPS आसान शब्दों में'),
  scenes: [
    sc('think', t('The NPS is a long-term pension account. You invest now and use it after you retire.', 'NPS एक लंबी अवधि का पेंशन खाता है। आप अभी निवेश करते हैं और रिटायरमेंट के बाद इस्तेमाल करते हैं।'), { big: t('NPS', 'NPS') }),
    sc('happy', t('You choose how your money is split between shares and safer assets, within the rules.', 'आप नियमों के भीतर तय करते हैं कि पैसा शेयर और सुरक्षित निवेश में कैसे बँटे।')),
    sc('surprised', fill(t('In the old regime, an extra {e} a year can be deducted. For someone in the 30% slab, that is about {s} of tax.', 'पुराने रिजीम में साल के अतिरिक्त {e} की कटौती मिल सकती है। 30% स्लैब वाले के लिए यह लगभग {s} का टैक्स है।'), { e: money(NPS_EXTRA), s: money(npsSaved) }),
      { prop: { kind: 'counter', from: 0, to: npsSaved, format: 'inr', tone: 'teal', label: t('tax saved at 30% (example)', '30% पर टैक्स बचत (उदाहरण)') } }),
    sc('worry', t('The money is meant for retirement. Early exit is limited, so do not put in what you may need soon.', 'यह पैसा रिटायरमेंट के लिए है। जल्दी निकासी सीमित है, इसलिए वह न डालें जो जल्द चाहिए।'), { prop: { kind: 'shield', text: t('Locked in', 'बंद'), sub: t('until retirement', 'रिटायरमेंट तक') } }),
    sc('think', t('Withdrawal and annuity rules are set by the regulator and change. Read the latest before you decide.', 'निकासी और एन्युटी के नियम नियामक तय करता है और वे बदलते हैं। फ़ैसले से पहले ताज़ा नियम पढ़ें।')),
    sc('cheer', t('Look at the charges and the fund options, then decide how much fits you.', 'शुल्क और फ़ंड विकल्प देखें, फिर तय करें कि कितना आपको जमता है।')),
  ],
  quiz: { q: t('What is the NPS mainly meant for?', 'NPS मुख्य रूप से किसके लिए है?'),
    options: [t('Long-term retirement saving', 'लंबी अवधि की रिटायरमेंट बचत'), t('Short-term trading', 'शॉर्ट-टर्म ट्रेडिंग'), t('Emergency cash', 'आपातकालीन नकदी')], answer: 0,
    why: t('Its limits on early exit are there to keep the money for retirement.', 'जल्दी निकासी की सीमाएँ पैसे को रिटायरमेंट के लिए बचाए रखने को हैं।') },
};

// ── Retirement: PPF ──────────────────────────────────────────────────────────────────────────────────────────────
const PPF_YEARLY = 100_000, PPF_RATE = 7, PPF_YEARS = 15;
const ppfPaid = PPF_YEARLY * PPF_YEARS, ppfValue = yearlyDepositsValue(PPF_YEARLY, PPF_RATE, PPF_YEARS);
const ppf: Reel = {
  id: 'ppf-basics', topic: 'retire', tags: ['PPF', 'savings scheme'],
  title: t('PPF: the 15-year saver', 'PPF: 15 साल का बचतकर्ता'),
  scenes: [
    sc('think', t('The PPF is a government-backed savings scheme with a 15-year lock-in.', 'PPF सरकार समर्थित बचत योजना है, जिसमें 15 साल का लॉक-इन है।'), { big: t('15 years', '15 साल') }),
    sc('happy', t('You can put in up to ₹1.5 lakh a year. The interest rate is reset by the government every quarter.', 'आप साल में ₹1.5 लाख तक डाल सकते हैं। ब्याज दर सरकार हर तिमाही तय करती है।')),
    sc('surprised', fill(t('Example: {d} a year for {y} years at an assumed {r}%. You put in {p}, and it ends near {v}.', 'उदाहरण: {d} सालाना, {y} साल, मान लें {r}% ब्याज। आप {p} डालते हैं, और अंत में लगभग {v}।'), { d: money(PPF_YEARLY), y: PPF_YEARS, r: PPF_RATE, p: money(ppfPaid), v: money(ppfValue) }),
      { prop: { kind: 'bars', items: [{ label: t('You put in', 'आपने डाला'), value: ppfPaid, text: money(ppfPaid), tone: 'gold' }, { label: t('It ends near', 'अंत में'), value: ppfValue, text: money(ppfValue), tone: 'teal' }] } }),
    sc('worry', t('The rate changes, so the real figure will differ. Your money is locked, with limited early withdrawals.', 'दर बदलती है, इसलिए असली आँकड़ा अलग होगा। पैसा बँधा रहता है, जल्दी निकासी सीमित है।')),
    sc('think', t('It suits money you will not need for a long time, and a part of your savings that must stay safe.', 'यह उस पैसे के लिए ठीक है जो लंबे समय तक नहीं चाहिए, और बचत के उस हिस्से के लिए जो सुरक्षित रहना चाहिए।')),
    sc('cheer', t('Deposit early in the year if you can, since the scheme counts interest on the balance.', 'हो सके तो साल की शुरुआत में जमा करें, क्योंकि ब्याज बैलेंस पर गिना जाता है।')),
  ],
  quiz: { q: t('How long is the PPF lock-in?', 'PPF का लॉक-इन कितना है?'),
    options: [t('15 years', '15 साल'), t('5 years', '5 साल'), t('1 year', '1 साल')], answer: 0,
    why: t('A PPF account matures after 15 years, with limited options before that.', 'PPF खाता 15 साल में परिपक्व होता है, उससे पहले विकल्प सीमित हैं।') },
};

// ── Retirement: how fast you draw down ───────────────────────────────────────────────────────────────────────────
const CORPUS = 10_000_000, RET_RATE = 7;
const slow = monthsToDeplete(CORPUS, RET_RATE, 60_000) / 12, fast = monthsToDeplete(CORPUS, RET_RATE, 80_000) / 12;
const withdraw: Reel = {
  id: 'withdrawal-rate', topic: 'retire', tags: ['withdrawal', 'retirement income'],
  title: t('How fast you spend decides how long it lasts', 'आप कितना निकालते हैं, यह तय करता है कि कितना चलेगा'),
  scenes: [
    sc('surprised', t('Same corpus, two different monthly withdrawals. Very different outcomes.', 'कॉर्पस वही, मासिक निकासी दो अलग। नतीजे बहुत अलग।'), { big: t('Same corpus', 'वही कॉर्पस') }),
    sc('think', fill(t('Take {c} earning an assumed {r}% a year, with money taken out every month.', '{c} का कॉर्पस, मान लें {r}% सालाना कमाई, और हर महीने पैसा निकलता है।'), { c: money(CORPUS), r: RET_RATE })),
    sc('happy', fill(t('Take out {w} a month and it lasts about {y} years.', 'महीने में {w} निकालें तो यह लगभग {y} साल चलता है।'), { w: money(60_000), y: Math.round(slow) }),
      { prop: { kind: 'counter', from: 0, to: Math.round(slow), format: 'plain', unit: t('years', 'साल'), tone: 'teal', label: t('at ₹60,000 a month', 'मासिक निकासी ₹60,000') } }),
    sc('worry', fill(t('Take out {w} a month and it lasts only about {y} years.', 'महीने में {w} निकालें तो यह सिर्फ़ लगभग {y} साल चलता है।'), { w: money(80_000), y: Math.round(fast) }),
      { prop: { kind: 'counter', from: 0, to: Math.round(fast), format: 'plain', unit: t('years', 'साल'), tone: 'red', label: t('at ₹80,000 a month', 'मासिक निकासी ₹80,000') } }),
    sc('think', t('A small rise in withdrawals can shorten the money’s life a lot. Prices rising makes it harder.', 'निकासी में थोड़ी बढ़त पैसे की उम्र बहुत घटा सकती है। बढ़ती कीमतें इसे और कठिन बनाती हैं।')),
    sc('cheer', t('Returns vary, so keep a margin. Review your withdrawals every year.', 'रिटर्न बदलते रहते हैं, इसलिए गुंजाइश रखें। हर साल अपनी निकासी देखें।')),
  ],
  quiz: { q: t('In the example, what lasts longer?', 'उदाहरण में कौन ज़्यादा चलता है?'),
    options: [t('The smaller monthly withdrawal', 'छोटी मासिक निकासी'), t('The larger monthly withdrawal', 'बड़ी मासिक निकासी'), t('They last the same', 'दोनों बराबर चलते हैं')], answer: 0,
    why: t('Less taken out means more left to earn, so the money lasts longer.', 'कम निकलने का मतलब है कि ज़्यादा बचा रहकर कमाता है, इसलिए पैसा ज़्यादा चलता है।') },
};

export const RETIRE_REELS: Reel[] = [retireCorpus, epf, nps, ppf, withdraw];

