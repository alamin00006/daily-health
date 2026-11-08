import { toBanglaDigits } from '../../common/formatting/bangla-digits.js';
import {
  EMAIL_BRAND_NAME,
  escapeHtml,
  wrapEmailHtml,
} from '../../core/mail/email-layout.js';
import type { OutgoingEmail } from '../../core/mail/email-sender.js';
import type { ProfileRole } from '../../generated/prisma/client.js';

const ROLE_TEXT: Record<ProfileRole, string> = {
  OWNER: 'মালিক (সব কিছু দেখা ও পরিচালনা)',
  CAREGIVER: 'যত্নকারী (দেখা ও তথ্য যোগ করা)',
  VIEWER: 'দর্শক (শুধু দেখা)',
};

/**
 * No health details: only the patient's name, the role and how to accept.
 * The invitee accepts in the app after logging in with this email.
 */
export function profileInviteEmail(input: {
  to: string;
  profileName: string;
  role: ProfileRole;
  expiresInDays: number;
}): OutgoingEmail {
  const subject = `${EMAIL_BRAND_NAME}: পরিবারের স্বাস্থ্য প্রোফাইলে আমন্ত্রণ`;
  const days = toBanglaDigits(input.expiresInDays);
  const steps =
    'অ্যাপে এই ইমেইল দিয়ে লগইন বা নতুন অ্যাকাউন্ট খুলুন, তারপর প্রোফাইল > আমন্ত্রণ থেকে গ্রহণ করুন।';

  const text = [
    `"${input.profileName}"-এর স্বাস্থ্য প্রোফাইলে আপনাকে আমন্ত্রণ জানানো হয়েছে।`,
    `আপনার ভূমিকা: ${ROLE_TEXT[input.role]}`,
    steps,
    `আমন্ত্রণটি ${days} দিন পর্যন্ত থাকবে। আপনি এই ব্যক্তিকে না চিনলে ইমেইলটি উপেক্ষা করুন।`,
  ].join('\n');

  const html = wrapEmailHtml(
    subject,
    `<p style="margin:0 0 12px"><strong>${escapeHtml(input.profileName)}</strong>-এর স্বাস্থ্য প্রোফাইলে আপনাকে আমন্ত্রণ জানানো হয়েছে।</p>
     <p style="margin:0 0 12px">আপনার ভূমিকা: ${ROLE_TEXT[input.role]}</p>
     <p style="margin:0 0 12px">${steps}</p>
     <p style="margin:0;color:#546b65;font-size:14px">আমন্ত্রণটি ${days} দিন পর্যন্ত থাকবে। আপনি এই ব্যক্তিকে না চিনলে ইমেইলটি উপেক্ষা করুন।</p>`,
  );
  return { to: input.to, subject, text, html };
}
