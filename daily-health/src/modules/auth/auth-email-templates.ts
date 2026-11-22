import { toBanglaDigits } from '../../common/formatting/bangla-digits.js';
import {
  EMAIL_BRAND_NAME as BRAND,
  wrapEmailHtml,
} from '../../core/mail/email-layout.js';
import type { OutgoingEmail } from '../../core/mail/email-sender.js';
import type { OtpPurpose } from '../../generated/prisma/client.js';

const PURPOSE_TEXT: Record<OtpPurpose, string> = {
  SIGNUP: 'অ্যাকাউন্ট খোলার',
  LOGIN: 'লগইনের',
  RESET_PASSWORD: 'পাসওয়ার্ড রিসেটের',
};

export function otpCodeEmail(
  to: string,
  purpose: OtpPurpose,
  code: string,
  ttlMinutes: number,
): OutgoingEmail {
  const subject = `${BRAND}: আপনার যাচাই কোড`;
  const purposeText = PURPOSE_TEXT[purpose];
  const minutes = toBanglaDigits(ttlMinutes);
  const text = [
    `${purposeText} জন্য আপনার যাচাই কোড: ${code}`,
    `কোডটি ${minutes} মিনিট কাজ করবে।`,
    'কোডটি কাউকে জানাবেন না। আমাদের কর্মীরাও কখনো এই কোড চাইবেন না।',
    'আপনি অনুরোধ না করে থাকলে এই ইমেইলটি উপেক্ষা করুন।',
  ].join('\n');
  const html = wrapEmailHtml(
    subject,
    `<p style="margin:0 0 12px">${purposeText} জন্য আপনার যাচাই কোড:</p>
     <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#0f5c5a;margin:0 0 12px">${code}</p>
     <p style="margin:0 0 12px">কোডটি ${minutes} মিনিট কাজ করবে।</p>
     <p style="margin:0;color:#546b65;font-size:14px">কোডটি কাউকে জানাবেন না। আমাদের কর্মীরাও কখনো এই কোড চাইবেন না। আপনি অনুরোধ না করে থাকলে এই ইমেইলটি উপেক্ষা করুন।</p>`,
  );
  return { to, subject, text, html };
}

/** Sent instead of a signup code when the email already has an account. */
export function accountAlreadyExistsEmail(to: string): OutgoingEmail {
  const subject = `${BRAND}: আপনার অ্যাকাউন্ট আগে থেকেই আছে`;
  const text = [
    'এই ইমেইল দিয়ে নতুন অ্যাকাউন্ট খোলার চেষ্টা করা হয়েছে, কিন্তু আপনার অ্যাকাউন্ট আগে থেকেই আছে।',
    'অ্যাপে লগইন করুন। পাসওয়ার্ড ভুলে গেলে "পাসওয়ার্ড ভুলে গেছি" বেছে নিন।',
    'আপনি চেষ্টা না করে থাকলে এই ইমেইলটি উপেক্ষা করুন।',
  ].join('\n');
  const html = wrapEmailHtml(
    subject,
    `<p style="margin:0 0 12px">এই ইমেইল দিয়ে নতুন অ্যাকাউন্ট খোলার চেষ্টা করা হয়েছে, কিন্তু আপনার অ্যাকাউন্ট আগে থেকেই আছে।</p>
     <p style="margin:0 0 12px">অ্যাপে লগইন করুন। পাসওয়ার্ড ভুলে গেলে "পাসওয়ার্ড ভুলে গেছি" বেছে নিন।</p>
     <p style="margin:0;color:#546b65;font-size:14px">আপনি চেষ্টা না করে থাকলে এই ইমেইলটি উপেক্ষা করুন।</p>`,
  );
  return { to, subject, text, html };
}

const SMS_PURPOSE_TEXT: Record<OtpPurpose, string> = {
  SIGNUP: 'অ্যাকাউন্ট খোলার',
  LOGIN: 'লগইনের',
  RESET_PASSWORD: 'পাসওয়ার্ড রিসেটের',
};

/**
 * Kept short: a Bangla SMS is unicode, 70 characters per part. The code stays in
 * Latin digits so Android can offer to fill it in.
 */
export function otpCodeSms(purpose: OtpPurpose, code: string, ttlMinutes: number): string {
  return `${BRAND}: ${SMS_PURPOSE_TEXT[purpose]} কোড ${code}। ${toBanglaDigits(ttlMinutes)} মিনিট কাজ করবে। কাউকে জানাবেন না।`;
}

/** A sign-up was asked for a number that already has an account. */
export function accountAlreadyExistsSms(): string {
  return `${BRAND}: এই নম্বরে আগে থেকেই অ্যাকাউন্ট আছে। অ্যাপে পাসওয়ার্ড বা কোড দিয়ে লগইন করুন।`;
}
