/**
 * Upload limits (CLAUDE.md §5). The app already resizes photos to 1600px at
 * ~0.7 quality, so a phone photo arrives well under 1 MB; PDFs can be larger.
 * Keep Nginx `client_max_body_size` slightly above MAX_UPLOAD_BYTES.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Larger images are scaled down to fit this box before storing. */
export const MAX_STORED_IMAGE_DIMENSION = 2400;

/** Profile photos are cropped to a square of this size. */
export const AVATAR_DIMENSION = 800;

/** Thumbnail widths stored next to every image (`<visibility>/thumbs/<width>/...`). */
export const THUMBNAIL_WIDTHS = [200, 800] as const;
export type ThumbnailWidth = (typeof THUMBNAIL_WIDTHS)[number];

/** Refuses decompression bombs: about 50 megapixels. */
export const MAX_INPUT_PIXELS = 50_000_000;
