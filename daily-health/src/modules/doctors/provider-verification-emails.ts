import {
  EMAIL_BRAND_NAME,
  escapeHtml,
  wrapEmailHtml,
} from '../../core/mail/email-layout.js';
import type { OutgoingEmail } from '../../core/mail/email-sender.js';

/** The admin verified the provider: they now appear to patients. */
export function providerVerifiedEmail(to: string, name: string): OutgoingEmail {
  const subject = `${EMAIL_BRAND_NAME}: আপনার প্রোফাইল যাচাই হয়েছে`;
  const lines = [
    `${name}, আপনার প্রোফাইল যাচাই করা হয়েছে।`,
    'এখন থেকে রোগীরা অ্যাপে আপনাকে খুঁজে পাবেন আর সিরিয়াল বা অ্যাপয়েন্টমেন্ট নিতে পারবেন।',
    'প্যানেলে লগইন করে সময়সূচি আর ফি ঠিক আছে কিনা দেখে নিন।',
  ];
  return {
    to,
    subject,
    text: lines.join('\n'),
    html: wrapEmailHtml(
      subject,
      lines
        .map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`)
        .join(''),
    ),
  };
}

/** The admin rejected the profile; the reason tells them what to fix. */
export function providerRejectedEmail(
  to: string,
  name: string,
  reason: string,
): OutgoingEmail {
  const subject = `${EMAIL_BRAND_NAME}: প্রোফাইলে কিছু সংশোধন দরকার`;
  const lines = [
    `${name}, আপনার প্রোফাইল এখনো যাচাই করা যায়নি।`,
    `কারণ: ${reason}`,
    'প্যানেলে লগইন করে তথ্য বা কাগজপত্র ঠিক করে আবার পাঠান।',
  ];
  return {
    to,
    subject,
    text: lines.join('\n'),
    html: wrapEmailHtml(
      subject,
      lines
        .map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`)
        .join(''),
    ),
  };
}
