// Second wave, part D: scams and goals. Scam reels name no number to call except the national helpline 1930 (a test enforces it).
import { emi, fill, grownCost, mean, money, pctOf, sipNeeded } from '@/lib/reels/figures';
import { lakhDec, sc, t } from '@/lib/reels/kit';
import type { Reel } from '@/lib/reels/types';

// ── Scams ────────────────────────────────────────────────────────────────────────────────────────────────────────
const phoneCheck: Reel = {
  id: 'phone-safety-checklist', topic: 'safety', tags: ['phone security', 'UPI', 'checklist'],
  title: t('Your five-minute phone safety check', 'आपकी पाँच मिनट की फ़ोन सुरक्षा जाँच'),
  scenes: [
    sc('think', t('Your phone is now your wallet. A few minutes of setup protects you from most tricks.', 'आपका फ़ोन अब आपका बटुआ है। कुछ मिनट की सेटिंग ज़्यादातर चालों से बचाती है।'), { big: t('Phone check', 'फ़ोन जाँच'), ms: 4400 }),
    sc('happy', t('Do these four things today.', 'आज ये चार काम करें।'), { prop: { kind: 'steps', items: [t('Lock the phone and UPI app', 'फ़ोन और UPI ऐप लॉक करें'), t('Set a daily UPI limit', 'रोज़ की UPI सीमा तय करें'), t('Review app permissions', 'ऐप की अनुमतियाँ देखें'), t('Install apps only from stores', 'ऐप सिर्फ़ स्टोर से लें')] }, ms: 5400 }),
    sc('think', t('Turn on alerts for every bank transaction, so an odd one shows up at once.', 'हर बैंक लेन-देन के अलर्ट चालू करें, ताकि अजीब लेन-देन तुरंत दिखे।')),
    sc('worry', t('Never let anyone control your phone with a screen-sharing app, even for “help”.', 'किसी को स्क्रीन-शेयरिंग ऐप से अपना फ़ोन कंट्रोल न करने दें, “मदद” के नाम पर भी नहीं।')),
    sc('cheer', t('Tell one family member about these steps. Report fraud on 1930 straight away.', 'परिवार के एक सदस्य को ये क़दम बताएँ। धोखाधड़ी की सूचना तुरंत 1930 पर दें।')),
  ],
  quiz: { q: t('Why set a daily UPI limit?', 'रोज़ की UPI सीमा क्यों तय करें?'),
    options: [t('It caps what a thief or scammer can take in one day', 'वह एक दिन में चोर या ठग के ले जाने की रकम सीमित करती है'), t('It makes payments faster', 'वह भुगतान तेज़ करती है'), t('It earns interest', 'उस पर ब्याज मिलता है')], answer: 0,
    why: t('A limit turns a possible big loss into a small one while you act.', 'सीमा संभावित बड़े नुक़सान को छोटा कर देती है जब तक आप कार्रवाई करें।') },
};

const simSwap: Reel = {
  id: 'sim-swap-signs', topic: 'safety', tags: ['SIM swap', 'fraud'],
  title: t('When your phone suddenly loses signal', 'जब फ़ोन अचानक सिग्नल खो दे'),
  scenes: [
    sc('worry', t('Your phone loses network for no reason, and then bank messages stop reaching you. That can be a SIM swap.', 'फ़ोन बिना वजह नेटवर्क खो देता है, और बैंक के संदेश आना बंद हो जाते हैं। यह SIM स्वैप हो सकता है।'), { big: t('No signal?', 'सिग्नल नहीं?') }),
    sc('think', t('A fraudster gets a copy of your number on a new SIM, so your calls and OTPs go to them.', 'ठग आपके नंबर की कॉपी नई SIM पर ले लेता है, और आपकी कॉल और OTP उसके पास जाते हैं।')),
    sc('happy', t('If this happens, act fast.', 'ऐसा हो तो तुरंत कार्रवाई करें।'), { prop: { kind: 'steps', items: [t('Call your operator from another phone', 'दूसरे फ़ोन से ऑपरेटर को कॉल करें'), t('Tell your bank to block access', 'बैंक से एक्सेस ब्लॉक करवाएँ'), t('Report on 1930', '1930 पर सूचित करें')] }, ms: 5000 }),
    sc('think', t('Never share your Aadhaar or ID copies casually, and do not tell strangers your SIM details.', 'अपने आधार या पहचान की कॉपी यूँ ही साझा न करें, और अजनबियों को SIM की जानकारी न बताएँ।')),
    sc('cheer', t('Set alerts by email as well as SMS, so you still see warnings.', 'SMS के साथ ईमेल अलर्ट भी लगाएँ, ताकि चेतावनियाँ फिर भी दिखें।')),
  ],
  quiz: { q: t('Your phone loses signal for no reason. What should you do?', 'फ़ोन बिना वजह सिग्नल खो दे, तो क्या करें?'),
    options: [t('Contact your operator and bank at once, from another phone', 'दूसरे फ़ोन से तुरंत ऑपरेटर और बैंक से संपर्क करें'), t('Wait a few days', 'कुछ दिन रुकें'), t('Ignore it', 'अनदेखा करें')], answer: 0,
    why: t('Speed matters: a swapped SIM gives the fraudster your OTPs until it is blocked.', 'गति मायने रखती है: बदली हुई SIM जब तक ब्लॉक न हो, ठग को आपके OTP देती रहती है।') },
};

const jobScam: Reel = {
  id: 'fake-job-task-scam', topic: 'safety', tags: ['job scam', 'task scam'],
  title: t('The “earn from home” task scam', 'घर बैठे कमाई वाला टास्क धोखा'),
  scenes: [
    sc('surprised', t('A message offers easy money for liking videos or rating products. The first small payout does arrive.', 'एक मैसेज वीडियो लाइक करने या प्रोडक्ट रेट करने पर आसान कमाई का ऑफ़र देता है। पहला छोटा भुगतान सच में आता है।'), { big: t('Easy money?', 'आसान कमाई?') }),
    sc('worry', t('Then comes the catch: pay a deposit to unlock bigger tasks. Each step asks for more.', 'फिर पेच आता है: बड़े टास्क खोलने के लिए जमा रकम दें। हर क़दम पर और माँगा जाता है।')),
    sc('think', t('The red flags:', 'ख़तरे के संकेत:'), { prop: { kind: 'steps', items: [t('Unknown sender, a chat app', 'अनजान भेजने वाला, चैट ऐप'), t('Pay first to earn more', 'ज़्यादा कमाने को पहले पैसे दें'), t('Pressure and a countdown', 'दबाव और उलटी गिनती')] } }),
    sc('happy', t('Real employers never ask you to pay to get paid.', 'असली नियोक्ता कभी पैसे पाने के लिए आपसे पैसे नहीं माँगते।')),
    sc('cheer', t('Stop, do not send more money, and report it on 1930 and cybercrime.gov.in.', 'रुकें, और पैसे न भेजें, और 1930 व cybercrime.gov.in पर शिकायत करें।')),
  ],
  quiz: { q: t('A “job” asks you to pay a deposit first. What is it?', 'कोई “नौकरी” पहले जमा रकम माँगती है। यह क्या है?'),
    options: [t('A scam', 'धोखा'), t('A normal joining fee', 'सामान्य जॉइनिंग फ़ीस'), t('A tax', 'एक टैक्स')], answer: 0,
    why: t('Paying to earn is the core trick. The early payout only builds trust.', 'कमाने के लिए देना ही असली चाल है। शुरुआती भुगतान सिर्फ़ भरोसा बनाता है।') },
};

const qrScam: Reel = {
  id: 'qr-code-scam', topic: 'safety', tags: ['QR', 'UPI', 'fraud'],
  title: t('Scanning a QR sends money out', 'QR स्कैन करने पर पैसा जाता है'),
  scenes: [
    sc('worry', t('A buyer says “scan this QR to receive your payment”. That QR will take money from you.', 'ख़रीदार कहता है “पेमेंट पाने के लिए यह QR स्कैन करें”। वह QR आपसे पैसा लेगा।'), { big: t('Scan to pay', 'स्कैन = भुगतान') }),
    sc('think', t('A QR code is for paying someone. To receive money, you only share your own UPI ID or QR.', 'QR कोड किसी को भुगतान के लिए होता है। पैसा पाने के लिए आप अपना UPI ID या QR देते हैं।')),
    sc('happy', t('Before you pay, check the name shown on the payment screen.', 'भुगतान से पहले पेमेंट स्क्रीन पर दिखा नाम देखें।'), { prop: { kind: 'shield', text: t('Check the name', 'नाम जाँचें'), sub: t('before you pay', 'भुगतान से पहले') } }),
    sc('worry', t('Also look at QR stickers in shops. A fake one pasted over the real one sends money to a stranger.', 'दुकानों में QR स्टिकर भी देखें। असली पर चिपकाया नक़ली स्टिकर पैसा किसी अजनबी को भेजता है।')),
    sc('cheer', t('Never scan a QR you got from a stranger, and never enter your PIN to receive.', 'अजनबी से मिला QR कभी स्कैन न करें, और पैसा पाने के लिए PIN न डालें।')),
  ],
  quiz: { q: t('To receive money, what do you do?', 'पैसा पाने के लिए आप क्या करते हैं?'),
    options: [t('Share your own UPI ID or QR; never scan theirs', 'अपना UPI ID या QR देते हैं; उनका स्कैन कभी नहीं'), t('Scan their QR', 'उनका QR स्कैन करते हैं'), t('Share your PIN', 'अपना PIN बताते हैं')], answer: 0,
    why: t('Scanning and entering a PIN always sends money out of your account.', 'स्कैन करके PIN डालने से हमेशा आपके खाते से पैसा जाता है।') },
};

const careScam: Reel = {
  id: 'fake-customer-care', topic: 'safety', tags: ['customer care', 'screen sharing'],
  title: t('The customer-care number you googled', 'गूगल किया हुआ कस्टमर-केयर नंबर'),
  scenes: [
    sc('worry', t('Something goes wrong with an order or a refund. You search online for the helpline and call the first number.', 'किसी ऑर्डर या रिफ़ंड में गड़बड़ होती है। आप ऑनलाइन हेल्पलाइन खोजकर पहला नंबर लगा देते हैं।'), { big: t('First result?', 'पहला नतीजा?') }),
    sc('think', t('Scammers plant their numbers in search results. The “agent” then asks you to install an app to fix it.', 'ठग अपने नंबर सर्च नतीजों में डाल देते हैं। फिर “एजेंट” ठीक करने के लिए आपसे ऐप इंस्टॉल करवाता है।')),
    sc('surprised', t('That app lets them see your screen, your OTPs and your banking app.', 'वह ऐप उन्हें आपकी स्क्रीन, आपके OTP और आपका बैंकिंग ऐप दिखा देता है।')),
    sc('happy', t('Get the number from the company’s own app or website, or from your bank card.', 'नंबर कंपनी के अपने ऐप या वेबसाइट से, या अपने बैंक कार्ड से लें।'), { prop: { kind: 'steps', items: [t('Use the official app', 'आधिकारिक ऐप इस्तेमाल करें'), t('Never install on request', 'कहने पर इंस्टॉल न करें'), t('Refunds never need your PIN', 'रिफ़ंड में PIN नहीं लगता')] } }),
    sc('cheer', t('If you installed something, remove it, call your bank, and report on 1930.', 'अगर कुछ इंस्टॉल किया है, तो हटाएँ, बैंक को कॉल करें, और 1930 पर सूचित करें।')),
  ],
  quiz: { q: t('Where should you find a company’s helpline?', 'किसी कंपनी की हेल्पलाइन कहाँ से लें?'),
    options: [t('Its official app or website', 'उसके आधिकारिक ऐप या वेबसाइट से'), t('The first search result', 'पहले सर्च नतीजे से'), t('A message from a stranger', 'अजनबी के मैसेज से')], answer: 0,
    why: t('Search results can be gamed. The company’s own channels are the safe source.', 'सर्च नतीजों से खिलवाड़ हो सकता है। कंपनी के अपने माध्यम सुरक्षित स्रोत हैं।') },
};

const parcelScam: Reel = {
  id: 'fake-delivery-fee', topic: 'safety', tags: ['parcel scam', 'phishing'],
  title: t('The “small fee” for your parcel', 'पार्सल के लिए “छोटी फ़ीस”'),
  scenes: [
    sc('surprised', t('A message says your parcel is held and you must pay a small fee at a link to release it.', 'मैसेज कहता है आपका पार्सल रुका है और छुड़ाने के लिए लिंक पर छोटी फ़ीस देनी है।'), { big: t('Small fee', 'छोटी फ़ीस') }),
    sc('worry', t('The link is fake. It copies a courier page and takes your card or UPI details for much more than the “fee”.', 'लिंक नक़ली है। वह कूरियर का पेज बनाकर आपके कार्ड या UPI की जानकारी लेता है, “फ़ीस” से कहीं ज़्यादा के लिए।')),
    sc('think', t('Did you order anything? If not, it is not yours. Courier firms do not ask for money by random link.', 'क्या आपने कुछ मँगाया था? नहीं, तो वह आपका नहीं। कूरियर कंपनियाँ यूँ ही लिंक से पैसे नहीं माँगतीं।')),
    sc('happy', t('Check the tracking in the shop’s own app, not in the message.', 'ट्रैकिंग दुकान के अपने ऐप में देखें, मैसेज में नहीं।')),
    sc('cheer', t('Delete the message, and do not reply or tap.', 'मैसेज मिटाएँ, और जवाब न दें या टैप न करें।')),
  ],
  quiz: { q: t('A link asks a small fee to release a parcel you did not order. What now?', 'ऐसे पार्सल के लिए लिंक छोटी फ़ीस माँगता है जो आपने मँगाया ही नहीं। अब क्या?'),
    options: [t('Delete it, it is a scam', 'मिटा दें, यह धोखा है'), t('Pay it, it is small', 'चुका दें, छोटी है'), t('Share it with friends', 'दोस्तों को भेजें')], answer: 0,
    why: t('The small fee is bait. The real aim is your card or UPI details.', 'छोटी फ़ीस चारा है। असली मक़सद आपके कार्ड या UPI की जानकारी है।') },
};

const familyCall: Reel = {
  id: 'family-emergency-call', topic: 'safety', tags: ['voice scam', 'impersonation'],
  title: t('“Papa, I am in trouble”', '“पापा, मैं मुसीबत में हूँ”'),
  scenes: [
    sc('worry', t('A call comes from an unknown number. A voice that sounds like your child or relative says they need money urgently.', 'अनजान नंबर से कॉल आती है। आपके बच्चे या रिश्तेदार जैसी आवाज़ कहती है कि उन्हें तुरंत पैसा चाहिए।'), { big: t('Urgent help', 'तुरंत मदद') }),
    sc('think', t('Voices can now be copied from a short clip. A familiar voice is no longer proof.', 'अब थोड़ी-सी क्लिप से आवाज़ की नक़ल हो सकती है। जानी-पहचानी आवाज़ अब सबूत नहीं।')),
    sc('happy', t('Slow down and check:', 'रुकें और जाँचें:'), { prop: { kind: 'steps', items: [t('Hang up, call them back', 'कॉल काटें, उन्हें वापस करें'), t('Ask a family-only question', 'सिर्फ़ परिवार को पता सवाल पूछें'), t('Agree a family code word', 'परिवार का कोड-शब्द तय करें')] } }),
    sc('worry', t('The caller will push for secrecy and speed. That pressure is the sign.', 'कॉल करने वाला गोपनीयता और जल्दबाज़ी पर ज़ोर देगा। वही दबाव संकेत है।')),
    sc('cheer', t('Talk about this with your family today, and pick a code word.', 'आज परिवार से इस पर बात करें, और एक कोड-शब्द चुनें।')),
  ],
  quiz: { q: t('A voice like your relative asks for urgent money. What first?', 'रिश्तेदार जैसी आवाज़ तुरंत पैसा माँगती है। पहले क्या?'),
    options: [t('Hang up and call them on their usual number', 'कॉल काटें और उनके सामान्य नंबर पर कॉल करें'), t('Send the money, then ask', 'पहले पैसे भेजें, फिर पूछें'), t('Keep it secret', 'राज़ रखें')], answer: 0,
    why: t('A call back on a number you already know breaks the trick in seconds.', 'जाने-पहचाने नंबर पर वापस कॉल करने से चाल सेकंडों में टूट जाती है।') },
};

const loanApp: Reel = {
  id: 'loan-app-red-flags', topic: 'safety', tags: ['loan apps', 'harassment'],
  title: t('Instant loan app red flags', 'इंस्टैंट लोन ऐप के ख़तरे के संकेत'),
  scenes: [
    sc('worry', t('An app promises a loan in minutes with no papers. Some are traps.', 'एक ऐप बिना काग़ज़ मिनटों में लोन का वादा करता है। कुछ जाल होते हैं।'), { big: t('Instant loan', 'इंस्टैंट लोन') }),
    sc('think', t('Warning signs:', 'चेतावनी के संकेत:'), { prop: { kind: 'steps', items: [t('Wants your contacts and photos', 'आपके कॉन्टैक्ट और फ़ोटो माँगता है'), t('Asks for a fee before paying', 'देने से पहले फ़ीस माँगता है'), t('Very short repayment time', 'चुकाने की बहुत कम अवधि'), t('Threatens to message contacts', 'कॉन्टैक्ट को मैसेज की धमकी')] }, ms: 5400 }),
    sc('worry', t('Some apps then shame borrowers by messaging their contacts. That is harassment, and it is illegal.', 'कुछ ऐप फिर उधार लेने वालों के कॉन्टैक्ट को मैसेज करके शर्मिंदा करते हैं। यह उत्पीड़न है, और ग़ैरक़ानूनी है।')),
    sc('happy', t('Borrow only from a lender that is regulated, and check this before you install anything.', 'उधार सिर्फ़ विनियमित लेनदार से लें, और कुछ भी इंस्टॉल करने से पहले यह जाँचें।')),
    sc('cheer', t('If you are being threatened, do not pay more. Save the messages and report on 1930.', 'अगर धमकी मिल रही है, तो और पैसे न दें। संदेश सहेजें और 1930 पर सूचित करें।')),
  ],
  quiz: { q: t('What is a red flag in a loan app?', 'लोन ऐप में ख़तरे का संकेत क्या है?'),
    options: [t('It asks for your contacts and a fee up front', 'वह आपके कॉन्टैक्ट और पहले से फ़ीस माँगता है'), t('It is regulated and explains charges', 'वह विनियमित है और शुल्क बताता है'), t('It asks for ID only', 'वह सिर्फ़ पहचान माँगता है')], answer: 0,
    why: t('A proper lender does not need your contact list, and it never charges to release a loan.', 'सही लेनदार को आपकी कॉन्टैक्ट सूची नहीं चाहिए, और वह लोन देने के लिए फ़ीस नहीं लेता।') },
};

export const SAFETY_MORE: Reel[] = [phoneCheck, simSwap, jobScam, qrScam, careScam, parcelScam, familyCall, loanApp];

// ── Goals ────────────────────────────────────────────────────────────────────────────────────────────────────────
const WED_TODAY = 1_200_000, WED_YEARS = 5, WED_INF = 8, WED_RATE = 7;
const wedTarget = Math.round(grownCost(WED_TODAY, WED_INF, WED_YEARS)), wedSip = Math.round(sipNeeded(wedTarget, WED_RATE, WED_YEARS));
const wedding: Reel = {
  id: 'wedding-fund', topic: 'goals', tags: ['wedding', 'goal', 'SIP'],
  title: t('Saving for a wedding', 'शादी के लिए बचत'),
  scenes: [
    sc('think', t('A wedding has a date and a rough budget. That makes it one of the easiest goals to plan.', 'शादी की तारीख़ और मोटा बजट होता है। इसलिए यह सबसे आसानी से योजना बन सकने वाले लक्ष्यों में है।'), { big: t('A fixed date', 'तय तारीख़') }),
    sc('surprised', fill(t('Say it costs {t} today. At an assumed {i}% price rise a year, in {y} years it is about {g}.', 'मान लें आज यह {t} का है। मान लें कीमतें साल में {i}% बढ़ें, तो {y} साल बाद लगभग {g}।'), { t: money(WED_TODAY), i: WED_INF, y: WED_YEARS, g: money(wedTarget) }),
      { prop: { kind: 'bars', items: [{ label: t('Today', 'आज'), value: WED_TODAY, text: money(WED_TODAY), tone: 'gold' }, { label: t('In 5 years', '5 साल बाद'), value: wedTarget, text: money(wedTarget), tone: 'red' }] } }),
    sc('happy', fill(t('Saving at an assumed {r}% for {y} years needs about {s} a month.', 'मान लें {r}% पर {y} साल बचत के लिए महीने में लगभग {s} चाहिए।'), { r: WED_RATE, y: WED_YEARS, s: money(wedSip) }),
      { prop: { kind: 'counter', from: 0, to: wedSip, format: 'inr', tone: 'teal', label: t('a month (example)', 'महीना (उदाहरण)') } }),
    sc('think', t('With a date this near, keep the money in safer places so a market fall cannot hit it.', 'तारीख़ इतनी पास हो तो पैसा सुरक्षित जगहों में रखें ताकि बाज़ार गिरने का असर न पड़े।')),
    sc('cheer', t('Agree the budget with your family early, and start the monthly amount now.', 'बजट परिवार से जल्दी तय करें, और महीने की रकम अभी से शुरू करें।')),
  ],
  quiz: { q: t('Why keep wedding money in safer places?', 'शादी का पैसा सुरक्षित जगहों में क्यों रखें?'),
    options: [t('The date is fixed and near, so a fall could hurt', 'तारीख़ तय और पास है, इसलिए गिरावट नुक़सान कर सकती है'), t('Safer places earn more', 'सुरक्षित जगहें ज़्यादा कमाती हैं'), t('Weddings are tax free', 'शादियाँ टैक्स-मुक्त हैं')], answer: 0,
    why: t('A fixed near date leaves no time to recover from a fall.', 'तय और नज़दीकी तारीख़ पर गिरावट से उबरने का समय नहीं होता।') },
};

const EDU_TODAY = 2_000_000, EDU_YEARS = 12, EDU_INF = 8, EDU_RATE = 10;
const eduTarget = Math.round(grownCost(EDU_TODAY, EDU_INF, EDU_YEARS)), eduSip = Math.round(sipNeeded(eduTarget, EDU_RATE, EDU_YEARS));
const childEdu: Reel = {
  id: 'child-education-fund', topic: 'goals', tags: ['child', 'education', 'goal'],
  title: t('A fund for your child’s education', 'बच्चे की पढ़ाई के लिए फ़ंड'),
  scenes: [
    sc('think', t('Education costs tend to rise faster than ordinary prices. Start from the cost in future rupees.', 'पढ़ाई का ख़र्च आम कीमतों से तेज़ बढ़ता है। भविष्य के रुपयों के ख़र्च से शुरू करें।'), { big: t('Future cost', 'भविष्य की लागत') }),
    sc('surprised', fill(t('Say a course costs {t} today. At an assumed {i}% a year, in {y} years it is about {g}.', 'मान लें कोर्स आज {t} का है। मान लें साल में {i}% बढ़ें, तो {y} साल बाद लगभग {g}।'), { t: money(EDU_TODAY), i: EDU_INF, y: EDU_YEARS, g: money(eduTarget) }),
      { prop: { kind: 'counter', from: EDU_TODAY, to: eduTarget, format: 'inr', tone: 'red', label: t('the target (illustration)', 'लक्ष्य (उदाहरण)') } }),
    sc('happy', fill(t('At an assumed {r}% a year, that needs about {s} a month for {y} years.', 'मान लें {r}% सालाना, इसके लिए {y} साल महीने में लगभग {s} चाहिए।'), { r: EDU_RATE, s: money(eduSip), y: EDU_YEARS })),
    sc('think', t('As the date nears, move the money towards safer places in steps, so a fall cannot hit the final years.', 'तारीख़ पास आए तो पैसा चरणों में सुरक्षित जगहों की ओर ले जाएँ, ताकि गिरावट आख़िरी सालों को न मारे।')),
    sc('cheer', t('Do not stop your own retirement saving for this. There is no loan for retirement.', 'इसके लिए अपनी रिटायरमेंट बचत न रोकें। रिटायरमेंट के लिए कोई लोन नहीं मिलता।')),
  ],
  quiz: { q: t('Why use the future cost of education?', 'पढ़ाई की भविष्य की लागत क्यों लें?'),
    options: [t('Because fees will have risen by then', 'क्योंकि तब तक फ़ीस बढ़ चुकी होगी'), t('Because it is cheaper', 'क्योंकि वह सस्ती है'), t('Because it is tax free', 'क्योंकि वह टैक्स-मुक्त है')], answer: 0,
    why: t('You pay tomorrow’s fees, not today’s, so plan for the higher number.', 'आप कल की फ़ीस देंगे, आज की नहीं, इसलिए ऊँचे आँकड़े की योजना बनाएँ।') },
};

const PRICE = 6_000_000, DOWN_PCT = 20, COSTS_PCT = 7, H_YEARS = 5, H_RATE = 7;
const homeNeed = pctOf(PRICE, DOWN_PCT) + pctOf(PRICE, COSTS_PCT), homeSip = Math.round(sipNeeded(homeNeed, H_RATE, H_YEARS));
const firstHome: Reel = {
  id: 'first-home-downpayment', topic: 'goals', tags: ['home', 'down payment', 'goal'],
  title: t('Saving for your first home’s down payment', 'पहले घर की डाउन पेमेंट की बचत'),
  scenes: [
    sc('think', t('The loan covers only part of a home. You bring the down payment and the buying costs.', 'लोन घर का सिर्फ़ एक हिस्सा देता है। डाउन पेमेंट और ख़रीद के ख़र्च आप लाते हैं।'), { big: t('Your share', 'आपका हिस्सा') }),
    sc('surprised', fill(t('Say a home costs {p}. A {d}% down payment plus about {c}% for stamp duty and fees is about {n}.', 'मान लें घर {p} का है। {d}% डाउन पेमेंट और स्टैम्प ड्यूटी व शुल्क का लगभग {c}% मिलाकर लगभग {n}।'), { p: money(PRICE), d: DOWN_PCT, c: COSTS_PCT, n: money(homeNeed) }),
      { prop: { kind: 'counter', from: 0, to: Math.round(homeNeed), format: 'inr', tone: 'cyan', label: t('to save (illustration)', 'बचाना है (उदाहरण)') } }),
    sc('happy', fill(t('In {y} years at an assumed {r}%, that needs about {s} a month.', '{y} साल में, मान लें {r}%, इसके लिए महीने में लगभग {s} चाहिए।'), { y: H_YEARS, r: H_RATE, s: money(homeSip) })),
    sc('think', t('Costs differ by state and by lender. A bigger down payment also means a smaller EMI.', 'ख़र्च राज्य और बैंक के हिसाब से अलग हैं। बड़ी डाउन पेमेंट का मतलब छोटी EMI भी है।')),
    sc('cheer', t('Keep an emergency fund apart from the home money, and check what the EMI would be.', 'घर के पैसे से अलग आपातकालीन फ़ंड रखें, और देखें कि EMI क्या होगी।')),
  ],
  quiz: { q: t('Besides the down payment, what should you save for?', 'डाउन पेमेंट के अलावा किसके लिए बचाना चाहिए?'),
    options: [t('Stamp duty, registration and fees', 'स्टैम्प ड्यूटी, रजिस्ट्रेशन और शुल्क'), t('Nothing else', 'और कुछ नहीं'), t('Only the first EMI', 'सिर्फ़ पहली EMI')], answer: 0,
    why: t('Buying costs are paid up front and are not covered by the loan.', 'ख़रीद के ख़र्च पहले देने पड़ते हैं और लोन उन्हें कवर नहीं करता।') },
};

const CAR = 1_000_000, CAR_RATE = 9, CAR_YEARS = 5;
const carEmi = emi(CAR, CAR_RATE, CAR_YEARS), carTotal = carEmi * CAR_YEARS * 12;
const carMath: Reel = {
  id: 'car-buying-math', topic: 'goals', tags: ['car', 'loan', 'goal'],
  title: t('The real cost of a car', 'कार की असली लागत'),
  scenes: [
    sc('think', t('A car loan spreads the price over years. The sticker price is not what you end up paying.', 'कार लोन कीमत को सालों में बाँट देता है। स्टिकर प्राइस वह नहीं जो आप अंत में चुकाते हैं।'), { big: t('Total cost', 'कुल लागत') }),
    sc('surprised', fill(t('Take {p} at an assumed {r}% for {y} years. The EMI is about {e}, and you pay about {t} in all.', '{p} का लोन, मान लें {r}% पर {y} साल। EMI लगभग {e}, और आप कुल लगभग {t} चुकाते हैं।'), { p: money(CAR), r: CAR_RATE, y: CAR_YEARS, e: money(Math.round(carEmi)), t: lakhDec(carTotal) }),
      { prop: { kind: 'bars', items: [{ label: t('Price', 'कीमत'), value: CAR, text: money(CAR), tone: 'gold' }, { label: t('You pay', 'आप चुकाते'), value: carTotal, text: lakhDec(carTotal), tone: 'red' }] } }),
    sc('worry', t('A car usually loses value as it ages, so it is a cost, not an investment. Fuel, insurance and servicing come on top.', 'कार उम्र के साथ आम तौर पर कीमत खोती है, इसलिए वह लागत है, निवेश नहीं। ऊपर से ईंधन, बीमा और सर्विस।')),
    sc('think', t('A larger down payment, a shorter loan or a cheaper car all cut the interest you pay.', 'बड़ी डाउन पेमेंट, छोटा लोन या सस्ती कार, सब आपके ब्याज को घटाते हैं।')),
    sc('cheer', t('Decide the total monthly cost you can carry, then pick the car.', 'तय करें कि कुल मासिक ख़र्च कितना सँभाल सकते हैं, फिर कार चुनें।')),
  ],
  quiz: { q: t('Is a car an investment?', 'क्या कार निवेश है?'),
    options: [t('Usually no, it tends to lose value', 'आम तौर पर नहीं, उसकी कीमत घटती है'), t('Yes, it always gains', 'हाँ, वह हमेशा बढ़ती है'), t('Yes, if the loan is long', 'हाँ, अगर लोन लंबा हो')], answer: 0,
    why: t('Most cars sell for less than they cost, so treat one as an expense to be planned.', 'ज़्यादातर कारें लागत से कम में बिकती हैं, इसलिए उसे योजना वाला ख़र्च मानें।') },
};

const SABB_SPEND = 40_000, SABB_MONTHS = 6;
const sabbatical: Reel = {
  id: 'sabbatical-fund', topic: 'goals', tags: ['sabbatical', 'career break', 'goal'],
  title: t('Funding a career break', 'करियर ब्रेक के लिए फंडिंग'),
  scenes: [
    sc('think', t('A break to study, travel or care for family needs money for the months with no pay.', 'पढ़ाई, यात्रा या परिवार की देखभाल के ब्रेक में बिना वेतन वाले महीनों के लिए पैसा चाहिए।'), { big: t('No pay', 'बिना वेतन'), ms: 4800 }),
    sc('happy', fill(t('Start from essentials. At {s} a month for {m} months, you need about {n}.', 'ज़रूरी ख़र्च से शुरू करें। महीने के {s}, {m} महीने, मतलब लगभग {n}।'), { s: money(SABB_SPEND), m: SABB_MONTHS, n: money(SABB_SPEND * SABB_MONTHS) }),
      { prop: { kind: 'counter', from: 0, to: SABB_SPEND * SABB_MONTHS, format: 'inr', tone: 'teal', label: t('break fund (example)', 'ब्रेक फ़ंड (उदाहरण)') } }),
    sc('think', t('Do not forget what keeps running:', 'जो चलता रहता है उसे न भूलें:'), { prop: { kind: 'steps', items: [t('EMIs and insurance premiums', 'EMI और बीमा प्रीमियम'), t('Health cover', 'हेल्थ कवर'), t('Your own retirement saving', 'आपकी रिटायरमेंट बचत')] } }),
    sc('worry', t('Keep this apart from your emergency fund. The emergency fund is for surprises, not plans.', 'इसे आपातकालीन फ़ंड से अलग रखें। वह अनहोनी के लिए है, योजनाओं के लिए नहीं।')),
    sc('cheer', t('Add a cushion for the months a restart can take.', 'फिर से शुरुआत में लगने वाले महीनों के लिए गुंजाइश जोड़ें।')),
  ],
  quiz: { q: t('How is a break fund different from an emergency fund?', 'ब्रेक फ़ंड आपातकालीन फ़ंड से कैसे अलग है?'),
    options: [t('It is for a planned break, not a surprise', 'वह योजनाबद्ध ब्रेक के लिए है, अनहोनी के लिए नहीं'), t('There is no difference', 'कोई फ़र्क़ नहीं'), t('It must be spent first', 'उसे पहले ख़र्च करना होता है')], answer: 0,
    why: t('Mixing them leaves you without a safety net when a real emergency arrives.', 'दोनों मिलाने पर असली आपातकाल आने पर कोई सुरक्षा-जाल नहीं बचता।') },
};

const MONTHS_INC = [40_000, 70_000, 25_000, 60_000, 35_000, 90_000], avgInc = Math.round(mean(MONTHS_INC)), leanInc = Math.min(...MONTHS_INC);
const gig: Reel = {
  id: 'irregular-income-buffer', topic: 'goals', tags: ['gig', 'freelance', 'irregular income'],
  title: t('Money plans for an irregular income', 'अनियमित आय के लिए पैसे की योजना'),
  scenes: [
    sc('think', t('If your income changes every month, a fixed monthly budget can feel impossible. A buffer helps.', 'अगर हर महीने आय बदलती है, तो तय मासिक बजट असंभव लग सकता है। बफ़र मदद करता है।'), { big: t('Ups and downs', 'उतार-चढ़ाव') }),
    sc('surprised', fill(t('Say six months bring {a} on average, but the lowest month is {l}. Plan on the lean month.', 'मान लें छह महीनों में औसत {a} आता है, पर सबसे कम महीना {l} का है। कम वाले महीने पर योजना बनाएँ।'), { a: money(avgInc), l: money(leanInc) }),
      { prop: { kind: 'bars', items: [{ label: t('Average', 'औसत'), value: avgInc, text: money(avgInc), tone: 'teal' }, { label: t('Lean month', 'कम वाला'), value: leanInc, text: money(leanInc), tone: 'red' }] } }),
    sc('happy', t('Pay yourself a fixed salary from a separate account. Good months fill it, lean months draw from it.', 'अलग खाते से अपने को तय वेतन दें। अच्छे महीने उसे भरते हैं, कम वाले महीने उससे निकलते हैं।')),
    sc('think', t('Aim for a larger emergency fund than a salaried person, often six to nine months of essentials.', 'नौकरीपेशा से बड़ा आपातकालीन फ़ंड रखने का लक्ष्य रखें, अक्सर छह से नौ महीने के ज़रूरी ख़र्च।')),
    sc('cheer', t('Set aside tax money as it arrives, so the bill never surprises you.', 'टैक्स का पैसा आते ही अलग रखें, ताकि बिल कभी चौंकाए नहीं।')),
  ],
  quiz: { q: t('How should you budget on an irregular income?', 'अनियमित आय पर बजट कैसे बनाएँ?'),
    options: [t('Around your leaner months, with a buffer', 'कम वाले महीनों के हिसाब से, बफ़र के साथ'), t('Around your best month', 'सबसे अच्छे महीने के हिसाब से'), t('Without a budget', 'बिना बजट के')], answer: 0,
    why: t('Planning on the lean month means a good month is a bonus, and a bad one is survivable.', 'कम वाले महीने पर योजना का मतलब है कि अच्छा महीना बोनस है, और बुरा महीना सहने लायक़।') },
};

const priority: Reel = {
  id: 'goal-priority', topic: 'goals', tags: ['goals', 'priorities'],
  title: t('Which goal first?', 'कौन-सा लक्ष्य पहले?'),
  scenes: [
    sc('think', t('You have more goals than money. Putting them in order stops you from doing a little for each.', 'आपके पास पैसे से ज़्यादा लक्ष्य हैं। उन्हें क्रम देने से आप हर एक में थोड़ा-थोड़ा करने से बचते हैं।'), { big: t('In order', 'क्रम में') }),
    sc('happy', t('A common order to think about:', 'सोचने के लिए एक आम क्रम:'), { prop: { kind: 'steps', items: [t('Safety: emergency fund, cover', 'सुरक्षा: आपातकालीन फ़ंड, कवर'), t('Costly debt', 'महँगा क़र्ज़'), t('Goals with a fixed date', 'तय तारीख़ वाले लक्ष्य'), t('Flexible goals, treats', 'लचीले लक्ष्य, शौक़')] }, ms: 5400 }),
    sc('worry', t('Retirement has no loan to fall back on, so it should not sit last just because it is far away.', 'रिटायरमेंट के लिए कोई लोन नहीं मिलता, इसलिए दूर होने भर से उसे आख़िर में न रखें।')),
    sc('think', t('Your own order may differ. A parent’s surgery, for example, can jump the queue.', 'आपका क्रम अलग हो सकता है। जैसे माता-पिता की सर्जरी सबसे आगे आ सकती है।')),
    sc('cheer', t('Write the order down, and give each goal its own monthly amount.', 'क्रम लिख लें, और हर लक्ष्य को उसकी अपनी मासिक रकम दें।')),
  ],
  quiz: { q: t('Why put goals in order?', 'लक्ष्यों को क्रम क्यों दें?'),
    options: [t('Money is limited, so choices must be clear', 'पैसा सीमित है, इसलिए चुनाव साफ़ होने चाहिए'), t('Banks demand it', 'बैंक इसकी माँग करते हैं'), t('It earns interest', 'उस पर ब्याज मिलता है')], answer: 0,
    why: t('A clear order stops important goals from being starved by smaller ones.', 'साफ़ क्रम बड़े लक्ष्यों को छोटे लक्ष्यों के हाथों भूखा रहने से रोकता है।') },
};

const BEHIND = 0, GOAL_Y = 2_000_000, GOAL_YEARS = 10, GOAL_RATE = 10;
const planned = Math.round(sipNeeded(GOAL_Y, GOAL_RATE, GOAL_YEARS)), late = Math.round(sipNeeded(GOAL_Y, GOAL_RATE, GOAL_YEARS - 1 + BEHIND));
const review: Reel = {
  id: 'yearly-goal-review', topic: 'goals', tags: ['review', 'goals', 'SIP'],
  title: t('A yearly goal check-up', 'हर साल लक्ष्यों की जाँच'),
  scenes: [
    sc('think', t('A goal is not set and forgotten. Once a year, check it against real life.', 'लक्ष्य एक बार तय करके भूलने की चीज़ नहीं। साल में एक बार उसे असल ज़िंदगी से मिलाएँ।'), { big: t('Check-up', 'जाँच') }),
    sc('happy', t('Ask four questions:', 'चार सवाल पूछें:'), { prop: { kind: 'steps', items: [t('Is the date the same?', 'क्या तारीख़ वही है?'), t('Is the cost updated?', 'क्या लागत अपडेट है?'), t('Am I on track?', 'क्या मैं सही राह पर हूँ?'), t('Can I add more?', 'क्या और जोड़ सकता हूँ?')] }, ms: 5400 }),
    sc('surprised', fill(t('Say {g} in {y} years at an assumed {r}% needs about {p} a month. Miss a year and it is about {l}.', 'मान लें {y} साल में {g}, मान लें {r}%, महीने में लगभग {p}। एक साल चूकें तो लगभग {l}।'), { g: money(GOAL_Y), y: GOAL_YEARS, r: GOAL_RATE, p: money(planned), l: money(late) }),
      { prop: { kind: 'bars', items: [{ label: t('As planned', 'योजना अनुसार'), value: planned, text: money(planned), tone: 'teal' }, { label: t('A year late', 'एक साल देर'), value: late, text: money(late), tone: 'red' }] } }),
    sc('think', t('If you fall behind, you can raise the amount, extend the date or trim the goal. Choose on purpose.', 'पीछे रह जाएँ तो रकम बढ़ा सकते हैं, तारीख़ आगे कर सकते हैं या लक्ष्य घटा सकते हैं। सोच-समझकर चुनें।')),
    sc('cheer', t('Pick one date each year, like your birthday, for this check-up.', 'इस जाँच के लिए हर साल एक तारीख़ चुनें, जैसे आपका जन्मदिन।')),
  ],
  quiz: { q: t('What if you fall behind on a goal?', 'अगर लक्ष्य में पीछे रह जाएँ तो?'),
    options: [t('Raise the amount, move the date or adjust the goal', 'रकम बढ़ाएँ, तारीख़ बदलें या लक्ष्य समायोजित करें'), t('Give up', 'छोड़ दें'), t('Ignore it', 'अनदेखा करें')], answer: 0,
    why: t('You have three levers. Looking once a year lets you use them early, when they cost least.', 'आपके पास तीन उपाय हैं। साल में एक जाँच से आप उन्हें जल्दी, जब वे सबसे सस्ते हैं, इस्तेमाल कर पाते हैं।') },
};

const ANNUAL = [24_000, 36_000, 30_000], annualTotal = ANNUAL.reduce((a, b) => a + b, 0), perMonth = annualTotal / 12;
const sinking: Reel = {
  id: 'sinking-funds', topic: 'goals', tags: ['sinking fund', 'annual expenses'],
  title: t('Sinking funds: ending the yearly shock', 'सिंकिंग फ़ंड: साल के झटके का अंत'),
  scenes: [
    sc('worry', t('Some bills come once a year: insurance, a festival, a trip. They hit your month all at once.', 'कुछ बिल साल में एक बार आते हैं: बीमा, त्योहार, यात्रा। वे एक ही महीने पर एक साथ आ पड़ते हैं।'), { big: t('Yearly bills', 'सालाना बिल') }),
    sc('happy', fill(t('Add them up and divide by twelve. Insurance, festival and a trip come to {a} a year, which is {m} a month.', 'उन्हें जोड़कर बारह से भाग दें। बीमा, त्योहार और यात्रा मिलाकर साल का {a}, यानी महीने का {m}।'), { a: money(annualTotal), m: money(perMonth) }),
      { prop: { kind: 'counter', from: 0, to: perMonth, format: 'inr', tone: 'teal', label: t('set aside a month (example)', 'महीने में अलग रखें (उदाहरण)') } }),
    sc('think', t('List your own once-a-year costs, then do the same sum.', 'अपने सालाना ख़र्चों की सूची बनाएँ, फिर यही जोड़ करें।'), { prop: { kind: 'steps', items: [t('Insurance premiums', 'बीमा प्रीमियम'), t('Festivals and gifts', 'त्योहार और तोहफ़े'), t('Travel and repairs', 'यात्रा और मरम्मत')] }, ms: 4800 }),
    sc('happy', t('Put it in a separate pot, so it is there when the bill comes.', 'इसे अलग खाते में रखें, ताकि बिल आने पर पैसा तैयार हो।')),
    sc('cheer', t('A small monthly amount beats a big yearly scramble.', 'छोटी मासिक रकम साल की बड़ी हड़बड़ी से बेहतर है।')),
  ],
  quiz: { q: t('What is a sinking fund?', 'सिंकिंग फ़ंड क्या है?'),
    options: [t('Money set aside monthly for a known future cost', 'किसी तय आगामी ख़र्च के लिए महीने-महीने अलग रखा पैसा'), t('A fund that loses value', 'ऐसा फ़ंड जो कीमत खोता है'), t('A loan', 'एक लोन')], answer: 0,
    why: t('Spreading a known cost over the year removes the shock when it arrives.', 'तय ख़र्च को साल भर में बाँटने से आने पर झटका नहीं लगता।') },
};

const WINDFALL = 200_000, CARD = 36, cardSaved = pctOf(WINDFALL, CARD);
const windfall: Reel = {
  id: 'windfall-plan', topic: 'goals', tags: ['bonus', 'windfall', 'priorities'],
  title: t('A bonus arrives: what first?', 'बोनस आया: पहले क्या?'),
  scenes: [
    sc('think', t('A bonus or a gift lands in your account. The right use depends on your situation.', 'बोनस या तोहफ़ा खाते में आता है। सही उपयोग आपकी स्थिति पर निर्भर है।'), { big: t('A windfall', 'अचानक रकम') }),
    sc('surprised', fill(t('If you carry card debt at about {c}% a year, clearing {w} of it saves roughly {s} in interest a year.', 'अगर आप पर लगभग {c}% सालाना का कार्ड क़र्ज़ है, तो {w} चुकाने से साल में मोटे तौर पर {s} का ब्याज बचता है।'), { c: CARD, w: money(WINDFALL), s: money(cardSaved) }),
      { prop: { kind: 'counter', from: 0, to: cardSaved, format: 'inr', tone: 'teal', label: t('interest saved a year', 'साल में बचा ब्याज') } }),
    sc('happy', t('Questions to ask in order:', 'क्रम से ये सवाल पूछें:'), { prop: { kind: 'steps', items: [t('Any costly debt?', 'कोई महँगा क़र्ज़?'), t('Is the emergency fund full?', 'क्या आपातकालीन फ़ंड पूरा है?'), t('Any goal with a near date?', 'कोई नज़दीकी तारीख़ का लक्ष्य?'), t('Then long-term goals', 'फिर लंबी अवधि के लक्ष्य')] }, ms: 5400 }),
    sc('think', t('Keep a small part to enjoy. A plan you can live with is one you will follow.', 'थोड़ा हिस्सा आनंद के लिए रखें। जिस योजना के साथ जी सकें, उसी पर चलेंगे।')),
    sc('cheer', t('Decide before the money arrives, so it is not spent by default.', 'पैसा आने से पहले तय करें, ताकि वह यूँ ही ख़र्च न हो।')),
  ],
  quiz: { q: t('What usually comes first for a windfall?', 'अचानक रकम के लिए आम तौर पर पहले क्या आता है?'),
    options: [t('Costly debt and the emergency fund', 'महँगा क़र्ज़ और आपातकालीन फ़ंड'), t('A luxury purchase', 'महँगी ख़रीद'), t('A risky bet', 'जोखिम भरा दाँव')], answer: 0,
    why: t('Clearing high-interest debt and building safety give the surest benefit.', 'महँगा क़र्ज़ चुकाने और सुरक्षा बनाने से सबसे पक्का लाभ मिलता है।') },
};

export const GOALS_MORE: Reel[] = [wedding, childEdu, firstHome, carMath, sabbatical, gig, priority, review, sinking, windfall];
