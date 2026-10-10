// Plain-text emails, English first then Hindi, because we don't know the reader's language.
export interface EmailBody {
  subject: string;
  text: string;
}

export function verificationEmail(link: string, brand: string): EmailBody {
  return {
    subject: `${brand}: confirm your email / अपना ईमेल पुष्ट करें`,
    text: [
      `Confirm your email for ${brand}:`,
      link,
      "",
      "The link works once and expires in 24 hours. If you did not create an account, ignore this email.",
      "",
      `${brand} के लिए अपना ईमेल पुष्ट करें:`,
      link,
      "",
      "यह लिंक एक बार चलता है और 24 घंटे में समाप्त हो जाता है। यदि आपने खाता नहीं बनाया, तो इस ईमेल को अनदेखा करें।",
    ].join("\n"),
  };
}

export function resetEmail(link: string, brand: string): EmailBody {
  return {
    subject: `${brand}: reset your password / पासवर्ड रीसेट करें`,
    text: [
      `Someone asked to reset the password for your ${brand} account. To choose a new password:`,
      link,
      "",
      "The link works once and expires in 1 hour. Using it signs you out everywhere. If you did not ask for this, ignore this email; your password has not changed.",
      "",
      `किसी ने आपके ${brand} खाते का पासवर्ड रीसेट करने का अनुरोध किया। नया पासवर्ड चुनने के लिए:`,
      link,
      "",
      "यह लिंक एक बार चलता है और 1 घंटे में समाप्त हो जाता है। इसका उपयोग करने पर आप हर जगह साइन आउट हो जाएँगे। यदि आपने यह अनुरोध नहीं किया, तो इस ईमेल को अनदेखा करें; आपका पासवर्ड नहीं बदला है।",
    ].join("\n"),
  };
}
