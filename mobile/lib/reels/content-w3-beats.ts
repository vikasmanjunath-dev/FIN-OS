// Wave 3b: sort-it, put-in-order and the new what-if sliders (EMI vs tenure, goal SIP, step-up, tax vs income, card interest, withdrawal). The pictures and
// figures inside each slider are drawn by the player from the models in lib/reels/beats.ts; nothing here holds a formula.
import { readMs, sc, t } from '@/lib/reels/kit';
import type { Beat, L, Prop, Reel, Topic } from '@/lib/reels/types';

const atLeast = (say: L, ms: number) => ({ ms: Math.max(readMs(say), ms) });

interface Args {
  id: string; topic: Topic; lesson?: string; title: L; tags: string[]; lines: [L, L, L, L, L]; steps?: L[]; beat: Beat; quiz: Reel['quiz'];
}
/** Five scenes: a hook, the setup (with an optional checklist), two takeaways and a close; the beat pauses the reel after the setup. */
export function reel(a: Args, kind: string): Reel {
  const [hook, setup, w1, w2, close] = a.lines;
  const prop: Prop | undefined = a.steps ? { kind: 'steps', items: a.steps } : undefined;
  return {
    id: a.id, topic: a.topic, ...(a.lesson ? { lesson: a.lesson } : {}), tags: [kind, ...a.tags], title: a.title,
    scenes: [sc('surprised', hook, atLeast(hook, 4600)), sc('think', setup, { ...(prop ? { prop } : {}), ...atLeast(setup, 4800) }), sc('happy', w1, atLeast(w1, 4800)), sc('think', w2, atLeast(w2, 4800)), sc('cheer', close, atLeast(close, 3800))],
    poke: { after: 1, beat: a.beat }, quiz: a.quiz,
  };
}
export const card = (en: string, hi: string, bin: number, whyEn: string, whyHi: string) => ({ t: t(en, hi), bin, why: t(whyEn, whyHi) });
export const item = (en: string, hi: string, whyEn: string, whyHi: string) => ({ t: t(en, hi), why: t(whyEn, whyHi) });

// ── Sort it ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const SORT_REELS: Reel[] = [
  reel({
    id: 'sort-protect-or-grow', topic: 'protect', title: t('Sort it: protect or grow?', 'छाँटिए: सुरक्षा या बढ़त?'), tags: ['insurance', 'investing'],
    lines: [t('Some money products protect you from a loss. Others try to grow your money. Mixing them up is expensive.', 'कुछ उत्पाद नुक़सान से बचाते हैं। कुछ पैसा बढ़ाने की कोशिश करते हैं। इन्हें मिलाना महँगा पड़ता है।'),
      t('Sort each one by its main job.', 'हर एक को उसके मुख्य काम से छाँटें।'), t('Protection pays when something goes wrong. Growth money may rise or fall.', 'सुरक्षा तब देती है जब कुछ बिगड़े। बढ़त वाला पैसा ऊपर या नीचे जा सकता है।'),
      t('A product that does both may do each job less well, and costs more to understand.', 'जो दोनों करे वह हर काम कम अच्छा कर सकता है, और समझने में भी महँगा है।'), t('Ask of each rupee: is it to protect, or to grow?', 'हर रुपये से पूछें: यह बचाने के लिए है, या बढ़ाने के लिए?')],
    beat: { kind: 'sort', q: t('What is the main job of each?', 'हर एक का मुख्य काम क्या है?'), bins: [t('Protects', 'सुरक्षा'), t('Grows', 'बढ़त')], cards: [
      card('Term life cover', 'टर्म जीवन कवर', 0, 'It pays your family if you are gone, and builds no savings.', 'आपके न रहने पर परिवार को देता है, और बचत नहीं बनाता।'),
      card('Health insurance', 'हेल्थ इंश्योरेंस', 0, 'It pays hospital bills, within the policy’s limits.', 'पॉलिसी की सीमा में अस्पताल के बिल चुकाता है।'),
      card('An index fund', 'इंडेक्स फ़ंड', 1, 'It holds shares to grow over time, with risk.', 'समय के साथ बढ़ने के लिए शेयर रखता है, जोखिम के साथ।'),
      card('A PPF account', 'PPF खाता', 1, 'It is a long-term saving scheme, built to grow.', 'यह लंबी अवधि की बचत योजना है, बढ़ने के लिए बनी।'),
      card('Personal accident cover', 'पर्सनल एक्सीडेंट कवर', 0, 'It pays if an accident causes loss or injury.', 'दुर्घटना से नुक़सान या चोट हो तो देता है।')] },
    quiz: { q: t('What does term cover build?', 'टर्म कवर क्या बनाता है?'), options: [t('Protection, not savings', 'सुरक्षा, बचत नहीं'), t('A big corpus', 'बड़ा कोष'), t('A fixed return', 'तय रिटर्न')], answer: 0,
      why: t('It pays on a loss, and nothing if there is none. That is why it costs little.', 'यह नुक़सान होने पर देता है, न होने पर कुछ नहीं। इसीलिए सस्ता है।') },
  }, 'sort'),
  reel({
    id: 'sort-scam-or-real', topic: 'safety', title: t('Sort it: scam or genuine?', 'छाँटिए: धोखा या असली?'), tags: ['scams'],
    lines: [t('Scams copy real messages, so how a message behaves is more telling than how it looks.', 'ठग असली मैसेज की नक़ल करते हैं, इसलिए मैसेज का बर्ताव उसकी शक्ल से ज़्यादा बताता है।'),
      t('Sort each situation as scam or genuine.', 'हर स्थिति को धोखा या असली में छाँटें।'), t('Scams rush you, ask for secrets and push you off the official app.', 'ठग जल्दी मचाते हैं, राज़ माँगते हैं और आधिकारिक ऐप से बाहर ले जाते हैं।'),
      t('Genuine messages inform you. They do not need anything secret from you.', 'असली संदेश जानकारी देते हैं। वे आपसे कोई गोपनीय चीज़ नहीं माँगते।'), t('When you cannot tell, stop and check in the official app.', 'पहचान न पाएँ तो रुकें और आधिकारिक ऐप में जाँचें।')],
    beat: { kind: 'sort', q: t('Scam or genuine?', 'धोखा या असली?'), bins: [t('Genuine', 'असली'), t('Scam', 'धोखा')], cards: [
      card('A bank alert about a debit, with no link', 'डेबिट का बैंक अलर्ट, बिना लिंक', 0, 'It only informs you, and asks for nothing.', 'वह सिर्फ़ जानकारी देता है, कुछ नहीं माँगता।'),
      card('A caller asking you to read out an OTP', 'OTP बोलने को कहने वाला कॉलर', 1, 'An OTP is for you alone. No genuine caller needs it.', 'OTP सिर्फ़ आपके लिए है। किसी असली कॉलर को नहीं चाहिए।'),
      card('A notice inside your bank’s own app', 'आपके बैंक के अपने ऐप के भीतर सूचना', 0, 'It sits in the place you already trust.', 'वह उसी जगह है जिस पर आप पहले से भरोसा करते हैं।'),
      card('A “collect request” to receive a refund', 'रिफ़ंड पाने के लिए “कलेक्ट रिक्वेस्ट”', 1, 'Approving a request sends money out. Refunds arrive without it.', 'रिक्वेस्ट मंज़ूर करने से पैसा बाहर जाता है। रिफ़ंड बिना उसके आता है।'),
      card('An unknown link that says your account closes today', 'अनजान लिंक जो कहे आज खाता बंद', 1, 'A threat plus a link is the usual shape of a scam.', 'धमकी और लिंक साथ हों तो यही ठगी का आम रूप है।')] },
    quiz: { q: t('Which is the best clue that a message is a scam?', 'मैसेज के धोखा होने का सबसे अच्छा सुराग़ क्या है?'), options: [t('It rushes you and asks for a secret', 'वह जल्दी मचाता है और राज़ माँगता है'), t('It names a bank', 'उसमें बैंक का नाम है'), t('It arrives by SMS', 'वह SMS से आता है')], answer: 0,
      why: t('Pressure plus a request for something secret is the common thread in scams.', 'दबाव और किसी गोपनीय चीज़ की माँग ठगी की साझा कड़ी है।') },
  }, 'sort'),
  reel({
    id: 'sort-regime-items', topic: 'tax', title: t('Sort it: which regime has it?', 'छाँटिए: किस रिजीम में मिलता है?'), tags: ['income tax', 'regime'],
    lines: [t('The old and new tax regimes allow different deductions. Knowing which is which saves a wrong choice.', 'पुराने और नए टैक्स रिजीम में अलग कटौतियाँ मिलती हैं। कौन-सी कहाँ है, यह जानना ग़लत चुनाव से बचाता है।'),
      t('Sort each item. Rules are for FY 2025-26 and change with Budgets.', 'हर एक को छाँटें। नियम FY 2025-26 के हैं और बजट के साथ बदलते हैं।'), t('The new regime has lower rates and few deductions. The old one has more deductions and higher rates.', 'नए रिजीम में दरें कम और कटौतियाँ कम हैं। पुराने में कटौतियाँ ज़्यादा और दरें ऊँची।'),
      t('Count your own deductions before you choose.', 'चुनने से पहले अपनी कटौतियाँ गिनें।'), t('Check the current year’s rules, then compare both on your numbers.', 'इस साल के नियम देखें, फिर अपने आँकड़ों पर दोनों की तुलना करें।')],
    beat: { kind: 'sort', q: t('Old regime, new regime, or both?', 'पुराना, नया, या दोनों?'), bins: [t('Old only', 'सिर्फ़ पुराना'), t('New only', 'सिर्फ़ नया'), t('Both', 'दोनों')], cards: [
      card('HRA exemption', 'HRA की छूट', 0, 'Not available in the new regime.', 'नए रिजीम में उपलब्ध नहीं।'),
      card('Section 80C deductions', 'सेक्शन 80C की कटौती', 0, 'The new regime gives up most deductions, 80C included.', 'नया रिजीम 80C समेत ज़्यादातर कटौतियाँ छोड़ देता है।'),
      card('Standard deduction on salary', 'वेतन पर स्टैंडर्ड डिडक्शन', 2, 'Both allow it, at different amounts.', 'दोनों में मिलती है, अलग रकम पर।'),
      card('The 87A rebate for low taxable income', '87A की छूट, कम कर-योग्य आय पर', 2, 'Both have a rebate, with different limits.', 'दोनों में छूट है, सीमाएँ अलग।'),
      card('Lower slab rates with fewer deductions', 'कम स्लैब दरें, कम कटौतियाँ', 1, 'This is the shape of the new regime.', 'यही नए रिजीम का स्वरूप है।')] },
    quiz: { q: t('Which regime allows the HRA exemption?', 'HRA की छूट किस रिजीम में मिलती है?'), options: [t('The old regime', 'पुराना रिजीम'), t('The new regime', 'नया रिजीम'), t('Both', 'दोनों')], answer: 0,
      why: t('HRA is one of the deductions you give up in the new regime.', 'HRA उन कटौतियों में है जो आप नए रिजीम में छोड़ते हैं।') },
  }, 'sort'),
  reel({
    id: 'sort-emergency-or-not', topic: 'protect', title: t('Sort it: is it an emergency?', 'छाँटिए: क्या यह आपातकाल है?'), tags: ['emergency fund'],
    lines: [t('An emergency fund works only if it is kept for emergencies. A sale is not one.', 'आपातकालीन फ़ंड तभी काम करता है जब वह आपात के लिए ही रखा जाए। सेल आपात नहीं है।'),
      t('Sort each situation: dip into the emergency fund, or not?', 'हर स्थिति छाँटें: इमरजेंसी फ़ंड से लें, या नहीं?'), t('A real emergency is sudden, necessary and cannot wait.', 'असली आपात अचानक, ज़रूरी होता है और रुक नहीं सकता।'),
      t('A want, however tempting, belongs in your regular budget or a separate goal fund.', 'चाहत, कितनी भी लुभावनी, नियमित बजट या अलग लक्ष्य-फ़ंड में आती है।'), t('Write down your own three emergencies, so the choice is made in advance.', 'अपने तीन आपात लिख लें, ताकि चुनाव पहले से हो चुका हो।')],
    beat: { kind: 'sort', q: t('Dip into the fund?', 'फ़ंड से लें?'), bins: [t('Use the fund', 'फ़ंड से लें'), t('Do not', 'नहीं')], cards: [
      card('Rent and food after a sudden job loss', 'अचानक नौकरी जाने के बाद किराया और खाना', 0, 'This is exactly what the fund is for.', 'फ़ंड इसी के लिए है।'),
      card('A phone sale ends tonight', 'फ़ोन की सेल आज रात ख़त्म', 1, 'A want with a deadline. Not an emergency.', 'समय-सीमा वाली चाहत। आपात नहीं।'),
      card('An urgent hospital deposit', 'अस्पताल की तुरंत जमा', 0, 'Sudden, necessary and cannot wait.', 'अचानक, ज़रूरी और रुकने वाला नहीं।'),
      card('A holiday offer for next month', 'अगले महीने की छुट्टी का ऑफ़र', 1, 'A goal for a separate fund.', 'अलग फ़ंड का लक्ष्य।'),
      card('A broken fridge you need to run the house', 'घर चलाने को ज़रूरी टूटा फ़्रिज', 0, 'A necessary repair that cannot wait.', 'ज़रूरी मरम्मत जो रुक नहीं सकती।')] },
    quiz: { q: t('What marks a real emergency?', 'असली आपात की पहचान क्या है?'), options: [t('Sudden, necessary and cannot wait', 'अचानक, ज़रूरी और रुकने वाला नहीं'), t('A good offer', 'अच्छा ऑफ़र'), t('A friend’s advice', 'दोस्त की सलाह')], answer: 0,
      why: t('The fund is a cushion for shocks, not a source for wants.', 'फ़ंड झटकों के लिए गद्दी है, चाहतों का स्रोत नहीं।') },
  }, 'sort'),
  reel({
    id: 'sort-risk-ladder', topic: 'invest', title: t('Sort it: lower or higher risk?', 'छाँटिए: कम या ज़्यादा जोखिम?'), tags: ['risk', 'assets'],
    lines: [t('Every place you can put money has its own kind of risk. Some move little, and some move a lot.', 'पैसा रखने की हर जगह का अपना जोखिम है। कुछ कम हिलते हैं, कुछ बहुत।'),
      t('Sort each one by how much its value can swing.', 'हर एक को इस आधार पर छाँटें कि उसकी कीमत कितनी हिल सकती है।'), t('Higher swings can mean higher gains, and also bigger losses. That is the trade.', 'ज़्यादा उतार-चढ़ाव का मतलब ज़्यादा लाभ भी हो सकता है, और बड़ा नुक़सान भी। यही सौदा है।'),
      t('Even lower-risk places have risks, like rising prices or rates.', 'कम जोखिम वाली जगहों में भी जोखिम हैं, जैसे बढ़ती कीमतें या दरें।'), t('Match the swing to your timeline and your nerves.', 'उतार-चढ़ाव को अपनी समय-सीमा और अपनी बेचैनी से मिलाएँ।')],
    beat: { kind: 'sort', q: t('Lower swing or higher swing?', 'कम उतार-चढ़ाव या ज़्यादा?'), bins: [t('Lower swing', 'कम उतार-चढ़ाव'), t('Higher swing', 'ज़्यादा उतार-चढ़ाव')], cards: [
      card('A savings account', 'बचत खाता', 0, 'Its value does not swing day to day.', 'उसकी कीमत रोज़ नहीं हिलती।'),
      card('A fixed deposit', 'फ़िक्स्ड डिपॉज़िट', 0, 'The amount at maturity is known in advance.', 'परिपक्वता की रकम पहले से पता है।'),
      card('A share-based fund', 'शेयर आधारित फ़ंड', 1, 'Its price follows the market, up and down.', 'उसका भाव बाज़ार के साथ ऊपर-नीचे होता है।'),
      card('A single company’s share', 'किसी एक कंपनी का शेयर', 1, 'One company’s news can move it sharply.', 'एक कंपनी की ख़बर उसे तेज़ी से हिला सकती है।'),
      card('A crypto token', 'क्रिप्टो टोकन', 1, 'Prices can swing very widely in a short time.', 'भाव थोड़े समय में बहुत ज़्यादा हिल सकते हैं।')] },
    quiz: { q: t('What does a higher swing mean?', 'ज़्यादा उतार-चढ़ाव का मतलब क्या है?'), options: [t('Bigger gains or bigger losses are possible', 'बड़ा लाभ या बड़ा नुक़सान संभव'), t('A guaranteed gain', 'पक्का लाभ'), t('A safer product', 'ज़्यादा सुरक्षित उत्पाद')], answer: 0,
      why: t('A swing runs both ways, so it asks for more time and more nerve.', 'उतार-चढ़ाव दोनों तरफ़ चलता है, इसलिए ज़्यादा समय और हिम्मत माँगता है।') },
  }, 'sort'),
  reel({
    id: 'sort-debt-kinds', topic: 'loans', title: t('Sort it: what is the loan for?', 'छाँटिए: लोन किसलिए है?'), tags: ['debt', 'loans'],
    lines: [t('Debt is a tool. What matters is what the borrowed money buys.', 'क़र्ज़ एक औज़ार है। मायने यह रखता है कि उधार के पैसे से क्या ख़रीदा जाता है।'),
      t('Sort each use of a loan by what it usually leaves you with.', 'लोन के हर उपयोग को इस आधार पर छाँटें कि वह आम तौर पर आपके पास क्या छोड़ता है।'), t('Some borrowing builds something that can earn or last. Some only costs.', 'कुछ उधार ऐसा कुछ बनाता है जो कमा सके या टिके। कुछ सिर्फ़ ख़र्च है।'),
      t('Nothing here is a rule. A loan for a skill can fail, and a loan for a home can be a burden.', 'यहाँ कुछ नियम नहीं। कौशल का लोन भी विफल हो सकता है, और घर का लोन भी बोझ।'), t('Ask what the loan leaves you with, and what it costs in total.', 'पूछें कि लोन आपके पास क्या छोड़ेगा, और कुल लागत क्या है।')],
    beat: { kind: 'sort', q: t('What does it usually leave you with?', 'वह आम तौर पर आपके पास क्या छोड़ता है?'), bins: [t('Something lasting', 'कुछ टिकाऊ'), t('Only the cost', 'सिर्फ़ ख़र्च')], cards: [
      card('A loan for a course that raises your pay', 'ऐसे कोर्स का लोन जो आपका वेतन बढ़ाए', 0, 'It can raise what you earn, if the course delivers.', 'कोर्स काम करे तो आपकी कमाई बढ़ा सकता है।'),
      card('A card balance rolled over for shopping', 'ख़रीदारी के लिए आगे बढ़ाया कार्ड बकाया', 1, 'The shopping is gone, and interest keeps running.', 'ख़रीदारी ख़त्म, और ब्याज चलता रहता है।'),
      card('A home loan for a place you will live in', 'रहने वाले घर का होम लोन', 0, 'You get an asset and a home, but the EMI is a long commitment.', 'आपको संपत्ति और घर मिलता है, पर EMI लंबी प्रतिबद्धता है।'),
      card('A loan for an expensive party', 'महँगी पार्टी का लोन', 1, 'The event ends, and the repayments continue.', 'आयोजन ख़त्म, और चुकौती चलती रहती है।'),
      card('A loan to buy tools for your own work', 'अपने काम के औज़ार ख़रीदने का लोन', 0, 'The tools can earn more than the loan costs.', 'औज़ार लोन की लागत से ज़्यादा कमा सकते हैं।')] },
    quiz: { q: t('What is the best question to ask before a loan?', 'लोन से पहले पूछने लायक़ सबसे अच्छा सवाल क्या है?'), options: [t('What will it leave me with, and what is the total cost?', 'यह मेरे पास क्या छोड़ेगा, और कुल लागत क्या है?'), t('Is the EMI small?', 'क्या EMI छोटी है?'), t('Do my friends have one?', 'क्या मेरे दोस्तों के पास है?')], answer: 0,
      why: t('Value left over and total cost together tell you if it is worth it.', 'बचा मूल्य और कुल लागत मिलकर बताते हैं कि वह सार्थक है या नहीं।') },
  }, 'sort'),
];

// ── Put it in order ──────────────────────────────────────────────────────────────────────────────────────────────
export const ORDER_REELS: Reel[] = [
  reel({
    id: 'order-emergency-steps', topic: 'protect', title: t('Put it in order: building an emergency fund', 'क्रम में लगाइए: इमरजेंसी फ़ंड बनाना'), tags: ['emergency fund', 'steps'],
    lines: [t('An emergency fund is built in steps. Done in the wrong order, people stall.', 'आपातकालीन फ़ंड क़दमों में बनता है। उल्टे क्रम में करें तो लोग अटक जाते हैं।'),
      t('Put the steps in order, first to last.', 'क़दमों को पहले से आख़िरी तक क्रम में लगाएँ।'), t('Start with what you know, then pick a target, then make saving automatic.', 'जो जानते हैं उससे शुरू करें, फिर लक्ष्य चुनें, फिर बचत को ऑटोमैटिक करें।'),
      t('A small first step beats a perfect plan you never start.', 'छोटा पहला क़दम उस पूरी योजना से बेहतर है जो कभी शुरू नहीं होती।'), t('Do step one this week.', 'पहला क़दम इसी हफ़्ते करें।')],
    beat: { kind: 'order', q: t('First to last.', 'पहले से आख़िरी।'), items: [
      item('Note what you spend in a month', 'एक महीने का ख़र्च लिखें', 'You cannot size a fund without knowing your costs.', 'ख़र्च जाने बिना फ़ंड का आकार तय नहीं हो सकता।'),
      item('List your must-pay costs', 'अनिवार्य ख़र्चों की सूची बनाएँ', 'The fund covers essentials, so list them next.', 'फ़ंड ज़रूरी ख़र्च चलाता है, इसलिए उन्हें सूचीबद्ध करें।'),
      item('Set a target of 3 to 6 months of them', 'उनके 3 से 6 महीने का लक्ष्य रखें', 'A number turns a wish into a plan.', 'एक संख्या इच्छा को योजना बनाती है।'),
      item('Set up an automatic monthly transfer', 'हर महीने का ऑटोमैटिक ट्रांसफ़र लगाएँ', 'Automatic saving does not rely on willpower.', 'ऑटोमैटिक बचत इच्छाशक्ति पर निर्भर नहीं।'),
      item('Keep it apart, and top it up after any use', 'अलग रखें, और इस्तेमाल के बाद फिर भरें', 'It stays ready only if it is refilled.', 'वह तभी तैयार रहता है जब फिर भरा जाए।')] },
    quiz: { q: t('Why make the transfer automatic?', 'ट्रांसफ़र ऑटोमैटिक क्यों करें?'), options: [t('It does not rely on willpower', 'वह इच्छाशक्ति पर निर्भर नहीं'), t('It earns more interest', 'उस पर ज़्यादा ब्याज मिलता है'), t('Banks insist', 'बैंक ज़ोर देते हैं')], answer: 0,
      why: t('A system that runs by itself keeps working in a month when you forget.', 'अपने आप चलने वाला तरीक़ा उस महीने भी चलता है जब आप भूल जाएँ।') },
  }, 'order'),
  reel({
    id: 'order-claim-steps', topic: 'protect', lesson: 'insurance', title: t('Put it in order: a hospital claim', 'क्रम में लगाइए: अस्पताल का क्लेम'), tags: ['claim', 'health insurance'],
    lines: [t('When someone is admitted to hospital there is little time to think. A known order helps.', 'कोई अस्पताल में भर्ती हो तो सोचने का समय कम होता है। जाना-पहचाना क्रम मदद करता है।'),
      t('Put the claim steps in order.', 'क्लेम के क़दम क्रम में लगाएँ।'), t('The early steps protect the claim. The later ones complete it.', 'शुरू के क़दम क्लेम को बचाते हैं। बाद के उसे पूरा करते हैं।'),
      t('Keeping papers as you go is far easier than finding them later.', 'काग़ज़ साथ-साथ रखना बाद में ढूँढने से कहीं आसान है।'), t('Save your policy number and the helpline in your phone now.', 'अपना पॉलिसी नंबर और हेल्पलाइन अभी फ़ोन में सहेजें।')],
    beat: { kind: 'order', q: t('First to last.', 'पहले से आख़िरी।'), items: [
      item('Tell the insurer about the admission', 'भर्ती की जानकारी बीमा कंपनी को दें', 'Early notice keeps the claim in order.', 'जल्दी सूचना क्लेम को ठीक रखती है।'),
      item('Ask the hospital for a cashless request', 'अस्पताल से कैशलेस अनुरोध करवाएँ', 'At a network hospital the insurer can pay directly.', 'नेटवर्क अस्पताल में बीमा कंपनी सीधे चुका सकती है।'),
      item('Keep every bill, report and prescription', 'हर बिल, रिपोर्ट और पर्ची रखें', 'These papers prove the claim.', 'ये काग़ज़ क्लेम साबित करते हैं।'),
      item('Collect the discharge summary', 'डिस्चार्ज सारांश लें', 'It is the main record of the stay.', 'यह भर्ती का मुख्य रिकॉर्ड है।'),
      item('Submit what is needed and follow up', 'ज़रूरी काग़ज़ जमा करें और पीछे लगे रहें', 'A complete file settles faster.', 'पूरी फ़ाइल जल्दी निपटती है।')] },
    quiz: { q: t('What should you do first when someone is admitted?', 'कोई भर्ती हो तो पहले क्या करें?'), options: [t('Inform the insurer', 'बीमा कंपनी को सूचना दें'), t('Wait for the bill', 'बिल का इंतज़ार करें'), t('Cancel the policy', 'पॉलिसी रद्द करें')], answer: 0,
      why: t('Early notice protects the claim and opens the cashless option.', 'जल्दी सूचना क्लेम बचाती है और कैशलेस विकल्प खोलती है।') },
  }, 'order'),
  reel({
    id: 'order-compare-loans', topic: 'loans', title: t('Put it in order: comparing two loans', 'क्रम में लगाइए: दो लोन की तुलना'), tags: ['loans', 'steps'],
    lines: [t('Two lenders, two offers. Comparing them takes a few steps, and the order matters.', 'दो बैंक, दो ऑफ़र। तुलना कुछ क़दमों में होती है, और क्रम मायने रखता है।'),
      t('Put the steps in order.', 'क़दमों को क्रम में लगाएँ।'), t('Start with the rate, then every fee, then what happens if you repay early.', 'दर से शुरू करें, फिर हर शुल्क, फिर जल्दी चुकाने पर क्या होता है।'),
      t('Only then look at the EMI, which can hide a lot.', 'उसके बाद ही EMI देखें, जो बहुत कुछ छिपा सकती है।'), t('Ask for every figure in writing.', 'हर आँकड़ा लिखित में माँगें।')],
    beat: { kind: 'order', q: t('First to last.', 'पहले से आख़िरी।'), items: [
      item('Note each lender’s interest rate and its type', 'हर बैंक की ब्याज दर और उसका प्रकार लिखें', 'The rate is the base of the cost.', 'दर लागत का आधार है।'),
      item('Add processing and other fees', 'प्रोसेसिंग और दूसरे शुल्क जोड़ें', 'Fees raise the real cost.', 'शुल्क असली लागत बढ़ाते हैं।'),
      item('Check the prepayment and foreclosure terms', 'प्रीपेमेंट और फ़ोरक्लोज़र की शर्तें देखें', 'They decide how freely you can repay early.', 'वे तय करती हैं कि आप जल्दी चुकाने में कितने आज़ाद हैं।'),
      item('Work out the total you will pay', 'कुल चुकाई जाने वाली रकम निकालें', 'The total is what you compare.', 'तुलना कुल रकम की होती है।'),
      item('Then compare the EMIs and decide', 'फिर EMI की तुलना करें और तय करें', 'The EMI tells you what fits your month.', 'EMI बताती है कि आपके महीने में क्या फ़िट होता है।')] },
    quiz: { q: t('What is the best single figure for comparing two loans?', 'दो लोन की तुलना का सबसे अच्छा एक आँकड़ा क्या है?'), options: [t('The total you will pay', 'कुल चुकाई जाने वाली रकम'), t('The EMI', 'EMI'), t('The advertised rate only', 'सिर्फ़ विज्ञापित दर')], answer: 0,
      why: t('The total includes rate, fees and tenure in one number.', 'कुल रकम में दर, शुल्क और अवधि एक संख्या में आ जाते हैं।') },
  }, 'order'),
  reel({
    id: 'order-itr-steps', topic: 'tax', title: t('Put it in order: filing your return', 'क्रम में लगाइए: रिटर्न भरना'), tags: ['ITR', 'steps'],
    lines: [t('Filing is easy in the right order and painful in the wrong one.', 'सही क्रम में रिटर्न भरना आसान है और ग़लत क्रम में तकलीफ़देह।'),
      t('Put the steps in order.', 'क़दमों को क्रम में लगाएँ।'), t('Gather first, check next, file after, and confirm last.', 'पहले जुटाएँ, फिर जाँचें, फिर भरें, और आख़िर में पुष्टि करें।'),
      t('The checks before filing catch most of the mistakes.', 'भरने से पहले की जाँच ज़्यादातर ग़लतियाँ पकड़ लेती है।'), t('Start early, so a missing paper is not a crisis.', 'जल्दी शुरू करें, ताकि छूटा काग़ज़ संकट न बने।')],
    beat: { kind: 'order', q: t('First to last.', 'पहले से आख़िरी।'), items: [
      item('Gather Form 16, bank statements and proofs', 'फ़ॉर्म 16, बैंक स्टेटमेंट और प्रूफ़ जुटाएँ', 'You need your papers before anything else.', 'सबसे पहले आपको काग़ज़ चाहिए।'),
      item('Check the tax department’s statement of your income', 'आयकर विभाग का आपकी आय का स्टेटमेंट देखें', 'It shows what the department already knows.', 'वह दिखाता है कि विभाग पहले से क्या जानता है।'),
      item('Choose the right return form', 'सही रिटर्न फ़ॉर्म चुनें', 'The form follows your kinds of income.', 'फ़ॉर्म आपकी आय के प्रकार से तय होता है।'),
      item('Fill and check the pre-filled figures', 'भरें और पहले से भरे आँकड़े जाँचें', 'Mismatches are best fixed before filing.', 'अंतर भरने से पहले सुधारना बेहतर है।'),
      item('File, then verify the return', 'भरें, फिर रिटर्न वेरिफ़ाई करें', 'A return is complete only after verification.', 'रिटर्न वेरिफ़ाई होने के बाद ही पूरा है।')] },
    quiz: { q: t('When is a return complete?', 'रिटर्न कब पूरा होता है?'), options: [t('After you verify it', 'वेरिफ़ाई करने के बाद'), t('When you click submit', 'सबमिट दबाते ही'), t('When the refund arrives', 'रिफ़ंड आने पर')], answer: 0,
      why: t('An unverified return may be treated as not filed.', 'बिना वेरिफ़ाई रिटर्न को भरा हुआ न माना जा सकता है।') },
  }, 'order'),
];

// ── New slider kinds ─────────────────────────────────────────────────────────────────────────────────────────────
const yearsU = t('years', 'साल');
export const SLIDER2_REELS: Reel[] = [
  reel({
    id: 'slide-emi-tenure', topic: 'loans', title: t('Drag it: the length of a home loan', 'खिसकाइए: होम लोन की अवधि'), tags: ['home loan', 'tenure'],
    lines: [t('A longer loan means a smaller EMI. But what does the length do to the total you pay?', 'लंबा लोन यानी छोटी EMI। पर अवधि कुल चुकाई रकम का क्या करती है?'),
      t('A ₹50 lakh loan at an assumed 8.5% a year. Drag the number of years.', '₹50 लाख का लोन, मान लें 8.5% सालाना। साल खिसकाएँ।'), t('As the years grow, the EMI falls, but the total interest climbs faster.', 'साल बढ़ते हैं तो EMI घटती है, पर कुल ब्याज उससे तेज़ बढ़ता है।'),
      t('A shorter loan costs less in all and asks more each month.', 'छोटा लोन कुल में कम लागत का है और हर महीने ज़्यादा माँगता है।'), t('Pick the shortest tenure your month can carry.', 'वह सबसे छोटी अवधि चुनें जो आपका महीना सँभाल सके।')],
    steps: [t('₹50 lakh borrowed', '₹50 लाख उधार'), t('8.5% a year, assumed', '8.5% सालाना, अनुमानित'), t('You choose the years', 'साल आप चुनें')],
    beat: { kind: 'slider', q: t('Drag the years to see the EMI and the interest.', 'साल खिसकाकर EMI और ब्याज देखें।'), label: t('Length of the loan', 'लोन की अवधि'), unit: yearsU, min: 5, max: 30, step: 1, start: 20,
      model: { kind: 'emi-tenure', principal: 5_000_000, rate: 8.5 }, takeaway: t('Over {x} the EMI is about {value} a month, and you pay about {put} in all, including about {lost} of interest.', '{x} में EMI लगभग {value} महीना है, और आप कुल लगभग {put} चुकाते हैं, जिसमें लगभग {lost} ब्याज है।') },
    quiz: { q: t('What does a longer tenure do?', 'लंबी अवधि क्या करती है?'), options: [t('Lowers the EMI and raises the total interest', 'EMI घटाती है और कुल ब्याज बढ़ाती है'), t('Lowers both', 'दोनों घटाती है'), t('Raises both', 'दोनों बढ़ाती है')], answer: 0,
      why: t('You borrow for longer, so each month is lighter, and the interest runs for more months.', 'आप ज़्यादा समय उधार रखते हैं, इसलिए हर महीना हल्का है, और ब्याज ज़्यादा महीने चलता है।') },
  }, 'slider'),
  reel({
    id: 'slide-goal-years', topic: 'goals', title: t('Drag it: the time you give a goal', 'खिसकाइए: लक्ष्य को आप कितना समय देते हैं'), tags: ['goal', 'SIP'],
    lines: [t('The same goal asks for very different monthly amounts depending on how long you give it.', 'एक ही लक्ष्य के लिए महीने की रकम बहुत अलग होती है, इस पर कि आप उसे कितना समय देते हैं।'),
      t('A goal of ₹50 lakh, at an assumed 10% a year. Drag the years you have.', '₹50 लाख का लक्ष्य, मान लें 10% सालाना। अपने पास के साल खिसकाएँ।'), t('More years means a much smaller monthly amount, because growth does more of the work.', 'ज़्यादा साल यानी महीने की रकम बहुत कम, क्योंकि बढ़त ज़्यादा काम करती है।'),
      t('The returns are an assumption, so leave some margin.', 'रिटर्न एक अनुमान हैं, इसलिए कुछ गुंजाइश रखें।'), t('Start now, even with less, and raise it later.', 'अभी शुरू करें, कम से सही, और बाद में बढ़ाएँ।')],
    steps: [t('₹50 lakh goal', '₹50 लाख का लक्ष्य'), t('10% a year, assumed', '10% सालाना, अनुमानित'), t('You choose the years', 'साल आप चुनें')],
    beat: { kind: 'slider', q: t('Drag the years to see the monthly SIP the goal needs.', 'साल खिसकाकर देखें लक्ष्य को कितनी मासिक SIP चाहिए।'), label: t('Years to the goal', 'लक्ष्य तक के साल'), unit: yearsU, min: 3, max: 25, step: 1, start: 12,
      model: { kind: 'goal-sip', target: 5_000_000, rate: 10 }, takeaway: t('With {x} to go, the goal needs about {value} a month. You put in about {put}, and growth does the rest.', '{x} बचे हों तो लक्ष्य को महीने में लगभग {value} चाहिए। आप लगभग {put} डालते हैं, बाक़ी बढ़त करती है।') },
    quiz: { q: t('Why does more time cut the monthly amount?', 'ज़्यादा समय महीने की रकम क्यों घटाता है?'), options: [t('Growth has longer to work', 'बढ़त को काम का ज़्यादा समय मिलता है'), t('The goal gets smaller', 'लक्ष्य छोटा हो जाता है'), t('Banks give a discount', 'बैंक छूट देते हैं')], answer: 0,
      why: t('Early money compounds for longer, so you need to put in less of your own.', 'शुरू का पैसा ज़्यादा समय चक्रवृद्धि पाता है, इसलिए आपको अपना कम डालना पड़ता है।') },
  }, 'slider'),
  reel({
    id: 'slide-step-up-rate', topic: 'goals', title: t('Drag it: how fast to raise your SIP', 'खिसकाइए: SIP कितनी तेज़ी से बढ़ाएँ'), tags: ['SIP', 'step-up'],
    lines: [t('Raising your SIP a little each year can matter more than the starting amount.', 'हर साल SIP थोड़ी बढ़ाना शुरुआती रकम से भी ज़्यादा मायने रख सकता है।'),
      t('₹10,000 a month for 20 years, at an assumed 12% a year. Drag the yearly step-up.', 'महीने के ₹10,000, 20 साल, मान लें 12% सालाना। सालाना बढ़ोतरी खिसकाएँ।'), t('Even a small yearly step lifts the end figure well above a flat SIP.', 'छोटी सालाना बढ़ोतरी भी अंतिम रकम को स्थिर SIP से काफ़ी ऊपर ले जाती है।'),
      t('It asks you to raise your savings only as your income rises.', 'यह आपसे तभी बचत बढ़ाने को कहती है जब आय बढ़े।'), t('Choose a step you can keep, and set a reminder for the raise.', 'ऐसी बढ़ोतरी चुनें जो टिक सके, और इन्क्रीमेंट पर रिमाइंडर लगाएँ।')],
    steps: [t('₹10,000 a month', 'महीने का ₹10,000'), t('20 years, 12% assumed', '20 साल, 12% अनुमानित'), t('You choose the step-up', 'बढ़ोतरी आप चुनें')],
    beat: { kind: 'slider', q: t('Drag the yearly step-up to see the end figure.', 'सालाना बढ़ोतरी खिसकाकर अंतिम रकम देखें।'), label: t('Raise each year by', 'हर साल बढ़ाएँ'), unit: t('%', '%'), min: 0, max: 15, step: 1, start: 8,
      model: { kind: 'step-up', monthly: 10_000, rate: 12, years: 20 }, takeaway: t('Raising it {x} a year ends near {value}, against {base} with no step-up. That is about {diff} more.', 'हर साल {x} बढ़ाने पर अंत में लगभग {value}, बिना बढ़ोतरी के {base}। यानी लगभग {diff} ज़्यादा।') },
    quiz: { q: t('Why does a yearly step-up help?', 'सालाना बढ़ोतरी क्यों मदद करती है?'), options: [t('More money goes in, and it also grows', 'ज़्यादा पैसा जाता है, और वह भी बढ़ता है'), t('It guarantees returns', 'वह रिटर्न की गारंटी देती है'), t('It cuts costs', 'वह ख़र्च घटाती है')], answer: 0,
      why: t('Each year’s extra amount gets its own time to grow.', 'हर साल की अतिरिक्त रकम को अपना बढ़ने का समय मिलता है।') },
  }, 'slider'),
  reel({
    id: 'slide-tax-income', topic: 'tax', title: t('Drag it: tax at different incomes', 'खिसकाइए: अलग आय पर टैक्स'), tags: ['income tax', 'regime'],
    lines: [t('Which regime costs less can flip as your income changes. Drag the income to see it.', 'कौन-सा रिजीम सस्ता है, आय बदलने पर पलट सकता है। आय खिसकाकर देखें।'),
      t('Salary income, FY 2025-26, with ₹2 lakh of deductions in the old regime.', 'वेतन की आय, FY 2025-26, पुराने रिजीम में ₹2 लाख की कटौती के साथ।'), t('At lower incomes the new regime can come to nil, and at higher ones the gap closes or flips.', 'कम आय पर नया रिजीम शून्य तक आ सकता है, और ज़्यादा पर अंतर घटता या पलटता है।'),
      t('Your own deductions decide where the line falls.', 'आपकी अपनी कटौतियाँ तय करती हैं कि रेखा कहाँ पड़ती है।'), t('Rules change with each Budget. Check the current year before you choose.', 'नियम हर बजट में बदलते हैं। चुनने से पहले इस साल के नियम देखें।')],
    steps: [t('Salary income', 'वेतन की आय'), t('₹2 lakh deductions, old', '₹2 लाख कटौती, पुराना'), t('Cess included', 'सेस सहित')],
    beat: { kind: 'slider', q: t('Drag the yearly income to compare the two regimes.', 'सालाना आय खिसकाकर दोनों रिजीम की तुलना करें।'), label: t('Yearly salary', 'सालाना वेतन'), unit: t('a year', 'सालाना'), xFormat: 'inr', min: 800_000, max: 3_000_000, step: 50_000, start: 1_500_000,
      model: { kind: 'tax-income', deduction: 200_000 }, takeaway: t('On {x}, the new regime tax is about {value}, and the old regime about {base}. The gap is about {diff}.', '{x} पर नए रिजीम का टैक्स लगभग {value}, और पुराने का लगभग {base}। अंतर लगभग {diff}।') },
    quiz: { q: t('What can change which regime is cheaper?', 'कौन-सा रिजीम सस्ता है, यह क्या बदल सकता है?'), options: [t('Your income and your deductions', 'आपकी आय और कटौतियाँ'), t('The bank you use', 'आप कौन-सा बैंक इस्तेमाल करते हैं'), t('Nothing', 'कुछ नहीं')], answer: 0,
      why: t('Higher deductions favour the old regime, and lower ones favour the new.', 'ज़्यादा कटौतियाँ पुराने रिजीम के पक्ष में हैं, कम नए के।') },
  }, 'slider'),
  reel({
    id: 'slide-card-wait', topic: 'credit', title: t('Drag it: what waiting costs on a card', 'खिसकाइए: कार्ड पर इंतज़ार की क़ीमत'), tags: ['credit card', 'interest'],
    lines: [t('Every month a card bill sits unpaid, it grows. Drag the months to watch it.', 'कार्ड बिल जितने महीने बिना चुकाए रहे, उतना बढ़ता है। महीने खिसकाकर देखें।'),
      t('A ₹50,000 balance at an assumed 3.5% a month, with no payments.', '₹50,000 का बकाया, मान लें 3.5% महीना, कोई भुगतान नहीं।'), t('The first months look small. The later months add more, because interest is charged on interest.', 'शुरू के महीने छोटे लगते हैं। बाद के ज़्यादा जोड़ते हैं, क्योंकि ब्याज पर ब्याज लगता है।'),
      t('Your card’s real rate may differ, so check your statement.', 'आपके कार्ड की असली दर अलग हो सकती है, स्टेटमेंट देखें।'), t('Pay in full, or pay as much as you can, as early as you can.', 'पूरा चुकाएँ, या जितना हो सके, जितना जल्दी हो सके।')],
    steps: [t('₹50,000 owed', '₹50,000 बकाया'), t('3.5% a month, assumed', '3.5% महीना, अनुमानित'), t('No payments', 'कोई भुगतान नहीं')],
    beat: { kind: 'slider', q: t('Drag the months to see the bill grow.', 'महीने खिसकाकर बिल बढ़ता देखें।'), label: t('Months left unpaid', 'बिना चुकाए महीने'), unit: t('months', 'महीने'), min: 0, max: 24, step: 1, start: 6,
      model: { kind: 'card-interest', balance: 50_000, monthlyPct: 3.5 }, takeaway: t('After {x}, ₹50,000 becomes about {value}. About {lost} of that is interest.', '{x} बाद ₹50,000 लगभग {value} हो जाता है। उसमें लगभग {lost} ब्याज है।') },
    quiz: { q: t('Why does the bill grow faster later?', 'बिल बाद में तेज़ क्यों बढ़ता है?'), options: [t('Interest is charged on past interest too', 'ब्याज पिछले ब्याज पर भी लगता है'), t('Banks add a penalty', 'बैंक जुर्माना जोड़ते हैं'), t('It does not', 'ऐसा नहीं होता')], answer: 0,
      why: t('Each month’s interest joins the balance, so the next month’s interest is on more.', 'हर महीने का ब्याज बकाया में जुड़ता है, इसलिए अगले महीने का ब्याज ज़्यादा पर लगता है।') },
  }, 'slider'),
  reel({
    id: 'slide-car-loan-rate', topic: 'loans', title: t('Drag it: the rate on a car loan', 'खिसकाइए: कार लोन की दर'), tags: ['car loan', 'rate'],
    lines: [t('Two lenders may quote a car-loan rate a few points apart. What does that do to the EMI?', 'दो बैंक कार लोन की दर में कुछ अंक का फ़र्क़ बता सकते हैं। EMI पर इसका क्या असर है?'),
      t('A ₹8 lakh loan over 5 years. Drag the rate.', '₹8 लाख का लोन, 5 साल। दर खिसकाएँ।'), t('Each extra point of rate adds to the EMI, and to the total you pay.', 'दर का हर अतिरिक्त अंक EMI और कुल चुकाई रकम बढ़ाता है।'),
      t('Compare rates from more than one lender, and check the fees too.', 'एक से ज़्यादा बैंक की दरें देखें, और शुल्क भी जाँचें।'), t('Ask each lender for the rate, in writing.', 'हर बैंक से दर लिखित में माँगें।')],
    steps: [t('₹8 lakh loan', '₹8 लाख का लोन'), t('5 years', '5 साल'), t('You choose the rate', 'दर आप चुनें')],
    beat: { kind: 'slider', q: t('Drag the rate to see the EMI move.', 'दर खिसकाकर EMI का बदलना देखें।'), label: t('The loan’s yearly rate', 'लोन की सालाना दर'), unit: t('%', '%'), min: 8, max: 16, step: 0.5, start: 11,
      model: { kind: 'emi-rate', principal: 800_000, years: 5, rate0: 9 }, takeaway: t('At {x} a year the EMI is about {value}, against {base} at 9%. The gap is about {diff} a month.', '{x} सालाना पर EMI लगभग {value}, 9% पर {base}। अंतर लगभग {diff} महीना।') },
    quiz: { q: t('What does a higher rate do?', 'ऊँची दर क्या करती है?'), options: [t('Raises the EMI and the total paid', 'EMI और कुल चुकाई रकम बढ़ाती है'), t('Lowers the EMI', 'EMI घटाती है'), t('Changes nothing', 'कुछ नहीं बदलती')], answer: 0,
      why: t('Interest is the price of the loan, and a higher rate is a higher price.', 'ब्याज लोन की क़ीमत है, और ऊँची दर ऊँची क़ीमत।') },
  }, 'slider'),
  reel({
    id: 'slide-corpus-small', topic: 'retire', title: t('Drag it: how long ₹50 lakh lasts', 'खिसकाइए: ₹50 लाख कितना चलेगा'), tags: ['withdrawal', 'corpus'],
    lines: [t('A smaller corpus is more sensitive to how much you take out each month.', 'छोटा कोष हर महीने की निकासी के प्रति ज़्यादा संवेदनशील होता है।'),
      t('₹50 lakh, earning an assumed 7% a year. Drag the monthly withdrawal.', '₹50 लाख, मान लें 7% सालाना कमाई। मासिक निकासी खिसकाएँ।'), t('A small rise in the withdrawal can cut the years by a lot.', 'निकासी में छोटी बढ़त सालों को बहुत घटा सकती है।'),
      t('Returns vary, and prices rise, so treat this as a rough guide.', 'रिटर्न बदलते हैं और कीमतें बढ़ती हैं, इसलिए इसे मोटा मार्गदर्शन मानें।'), t('Choose a withdrawal that leaves a margin, and review it each year.', 'ऐसी निकासी चुनें जो गुंजाइश छोड़े, और हर साल देखें।')],
    steps: [t('₹50 lakh corpus', '₹50 लाख का कोष'), t('7% a year, assumed', '7% सालाना, अनुमानित'), t('You choose the withdrawal', 'निकासी आप चुनें')],
    beat: { kind: 'slider', q: t('Drag the withdrawal to see how long it lasts.', 'निकासी खिसकाकर देखें वह कितना चलता है।'), label: t('Taken out each month', 'हर महीने निकालें'), unit: t('per month', 'प्रति माह'), xFormat: 'inr', min: 15_000, max: 60_000, step: 5_000, start: 35_000,
      model: { kind: 'corpus-spend', corpus: 5_000_000, rate: 7 }, takeaway: t('Taking {x} a month, the corpus lasts about {value}, at an assumed 7% growth.', 'महीने में {x} निकालने पर कोष लगभग {value} चलता है, मान लें 7% बढ़त पर।') },
    quiz: { q: t('What happens when you take out less each month?', 'हर महीने कम निकालें तो क्या होता है?'), options: [t('The corpus lasts longer', 'कोष ज़्यादा चलता है'), t('It lasts a shorter time', 'वह कम चलता है'), t('Nothing changes', 'कुछ नहीं बदलता')], answer: 0,
      why: t('Less taken out leaves more to earn, so the money lasts longer.', 'कम निकलने से ज़्यादा बचा रहकर कमाता है, इसलिए पैसा ज़्यादा चलता है।') },
  }, 'slider'),
];
