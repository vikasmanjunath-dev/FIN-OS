// Wave 3, part 1: twelve "spot the scam" reels. Each shows a realistic message in pieces and the viewer taps the red flags. The messages are made up,
// no real sender, number or link is used, and the only number a caption names is the national cyber-fraud helpline, 1930.
import { sc, t } from '@/lib/reels/kit';
import type { L, Reel } from '@/lib/reels/types';

const q = t('Tap the parts that look like red flags.', 'लाल झंडे जैसे लगने वाले हिस्से छुएँ।');
const exampleScene = t('Here is an example of the kind of message scammers send. Read it slowly.', 'ठगों के भेजे मैसेज का एक उदाहरण यह है। इसे धीरे-धीरे पढ़ें।');
const readSteps = [t('Read the message', 'मैसेज पढ़ें'), t('Spot what is off', 'देखें क्या ग़लत है')];
export const part = (en: string, hi: string, flagEn?: string, flagHi?: string) => ({ t: t(en, hi), ...(flagEn ? { flag: t(flagEn, flagHi ?? flagEn) } : {}) });

interface SpotArgs {
  id: string; title: L; tags: string[];
  lines: [L, L, L, L, L];                                  // hook, then three reasons, then the closing line
  from: L; parts: ReturnType<typeof part>[]; todo: L;
  quiz: Reel['quiz'];
}
export function spot(a: SpotArgs): Reel {
  const [hook, w1, w2, w3, close] = a.lines;
  return {
    id: a.id, topic: 'safety', tags: ['scams', 'spot', ...a.tags], title: a.title,
    scenes: [
      sc('worry', hook), sc('think', exampleScene, { prop: { kind: 'steps', items: readSteps } }),
      sc('happy', w1), sc('think', w2), sc('worry', w3), sc('cheer', close),
    ],
    poke: { after: 1, beat: { kind: 'spot', q, from: a.from, parts: a.parts, todo: a.todo } },
    quiz: a.quiz,
  };
}

export const SPOT_REELS: Reel[] = [
  spot({
    id: 'spot-electricity-sms', title: t('Spot the scam: the power-cut message', 'ठगी पहचानें: बिजली कटने का मैसेज'), tags: ['bill', 'SMS'],
    lines: [
      t('A message says your power will be cut tonight unless you act now. You have a fan running and exams tomorrow.', 'मैसेज कहता है आज रात बिजली कट जाएगी, जब तक आप अभी कुछ न करें। पंखा चल रहा है और कल इम्तिहान है।'),
      t('Utilities do send reminders. They do not threaten a cut within hours or send you to an unknown number.', 'बिजली कंपनियाँ रिमाइंडर भेजती हैं। वे घंटों में कटने की धमकी या अनजान नंबर पर भेजना नहीं करतीं।'),
      t('Paying through a link or app from a message can hand the scammer your card or UPI details.', 'मैसेज के लिंक या ऐप से भुगतान करने पर ठग को आपके कार्ड या UPI की जानकारी मिल सकती है।'),
      t('A real bill is in your own account on the utility’s app or website, with the real amount.', 'असली बिल आपके अपने खाते में, बिजली कंपनी के ऐप या वेबसाइट पर, असली रकम के साथ होता है।'),
      t('Check the bill on the official app, not through the message.', 'बिल आधिकारिक ऐप पर देखें, मैसेज के ज़रिए नहीं।')],
    from: t('SMS from “ELEC-ALERT”', '“ELEC-ALERT” का SMS'),
    parts: [
      part('Dear consumer, your last bill is unpaid.', 'प्रिय उपभोक्ता, आपका पिछला बिल बाक़ी है।'),
      part('Your power will be disconnected tonight at 9.30 pm.', 'आज रात 9.30 बजे आपकी बिजली काट दी जाएगी।', 'A threat with a deadline of hours. Scammers rush you so you do not check.', 'घंटों की समय-सीमा वाली धमकी। ठग जल्दी मचाते हैं ताकि आप जाँच न करें।'),
      part('Call our officer on the number below at once.', 'नीचे दिए नंबर पर तुरंत हमारे अफ़सर को कॉल करें।', 'An unknown number instead of the utility’s own helpline.', 'बिजली कंपनी की अपनी हेल्पलाइन के बजाय अनजान नंबर।'),
      part('Install our app to pay in two minutes.', 'दो मिनट में भुगतान के लिए हमारा ऐप इंस्टॉल करें।', 'An app pushed through a message can take over your phone or steal your details.', 'मैसेज से थोपा गया ऐप आपका फ़ोन क़ब्ज़े में ले सकता है या जानकारी चुरा सकता है।'),
      part('– Electricity Board', '– बिजली बोर्ड'),
    ],
    todo: t('Do not call, install or pay. Check your bill in the utility’s official app or website, and report the message to 1930 if you lost money.', 'कॉल, इंस्टॉल या भुगतान न करें। बिल बिजली कंपनी के आधिकारिक ऐप या वेबसाइट पर देखें, और पैसा गया हो तो 1930 पर सूचित करें।'),
    quiz: { q: t('A message threatens a power cut within hours. Where do you check?', 'मैसेज घंटों में बिजली कटने की धमकी देता है। आप कहाँ जाँचेंगे?'),
      options: [t('The utility’s official app or website', 'बिजली कंपनी के आधिकारिक ऐप या वेबसाइट पर'), t('The number in the message', 'मैसेज वाले नंबर पर'), t('The link in the message', 'मैसेज वाले लिंक पर')], answer: 0,
      why: t('Your own account on the official channel shows the true bill, so you never need the message.', 'आधिकारिक माध्यम पर आपका अपना खाता सही बिल दिखाता है, इसलिए मैसेज की ज़रूरत नहीं।') },
  }),
  spot({
    id: 'spot-refund-call', title: t('Spot the scam: the refund call', 'ठगी पहचानें: रिफ़ंड वाली कॉल'), tags: ['refund', 'UPI', 'call'],
    lines: [
      t('A caller says your order failed but the money left your account, and he will refund you right now.', 'कॉल करने वाला कहता है आपका ऑर्डर फ़ेल हुआ पर पैसा कट गया, और वह अभी रिफ़ंड करेगा।'),
      t('A refund goes back to you on its own. It never needs you to approve a payment or enter a PIN.', 'रिफ़ंड अपने आप आपके पास लौटता है। उसके लिए भुगतान मंज़ूर करना या PIN डालना नहीं पड़ता।'),
      t('Keeping you on the line is a tactic: it stops you from calling your bank or asking anyone.', 'आपको लाइन पर रोके रखना एक चाल है: इससे आप बैंक को कॉल या किसी से पूछ नहीं पाते।'),
      t('The “code” they ask you to read out is often an OTP or a screen-share code.', 'जो “कोड” वे बोलने को कहते हैं, वह अक्सर OTP या स्क्रीन-शेयर कोड होता है।'),
      t('Hang up, and contact the shop through its own app.', 'कॉल काटें, और दुकान से उसके अपने ऐप के ज़रिए संपर्क करें।')],
    from: t('A call from a “support agent”', 'एक “सपोर्ट एजेंट” की कॉल'),
    parts: [
      part('Hello, I am calling from the shopping app’s support.', 'नमस्ते, मैं शॉपिंग ऐप के सपोर्ट से बोल रहा हूँ।'),
      part('Your order failed, but the money was debited.', 'आपका ऑर्डर फ़ेल हुआ, पर पैसा कट गया।'),
      part('I will send you a request. Approve it with your UPI PIN to get the refund.', 'मैं आपको एक रिक्वेस्ट भेजूँगा। रिफ़ंड के लिए उसे UPI PIN से मंज़ूर करें।', 'Approving with a PIN sends money out. A refund never needs it.', 'PIN से मंज़ूर करने पर पैसा बाहर जाता है। रिफ़ंड में इसकी ज़रूरत नहीं।'),
      part('Please stay on the call and do not disconnect.', 'कृपया कॉल पर बने रहें, काटें नहीं।', 'Keeping you on the line stops you from checking.', 'लाइन पर रोकना आपको जाँचने से रोकता है।'),
      part('Now read out the code that appears on your screen.', 'अब आपकी स्क्रीन पर आया कोड बोलिए।', 'That code can be an OTP or lets them see your screen.', 'वह कोड OTP हो सकता है या उन्हें आपकी स्क्रीन दिखा सकता है।'),
    ],
    todo: t('Hang up. Check the order in the shop’s own app. If money has gone, call 1930 straight away.', 'कॉल काटें। ऑर्डर दुकान के अपने ऐप में देखें। पैसा गया हो तो तुरंत 1930 पर कॉल करें।'),
    quiz: { q: t('To receive a refund, what do you have to do?', 'रिफ़ंड पाने के लिए आपको क्या करना पड़ता है?'),
      options: [t('Nothing. It comes back by itself', 'कुछ नहीं। वह अपने आप लौटता है'), t('Enter your UPI PIN', 'अपना UPI PIN डालें'), t('Read out a code', 'कोई कोड बोलें')], answer: 0,
      why: t('Money coming in never needs your PIN, so a request to enter it means money is going out.', 'आने वाले पैसे के लिए PIN नहीं लगता, इसलिए PIN माँगा जाए तो पैसा बाहर जा रहा है।') },
  }),
  spot({
    id: 'spot-job-whatsapp', title: t('Spot the scam: the easy-work offer', 'ठगी पहचानें: आसान काम का ऑफ़र'), tags: ['job', 'WhatsApp'],
    lines: [
      t('A stranger messages you on WhatsApp about a part-time job from home that pays very well.', 'कोई अजनबी WhatsApp पर घर बैठे पार्ट-टाइम नौकरी बताता है जिसमें बहुत अच्छा पैसा है।'),
      t('Pay that is far above the work, for liking videos or rating shops, is the bait.', 'काम के मुक़ाबले बहुत ज़्यादा पैसा, वीडियो लाइक या दुकान रेट करने के लिए, यही चारा है।'),
      t('Then a “deposit” or “registration fee” appears, and each step asks for more.', 'फिर “डिपॉज़िट” या “रजिस्ट्रेशन फ़ीस” आती है, और हर क़दम पर और माँगा जाता है।'),
      t('Real employers do not hire through chat from an unknown number, and do not charge you to start.', 'असली नियोक्ता अनजान नंबर से चैट पर भर्ती नहीं करते, और शुरू करने के लिए फ़ीस नहीं लेते।'),
      t('Block the number, and do not pay anything to earn.', 'नंबर ब्लॉक करें, और कमाने के लिए कुछ न चुकाएँ।')],
    from: t('WhatsApp, unknown number', 'WhatsApp, अनजान नंबर'),
    parts: [
      part('Hi! We found your profile. We have part-time work from home.', 'नमस्ते! हमें आपकी प्रोफ़ाइल मिली। हमारे पास घर बैठे पार्ट-टाइम काम है।'),
      part('Earn ₹5,000 a day just by liking videos for 30 minutes.', '30 मिनट वीडियो लाइक करके रोज़ ₹5,000 कमाएँ।', 'Far too much for easy work. That is the bait.', 'आसान काम के लिए बहुत ज़्यादा। यही चारा है।'),
      part('First pay a small registration deposit to unlock your account.', 'पहले अकाउंट खोलने के लिए छोटा रजिस्ट्रेशन डिपॉज़िट दें।', 'Paying to earn is the core trick of this scam.', 'कमाने के लिए देना इस ठगी की असली चाल है।'),
      part('Join our Telegram group now, only a few seats are left.', 'अभी हमारे टेलीग्राम ग्रुप से जुड़ें, बस कुछ सीटें बची हैं।', 'A rush and a move to a private group, away from anyone who could warn you.', 'जल्दबाज़ी और निजी ग्रुप में ले जाना, ताकि कोई आपको चेताए नहीं।'),
      part('Reply YES to start.', 'शुरू करने के लिए YES लिखें।'),
    ],
    todo: t('Do not reply or pay. Block and report the number. If you already paid, stop sending money and call 1930.', 'जवाब न दें, न पैसे दें। नंबर ब्लॉक करें और रिपोर्ट करें। पहले दे चुके हों तो और न भेजें और 1930 पर कॉल करें।'),
    quiz: { q: t('A “job” asks you to pay a fee to start. What is the sign?', 'कोई “नौकरी” शुरू करने के लिए फ़ीस माँगती है। यह किस बात का संकेत है?'),
      options: [t('A scam', 'धोखे का'), t('A serious employer', 'गंभीर नियोक्ता का'), t('A government job', 'सरकारी नौकरी का')], answer: 0,
      why: t('Employers pay you. They do not charge you to start.', 'नियोक्ता आपको पैसे देते हैं। वे शुरू करने के लिए आपसे नहीं लेते।') },
  }),
  spot({
    id: 'spot-loan-app', title: t('Spot the scam: the instant loan app', 'ठगी पहचानें: इंस्टैंट लोन ऐप'), tags: ['loan app', 'harassment'],
    lines: [
      t('An advert offers a loan in five minutes with no papers. You need money this week.', 'एक विज्ञापन पाँच मिनट में बिना काग़ज़ लोन देता है। आपको इसी हफ़्ते पैसा चाहिए।'),
      t('A lender that is regulated checks who you are and shows every charge before you accept.', 'विनियमित लेनदार आपकी पहचान जाँचता है और मंज़ूरी से पहले हर शुल्क दिखाता है।'),
      t('Some apps copy your contacts and photos, then threaten to message your family if you are late.', 'कुछ ऐप आपके कॉन्टैक्ट और फ़ोटो कॉपी करके देर होने पर परिवार को मैसेज की धमकी देते हैं।'),
      t('A fee taken before the loan is paid out is a warning on its own.', 'लोन मिलने से पहले ली गई फ़ीस अपने आप में चेतावनी है।'),
      t('Borrow only from a regulated lender, and check that before you install an app.', 'उधार सिर्फ़ विनियमित लेनदार से लें, और ऐप इंस्टॉल करने से पहले यह जाँचें।')],
    from: t('Advert: “QuickCash” app', 'विज्ञापन: “QuickCash” ऐप'),
    parts: [
      part('Get a loan in 5 minutes. Apply in our app.', '5 मिनट में लोन पाएँ। हमारे ऐप में अर्ज़ी दें।'),
      part('No documents and no credit check needed.', 'कोई काग़ज़ या क्रेडिट जाँच नहीं चाहिए।', 'A real lender checks. “No checks” means they plan to earn another way.', 'असली लेनदार जाँच करता है। “कोई जाँच नहीं” का मतलब वे कमाई किसी और तरीक़े से करेंगे।'),
      part('Allow access to your contacts and gallery to continue.', 'आगे बढ़ने के लिए कॉन्टैक्ट और गैलरी की अनुमति दें।', 'Your contacts and photos are used later to pressure you.', 'आपके कॉन्टैक्ट और फ़ोटो बाद में दबाव डालने के काम आते हैं।'),
      part('Pay a processing fee of ₹2,000 first to release the money.', 'पैसा छोड़ने के लिए पहले ₹2,000 प्रोसेसिंग फ़ीस दें।', 'A fee before any loan is paid out is a classic trap.', 'लोन मिलने से पहले फ़ीस पुराना जाल है।'),
      part('Repay in 7 days with full charges.', '7 दिन में पूरे शुल्क के साथ चुकाएँ।'),
    ],
    todo: t('Do not install or pay. Check that a lender is regulated first. If you are being threatened, save the messages and report on 1930.', 'इंस्टॉल या भुगतान न करें। पहले जाँचें कि लेनदार विनियमित है। धमकी मिल रही हो तो संदेश सहेजें और 1930 पर सूचित करें।'),
    quiz: { q: t('Why does a loan app ask for your contacts?', 'लोन ऐप आपके कॉन्टैक्ट क्यों माँगता है?'),
      options: [t('To pressure you later if you are late', 'देर होने पर बाद में दबाव डालने के लिए'), t('To check your income', 'आपकी आय जाँचने के लिए'), t('To give you a discount', 'आपको छूट देने के लिए')], answer: 0,
      why: t('A proper lender does not need your contact list. Apps that take it often use it for threats.', 'सही लेनदार को आपकी कॉन्टैक्ट सूची नहीं चाहिए। जो ऐप लेते हैं वे अक्सर उसे धमकी में इस्तेमाल करते हैं।') },
  }),
  spot({
    id: 'spot-parcel-fee', title: t('Spot the scam: the held parcel', 'ठगी पहचानें: रुका हुआ पार्सल'), tags: ['parcel', 'courier'],
    lines: [
      t('A message says a parcel for you is held and needs a small fee to be delivered.', 'मैसेज कहता है आपका पार्सल रुका है और पहुँचाने के लिए छोटी फ़ीस चाहिए।'),
      t('Think first: did you order anything? A parcel you never expected is a hook, not a delivery.', 'पहले सोचें: क्या आपने कुछ मँगाया था? जिसकी उम्मीद नहीं थी वह पार्सल चारा है, डिलीवरी नहीं।'),
      t('The page that opens looks like a courier’s, but it asks for your card or UPI details.', 'जो पेज खुलता है वह कूरियर जैसा दिखता है, पर आपके कार्ड या UPI की जानकारी माँगता है।'),
      t('The small fee is bait. The real aim is to use your details for much more.', 'छोटी फ़ीस चारा है। असली मक़सद आपकी जानकारी से बहुत ज़्यादा निकालना है।'),
      t('Track an order only in the shop’s own app.', 'ऑर्डर सिर्फ़ दुकान के अपने ऐप में ट्रैक करें।')],
    from: t('SMS from “COURIER”', '“COURIER” का SMS'),
    parts: [
      part('Your parcel could not be delivered. The address is incomplete.', 'आपका पार्सल नहीं पहुँच सका। पता अधूरा है।'),
      part('Pay a ₹25 re-delivery fee at the link below within 2 hours.', 'नीचे लिंक पर 2 घंटे में ₹25 री-डिलीवरी फ़ीस दें।', 'A tiny fee and a short deadline. The fee is bait, the deadline hurries you.', 'बहुत छोटी फ़ीस और कम समय। फ़ीस चारा है, समय आपको जल्दी में डालता है।'),
      part('Open: parcel-redeliver.in/pay', 'खोलें: parcel-redeliver.in/pay', 'A look-alike link you did not ask for.', 'ऐसा मिलता-जुलता लिंक जो आपने माँगा नहीं।'),
      part('Enter your card number, expiry and OTP to confirm.', 'पुष्टि के लिए कार्ड नंबर, एक्सपायरी और OTP डालें।', 'No courier needs your card details and OTP for a ₹25 fee.', 'किसी कूरियर को ₹25 की फ़ीस के लिए कार्ड की जानकारी और OTP नहीं चाहिए।'),
      part('– Delivery Team', '– डिलीवरी टीम'),
    ],
    todo: t('Delete it and do not tap. Check your orders in the shop’s own app. If you entered card details, call your bank at once.', 'मिटा दें, टैप न करें। अपने ऑर्डर दुकान के अपने ऐप में देखें। कार्ड की जानकारी डाली हो तो तुरंत बैंक को कॉल करें।'),
    quiz: { q: t('A message says a parcel you did not order is held. What now?', 'मैसेज कहता है जो पार्सल आपने मँगाया नहीं वह रुका है। अब क्या?'),
      options: [t('Delete it. It is not yours', 'मिटा दें। वह आपका नहीं'), t('Pay the small fee', 'छोटी फ़ीस दे दें'), t('Reply with your card number', 'कार्ड नंबर के साथ जवाब दें')], answer: 0,
      why: t('If you ordered nothing, there is nothing to release. The fee page exists to collect your details.', 'कुछ मँगाया ही नहीं तो छुड़ाने को कुछ नहीं। फ़ीस वाला पेज आपकी जानकारी जुटाने के लिए है।') },
  }),
  spot({
    id: 'spot-pan-update', title: t('Spot the scam: the PAN deactivation notice', 'ठगी पहचानें: PAN बंद होने की सूचना'), tags: ['PAN', 'Aadhaar', 'KYC'],
    lines: [
      t('A message says your PAN will be deactivated today unless you update it at a link.', 'मैसेज कहता है आपका PAN आज बंद हो जाएगा जब तक आप लिंक पर अपडेट न करें।'),
      t('Government departments do not send urgent update links by SMS and do not set same-day deadlines.', 'सरकारी विभाग SMS से तुरंत अपडेट के लिंक नहीं भेजते और उसी दिन की समय-सीमा नहीं रखते।'),
      t('The link leads to a copy of an official page that collects your PAN, Aadhaar and bank details.', 'लिंक एक आधिकारिक पेज की नक़ल पर ले जाता है जो आपके PAN, आधार और बैंक की जानकारी जुटाता है।'),
      t('With those details a scammer can open accounts or loans in your name.', 'उन जानकारियों से ठग आपके नाम पर खाते या लोन खोल सकता है।'),
      t('Check your PAN status only on the official government website you type in yourself.', 'अपने PAN की स्थिति सिर्फ़ ख़ुद टाइप की हुई आधिकारिक सरकारी वेबसाइट पर देखें।')],
    from: t('SMS from “INCOME-TAX”', '“INCOME-TAX” का SMS'),
    parts: [
      part('Your PAN is not linked and will be deactivated today.', 'आपका PAN लिंक नहीं है और आज बंद कर दिया जाएगा।', 'A same-day threat. Real notices give time and come through your registered account.', 'उसी दिन की धमकी। असली सूचनाओं में समय मिलता है और वे आपके पंजीकृत खाते में आती हैं।'),
      part('Update now at pan-update-india.in', 'अभी अपडेट करें: pan-update-india.in', 'A look-alike address, not the official government site.', 'मिलता-जुलता पता, आधिकारिक सरकारी साइट नहीं।'),
      part('Keep your PAN, Aadhaar and bank details ready.', 'अपने PAN, आधार और बैंक की जानकारी तैयार रखें।', 'Asking for all of them together is how identity theft starts.', 'सब एक साथ माँगना ही पहचान की चोरी की शुरुआत है।'),
      part('This is an automated message, please do not reply.', 'यह स्वचालित मैसेज है, कृपया जवाब न दें।'),
      part('– Department Helpdesk', '– विभाग हेल्पडेस्क'),
    ],
    todo: t('Do not tap. Type the official site into your browser yourself to check. If you shared details, tell your bank and report on 1930.', 'टैप न करें। जाँच के लिए आधिकारिक साइट ख़ुद ब्राउज़र में टाइप करें। जानकारी दे दी हो तो बैंक को बताएँ और 1930 पर सूचित करें।'),
    quiz: { q: t('Where should you check your PAN status?', 'अपने PAN की स्थिति कहाँ जाँचें?'),
      options: [t('On the official site you type in yourself', 'ख़ुद टाइप की आधिकारिक साइट पर'), t('At the link in the SMS', 'SMS के लिंक पर'), t('By replying to the SMS', 'SMS का जवाब देकर')], answer: 0,
      why: t('Typing the address yourself avoids look-alike pages.', 'पता ख़ुद टाइप करने से मिलते-जुलते पेज से बचाव होता है।') },
  }),
  spot({
    id: 'spot-reward-points', title: t('Spot the scam: expiring reward points', 'ठगी पहचानें: ख़त्म होते रिवॉर्ड पॉइंट'), tags: ['credit card', 'APK', 'rewards'],
    lines: [
      t('A message says your card’s reward points expire today and you can redeem them with an app.', 'मैसेज कहता है आपके कार्ड के रिवॉर्ड पॉइंट आज ख़त्म हो रहे हैं और ऐप से भुनाए जा सकते हैं।'),
      t('Banks tell you about points inside their own app and statement, not through a file sent in a message.', 'बैंक पॉइंट की जानकारी अपने ऐप और स्टेटमेंट में देते हैं, मैसेज से भेजी फ़ाइल में नहीं।'),
      t('A file that you install from outside the app store, often ending in .apk, can read your messages and OTPs.', 'ऐप स्टोर के बाहर से इंस्टॉल की गई फ़ाइल, अक्सर .apk, आपके मैसेज और OTP पढ़ सकती है।'),
      t('Once it reads your OTPs, the scammer can approve payments from your account.', 'OTP पढ़ने के बाद ठग आपके खाते से भुगतान मंज़ूर कर सकता है।'),
      t('Install apps only from the official store, and check points in your bank’s app.', 'ऐप सिर्फ़ आधिकारिक स्टोर से इंस्टॉल करें, और पॉइंट बैंक के ऐप में देखें।')],
    from: t('SMS from “CARD-REWARDS”', '“CARD-REWARDS” का SMS'),
    parts: [
      part('Dear cardholder, you have 9,480 reward points.', 'प्रिय कार्डधारक, आपके पास 9,480 रिवॉर्ड पॉइंट हैं।'),
      part('They expire today. Redeem now to avoid losing ₹4,740.', 'वे आज ख़त्म हो रहे हैं। ₹4,740 खोने से बचने के लिए अभी भुनाएँ।', 'A deadline and a loss to scare you into acting without checking.', 'डर दिखाने के लिए समय-सीमा और नुक़सान, ताकि आप बिना जाँचे काम करें।'),
      part('Download our rewards app from this link: RewardsPlus.apk', 'इस लिंक से हमारा रिवॉर्ड ऐप डाउनलोड करें: RewardsPlus.apk', 'A file sent in a message is not from an app store. It can read your messages.', 'मैसेज में भेजी फ़ाइल ऐप स्टोर की नहीं है। वह आपके संदेश पढ़ सकती है।'),
      part('Allow all permissions, including messages, to continue.', 'आगे बढ़ने के लिए संदेशों समेत सारी अनुमतियाँ दें।', 'Reading your messages lets them see every OTP.', 'संदेश पढ़ने की अनुमति से वे हर OTP देख लेते हैं।'),
      part('– Rewards Desk', '– रिवॉर्ड डेस्क'),
    ],
    todo: t('Do not install it. Check your points in your bank’s official app. If you installed it, remove it, call your bank, and report on 1930.', 'इंस्टॉल न करें। पॉइंट बैंक के आधिकारिक ऐप में देखें। इंस्टॉल कर लिया हो तो हटाएँ, बैंक को कॉल करें और 1930 पर सूचित करें।'),
    quiz: { q: t('Why is an .apk file from a message dangerous?', 'मैसेज से आई .apk फ़ाइल ख़तरनाक क्यों है?'),
      options: [t('It can read your messages, including OTPs', 'वह आपके संदेश, OTP समेत, पढ़ सकती है'), t('It uses a lot of storage', 'वह बहुत स्टोरेज लेती है'), t('It is slower', 'वह धीमी है')], answer: 0,
      why: t('Apps from outside the store skip the checks, and one that reads messages can approve payments for the scammer.', 'स्टोर के बाहर के ऐप जाँच से बचते हैं, और संदेश पढ़ने वाला ऐप ठग के लिए भुगतान मंज़ूर कर सकता है।') },
  }),
  spot({
    id: 'spot-new-number-family', title: t('Spot the scam: “my phone broke”', 'ठगी पहचानें: “मेरा फ़ोन टूट गया”'), tags: ['impersonation', 'family'],
    lines: [
      t('A message arrives from an unknown number: “Mum, it is me. My phone broke. I need money urgently.”', 'अनजान नंबर से मैसेज आता है: “मम्मी, मैं हूँ। मेरा फ़ोन टूट गया। मुझे तुरंत पैसे चाहिए।”'),
      t('The message uses a feeling, not a fact. It wants you to act as a parent, before you think as a sceptic.', 'मैसेज तथ्य नहीं, भावना का इस्तेमाल करता है। वह चाहता है कि आप शक करने से पहले माँ-बाप की तरह काम करें।'),
      t('A new number and an excuse for why you cannot call is the pattern.', 'नया नंबर और कॉल न कर पाने का बहाना, यही तरीक़ा है।'),
      t('The money goes to an account that is not your child’s.', 'पैसा ऐसे खाते में जाता है जो आपके बच्चे का नहीं है।'),
      t('Call your child on the old number, or ask someone who is with them.', 'अपने बच्चे को पुराने नंबर पर कॉल करें, या उनके साथ किसी से पूछें।')],
    from: t('WhatsApp, new number', 'WhatsApp, नया नंबर'),
    parts: [
      part('Mum, it is me. This is my new number.', 'मम्मी, मैं हूँ। यह मेरा नया नंबर है।', 'A “new number” is the first step of this trick.', 'यह “नया नंबर” इस चाल का पहला क़दम है।'),
      part('My phone broke so I cannot call.', 'मेरा फ़ोन टूट गया, इसलिए कॉल नहीं कर सकता।', 'An excuse that stops you from calling to check.', 'ऐसा बहाना जो आपको जाँचने के लिए कॉल करने से रोके।'),
      part('I need ₹18,000 urgently for a fee.', 'मुझे एक फ़ीस के लिए तुरंत ₹18,000 चाहिए।', 'Urgent money, to a stranger’s account.', 'तुरंत पैसा, किसी अजनबी के खाते में।'),
      part('Please do not tell Dad, I will explain later.', 'पापा को मत बताना, बाद में समझा दूँगा।'),
      part('I will send you the account number now.', 'मैं अभी आपको खाता नंबर भेजता हूँ।'),
    ],
    todo: t('Do not send money. Call your child on their old number first, or ask a family member. Report on 1930 if you sent any.', 'पैसे न भेजें। पहले अपने बच्चे को पुराने नंबर पर कॉल करें, या किसी परिवारजन से पूछें। भेज दिए हों तो 1930 पर सूचित करें।'),
    quiz: { q: t('A “relative” texts from a new number asking for money. First step?', 'कोई “रिश्तेदार” नए नंबर से पैसे माँगता है। पहला क़दम?'),
      options: [t('Call them on the number you already know', 'जो नंबर आप पहले से जानते हैं उस पर कॉल करें'), t('Send a little first', 'पहले थोड़ा भेज दें'), t('Keep it secret as asked', 'कहने के अनुसार राज़ रखें')], answer: 0,
      why: t('One call on a trusted number ends the trick. Secrecy is part of it.', 'भरोसेमंद नंबर पर एक कॉल चाल ख़त्म कर देती है। गोपनीयता उसका हिस्सा है।') },
  }),
  spot({
    id: 'spot-marketplace-buyer', title: t('Spot the scam: the eager online buyer', 'ठगी पहचानें: जल्दबाज़ ऑनलाइन ख़रीदार'), tags: ['marketplace', 'QR'],
    lines: [
      t('You list a sofa online. A buyer replies within minutes and does not even bargain.', 'आप ऑनलाइन सोफ़ा बेचने डालते हैं। ख़रीदार मिनटों में जवाब देता है और मोल-भाव भी नहीं करता।'),
      t('A buyer who does not see the item, does not bargain, and pays in advance deserves a second look.', 'जो ख़रीदार सामान देखता नहीं, मोल-भाव नहीं करता और एडवांस देता है, उस पर दोबारा नज़र डालें।'),
      t('He asks you to scan a QR or approve a request “to receive” money. Both take money from you.', 'वह “पैसे पाने” के लिए QR स्कैन या रिक्वेस्ट मंज़ूर करने को कहता है। दोनों आपसे पैसा लेते हैं।'),
      t('Official-looking stories, such as an army posting, are used to build trust.', 'सेना में पोस्टिंग जैसी आधिकारिक दिखने वाली कहानियाँ भरोसा बनाने के लिए होती हैं।'),
      t('Receive money by sharing your UPI ID. Never scan or enter a PIN.', 'पैसा पाने के लिए अपना UPI ID दें। कभी स्कैन या PIN न डालें।')],
    from: t('Chat on a marketplace app', 'मार्केटप्लेस ऐप की चैट'),
    parts: [
      part('Hello, I want to buy your sofa for the full price.', 'नमस्ते, मैं आपका सोफ़ा पूरी क़ीमत पर लेना चाहता हूँ।'),
      part('I am posted in the army, so I cannot visit.', 'मैं सेना में तैनात हूँ, इसलिए आ नहीं सकता।', 'A story that explains why he cannot see it and builds trust.', 'ऐसी कहानी जो बताए कि वह देख क्यों नहीं सकता और भरोसा बनाए।'),
      part('I will pay in advance. Scan this QR to receive the payment.', 'मैं एडवांस दूँगा। पेमेंट पाने के लिए यह QR स्कैन करें।', 'Scanning a QR sends money out. Receiving never needs it.', 'QR स्कैन करने से पैसा बाहर जाता है। पाने के लिए ज़रूरत नहीं।'),
      part('If it asks for a PIN, enter it; it is just a test.', 'PIN माँगे तो डाल दें, बस जाँच है।', 'No PIN is ever needed to receive money.', 'पैसा पाने के लिए कभी PIN नहीं लगता।'),
      part('My packers will collect it tomorrow.', 'मेरे पैकर्स कल इसे ले जाएँगे।'),
    ],
    todo: t('Do not scan or enter a PIN. Meet in person or take payment only to your UPI ID after you see it arrive.', 'स्कैन या PIN न डालें। मिलकर लें, या पैसा अपने UPI ID में आता दिखे तभी सामान दें।'),
    quiz: { q: t('To receive an advance payment, what should you share?', 'एडवांस पेमेंट पाने के लिए क्या देना चाहिए?'),
      options: [t('Only your UPI ID', 'सिर्फ़ अपना UPI ID'), t('Your UPI PIN', 'अपना UPI PIN'), t('A QR you scanned', 'स्कैन किया हुआ QR')], answer: 0,
      why: t('Your ID is enough for money to arrive. Anything that needs a PIN sends money out.', 'पैसा आने के लिए आपका ID काफ़ी है। जिसमें PIN लगे वह पैसा बाहर भेजता है।') },
  }),
  spot({
    id: 'spot-ipo-allotment', title: t('Spot the scam: the “sure allotment” tip', 'ठगी पहचानें: “पक्का अलॉटमेंट” वाली सलाह'), tags: ['IPO', 'investment fraud'],
    lines: [
      t('A message offers a sure allotment in a hot IPO if you pay an “arrangement fee” to a person.', 'मैसेज एक चर्चित IPO में पक्के अलॉटमेंट का वादा करता है, अगर आप किसी व्यक्ति को “अरेंजमेंट फ़ीस” दें।'),
      t('IPO shares are given by a process, not by a favour. No one can promise you an allotment.', 'IPO के शेयर एक प्रक्रिया से मिलते हैं, एहसान से नहीं। कोई अलॉटमेंट का वादा नहीं कर सकता।'),
      t('You pay for an IPO only through your own broker or bank account, never to a person’s account.', 'IPO का पैसा आप सिर्फ़ अपने ब्रोकर या बैंक खाते से देते हैं, किसी व्यक्ति के खाते में कभी नहीं।'),
      t('A rush and a secret “quota” are bait.', 'जल्दबाज़ी और गुप्त “कोटा” चारा हैं।'),
      t('Apply through your own broker, and ignore anyone who promises a result.', 'अपने ब्रोकर के ज़रिए अर्ज़ी दें, और नतीजे का वादा करने वाले को अनदेखा करें।')],
    from: t('Telegram, unknown sender', 'टेलीग्राम, अनजान भेजने वाला'),
    parts: [
      part('Big IPO opens tomorrow. Many people made money last time.', 'कल बड़ा IPO खुल रहा है। पिछली बार कई लोगों ने कमाया।'),
      part('We can fix allotment for you from our special quota.', 'हम अपने ख़ास कोटे से आपका अलॉटमेंट पक्का कर सकते हैं।', 'Allotment cannot be fixed. This is a false promise.', 'अलॉटमेंट पक्का नहीं किया जा सकता। यह झूठा वादा है।'),
      part('Send an arrangement fee to this personal account today.', 'आज ही इस निजी खाते में अरेंजमेंट फ़ीस भेजें।', 'Paying a person’s account for an IPO is never how it works.', 'IPO के लिए किसी व्यक्ति के खाते में देना कभी इसका तरीक़ा नहीं।'),
      part('Only 20 slots left, so decide in the next hour.', 'सिर्फ़ 20 स्लॉट बचे हैं, एक घंटे में तय करें।', 'A countdown to stop you thinking or checking.', 'आपको सोचने या जाँचने से रोकने के लिए उलटी गिनती।'),
      part('Apply through your broker as usual.', 'हमेशा की तरह अपने ब्रोकर से अर्ज़ी दें।'),
    ],
    todo: t('Do not pay anyone. Apply only through your own broker or bank, and check that anyone advising you is registered with the market regulator.', 'किसी को पैसे न दें। अर्ज़ी सिर्फ़ अपने ब्रोकर या बैंक से दें, और जाँचें कि सलाह देने वाला बाज़ार नियामक के यहाँ पंजीकृत है।'),
    quiz: { q: t('Can anyone promise you an IPO allotment for a fee?', 'क्या कोई फ़ीस लेकर IPO अलॉटमेंट का वादा कर सकता है?'),
      options: [t('No, so such a promise is a scam', 'नहीं, इसलिए ऐसा वादा धोखा है'), t('Yes, with a special quota', 'हाँ, ख़ास कोटे से'), t('Yes, if you pay early', 'हाँ, अगर जल्दी दें')], answer: 0,
      why: t('Allotment follows the issue process. A fee cannot buy it.', 'अलॉटमेंट इश्यू की प्रक्रिया से होता है। फ़ीस उसे ख़रीद नहीं सकती।') },
  }),
  spot({
    id: 'spot-crypto-double', title: t('Spot the scam: “send one, get two”', 'ठगी पहचानें: “एक भेजो, दो पाओ”'), tags: ['crypto', 'giveaway'],
    lines: [
      t('A famous person’s post says send some crypto to a wallet and they will send back double.', 'किसी मशहूर व्यक्ति की पोस्ट कहती है कुछ क्रिप्टो वॉलेट में भेजें और वे दोगुना लौटाएँगे।'),
      t('No one gives away double. A giveaway that starts with you paying is a theft.', 'कोई दोगुना नहीं बाँटता। जो गिवअवे आपके देने से शुरू हो वह चोरी है।'),
      t('Accounts of famous people are copied or hacked, so the post looks real.', 'मशहूर लोगों के अकाउंट की नक़ल या हैकिंग होती है, इसलिए पोस्ट असली लगती है।'),
      t('Crypto sent to a wallet cannot be called back.', 'वॉलेट में भेजा क्रिप्टो वापस नहीं बुलाया जा सकता।'),
      t('If it sounds too good, stop. Check on the official page of the person.', 'बहुत अच्छा लगे तो रुकें। उस व्यक्ति के आधिकारिक पेज पर जाँचें।')],
    from: t('A social media post', 'एक सोशल मीडिया पोस्ट'),
    parts: [
      part('Special giveaway for our fans this week only!', 'इस हफ़्ते सिर्फ़ हमारे फ़ैन्स के लिए ख़ास गिवअवे!'),
      part('Send any amount to the wallet below and get double back.', 'नीचे वॉलेट में कोई भी रकम भेजें और दोगुना वापस पाएँ।', 'Nobody doubles your money for free. This is the whole trick.', 'कोई मुफ़्त में आपका पैसा दोगुना नहीं करता। यही पूरी चाल है।'),
      part('Hurry, the offer ends in one hour.', 'जल्दी करें, ऑफ़र एक घंटे में ख़त्म।', 'A deadline to stop you checking.', 'जाँचने से रोकने के लिए समय-सीमा।'),
      part('Thousands have already received their double. See the comments.', 'हज़ारों लोग दोगुना पा चुके। कमेंट देखें।', 'Comments and screenshots are easy to fake.', 'कमेंट और स्क्रीनशॉट बनाना आसान है।'),
      part('Follow us for more events.', 'और इवेंट के लिए हमें फ़ॉलो करें।'),
    ],
    todo: t('Do not send anything. Report the post and block it. Check offers only on the person’s verified, official page.', 'कुछ न भेजें। पोस्ट रिपोर्ट और ब्लॉक करें। ऑफ़र सिर्फ़ उस व्यक्ति के सत्यापित, आधिकारिक पेज पर जाँचें।'),
    quiz: { q: t('A giveaway asks you to send money first. What is it?', 'गिवअवे पहले पैसे भेजने को कहता है। यह क्या है?'),
      options: [t('A scam', 'धोखा'), t('A fair offer', 'सही ऑफ़र'), t('A tax refund', 'टैक्स रिफ़ंड')], answer: 0,
      why: t('A real giveaway never needs you to pay or send first.', 'असली गिवअवे में आपको पहले देना या भेजना नहीं पड़ता।') },
  }),
  spot({
    id: 'spot-lottery-win', title: t('Spot the scam: the lucky draw win', 'ठगी पहचानें: लकी ड्रॉ की जीत'), tags: ['lottery', 'advance fee'],
    lines: [
      t('A message says you won ₹25 lakh in a lucky draw you never entered.', 'मैसेज कहता है आपने एक लकी ड्रॉ में ₹25 लाख जीते हैं, जिसमें आपने हिस्सा लिया ही नहीं।'),
      t('You cannot win a draw you did not enter. That alone ends the story.', 'जिस ड्रॉ में आप शामिल ही नहीं हुए, उसे आप जीत नहीं सकते। इतने से कहानी ख़त्म।'),
      t('Then comes a “tax”, “GST” or “courier” fee to release the prize. There is no prize.', 'फिर इनाम छुड़ाने के लिए “टैक्स”, “GST” या “कूरियर” फ़ीस आती है। कोई इनाम नहीं है।'),
      t('Each payment is followed by another reason to pay more.', 'हर भुगतान के बाद और देने का नया कारण आता है।'),
      t('Delete it. Real winnings never need an advance fee.', 'मिटा दें। असली इनाम के लिए एडवांस फ़ीस नहीं लगती।')],
    from: t('WhatsApp, unknown number', 'WhatsApp, अनजान नंबर'),
    parts: [
      part('Congratulations! You have won ₹25 lakh in our lucky draw.', 'बधाई! आपने हमारे लकी ड्रॉ में ₹25 लाख जीते हैं।', 'You never entered a draw. There is nothing to win.', 'आपने ड्रॉ में हिस्सा नहीं लिया। जीतने को कुछ नहीं।'),
      part('Your number was picked from a list of customers.', 'आपका नंबर ग्राहकों की सूची से चुना गया।'),
      part('To release the prize, pay a tax fee of ₹14,500 today.', 'इनाम छुड़ाने के लिए आज ₹14,500 टैक्स फ़ीस दें।', 'Paying to receive a prize is the core of the scam.', 'इनाम पाने के लिए देना इस ठगी की जड़ है।'),
      part('Send the fee to the account below and keep this private.', 'फ़ीस नीचे के खाते में भेजें और इसे गोपनीय रखें।', 'Secrecy stops you from asking anyone.', 'गोपनीयता आपको किसी से पूछने से रोकती है।'),
      part('Reply with your name and address to claim.', 'दावे के लिए नाम और पता भेजें।'),
    ],
    todo: t('Do not reply or pay. Block the number. If you paid, do not pay again, and call 1930.', 'जवाब या भुगतान न करें। नंबर ब्लॉक करें। दे चुके हों तो फिर न दें, और 1930 पर कॉल करें।'),
    quiz: { q: t('Can you win a lucky draw you never entered?', 'क्या आप ऐसा लकी ड्रॉ जीत सकते हैं जिसमें आपने हिस्सा नहीं लिया?'),
      options: [t('No, so it is a scam', 'नहीं, इसलिए यह धोखा है'), t('Yes, if you are lucky', 'हाँ, अगर क़िस्मत हो'), t('Yes, if you pay a fee', 'हाँ, अगर फ़ीस दें')], answer: 0,
      why: t('A prize you did not enter for does not exist, and the fee is the real aim.', 'जिस इनाम के लिए आपने हिस्सा नहीं लिया वह होता ही नहीं, और फ़ीस ही असली मक़सद है।') },
  }),
  spot({
    id: 'spot-bank-manager-call', title: t('Spot the scam: the “bank manager” call', 'ठगी पहचानें: “बैंक मैनेजर” की कॉल'), tags: ['call', 'account freeze'],
    lines: [
      t('A calm, polite voice says he is your bank’s manager and that someone is trying to take money from your account.', 'शांत, विनम्र आवाज़ कहती है वह आपके बैंक का मैनेजर है और कोई आपके खाते से पैसे निकालने की कोशिश कर रहा है।'),
      t('He sounds like help. The trick is that he makes you the one who acts, in a hurry.', 'वह मदद जैसा लगता है। चाल यह है कि वह आपको ही जल्दी में कार्रवाई करने वाला बना देता है।'),
      t('He asks you to move money to a “safe account” to protect it. A bank has no such thing.', 'वह पैसा “सुरक्षित खाते” में डालने को कहता है। बैंक में ऐसी कोई चीज़ नहीं होती।'),
      t('The “safe account” is the scammer’s account.', 'वह “सुरक्षित खाता” ठग का खाता है।'),
      t('End the call. Dial the number on your bank card yourself.', 'कॉल काटें। अपने बैंक कार्ड पर छपा नंबर ख़ुद डायल करें।')],
    from: t('A call from “your bank”', '“आपके बैंक” की कॉल'),
    parts: [
      part('Good evening, I am the manager of your bank’s branch.', 'शुभ संध्या, मैं आपके बैंक की शाखा का मैनेजर बोल रहा हूँ।'),
      part('Someone is trying to withdraw money from your account right now.', 'कोई अभी आपके खाते से पैसे निकालने की कोशिश कर रहा है।', 'Fear and urgency, to make you act before you think.', 'डर और जल्दबाज़ी, ताकि आप सोचने से पहले काम करें।'),
      part('To protect it, move your savings to a safe account I will give you.', 'बचाने के लिए अपनी बचत उस सुरक्षित खाते में डालें जो मैं बताता हूँ।', 'Banks do not have “safe accounts” for you to move money to.', 'बैंकों में पैसा डालने के लिए “सुरक्षित खाते” नहीं होते।'),
      part('Do not tell anyone, or the fraudster will hear.', 'किसी को न बताएँ, वरना ठग सुन लेगा।', 'Secrecy is a tool to keep you from checking.', 'गोपनीयता आपको जाँचने से रोकने का औज़ार है।'),
      part('I will stay on the line until it is done.', 'काम होने तक मैं लाइन पर रहूँगा।'),
    ],
    todo: t('End the call. Call your bank on the number printed on your card. If money moved, call 1930 immediately.', 'कॉल काटें। अपने कार्ड पर छपे नंबर पर बैंक को कॉल करें। पैसा गया हो तो तुरंत 1930 पर कॉल करें।'),
    quiz: { q: t('A “manager” asks you to move money to a “safe account”. What is it?', '“मैनेजर” पैसा “सुरक्षित खाते” में डालने को कहता है। यह क्या है?'),
      options: [t('A scam. Banks have no such account', 'धोखा। बैंकों में ऐसा खाता नहीं होता'), t('A security step', 'सुरक्षा का एक क़दम'), t('A free service', 'एक मुफ़्त सेवा')], answer: 0,
      why: t('Your money is safest where it is. Moving it on a caller’s request is how it is stolen.', 'आपका पैसा जहाँ है वहीं सबसे सुरक्षित है। कॉल करने वाले के कहने पर हटाना ही चोरी का तरीक़ा है।') },
  }),
];
