/** Error codes of the records module. The app maps each to Bangla text; never rename. */
export const RecordsErrorCode = {
  /** Unknown id, another profile's file, or a deleted file. */
  MEDICAL_FILE_NOT_FOUND: 'MEDICAL_FILE_NOT_FOUND',
  /** A report or prescription over 5 MB (details.maxBytes). */
  MEDICAL_FILE_TOO_LARGE: 'MEDICAL_FILE_TOO_LARGE',
  RECORD_SHARE_NOT_FOUND: 'RECORD_SHARE_NOT_FOUND',
  /** The provider asked for a patient who has not shared with them (or it ran out). */
  RECORDS_NOT_SHARED: 'RECORDS_NOT_SHARED',
} as const;
