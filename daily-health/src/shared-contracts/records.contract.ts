import { z } from 'zod';
import {
  calendarDateSchema,
  paginationQuerySchema,
} from './common-fields.contract.js';
import type { ProviderSummaryResponse } from './doctors.contract.js';

export const medicalFileTypeSchema = z.enum([
  'LAB_REPORT',
  'PRESCRIPTION_SCAN',
  'IMAGING',
  'OTHER',
]);
export type MedicalFileType = z.infer<typeof medicalFileTypeSchema>;

/**
 * Lab tests people in Bangladesh do most, for the report form's list (Roadmap doc,
 * 2026-11-28). "OTHER" comes last; then the person types the test name. Codes are
 * stored, so never rename one; add new ones instead.
 */
export const LAB_TESTS = [
  { code: 'CBC', nameBn: 'সিবিসি (রক্তের সম্পূর্ণ পরীক্ষা)', nameEn: 'CBC' },
  { code: 'HB', nameBn: 'হিমোগ্লোবিন', nameEn: 'Haemoglobin' },
  { code: 'ESR', nameBn: 'ইএসআর', nameEn: 'ESR' },
  { code: 'PLATELET', nameBn: 'প্লাটিলেট কাউন্ট', nameEn: 'Platelet count' },
  { code: 'FBS', nameBn: 'খালি পেটে রক্তের সুগার', nameEn: 'Fasting blood sugar' },
  { code: 'RBS', nameBn: 'যেকোনো সময়ের রক্তের সুগার', nameEn: 'Random blood sugar' },
  { code: 'TWO_HABF', nameBn: 'খাবারের ২ ঘণ্টা পর সুগার', nameEn: '2h after breakfast sugar' },
  { code: 'OGTT', nameBn: 'ওজিটিটি (সুগার সহনশীলতা)', nameEn: 'OGTT' },
  { code: 'HBA1C', nameBn: 'এইচবিএওয়ানসি', nameEn: 'HbA1c' },
  { code: 'LIPID', nameBn: 'লিপিড প্রোফাইল (কোলেস্টেরল)', nameEn: 'Lipid profile' },
  { code: 'CREATININE', nameBn: 'ক্রিয়েটিনিন', nameEn: 'Serum creatinine' },
  { code: 'UREA', nameBn: 'ইউরিয়া', nameEn: 'Blood urea' },
  { code: 'ELECTROLYTES', nameBn: 'ইলেক্ট্রোলাইট', nameEn: 'Electrolytes' },
  { code: 'URIC_ACID', nameBn: 'ইউরিক অ্যাসিড', nameEn: 'Uric acid' },
  { code: 'SGPT', nameBn: 'এসজিপিটি (এএলটি)', nameEn: 'SGPT (ALT)' },
  { code: 'SGOT', nameBn: 'এসজিওটি (এএসটি)', nameEn: 'SGOT (AST)' },
  { code: 'BILIRUBIN', nameBn: 'বিলিরুবিন', nameEn: 'Bilirubin' },
  { code: 'LFT', nameBn: 'লিভার ফাংশন টেস্ট', nameEn: 'Liver function test' },
  { code: 'TSH', nameBn: 'টিএসএইচ (থাইরয়েড)', nameEn: 'TSH' },
  { code: 'THYROID', nameBn: 'থাইরয়েড প্রোফাইল (T3, T4)', nameEn: 'Thyroid profile' },
  { code: 'VITAMIN_D', nameBn: 'ভিটামিন ডি', nameEn: 'Vitamin D' },
  { code: 'CRP', nameBn: 'সিআরপি', nameEn: 'CRP' },
  { code: 'URINE_RE', nameBn: 'প্রস্রাব পরীক্ষা (R/E)', nameEn: 'Urine R/E' },
  { code: 'STOOL_RE', nameBn: 'পায়খানা পরীক্ষা (R/E)', nameEn: 'Stool R/E' },
  { code: 'DENGUE_NS1', nameBn: 'ডেঙ্গু এনএস১', nameEn: 'Dengue NS1' },
  { code: 'WIDAL', nameBn: 'টাইফয়েড (ওয়াইডাল)', nameEn: 'Widal' },
  { code: 'HBSAG', nameBn: 'হেপাটাইটিস বি (HBsAg)', nameEn: 'HBsAg' },
  { code: 'PREGNANCY', nameBn: 'গর্ভধারণ পরীক্ষা', nameEn: 'Pregnancy test' },
  { code: 'XRAY_CHEST', nameBn: 'বুকের এক্স-রে', nameEn: 'Chest X-ray' },
  { code: 'USG_ABDOMEN', nameBn: 'পেটের আল্ট্রাসনোগ্রাম', nameEn: 'USG whole abdomen' },
  { code: 'ECG', nameBn: 'ইসিজি', nameEn: 'ECG' },
  { code: 'ECHO', nameBn: 'ইকোকার্ডিওগ্রাম', nameEn: 'Echocardiogram' },
  { code: 'CT_SCAN', nameBn: 'সিটি স্ক্যান', nameEn: 'CT scan' },
  { code: 'MRI', nameBn: 'এমআরআই', nameEn: 'MRI' },
  { code: 'OTHER', nameBn: 'অন্যান্য', nameEn: 'Other' },
] as const;
export type LabTestCode = (typeof LAB_TESTS)[number]['code'];
const LAB_TEST_CODES = LAB_TESTS.map((t) => t.code) as [LabTestCode, ...LabTestCode[]];
export const labTestCodeSchema = z.enum(LAB_TEST_CODES);

/** "CBC" → "সিবিসি (রক্তের সম্পূর্ণ পরীক্ষা)"; unknown or "OTHER" → null. */
export function labTestName(code: string | null): string | null {
  if (!code || code === 'OTHER') return null;
  return LAB_TESTS.find((t) => t.code === code)?.nameBn ?? null;
}

/** Report and prescription files are capped lower than other uploads (Roadmap doc: 2–5 MB). */
export const MAX_MEDICAL_FILE_BYTES = 5 * 1024 * 1024;

const reportDateSchema = calendarDateSchema.refine(
  (date) =>
    date >= '1900-01-01' && date <= new Date().toISOString().slice(0, 10),
  { message: 'Report date must be between 1900-01-01 and today' },
);

const shortText = (max: number) => z.string().trim().min(2).max(max);

const medicalFileFieldsSchema = z.object({
  type: medicalFileTypeSchema,
  /**
   * What people see in lists. Lab report: the test's name (filled from the catalog,
   * or typed for "OTHER"). Prescription: e.g. "ডা. করিমের প্রেসক্রিপশন".
   */
  title: z.string().trim().min(1).max(120),
  /** The date printed on the report. */
  reportDate: reportDateSchema.nullable().optional(),
  /** Lab report: a catalog code. */
  testCode: labTestCodeSchema.nullable().optional(),
  /** Lab, hospital or chamber. */
  institute: shortText(120).nullable().optional(),
  /** The illness or reason ("ডায়াবেটিস চেক", "জ্বর"). */
  purpose: shortText(200).nullable().optional(),
  /** Lab report: the doctor who asked for it. Prescription: the doctor who wrote it. */
  consultantName: shortText(100).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

/**
 * The report form asks for everything except the note (Roadmap doc, 2026-11-28):
 * lab reports need the test, institute, purpose, doctor and date; prescriptions the
 * doctor, institute, purpose and date. Imaging and "other" files stay simple.
 */
function requireDetails(
  body: {
    type?: MedicalFileType;
    reportDate?: string | null;
    testCode?: string | null;
    institute?: string | null;
    purpose?: string | null;
    consultantName?: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  const need = (field: keyof typeof body) => {
    if (!body[field]) ctx.addIssue({ code: 'custom', path: [field], message: 'Required' });
  };
  if (body.type === 'LAB_REPORT') {
    need('testCode');
    need('institute');
    need('purpose');
    need('consultantName');
    need('reportDate');
  } else if (body.type === 'PRESCRIPTION_SCAN') {
    need('consultantName');
    need('institute');
    need('purpose');
    need('reportDate');
  }
}

/** Multipart fields are strings: "" means "not given". */
const blankToUndefined = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema);

/**
 * POST /api/v1/profiles/:profileId/files (multipart/form-data)
 * Parts: `file` (JPEG/PNG/WebP image or PDF; reports and prescriptions up to 5 MB,
 * other files 10 MB) plus these text fields.
 */
export const uploadMedicalFileFieldsSchema = z
  .object({
    type: medicalFileTypeSchema,
    title: z.string().trim().min(1).max(120),
    reportDate: blankToUndefined(reportDateSchema.optional()),
    testCode: blankToUndefined(labTestCodeSchema.optional()),
    institute: blankToUndefined(shortText(120).optional()),
    purpose: blankToUndefined(shortText(200).optional()),
    consultantName: blankToUndefined(shortText(100).optional()),
    note: blankToUndefined(z.string().trim().max(1000).optional()),
  })
  .superRefine(requireDetails);
export type UploadMedicalFileFields = z.infer<
  typeof uploadMedicalFileFieldsSchema
>;

// PATCH /api/v1/profiles/:profileId/files/:fileId (the type cannot change here)
export const updateMedicalFileRequestSchema = medicalFileFieldsSchema
  .omit({ type: true })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one field',
  });
export type UpdateMedicalFileRequest = z.infer<
  typeof updateMedicalFileRequestSchema
>;

// GET /api/v1/profiles/:profileId/files?type=LAB_REPORT&testCode=CBC&cursor=...&limit=...
export const listMedicalFilesQuerySchema = paginationQuerySchema.extend({
  type: medicalFileTypeSchema.optional(),
  /** One test's reports, newest report date first. */
  testCode: labTestCodeSchema.optional(),
});
export type ListMedicalFilesQuery = z.infer<typeof listMedicalFilesQuerySchema>;

export interface MedicalFileResponse {
  id: string;
  type: MedicalFileType;
  title: string;
  /** image/webp or application/pdf. */
  mimeType: string;
  sizeBytes: number;
  reportDate: string | null;
  testCode: LabTestCode | null;
  institute: string | null;
  purpose: string | null;
  consultantName: string | null;
  note: string | null;
  uploadedByUserId: string;
  /** Signed, expires in about 10 minutes: fetch the file again for a new one. */
  fileUrl: string;
  /** 200px WebP for lists; null for PDFs. */
  thumbnailUrl: string | null;
  /** 800px WebP for viewing on a phone; null for PDFs. */
  previewUrl: string | null;
  urlsExpireAt: string;
  createdAt: string;
}

// GET /api/v1/profiles/:profileId/files/tests — lab reports grouped by test
export interface LabTestSummaryResponse {
  testCode: LabTestCode;
  /** Catalog name; for "OTHER" the latest typed name. */
  name: string;
  count: number;
  latestReportDate: string | null;
}

// ---------------------------------------------------------------------------
// Sharing the file history with a doctor (Roadmap doc, 2026-11-28)
// ---------------------------------------------------------------------------

export const recordShareDaysSchema = z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(90)]);

// POST /api/v1/profiles/:profileId/record-shares (OWNER, CAREGIVER)
export const createRecordShareRequestSchema = z.object({
  /** A verified doctor, nutritionist or physiotherapist. */
  providerId: z.uuid(),
  /** How long they may look. Sharing again with the same provider extends it. */
  days: recordShareDaysSchema,
});
export type CreateRecordShareRequest = z.infer<typeof createRecordShareRequestSchema>;

export interface RecordShareResponse {
  id: string;
  provider: ProviderSummaryResponse;
  expiresAt: string;
  /** False once it ran out or was taken back. */
  active: boolean;
  createdAt: string;
}

// GET /api/v1/provider/me/shared-records — patients who shared their files with me
export interface SharedPatientResponse {
  shareId: string;
  patientId: string;
  patientCode: string;
  fullName: string;
  gender: string | null;
  /** Whole years; null when the birth date is unknown. */
  age: number | null;
  expiresAt: string;
  fileCount: number;
}

// GET /api/v1/provider/me/shared-records/:patientId/files?type=&cursor=
export const sharedFilesQuerySchema = paginationQuerySchema.extend({
  type: medicalFileTypeSchema.optional(),
});
export type SharedFilesQuery = z.infer<typeof sharedFilesQuerySchema>;
