import { Injectable } from '@nestjs/common';
import { ColumnEncryptionService } from '../../core/crypto/column-encryption.service.js';
import type {
  PrescribedTest,
  Prescription,
  PrescriptionItem,
} from '../../generated/prisma/client.js';
import {
  parseDosePattern,
  type PrescriptionPatientInfo,
  type PrescriptionResponse,
} from '../../shared-contracts/prescription.contract.js';
import { AppointmentLookupService } from '../appointments/appointment-lookup.service.js';
import { ProviderDirectoryService } from '../doctors/provider-directory.service.js';
import { MedicationPlansService } from '../medicine/medication-plans.service.js';
import { MedicalFilesService } from '../records/medical-files.service.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';

export const ENC = {
  chiefComplaint: 'prescriptions.Prescription.chiefComplaint',
  diagnosis: 'prescriptions.Prescription.diagnosis',
  advice: 'prescriptions.Prescription.advice',
} as const;

export type PrescriptionRow = Prescription & {
  items: PrescriptionItem[];
  tests: PrescribedTest[];
};

export const PRESCRIPTION_INCLUDE = {
  items: { orderBy: { position: 'asc' } },
  tests: { orderBy: { position: 'asc' } },
} as const;

/** Builds prescription responses with batched lookups in the modules that own the data. */
@Injectable()
export class PrescriptionViewsService {
  constructor(
    private readonly encryption: ColumnEncryptionService,
    private readonly profiles: PatientProfilesService,
    private readonly directory: ProviderDirectoryService,
    private readonly appointments: AppointmentLookupService,
    private readonly plans: MedicationPlansService,
    private readonly files: MedicalFilesService,
  ) {}

  async one(row: PrescriptionRow, withAlarms = false): Promise<PrescriptionResponse> {
    const [response] = await this.many([row], withAlarms);
    return response!;
  }

  /** `withAlarms`: the patient side, which sees the alarms made from each line. */
  async many(rows: PrescriptionRow[], withAlarms = false): Promise<PrescriptionResponse[]> {
    const [patients, providers, appointments] = await Promise.all([
      this.profiles.findManyByIds(rows.map((r) => r.patientId)),
      this.directory.summariesByIds(rows.map((r) => r.providerId)),
      this.appointments.findManyByIds(rows.flatMap((r) => (r.appointmentId ? [r.appointmentId] : []))),
    ]);
    const results: PrescriptionResponse[] = [];
    for (const row of rows) {
      const alarms = withAlarms
        ? await this.plans.plansForPrescriptionItems(row.patientId, row.items.map((i) => i.id))
        : new Map<string, { planId: string; isActive: boolean }>();
      const fileTitles = await this.files.titlesByIds(
        row.patientId,
        row.tests.flatMap((t) => (t.resultFileId ? [t.resultFileId] : [])),
      );
      const profile = patients.get(row.patientId);
      results.push({
        id: row.id,
        code: row.code,
        status: row.status,
        patient: patientInfo(profile, row.patientId),
        provider: providers.get(row.providerId) ?? null,
        appointmentId: row.appointmentId,
        appointmentCode: row.appointmentId ? (appointments.get(row.appointmentId)?.code ?? null) : null,
        consultationId: row.consultationId,
        chiefComplaint: this.decrypt(row.chiefComplaint, ENC.chiefComplaint),
        diagnosis: this.decrypt(row.diagnosis, ENC.diagnosis),
        advice: this.decrypt(row.advice, ENC.advice),
        followUpAfterDays: row.followUpAfterDays,
        items: row.items.map((item) => ({
          id: item.id,
          medicineId: item.medicineId,
          medicineName: item.medicineName,
          strength: item.strength,
          form: item.form,
          doseUnit: item.doseUnit,
          dosePattern: item.dosePattern,
          doses: parseDosePattern(item.dosePattern) ?? [],
          mealTiming: item.mealTiming,
          durationDays: item.durationDays,
          instruction: item.instruction,
          alarm: alarms.get(item.id) ?? null,
        })),
        tests: row.tests.map((test) => {
          const title = test.resultFileId ? fileTitles.get(test.resultFileId) : undefined;
          return {
            id: test.id,
            testName: test.testName,
            note: test.note,
            resultFile: test.resultFileId && title !== undefined ? { id: test.resultFileId, title } : null,
          };
        }),
        issuedAt: row.issuedAt?.toISOString() ?? null,
        revokedAt: row.revokedAt?.toISOString() ?? null,
        revokeReason: row.revokeReason,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    }
    return results;
  }

  private decrypt(value: Uint8Array | null, context: string): string | null {
    return value ? this.encryption.decrypt(value, context) : null;
  }
}

function patientInfo(
  profile:
    | { id: string; patientCode: string; fullName: string; gender: string; dateOfBirth: Date | null }
    | undefined,
  fallbackId: string,
): PrescriptionPatientInfo {
  if (!profile) return { id: fallbackId, patientCode: '', fullName: '', gender: null, ageYears: null };
  let ageYears: number | null = null;
  if (profile.dateOfBirth) {
    const now = new Date();
    const birth = profile.dateOfBirth;
    ageYears = now.getUTCFullYear() - birth.getUTCFullYear();
    if (
      now.getUTCMonth() < birth.getUTCMonth() ||
      (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())
    ) {
      ageYears -= 1;
    }
  }
  return {
    id: profile.id,
    patientCode: profile.patientCode,
    fullName: profile.fullName,
    gender: profile.gender,
    ageYears,
  };
}
