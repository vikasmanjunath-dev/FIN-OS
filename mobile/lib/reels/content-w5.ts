// Wave 5 (draft): explainers for the thinnest rungs of the ladder (scams: concept, decision, action; investing, retirement and credit: action
// and concept). Same builders and rules as waves 3 and 4: education, not advice; no promised returns; no named product.
import { holdScenes, sc, t } from '@/lib/reels/kit';
import type { Reel } from '@/lib/reels/types';

const W5_RAW: Reel[] = [
  {
    id: 'scam-three-kinds', topic: 'safety', tags: ['phishing', 'fraud'],
    title: t('Phishing, vishing, smishing: same trick', 'फ़िशिंग, विशिंग, स्मिशिंग: एक ही चाल'),
    scenes: [
      sc('think', t('Three odd words for one trick: someone pretends to be a bank, a courier or an office, to get you to act in a hurry.', 'तीन अजीब शब्द, एक ही चाल: कोई बैंक, कूरियर या दफ़्तर बनकर आपसे जल्दबाज़ी में कुछ करवाना चाहता है।'), { big: t('Same trick', 'एक ही चाल') }),
      sc('worry', t('Phishing comes by email, smishing by text message, vishing by a phone call.', 'फ़िशिंग ईमेल से आती है, स्मिशिंग संदेश से, विशिंग फ़ोन कॉल से।'), { prop: { kind: 'steps', items: [t('Phishing: email', 'फ़िशिंग: ईमेल'), t('Smishing: text', 'स्मिशिंग: संदेश'), t('Vishing: call', 'विशिंग: कॉल')] } }),
      sc('surprised', t('The signs repeat: urgency, a link or number you did not ask for, and a request for an OTP, PIN or password.', 'संकेत दोहराते हैं: जल्दी, ऐसा लिंक या नंबर जो आपने माँगा नहीं, और OTP, पिन या पासवर्ड की माँग।')),
      sc('cheer', t('A real bank never asks for your OTP or PIN. If you are unsure, hang up and call the number on your card.', 'असली बैंक आपसे OTP या पिन कभी नहीं माँगता। शक हो तो कॉल काटें और कार्ड पर छपे नंबर पर ख़ुद फ़ोन करें।')),
    ],
    quiz: { q: t('Which of these is a sign of a scam?', 'इनमें से कौन-सा ठगी का संकेत है?'), options: [t('A caller asking for your OTP', 'कॉल करने वाला आपसे OTP माँगे'), t('A bank statement you asked for', 'आपके माँगने पर आया बैंक स्टेटमेंट'), t('A reminder from the app you use', 'आपके ऐप की ओर से याद दिलाना')], answer: 0,
      why: t('An OTP is meant for you alone. Nobody who works for a bank needs it.', 'OTP सिर्फ़ आपके लिए है। बैंक में काम करने वाले को उसकी ज़रूरत नहीं पड़ती।') },
  },
  {
    id: 'scam-pause-three-questions', topic: 'safety', tags: ['fraud', 'decision'],
    title: t('Before you pay: three questions', 'पैसे भेजने से पहले: तीन सवाल'),
    scenes: [
      sc('think', t('Scams work by taking away your time to think. So give yourself that time back, with three questions.', 'ठगी आपका सोचने का समय छीनकर चलती है। इसलिए वह समय लौटाइए, तीन सवालों से।'), { big: t('Pause first', 'पहले रुकिए'), ms: 5000 }),
      sc('happy', t('One: did I start this, or did someone contact me first?', 'पहला: यह मैंने शुरू किया, या पहले किसी ने मुझसे संपर्क किया?'), { prop: { kind: 'steps', items: [t('Did I start it?', 'क्या मैंने शुरू किया?'), t('Can I check it another way?', 'क्या दूसरे तरीक़े से जाँच सकता हूँ?'), t('What if I wait a day?', 'एक दिन रुकूँ तो क्या होगा?')] } }),
      sc('think', t('Two: can I check it another way, with an official number or app that I look up myself?', 'दूसरा: क्या मैं इसे दूसरे तरीक़े से जाँच सकता हूँ, ऐसे आधिकारिक नंबर या ऐप से जिसे मैं ख़ुद ढूँढूँ?')),
      sc('cheer', t('Three: what happens if I wait a day? A real offer survives a day. A scam does not.', 'तीसरा: एक दिन रुकूँ तो क्या होगा? असली प्रस्ताव एक दिन टिकता है। ठगी नहीं टिकती।'), { ms: 5000 }),
    ],
    quiz: { q: t('Someone pushes you to pay in the next ten minutes. What is the safest move?', 'कोई आपको अगले दस मिनट में पैसे भेजने के लिए दबा रहा है। सबसे सुरक्षित क़दम क्या है?'), options: [t('Pause and check it another way', 'रुकें और दूसरे तरीक़े से जाँचें'), t('Pay quickly so you do not lose out', 'जल्दी भेज दें ताकि मौक़ा न छूटे'), t('Send half now and half later', 'आधा अभी, आधा बाद में भेजें')], answer: 0,
      why: t('Pressure to hurry is the scam’s main tool. Time is your defence.', 'जल्दबाज़ी का दबाव ठगी का मुख्य औज़ार है। समय आपका बचाव है।') },
  },
  {
    id: 'scam-first-hour', topic: 'safety', tags: ['fraud', 'report'],
    title: t('Cheated online? The first hour', 'ऑनलाइन ठगे गए? पहला घंटा'),
    scenes: [
      sc('worry', t('If money has already left your account, the first hour matters most. Act first, feel bad later.', 'अगर पैसा खाते से निकल चुका है, तो पहला घंटा सबसे अहम है। पहले क़दम उठाइए, पछतावा बाद में।'), { big: t('Act fast', 'तुरंत क़दम उठाइए') }),
      sc('think', t('Call your bank and ask them to block the card, the UPI or the account, and note the time you called.', 'अपने बैंक को फ़ोन करें और कार्ड, UPI या खाता रुकवाएँ, और फ़ोन करने का समय लिख लें।'), { prop: { kind: 'steps', items: [t('Call your bank', 'बैंक को फ़ोन करें'), t('Call 1930, the cyber helpline', '1930 पर कॉल करें, साइबर हेल्पलाइन'), t('Report on cybercrime.gov.in', 'cybercrime.gov.in पर शिकायत करें')] } }),
      sc('think', t('Then call 1930, the national cyber crime helpline, and report on cybercrime.gov.in. Keep screenshots, numbers and receipts.', 'फिर 1930 (साइबर अपराध हेल्पलाइन) पर कॉल करें और cybercrime.gov.in पर शिकायत करें। स्क्रीनशॉट और रसीदें रखें।')),
      sc('cheer', t('Reporting quickly gives the best chance of stopping the money. It is not a guarantee, but waiting makes it worse.', 'जल्दी शिकायत करने से पैसा रोकने की सबसे अच्छी संभावना बनती है। यह गारंटी नहीं, पर रुकना हालात बिगाड़ता है।')),
    ],
    quiz: { q: t('What should you do first when money was taken by fraud?', 'ठगी से पैसा निकल जाए तो सबसे पहले क्या करें?'), options: [t('Call your bank and the 1930 helpline', 'बैंक और 1930 हेल्पलाइन को फ़ोन करें'), t('Wait a week to see if it comes back', 'हफ़्ता भर रुकें कि शायद लौट आए'), t('Message the person who took it', 'जिसने पैसा लिया उसे संदेश भेजें')], answer: 0,
      why: t('Speed is what gives a bank a chance to stop or trace the money.', 'गति से ही बैंक को पैसा रोकने या खोजने का मौक़ा मिलता है।') },
  },
  {
    id: 'first-sip-steps', topic: 'invest', tags: ['SIP', 'getting started'],
    title: t('Starting a first SIP, step by step', 'पहला SIP शुरू करना, क़दम-दर-क़दम'),
    scenes: [
      sc('happy', t('Starting a SIP is less about the perfect fund and more about four small steps.', 'SIP शुरू करना परफ़ेक्ट फ़ंड से ज़्यादा चार छोटे क़दमों की बात है।'), { big: t('Four steps', 'चार क़दम') }),
      sc('think', t('First, complete your KYC. Second, decide what the money is for and when you need it.', 'पहला, अपना KYC पूरा करें। दूसरा, तय करें कि पैसा किसलिए है और कब चाहिए।'), { prop: { kind: 'steps', items: [t('Complete KYC', 'KYC पूरा करें'), t('Know the goal and the date', 'लक्ष्य और तारीख़ जानें'), t('Amount + auto-debit', 'रकम + ऑटो-डेबिट'), t('Review once a year', 'साल में एक बार देखें')] } }),
      sc('think', t('Third, pick an amount that fits even a bad month, and set an auto-debit so it happens on its own.', 'तीसरा, ऐसी रकम चुनें जो ख़राब महीने में भी निभे, और ऑटो-डेबिट लगाएँ।')),
      sc('cheer', t('Fourth, look once a year, not daily. Returns are not guaranteed, so match the fund to your time horizon.', 'चौथा, साल में एक बार देखें, रोज़ नहीं। रिटर्न की गारंटी नहीं, इसलिए फ़ंड को अपनी समय-सीमा से मिलाएँ।')),
    ],
    quiz: { q: t('Why set an auto-debit for a SIP?', 'SIP के लिए ऑटो-डेबिट क्यों लगाएँ?'), options: [t('So it keeps happening without effort', 'ताकि बिना मेहनत के होता रहे'), t('To guarantee a profit', 'मुनाफ़े की गारंटी के लिए'), t('To avoid KYC', 'KYC से बचने के लिए')], answer: 0,
      why: t('Habit does the work: money that moves on a date is money that gets invested.', 'आदत काम करती है: तारीख़ पर निकलने वाला पैसा ही निवेश हो पाता है।') },
  },
  {
    id: 'epf-check-yours', topic: 'retire', tags: ['EPF', 'retirement'],
    title: t('Check your EPF in ten minutes', 'दस मिनट में अपना EPF देखें'),
    scenes: [
      sc('think', t('If you have worked in a company, you may already have retirement money in the EPF. Many people never look.', 'अगर आपने किसी कंपनी में काम किया है, तो EPF में रिटायरमेंट का पैसा पहले से हो सकता है। बहुत लोग कभी देखते ही नहीं।'), { big: t('Look once', 'एक बार देखिए') }),
      sc('happy', t('Three things to check: your balance, that your UAN is active, and that a nominee is added.', 'तीन चीज़ें देखें: आपका बैलेंस, कि UAN चालू है, और कि नॉमिनी जुड़ा है।'), { prop: { kind: 'steps', items: [t('Balance in the passbook', 'पासबुक में बैलेंस'), t('UAN active, KYC linked', 'UAN चालू, KYC जुड़ा'), t('Nominee added', 'नॉमिनी जुड़ा')] } }),
      sc('surprised', t('If you changed jobs, check that every old employer’s account is on the same UAN.', 'अगर आपने नौकरी बदली है, तो देखें कि पुराने हर नियोक्ता का खाता एक ही UAN पर है।')),
      sc('cheer', t('Use the official EPFO member portal or the UMANG app. Never share your OTP with anyone who calls to help.', 'आधिकारिक EPFO सदस्य पोर्टल या UMANG ऐप इस्तेमाल करें। मदद के नाम पर फ़ोन करने वाले को OTP कभी न दें।')),
    ],
    quiz: { q: t('Why link every old job to the same UAN?', 'हर पुरानी नौकरी को एक ही UAN से क्यों जोड़ें?'), options: [t('So all your EPF shows in one place', 'ताकि पूरा EPF एक जगह दिखे'), t('To pay less tax automatically', 'अपने आप कम टैक्स देने के लिए'), t('To get a loan faster', 'लोन जल्दी पाने के लिए')], answer: 0,
      why: t('One UAN means one view of your balance and an easier transfer or claim.', 'एक UAN यानी बैलेंस की एक तस्वीर और ट्रांसफ़र या दावा आसान।') },
  },
  {
    id: 'credit-use-ratio', topic: 'credit', tags: ['credit score', 'utilisation'],
    title: t('Credit use: how much of the limit', 'क्रेडिट इस्तेमाल: सीमा का कितना हिस्सा'),
    scenes: [
      sc('think', t('Your credit limit is not money to spend. It is a number lenders watch, and how much you use matters.', 'क्रेडिट लिमिट ख़र्च का पैसा नहीं, कर्ज़दाता की नज़र की संख्या है। आप उसका कितना इस्तेमाल करते हैं, यह मायने रखता है।'), { big: t('Use ÷ limit', 'इस्तेमाल ÷ सीमा') }),
      sc('happy', t('Use ÷ limit is called utilisation. If your limit is ₹1,00,000 and you use ₹20,000, utilisation is 20 percent.', 'इस्तेमाल ÷ सीमा को यूटिलाइज़ेशन कहते हैं। लिमिट ₹1,00,000 हो और आप ₹20,000 इस्तेमाल करें, तो यूटिलाइज़ेशन 20 प्रतिशत है।'), { prop: { kind: 'donut', parts: [{ value: 20, label: t('Used', 'इस्तेमाल'), tone: 'teal' }, { value: 80, label: t('Free', 'ख़ाली'), tone: 'gold' }], centre: t('20%', '20%') } }),
      sc('think', t('A common rule of thumb is to stay well under about a third of your limit. Higher use can look like money stress to a lender.', 'आम नियम यह है कि लिमिट के लगभग एक-तिहाई से काफ़ी नीचे रहें। ज़्यादा इस्तेमाल कर्ज़ देने वाले को पैसों की तंगी जैसा दिख सकता है।')),
      sc('cheer', t('Pay before the statement date, or ask for a higher limit and keep spending the same. Paying the full bill matters most.', 'स्टेटमेंट की तारीख़ से पहले भुगतान करें, या ऊँची लिमिट माँगें और ख़र्च वही रखें। पूरा बिल चुकाना सबसे ज़रूरी है।')),
    ],
    quiz: { q: t('Limit ₹50,000, you use ₹25,000. What is your utilisation?', 'लिमिट ₹50,000, आप ₹25,000 इस्तेमाल करते हैं। यूटिलाइज़ेशन कितना है?'), options: [t('50 percent', '50 प्रतिशत'), t('25 percent', '25 प्रतिशत'), t('75 percent', '75 प्रतिशत')], answer: 0,
      why: t('25,000 ÷ 50,000 is one half, so 50 percent.', '25,000 ÷ 50,000 आधा है, यानी 50 प्रतिशत।') },
  },
  {
    id: 'credit-report-free-check', topic: 'credit', tags: ['credit report', 'check'],
    title: t('Read your credit report once a year', 'साल में एक बार क्रेडिट रिपोर्ट पढ़ें'),
    scenes: [
      sc('think', t('Your credit report is what lenders read. Mistakes in it can raise your rate or get a loan refused.', 'क्रेडिट रिपोर्ट वह रिकॉर्ड है जो कर्ज़दाता पढ़ते हैं। उसमें ग़लती से ब्याज बढ़ सकता है या लोन मना हो सकता है।'), { big: t('Read it yearly', 'हर साल पढ़िए') }),
      sc('happy', t('In India, each credit bureau must give you one full report free every year, when you ask on its official site.', 'भारत में हर क्रेडिट ब्यूरो को साल में एक पूरी रिपोर्ट मुफ़्त देनी होती है, जब आप उसकी आधिकारिक साइट पर माँगें।')),
      sc('worry', t('Look for loans you never took, wrong dues, and accounts you closed that still show open.', 'देखें कि कोई ऐसा लोन तो नहीं जो आपने लिया नहीं, ग़लत बकाया, और बंद किए खाते जो अब भी खुले दिख रहे हों।'), { prop: { kind: 'steps', items: [t('Loans you did not take', 'वे लोन जो आपने नहीं लिए'), t('Wrong dues', 'ग़लत बकाया'), t('Closed accounts shown open', 'बंद खाते जो खुले दिखें')] } }),
      sc('cheer', t('If something is wrong, raise a dispute with the bureau and the lender. Use only official sites, not message links.', 'कुछ ग़लत हो तो ब्यूरो और कर्ज़दाता दोनों के पास शिकायत करें। सिर्फ़ आधिकारिक साइट ही इस्तेमाल करें।')),
    ],
    quiz: { q: t('What should you do if your report shows a loan you never took?', 'अगर रिपोर्ट में ऐसा लोन दिखे जो आपने नहीं लिया, तो क्या करें?'), options: [t('Raise a dispute with the bureau and the lender', 'ब्यूरो और कर्ज़दाता के पास शिकायत करें'), t('Ignore it, it will fade', 'अनदेखा करें, अपने आप मिट जाएगा'), t('Pay it to be safe', 'सुरक्षित रहने के लिए चुका दें')], answer: 0,
      why: t('An error left alone keeps counting against you. A dispute puts it on record.', 'ग़लती को छोड़ दें तो वह आपके ख़िलाफ़ गिनी जाती रहती है। शिकायत उसे दर्ज कराती है।') },
  },
  {
    id: 'credit-hard-soft-enquiry', topic: 'credit', tags: ['credit score', 'enquiry'],
    title: t('Hard and soft credit checks', 'हार्ड और सॉफ़्ट क्रेडिट जाँच'),
    scenes: [
      sc('think', t('When someone looks at your credit report, it is recorded as an enquiry. There are two kinds.', 'जब कोई आपकी क्रेडिट रिपोर्ट देखता है, तो वह पूछताछ के रूप में दर्ज होता है। इसके दो प्रकार हैं।'), { big: t('Two kinds', 'दो प्रकार'), ms: 5000 }),
      sc('happy', t('A soft check is you looking at your own report. It does not hurt your score.', 'सॉफ़्ट जाँच वह है जब आप अपनी ही रिपोर्ट देखते हैं। इससे स्कोर पर असर नहीं पड़ता।'), { prop: { kind: 'steps', items: [t('Soft: your own check', 'सॉफ़्ट: आपकी अपनी जाँच'), t('Hard: a lender checks', 'हार्ड: कर्ज़दाता की जाँच')] } }),
      sc('worry', t('A hard check happens when you apply. Many in a short time can look like you are desperate for credit.', 'हार्ड जाँच आवेदन करने पर होती है। थोड़े समय में कई जाँचें सख़्त ज़रूरत जैसी दिख सकती हैं।'), { ms: 5200 }),
      sc('cheer', t('So compare offers first, apply only where you mean to, and space the applications out.', 'इसलिए पहले प्रस्ताव तुलना करें, वहीं आवेदन करें जहाँ सच में लेना हो, और आवेदनों के बीच अंतर रखें।'), { ms: 4600 }),
    ],
    quiz: { q: t('Which check can lower your score a little?', 'कौन-सी जाँच स्कोर थोड़ा घटा सकती है?'), options: [t('A lender checking after you apply', 'आपके आवेदन के बाद कर्ज़दाता की जाँच'), t('You viewing your own report', 'आपका अपनी रिपोर्ट देखना'), t('Neither ever does', 'दोनों में से कोई नहीं')], answer: 0,
      why: t('Only a lender’s check on an application is a hard check. Looking at your own report is safe.', 'सिर्फ़ आवेदन पर कर्ज़दाता की जाँच हार्ड होती है। अपनी रिपोर्ट देखना सुरक्षित है।') },
  },
];

/** Four short scenes would run under the 20 s a reel needs, so each is held for at least 5.3 s. */
export const W5_EXPLAIN: Reel[] = W5_RAW.map(r => holdScenes(r, 5300));
