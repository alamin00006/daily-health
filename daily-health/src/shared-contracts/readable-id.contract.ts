import { z } from 'zod';

/**
 * Human-readable IDs shown to people: `PR-2611-0042`.
 *
 *   P    what it is (P patient, D doctor, N nutritionist, T physiotherapist,
 *        M moderator, A admin)
 *   R    first letter of the name, in Latin (Bangla names are transliterated:
 *        "রহিম" → R); titles such as "ডা." or "Md." are skipped
 *   2611 year and month it was created (Asia/Dhaka): November 2026
 *   0042 the 42nd of that kind that month (the previous one + 1)
 *
 * Unique because the serial comes from one atomic counter per kind and month
 * (core/readable-ids). The initial is only a memory aid. The uuid stays the
 * internal primary key and is never shown. IDs never change, even when the
 * name does. Latin characters on purpose: an ID is not converted to Bangla
 * numerals like the rest of the UI.
 */
export const READABLE_ID_PREFIX = {
  PATIENT: 'P',
  DOCTOR: 'D',
  NUTRITIONIST: 'N',
  PHYSIO: 'T',
  MODERATOR: 'M',
  ADMIN: 'A',
} as const;
export type ReadableIdKind = keyof typeof READABLE_ID_PREFIX;

export const READABLE_ID_PATTERN = /^[PDNTMA][A-Z]-\d{4}-\d{4,}$/;

/**
 * Bangla letter → Latin initial. ড়/ঢ়/য় need no entry: NFC splits them into
 * ড/ঢ/য + nukta. Keep in sync with the migration that backfilled IDs.
 */
const BANGLA_INITIALS: Record<string, string> = {
  অ: 'A',
  আ: 'A',
  ই: 'I',
  ঈ: 'I',
  উ: 'U',
  ঊ: 'U',
  ঋ: 'R',
  এ: 'E',
  ঐ: 'O',
  ও: 'O',
  ঔ: 'O',
  ক: 'K',
  খ: 'K',
  গ: 'G',
  ঘ: 'G',
  ঙ: 'N',
  চ: 'C',
  ছ: 'C',
  জ: 'J',
  ঝ: 'J',
  ঞ: 'N',
  ট: 'T',
  ঠ: 'T',
  ড: 'D',
  ঢ: 'D',
  ণ: 'N',
  ত: 'T',
  থ: 'T',
  দ: 'D',
  ধ: 'D',
  ন: 'N',
  প: 'P',
  ফ: 'F',
  ব: 'B',
  ভ: 'B',
  ম: 'M',
  য: 'J',
  র: 'R',
  ল: 'L',
  শ: 'S',
  ষ: 'S',
  স: 'S',
  হ: 'H',
  ৎ: 'T',
};

/** Titles that come before the name and say nothing about the person. */
const TITLES = new Set([
  'dr',
  'ডা',
  'ডাঃ',
  'ডাক্তার',
  'prof',
  'professor',
  'অধ্যাপক',
  'md',
  'mohd',
  'মো',
  'মোঃ',
  'মোহাঃ',
  'mst',
  'মোসাঃ',
  'মোছাঃ',
  'mr',
  'mrs',
  'ms',
  'miss',
  'জনাব',
  'বেগম',
  'শ্রী',
  'শ্রীমতি',
]);

/** "ডা. রহিম উদ্দিন" → "R", "Md. Karim" → "K", "১২৩" → "X". */
export function nameInitial(name: string): string {
  const words = name.normalize('NFC').trim().split(/\s+/).filter(Boolean);
  const first =
    words.find(
      (word) => !TITLES.has(word.toLowerCase().replace(/[.:]+$/, '')),
    ) ??
    words[0] ??
    '';
  // The first code point, not grapheme: for "রি" we want "র", not "রি".
  const codePoint = first.codePointAt(0);
  const char = codePoint === undefined ? '' : String.fromCodePoint(codePoint);
  if (/^[A-Za-z]$/.test(char)) return char.toUpperCase();
  return BANGLA_INITIALS[char] ?? 'X';
}

/** "PR-2611-0042". */
export function formatReadableId(
  kind: ReadableIdKind,
  initial: string,
  period: string,
  serial: number,
): string {
  return `${READABLE_ID_PREFIX[kind]}${initial}-${period}-${String(serial).padStart(4, '0')}`;
}

/**
 * Accepts what people type: any case, spaces, missing dashes
 * ("pr 2611 42" is not valid, "pr26110042" → "PR-2611-0042").
 */
export const readableIdSchema = z
  .string()
  .trim()
  .transform((raw) => {
    const compact = raw.toUpperCase().replace(/[\s-]/g, '');
    return `${compact.slice(0, 2)}-${compact.slice(2, 6)}-${compact.slice(6)}`;
  })
  .pipe(z.string().regex(READABLE_ID_PATTERN, 'Invalid ID'));

/** A patient's ID (starts with P). */
export const patientCodeSchema = readableIdSchema.refine(
  (id) => id.startsWith(READABLE_ID_PREFIX.PATIENT),
  { message: 'Not a patient ID' },
);

/**
 * References that are not people, without a name letter: `BK-2611-0042`
 * booking, `RC-2611-0042` payment receipt, `ST-2611-0042` provider payout
 * (settlement), `RX-2611-0042` prescription. YYMM in Asia/Dhaka + that month's serial. B, R and S are not
 * person prefixes (P/D/N/T/M/A), so a reference never looks like someone's ID
 * ("PY-…" would: a patient named Yasmin).
 */
export const REFERENCE_CODE_PREFIX = {
  BOOKING: 'BK',
  PAYMENT: 'RC',
  PAYOUT: 'ST',
  PRESCRIPTION: 'RX',
  /** Emergency (SOS) requests. */
  EMERGENCY: 'EM',
} as const;
export type ReferenceCodeKind = keyof typeof REFERENCE_CODE_PREFIX;

export const BOOKING_CODE_PATTERN = /^BK-\d{4}-\d{4,}$/;
export const PAYMENT_INVOICE_PATTERN = /^RC-\d{4}-\d{4,}$/;
export const PRESCRIPTION_CODE_PATTERN = /^RX-\d{4}-\d{4,}$/;

export function formatReferenceCode(
  kind: ReferenceCodeKind,
  period: string,
  serial: number,
): string {
  return `${REFERENCE_CODE_PREFIX[kind]}-${period}-${String(serial).padStart(4, '0')}`;
}
