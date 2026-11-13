import { z } from 'zod';
import { paginationQuerySchema } from './common-fields.contract.js';
import type { ProviderSummaryResponse } from './doctors.contract.js';

/**
 * Health tips (স্বাস্থ্য টিপস) on home: written and published by staff in the
 * panel, optionally credited to a doctor. Anyone, guests too, can read
 * published tips.
 */
export const tipCategorySchema = z.enum(['GENERAL', 'NUTRITION', 'WOMEN', 'CHILD', 'MENTAL']);
export type TipCategory = z.infer<typeof tipCategorySchema>;

export const tipStatusSchema = z.enum(['DRAFT', 'PUBLISHED']);
export type TipStatus = z.infer<typeof tipStatusSchema>;

export interface HealthTipResponse {
  id: string;
  title: string;
  body: string;
  category: TipCategory;
  /** 800px WebP for the detail screen; null without a picture. */
  imageUrl: string | null;
  /** 200px WebP for cards. */
  imageThumbnailUrl: string | null;
  author: Pick<ProviderSummaryResponse, 'id' | 'type' | 'displayName' | 'designation' | 'avatarThumbnailUrl'> | null;
  publishedAt: string | null;
}

/** Staff view: also drafts and timestamps. */
export interface StaffHealthTipResponse extends HealthTipResponse {
  status: TipStatus;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
}

// GET /api/v1/health-tips?category=
export const listHealthTipsQuerySchema = paginationQuerySchema.extend({
  category: tipCategorySchema.optional(),
});
export type ListHealthTipsQuery = z.infer<typeof listHealthTipsQuerySchema>;

// GET /api/v1/staff/health-tips?status=
export const listStaffHealthTipsQuerySchema = paginationQuerySchema.extend({
  status: tipStatusSchema.optional(),
  category: tipCategorySchema.optional(),
});
export type ListStaffHealthTipsQuery = z.infer<typeof listStaffHealthTipsQuerySchema>;

// POST /api/v1/staff/health-tips (always a draft)
export const createHealthTipRequestSchema = z.object({
  title: z.string().trim().min(5).max(120),
  body: z.string().trim().min(20).max(5000),
  category: tipCategorySchema,
  /** Credit a verified provider (their name shows on the tip). */
  authorProviderId: z.uuid().nullable().optional(),
});
export type CreateHealthTipRequest = z.infer<typeof createHealthTipRequestSchema>;

// PATCH /api/v1/staff/health-tips/:tipId
export const updateHealthTipRequestSchema = createHealthTipRequestSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one field' });
export type UpdateHealthTipRequest = z.infer<typeof updateHealthTipRequestSchema>;
