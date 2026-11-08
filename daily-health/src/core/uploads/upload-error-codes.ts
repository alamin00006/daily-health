/** Error codes for file uploads. The app maps each to Bangla text; never rename. */
export const UploadErrorCode = {
  /** The multipart request had no `file` part. */
  FILE_REQUIRED: 'FILE_REQUIRED',
  /** The bytes are not an accepted format (checked by magic bytes, not the name). */
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  /** Recognised format, but the content is damaged or too large in pixels. */
  INVALID_FILE: 'INVALID_FILE',
} as const;
