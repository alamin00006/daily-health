/** Error codes of the medicine module. The app maps each to Bangla text; never rename. */
export const MedicineErrorCode = {
  MEDICINE_NOT_FOUND: 'MEDICINE_NOT_FOUND',
  /** Unknown plan or another profile's plan. */
  MEDICATION_PLAN_NOT_FOUND: 'MEDICATION_PLAN_NOT_FOUND',
  /** The plan was stopped; restart it by editing instead. */
  MEDICATION_PLAN_STOPPED: 'MEDICATION_PLAN_STOPPED',
  /** No dose of this plan is scheduled at that time. */
  DOSE_SLOT_NOT_FOUND: 'DOSE_SLOT_NOT_FOUND',
  /** Marking a dose that is more than 12 hours away. */
  DOSE_TOO_EARLY: 'DOSE_TOO_EARLY',
} as const;
