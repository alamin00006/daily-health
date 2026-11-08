import type {
  VitalContext,
  VitalStatus,
  VitalType,
} from '../../shared-contracts/health.contract.js';

/**
 * Status shown next to a reading. Informational, not a diagnosis: the app
 * always says to follow the doctor's advice. CONTROLLED = above the healthy
 * range but below the "high" line (borderline, or on target with treatment).
 *
 * Thresholds (adults):
 * - BP (mmHg): LOW < 90/60; NORMAL < 130/85; CONTROLLED < 140/90; HIGH ≥ 140/90.
 * - Glucose (mmol/L): LOW < 3.9. Fasting: NORMAL ≤ 5.5, CONTROLLED < 7.0, HIGH ≥ 7.0.
 *   After meal / random: NORMAL < 7.8, CONTROLLED < 11.1, HIGH ≥ 11.1.
 * - Weight via BMI, WHO Asian cut-offs: LOW < 18.5; NORMAL < 23; CONTROLLED < 27.5; HIGH ≥ 27.5.
 * - Pulse (bpm): LOW < 60; NORMAL ≤ 100; HIGH > 100.
 * - Temperature (°C): LOW < 35; NORMAL ≤ 37.5; HIGH > 37.5.
 * - SpO2 (%): NORMAL ≥ 95; LOW < 95.
 */
export interface VitalStatusInput {
  type: VitalType;
  systolic?: number | null;
  diastolic?: number | null;
  value?: number | null;
  context?: VitalContext | null;
  /** WEIGHT only: needed for BMI. */
  heightCm?: number | null;
}

export function computeVitalStatus(
  input: VitalStatusInput,
): VitalStatus | null {
  switch (input.type) {
    case 'BP':
      return bpStatus(input.systolic ?? 0, input.diastolic ?? 0);
    case 'GLUCOSE':
      return glucoseStatus(input.value ?? 0, input.context ?? 'RANDOM');
    case 'WEIGHT': {
      const bmi = computeBmi(input.value ?? null, input.heightCm ?? null);
      return bmi === null ? null : bmiStatus(bmi);
    }
    case 'PULSE':
      return rangeStatus(input.value ?? 0, 60, 100);
    case 'TEMP':
      return rangeStatus(input.value ?? 0, 35, 37.5);
    case 'SPO2':
      return (input.value ?? 0) >= 95 ? 'NORMAL' : 'LOW';
  }
}

/** kg / m², one decimal; null without both numbers. */
export function computeBmi(
  weightKg: number | null,
  heightCm: number | null,
): number | null {
  if (!weightKg || !heightCm) return null;
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

function bpStatus(systolic: number, diastolic: number): VitalStatus {
  if (systolic >= 140 || diastolic >= 90) return 'HIGH';
  if (systolic < 90 || diastolic < 60) return 'LOW';
  if (systolic >= 130 || diastolic >= 85) return 'CONTROLLED';
  return 'NORMAL';
}

function glucoseStatus(mmolPerL: number, context: VitalContext): VitalStatus {
  if (mmolPerL < 3.9) return 'LOW';
  if (context === 'FASTING') {
    if (mmolPerL <= 5.5) return 'NORMAL';
    return mmolPerL < 7.0 ? 'CONTROLLED' : 'HIGH';
  }
  if (mmolPerL < 7.8) return 'NORMAL';
  return mmolPerL < 11.1 ? 'CONTROLLED' : 'HIGH';
}

function bmiStatus(bmi: number): VitalStatus {
  if (bmi < 18.5) return 'LOW';
  if (bmi < 23) return 'NORMAL';
  return bmi < 27.5 ? 'CONTROLLED' : 'HIGH';
}

function rangeStatus(value: number, low: number, high: number): VitalStatus {
  if (value < low) return 'LOW';
  return value > high ? 'HIGH' : 'NORMAL';
}
