import { SITE } from "../config/site";
import type { Prefs } from "../lib/prefs";

type Lang = Prefs["lang"];

export interface LegalSection {
  heading: string;
  body?: string[];
  list?: string[];
}
export interface LegalDoc {
  title: string;
  intro: string;
  sections: LegalSection[];
}

/** Fills {brand}, {operator}, {contact} and {jurisdiction} from the site config. */
export function fill(text: string, site: Record<string, string> = SITE): string {
  return text
    .replaceAll("{brand}", site.brand)
    .replaceAll("{operator}", site.operator)
    .replaceAll("{contact}", site.contactEmail)
    .replaceAll("{jurisdiction}", site.jurisdiction);
}

const privacyEn: LegalDoc = {
  title: "Privacy Policy",
  intro:
    "This policy explains what personal data {brand} handles and why. If you only look at charts and never create an account, the site does not ask you for personal data.",
  sections: [
    {
      heading: "1. Who we are",
      body: ["{brand} is operated by {operator} (\"we\"). You can reach us at {contact}."],
    },
    {
      heading: "2. What we collect",
      list: [
        "Account: your email address, a hashed password (we cannot read it), the date you signed up, and the settings you choose to save (language, theme, instrument, timeframe).",
        "Sign-in session: a random token in a cookie named aurum_session, valid for 30 days. The server stores only a hash of it.",
        "Email links: one-time tokens for confirming your email (valid 24 hours) and resetting your password (valid 1 hour). Only a hash of each token is stored, and each is deleted once used or expired.",
        "On your device: your language, theme, sidebar state and last-used instrument and timeframe are kept in your browser's local storage so the site remembers them. They stay on your device unless you press \"Save these settings to my account\".",
        "Network address (IP): held briefly in the server's memory to limit repeated sign-in attempts. It is not saved in our database. Your hosting provider or proxy may keep its own access logs.",
        "We do not use advertising or analytics cookies, and we do not collect payment details.",
      ],
    },
    {
      heading: "3. Why we use it",
      list: [
        "To create and secure your account and keep you signed in.",
        "To remember your saved settings.",
        "To prevent abuse, such as password guessing.",
      ],
      body: [
        "Where the law requires a legal basis, we rely on providing the account you asked for and on our legitimate interest in keeping the site secure.",
      ],
    },
    {
      heading: "4. Who else is involved",
      list: [
        "Market data: gold prices are fetched by our server from Twelve Data. Bitcoin prices are fetched directly by your browser from Binance, so Binance can see your IP address and browser details under its own policy.",
        "Hosting: our hosting provider stores the data described above on our behalf.",
        "Email delivery: the confirmation and password-reset emails are sent through an email service we choose. It sees your email address and the message, which contains your one-time link.",
      ],
      body: ["We do not sell personal data and do not share it for advertising."],
    },
    {
      heading: "5. How long we keep it",
      body: [
        "Account data is kept until you delete your account. Sessions end after 30 days or when you sign out.",
        "On the Account page, \"Delete account\" removes your account, saved settings and sessions from the live database. Backups may keep a copy for a limited time until they are overwritten.",
      ],
    },
    {
      heading: "6. Your choices and rights",
      body: [
        "You can see your email on the Account page, change your saved settings, and delete your account at any time. For anything else, such as access, correction, a copy of your data or a complaint, write to {contact}.",
        "Depending on where you live, you may have further rights under local law, for example India's Digital Personal Data Protection Act or the EU/UK GDPR.",
      ],
    },
    {
      heading: "7. Security",
      body: [
        "Passwords are hashed with scrypt. The session cookie is hidden from page scripts and is sent only over HTTPS when the site is served that way. No system is perfectly secure.",
        "We ask you to confirm your email address and offer password reset by email. A reset link works once and expires in 1 hour; using it signs you out everywhere. Anyone who can read your email can reset your password, so keep your email account secure.",
      ],
    },
    {
      heading: "8. Children",
      body: ["The site is not meant for anyone under 18, and we do not knowingly collect their data."],
    },
    {
      heading: "9. Changes",
      body: ["We may update this policy. The date at the top shows the latest version. Material changes will be announced on the site."],
    },
    {
      heading: "10. Contact",
      body: ["{operator}, {contact}."],
    },
  ],
};

const termsEn: LegalDoc = {
  title: "Terms of Use",
  intro: "By using {brand} or creating an account you agree to these terms. If you do not agree, please do not use the site.",
  sections: [
    {
      heading: "1. The service",
      body: [
        "{brand}, operated by {operator}, shows charts and rule-based signals for XAU/USD (gold) and BTC/USD (Bitcoin) for education and information. It does not place trades, hold money or connect to brokers.",
      ],
    },
    {
      heading: "2. Not advice",
      body: [
        "Nothing on this site is investment, financial, legal or tax advice, or an offer or invitation to buy or sell anything. We do not claim to be a licensed adviser or research analyst. Signals come from fixed technical rules and can be wrong.",
      ],
    },
    {
      heading: "3. Risk",
      body: [
        "Trading gold CFDs, forex and cryptocurrency carries a high risk of loss, including more than you invest. Past results, including anything shown in Signal history, do not predict future results. You alone are responsible for your decisions. Please read the Risk disclosure.",
      ],
    },
    {
      heading: "4. Data accuracy and availability",
      body: [
        "Prices come from third parties and may be delayed, inaccurate or unavailable. When real data is not available the site may show sample data, which is clearly labelled and is not a real quote. The site is provided \"as is\" and may be interrupted or changed at any time.",
      ],
    },
    {
      heading: "5. Your account",
      list: [
        "Give a correct email address and keep your password secret.",
        "You are responsible for activity under your account. Tell us at {contact} if you think someone else has used it.",
        "If you forget your password, use \"Forgot password?\" on the sign-in page. It needs access to your email.",
      ],
    },
    {
      heading: "6. Acceptable use",
      body: ["You agree not to:"],
      list: [
        "attack, overload or probe the site, or try to get around its limits or security;",
        "access other people's accounts or data;",
        "copy or resell the market data or signals;",
        "use the site to break the law.",
      ],
    },
    {
      heading: "7. Ownership",
      body: [
        "The site's code, design and text belong to {operator} or its licensors. Market data belongs to its providers. You may use the site for your own personal use.",
      ],
    },
    {
      heading: "8. Suspension and ending",
      body: ["We may suspend or end access if these terms are broken or to protect the site. You can delete your account at any time from the Account page."],
    },
    {
      heading: "9. Limit of liability",
      body: [
        "To the fullest extent the law allows, we are not liable for any loss, including trading or investment losses and indirect or consequential loss, arising from your use of or reliance on the site. Nothing in these terms excludes liability that cannot be excluded by law.",
      ],
    },
    {
      heading: "10. Governing law",
      body: ["These terms are governed by {jurisdiction}, without limiting any mandatory consumer rights you have where you live."],
    },
    {
      heading: "11. Changes",
      body: ["We may update these terms. The date at the top shows the latest version. Continuing to use the site after a change means you accept it."],
    },
    {
      heading: "12. Contact",
      body: ["{operator}, {contact}."],
    },
  ],
};

const privacyHi: LegalDoc = {
  title: "गोपनीयता नीति",
  intro:
    "यह नीति बताती है कि {brand} कौन-सा व्यक्तिगत डेटा संभालता है और क्यों। यदि आप केवल चार्ट देखते हैं और खाता नहीं बनाते, तो साइट आपसे कोई व्यक्तिगत डेटा नहीं माँगती।",
  sections: [
    {
      heading: "1. हम कौन हैं",
      body: ["{brand} का संचालन {operator} (\"हम\") करता है। आप हमसे {contact} पर संपर्क कर सकते हैं।"],
    },
    {
      heading: "2. हम क्या एकत्र करते हैं",
      list: [
        "खाता: आपका ईमेल पता, हैश किया हुआ पासवर्ड (जिसे हम पढ़ नहीं सकते), साइन-अप की तारीख, और वे सेटिंग्स जो आप सहेजना चुनते हैं (भाषा, थीम, इंस्ट्रूमेंट, टाइमफ्रेम)।",
        "साइन-इन सत्र: aurum_session नाम की कुकी में एक यादृच्छिक टोकन, जो 30 दिन तक मान्य रहता है। सर्वर उसका केवल हैश रखता है।",
        "ईमेल लिंक: ईमेल की पुष्टि (24 घंटे मान्य) और पासवर्ड रीसेट (1 घंटे मान्य) के लिए एक-बार वाले टोकन। हर टोकन का केवल हैश रखा जाता है, और उपयोग होने या समाप्त होने पर उसे हटा दिया जाता है।",
        "आपके डिवाइस पर: आपकी भाषा, थीम, साइडबार की स्थिति और अंतिम बार चुना गया इंस्ट्रूमेंट व टाइमफ्रेम आपके ब्राउज़र के लोकल स्टोरेज में रखे जाते हैं ताकि साइट उन्हें याद रखे। जब तक आप \"ये सेटिंग्स मेरे खाते में सहेजें\" नहीं दबाते, वे आपके डिवाइस पर ही रहती हैं।",
        "नेटवर्क पता (IP): बार-बार साइन-इन कोशिशों को सीमित करने के लिए सर्वर की मेमोरी में थोड़ी देर रखा जाता है। इसे हमारे डेटाबेस में सहेजा नहीं जाता। आपका होस्टिंग प्रदाता या प्रॉक्सी अपने एक्सेस लॉग रख सकता है।",
        "हम विज्ञापन या एनालिटिक्स कुकी का उपयोग नहीं करते और भुगतान का विवरण एकत्र नहीं करते।",
      ],
    },
    {
      heading: "3. हम इसका उपयोग क्यों करते हैं",
      list: [
        "आपका खाता बनाने, सुरक्षित रखने और आपको साइन इन रखने के लिए।",
        "आपकी सहेजी हुई सेटिंग्स याद रखने के लिए।",
        "दुरुपयोग, जैसे पासवर्ड का अंदाज़ा लगाने की कोशिश, रोकने के लिए।",
      ],
      body: [
        "जहाँ कानून किसी वैधानिक आधार की माँग करता है, वहाँ हम आपके माँगे गए खाते की सेवा देने और साइट को सुरक्षित रखने में अपने वैध हित पर निर्भर करते हैं।",
      ],
    },
    {
      heading: "4. और कौन शामिल है",
      list: [
        "बाज़ार डेटा: सोने की कीमतें हमारा सर्वर Twelve Data से लेता है। बिटकॉइन की कीमतें आपका ब्राउज़र सीधे Binance से लेता है, इसलिए Binance अपनी नीति के अनुसार आपका IP पता और ब्राउज़र का विवरण देख सकता है।",
        "होस्टिंग: ऊपर बताया गया डेटा हमारी ओर से हमारा होस्टिंग प्रदाता संग्रहित करता है।",
        "ईमेल डिलीवरी: पुष्टि और पासवर्ड-रीसेट के ईमेल हमारे चुने हुए ईमेल सेवा प्रदाता से भेजे जाते हैं। वह आपका ईमेल पता और संदेश देखता है, जिसमें आपका एक-बार वाला लिंक होता है।",
      ],
      body: ["हम व्यक्तिगत डेटा बेचते नहीं हैं और विज्ञापन के लिए साझा नहीं करते।"],
    },
    {
      heading: "5. हम इसे कितने समय रखते हैं",
      body: [
        "खाते का डेटा तब तक रखा जाता है जब तक आप खाता नहीं हटाते। सत्र 30 दिन बाद या साइन आउट करने पर समाप्त हो जाते हैं।",
        "खाता पेज पर \"खाता हटाएँ\" आपका खाता, सहेजी गई सेटिंग्स और सत्र लाइव डेटाबेस से हटा देता है। बैकअप में एक प्रति सीमित समय तक, ओवरराइट होने तक, रह सकती है।",
      ],
    },
    {
      heading: "6. आपके विकल्प और अधिकार",
      body: [
        "आप खाता पेज पर अपना ईमेल देख सकते हैं, सहेजी सेटिंग्स बदल सकते हैं और कभी भी खाता हटा सकते हैं। किसी और बात, जैसे जानकारी तक पहुँच, सुधार, अपने डेटा की प्रति या शिकायत, के लिए {contact} पर लिखें।",
        "आप जहाँ रहते हैं उसके अनुसार स्थानीय कानून के तहत आपके और अधिकार हो सकते हैं, जैसे भारत का डिजिटल पर्सनल डेटा प्रोटेक्शन अधिनियम या EU/UK का GDPR।",
      ],
    },
    {
      heading: "7. सुरक्षा",
      body: [
        "पासवर्ड scrypt से हैश किए जाते हैं। सत्र की कुकी पेज की स्क्रिप्ट से छिपी रहती है और साइट HTTPS पर चलने पर केवल HTTPS के ज़रिए भेजी जाती है। कोई भी प्रणाली पूरी तरह सुरक्षित नहीं होती।",
        "हम आपसे ईमेल पता पुष्ट करने को कहते हैं और ईमेल से पासवर्ड रीसेट की सुविधा देते हैं। रीसेट लिंक एक बार चलता है और 1 घंटे में समाप्त हो जाता है; उसका उपयोग करने पर आप हर जगह साइन आउट हो जाते हैं। जो आपका ईमेल पढ़ सकता है वह आपका पासवर्ड रीसेट कर सकता है, इसलिए अपना ईमेल खाता सुरक्षित रखें।",
      ],
    },
    {
      heading: "8. बच्चे",
      body: ["यह साइट 18 वर्ष से कम उम्र के लोगों के लिए नहीं है, और हम जानबूझकर उनका डेटा एकत्र नहीं करते।"],
    },
    {
      heading: "9. बदलाव",
      body: ["हम इस नीति को अपडेट कर सकते हैं। ऊपर की तारीख नवीनतम संस्करण दिखाती है। महत्वपूर्ण बदलावों की सूचना साइट पर दी जाएगी।"],
    },
    {
      heading: "10. संपर्क",
      body: ["{operator}, {contact}।"],
    },
  ],
};

const termsHi: LegalDoc = {
  title: "उपयोग की शर्तें",
  intro: "{brand} का उपयोग करने या खाता बनाने पर आप इन शर्तों से सहमत होते हैं। यदि आप सहमत नहीं हैं, तो कृपया साइट का उपयोग न करें।",
  sections: [
    {
      heading: "1. सेवा",
      body: [
        "{operator} द्वारा संचालित {brand}, शिक्षा और जानकारी के लिए XAU/USD (सोना) और BTC/USD (बिटकॉइन) के चार्ट और नियम-आधारित सिग्नल दिखाता है। यह ट्रेड नहीं करता, पैसे नहीं रखता और ब्रोकरों से नहीं जुड़ता।",
      ],
    },
    {
      heading: "2. सलाह नहीं",
      body: [
        "इस साइट की कोई भी बात निवेश, वित्तीय, कानूनी या कर संबंधी सलाह नहीं है, न ही कुछ खरीदने-बेचने का प्रस्ताव या निमंत्रण है। हम लाइसेंस प्राप्त सलाहकार या रिसर्च एनालिस्ट होने का दावा नहीं करते। सिग्नल तय तकनीकी नियमों से बनते हैं और गलत हो सकते हैं।",
      ],
    },
    {
      heading: "3. जोखिम",
      body: [
        "गोल्ड CFD, फॉरेक्स और क्रिप्टोकरेंसी में ट्रेडिंग से पैसे गँवाने का उच्च जोखिम है, निवेश से ज़्यादा भी। पिछले नतीजे, सिग्नल इतिहास में दिखाई गई किसी भी चीज़ सहित, भविष्य के नतीजे नहीं बताते। अपने फ़ैसलों की ज़िम्मेदारी केवल आपकी है। कृपया जोखिम की चेतावनी पढ़ें।",
      ],
    },
    {
      heading: "4. डेटा की सटीकता और उपलब्धता",
      body: [
        "कीमतें तीसरे पक्षों से आती हैं और देरी से, गलत या अनुपलब्ध हो सकती हैं। असली डेटा न मिलने पर साइट नमूना डेटा दिखा सकती है, जिस पर साफ़ लेबल होता है और जो असली भाव नहीं है। साइट \"जैसी है\" उसी रूप में दी जाती है और कभी भी बाधित या बदली जा सकती है।",
      ],
    },
    {
      heading: "5. आपका खाता",
      list: [
        "सही ईमेल पता दें और अपना पासवर्ड गोपनीय रखें।",
        "आपके खाते की गतिविधि के लिए आप ज़िम्मेदार हैं। यदि आपको लगता है कि किसी और ने उसका उपयोग किया है, तो {contact} पर हमें बताएँ।",
        "यदि आप पासवर्ड भूल जाएँ, तो साइन-इन पेज पर \"पासवर्ड भूल गए?\" का उपयोग करें। इसके लिए आपके ईमेल तक पहुँच चाहिए।",
      ],
    },
    {
      heading: "6. स्वीकार्य उपयोग",
      body: ["आप सहमत हैं कि आप ये नहीं करेंगे:"],
      list: [
        "साइट पर हमला करना, उसे ओवरलोड करना या जाँचना, या उसकी सीमाओं या सुरक्षा को दरकिनार करने की कोशिश करना;",
        "दूसरों के खाते या डेटा तक पहुँचना;",
        "बाज़ार डेटा या सिग्नल की नकल करना या उन्हें बेचना;",
        "साइट का उपयोग कानून तोड़ने के लिए करना।",
      ],
    },
    {
      heading: "7. स्वामित्व",
      body: [
        "साइट का कोड, डिज़ाइन और पाठ {operator} या उसके लाइसेंसदाताओं का है। बाज़ार डेटा उसके प्रदाताओं का है। आप साइट का अपने निजी उपयोग के लिए उपयोग कर सकते हैं।",
      ],
    },
    {
      heading: "8. निलंबन और समाप्ति",
      body: ["शर्तें टूटने पर या साइट की सुरक्षा के लिए हम पहुँच निलंबित या समाप्त कर सकते हैं। आप कभी भी खाता पेज से अपना खाता हटा सकते हैं।"],
    },
    {
      heading: "9. ज़िम्मेदारी की सीमा",
      body: [
        "कानून जितनी अनुमति देता है, उस हद तक, साइट के उपयोग या उस पर भरोसे से होने वाली किसी भी हानि, जिसमें ट्रेडिंग या निवेश की हानि और अप्रत्यक्ष या परिणामी हानि शामिल हैं, के लिए हम ज़िम्मेदार नहीं हैं। इन शर्तों की कोई बात उस ज़िम्मेदारी को नहीं हटाती जिसे कानून से हटाया नहीं जा सकता।",
      ],
    },
    {
      heading: "10. लागू कानून",
      body: ["ये शर्तें {jurisdiction} द्वारा शासित हैं, और आप जहाँ रहते हैं वहाँ के अनिवार्य उपभोक्ता अधिकारों को सीमित किए बिना।"],
    },
    {
      heading: "11. बदलाव",
      body: ["हम इन शर्तों को अपडेट कर सकते हैं। ऊपर की तारीख नवीनतम संस्करण दिखाती है। बदलाव के बाद साइट का उपयोग जारी रखने का अर्थ है कि आप उसे स्वीकार करते हैं।"],
    },
    {
      heading: "12. संपर्क",
      body: ["{operator}, {contact}।"],
    },
  ],
};

export const LEGAL: Record<"privacy" | "terms", Record<Lang, LegalDoc>> = {
  privacy: { en: privacyEn, hi: privacyHi },
  terms: { en: termsEn, hi: termsHi },
};
