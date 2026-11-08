import { z } from 'zod';
import {
  calendarDateSchema,
  paginationQuerySchema,
} from './common-fields.contract.js';

export const medicalFileTypeSchema = z.enum([
  'LAB_REPORT',
  'PRESCRIPTION_SCAN',
  'IMAGING',
  'OTHER',
]);
export type MedicalFileType = z.infer<typeof medicalFileTypeSchema>;

const reportDateSchema = calendarDateSchema.refine(
  (date) =>
    date >= '1900-01-01' && date <= new Date().toISOString().slice(0, 10),
  { message: 'Report date must be between 1900-01-01 and today' },
);

const medicalFileFieldsSchema = z.object({
  type: medicalFileTypeSchema,
  /** e.g. "CBC রিপোর্ট", "ডা. করিমের প্রেসক্রিপশন". */
  title: z.string().trim().min(1).max(120),
  /** The date printed on the report. */
  reportDate: reportDateSchema.nullable().optional(),
});

/**
 * POST /api/v1/profiles/:profileId/files (multipart/form-data)
 * Parts: `file` (JPEG/PNG/WebP image or PDF, max 10 MB) plus these text fields.
 * Multipart fields are strings, so an empty reportDate means "none".
 */
export const uploadMedicalFileFieldsSchema = medicalFileFieldsSchema.extend({
  reportDate: z
    .preprocess(
      (value) => (value === '' ? undefined : value),
      reportDateSchema.optional(),
    )
    .optional(),
});
export type UploadMedicalFileFields = z.infer<
  typeof uploadMedicalFileFieldsSchema
>;

// PATCH /api/v1/profiles/:profileId/files/:fileId
export const updateMedicalFileRequestSchema = medicalFileFieldsSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one field',
  });
export type UpdateMedicalFileRequest = z.infer<
  typeof updateMedicalFileRequestSchema
>;

// GET /api/v1/profiles/:profileId/files?type=LAB_REPORT&cursor=...&limit=...
export const listMedicalFilesQuerySchema = paginationQuerySchema.extend({
  type: medicalFileTypeSchema.optional(),
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
