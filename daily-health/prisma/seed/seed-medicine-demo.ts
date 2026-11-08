// Medicine demo data, called from seed-demo-data.ts: a small catalog of common
// Bangladeshi brands and a month of an elderly father's medicines.
//
// The catalog is sample data for development: names, strengths and makers are
// common brands but must be checked against the DGDA register (and prices
// added) before it is used in production.
import { Prisma } from '../../src/generated/prisma/client.js';
import type { PrismaService } from '../../src/core/prisma/prisma.service.js';
import {
  maskFromDays,
  slotsBetween,
  toSchedulePlan,
} from '../../src/modules/medicine/dose-schedule.js';
import {
  dhakaDate,
  addDays,
  hhmmToTimeColumn,
  stringToDateColumn,
} from '../../src/common/time/dhaka-time.js';
import type { MedicineForm } from '../../src/shared-contracts/medicine.contract.js';

const CATALOG: {
  brandName: string;
  genericName: string;
  strength: string;
  form: MedicineForm;
  manufacturer: string;
}[] = [
  {
    brandName: 'Napa',
    genericName: 'Paracetamol',
    strength: '500 mg',
    form: 'TABLET',
    manufacturer: 'Beximco Pharmaceuticals',
  },
  {
    brandName: 'Napa Extra',
    genericName: 'Paracetamol + Caffeine',
    strength: '500 mg + 65 mg',
    form: 'TABLET',
    manufacturer: 'Beximco Pharmaceuticals',
  },
  {
    brandName: 'Napa',
    genericName: 'Paracetamol',
    strength: '120 mg/5 ml',
    form: 'SYRUP',
    manufacturer: 'Beximco Pharmaceuticals',
  },
  {
    brandName: 'Ace',
    genericName: 'Paracetamol',
    strength: '500 mg',
    form: 'TABLET',
    manufacturer: 'Square Pharmaceuticals',
  },
  {
    brandName: 'Seclo',
    genericName: 'Omeprazole',
    strength: '20 mg',
    form: 'CAPSULE',
    manufacturer: 'Square Pharmaceuticals',
  },
  {
    brandName: 'Losectil',
    genericName: 'Omeprazole',
    strength: '20 mg',
    form: 'CAPSULE',
    manufacturer: 'Eskayef Pharmaceuticals',
  },
  {
    brandName: 'Sergel',
    genericName: 'Esomeprazole',
    strength: '20 mg',
    form: 'CAPSULE',
    manufacturer: 'Healthcare Pharmaceuticals',
  },
  {
    brandName: 'Maxpro',
    genericName: 'Esomeprazole',
    strength: '20 mg',
    form: 'TABLET',
    manufacturer: 'Renata',
  },
  {
    brandName: 'Fexo',
    genericName: 'Fexofenadine',
    strength: '120 mg',
    form: 'TABLET',
    manufacturer: 'Square Pharmaceuticals',
  },
  {
    brandName: 'Alatrol',
    genericName: 'Cetirizine',
    strength: '10 mg',
    form: 'TABLET',
    manufacturer: 'Square Pharmaceuticals',
  },
  {
    brandName: 'Monas',
    genericName: 'Montelukast',
    strength: '10 mg',
    form: 'TABLET',
    manufacturer: 'ACME Laboratories',
  },
  {
    brandName: 'Comet',
    genericName: 'Metformin',
    strength: '500 mg',
    form: 'TABLET',
    manufacturer: 'Square Pharmaceuticals',
  },
  {
    brandName: 'Amdocal',
    genericName: 'Amlodipine',
    strength: '5 mg',
    form: 'TABLET',
    manufacturer: 'Beximco Pharmaceuticals',
  },
  {
    brandName: 'Camlodin',
    genericName: 'Amlodipine',
    strength: '5 mg',
    form: 'TABLET',
    manufacturer: 'Square Pharmaceuticals',
  },
  {
    brandName: 'Osartil',
    genericName: 'Losartan Potassium',
    strength: '50 mg',
    form: 'TABLET',
    manufacturer: 'Incepta Pharmaceuticals',
  },
  {
    brandName: 'Angilock',
    genericName: 'Losartan Potassium',
    strength: '50 mg',
    form: 'TABLET',
    manufacturer: 'Square Pharmaceuticals',
  },
  {
    brandName: 'Atova',
    genericName: 'Atorvastatin',
    strength: '10 mg',
    form: 'TABLET',
    manufacturer: 'Beximco Pharmaceuticals',
  },
  {
    brandName: 'Ecosprin',
    genericName: 'Aspirin',
    strength: '75 mg',
    form: 'TABLET',
    manufacturer: 'ACME Laboratories',
  },
  {
    brandName: 'Calbo-D',
    genericName: 'Calcium + Vitamin D3',
    strength: '500 mg + 200 IU',
    form: 'TABLET',
    manufacturer: 'Square Pharmaceuticals',
  },
  {
    brandName: 'Flagyl',
    genericName: 'Metronidazole',
    strength: '400 mg',
    form: 'TABLET',
    manufacturer: 'Sanofi',
  },
  {
    brandName: 'Azithrocin',
    genericName: 'Azithromycin',
    strength: '500 mg',
    form: 'TABLET',
    manufacturer: 'Beximco Pharmaceuticals',
  },
];

/** Upserts the catalog (kept between seed runs). Returns brand+strength → id. */
export async function seedMedicineCatalog(
  prisma: PrismaService,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const medicine of CATALOG) {
    const row = await prisma.medicine.upsert({
      where: {
        brandName_strength_form: {
          brandName: medicine.brandName,
          strength: medicine.strength,
          form: medicine.form,
        },
      },
      create: medicine,
      update: {
        genericName: medicine.genericName,
        manufacturer: medicine.manufacturer,
        isActive: true,
      },
    });
    ids.set(`${medicine.brandName} ${medicine.strength}`, row.id);
  }
  return ids;
}

interface DemoPlan {
  catalogKey?: string;
  displayName: string;
  doseUnit: string;
  mealTiming: 'BEFORE_MEAL' | 'AFTER_MEAL' | 'WITH_MEAL' | 'ANY';
  mealOffsetMin?: number;
  startedDaysAgo: number;
  /** Days from today; omit for ongoing. */
  endsInDays?: number;
  times: { time: string; dose: number; days?: number[] }[];
  stockQty?: number;
}

/** Deterministic pseudo-random numbers, so every seed run looks the same. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Creates the plans with a recorded history for every dose whose time has
 * passed: mostly taken on time, some late, a few skipped or missed. The most
 * recent past dose is left untouched so the app shows something "due".
 * Upcoming doses and their backup reminders are created by the API's
 * dose maintenance job (every 30 minutes, and at start-up).
 */
export async function seedDemoMedicationPlans(
  prisma: PrismaService,
  options: {
    patientId: string;
    createdByUserId: string;
    /** Who marks doses: the patient's own account or a caregiver. */
    actorUserIds: string[];
    catalog: Map<string, string>;
    plans: DemoPlan[];
    seed: number;
  },
): Promise<void> {
  const random = seededRandom(options.seed);
  const today = dhakaDate();
  const now = new Date();

  const history: Prisma.DoseLogCreateManyInput[] = [];
  let latestPast: { index: number; at: number } | null = null;

  for (const demo of options.plans) {
    const startDate = addDays(today, -demo.startedDaysAgo);
    const createdAt = new Date(
      Date.parse(`${startDate}T00:00:00.000Z`) - 6 * 60 * 60_000,
    );
    const plan = await prisma.medicationPlan.create({
      data: {
        patientId: options.patientId,
        medicineId: demo.catalogKey
          ? (options.catalog.get(demo.catalogKey) ?? null)
          : null,
        displayName: demo.displayName,
        doseUnit: demo.doseUnit,
        mealTiming: demo.mealTiming,
        mealOffsetMin: demo.mealOffsetMin ?? null,
        startDate: stringToDateColumn(startDate),
        endDate:
          demo.endsInDays === undefined
            ? null
            : stringToDateColumn(addDays(today, demo.endsInDays)),
        stockQty:
          demo.stockQty === undefined
            ? null
            : new Prisma.Decimal(demo.stockQty),
        createdByUserId: options.createdByUserId,
        createdAt,
        times: {
          create: demo.times.map((time) => ({
            timeOfDay: hhmmToTimeColumn(time.time),
            dose: new Prisma.Decimal(time.dose),
            daysMask: maskFromDays(time.days),
          })),
        },
      },
      include: { times: true },
    });

    for (const slot of slotsBetween(toSchedulePlan(plan), createdAt, now)) {
      const roll = random();
      const actor =
        options.actorUserIds[
          Math.floor(random() * options.actorUserIds.length)
        ]!;
      const status = roll < 0.82 ? 'TAKEN' : roll < 0.9 ? 'SKIPPED' : 'MISSED';
      const lateMinutes = status === 'TAKEN' ? Math.floor(random() * 75) : 0;
      history.push({
        planId: plan.id,
        medicationTimeId: slot.medicationTimeId,
        scheduledFor: slot.scheduledFor,
        dose: new Prisma.Decimal(slot.dose),
        status,
        actedAt:
          status === 'MISSED'
            ? null
            : new Date(slot.scheduledFor.getTime() + lateMinutes * 60_000),
        actedByUserId: status === 'MISSED' ? null : actor,
        source: status === 'MISSED' ? null : 'APP',
      });
      const at = slot.scheduledFor.getTime();
      if (!latestPast || at > latestPast.at) {
        latestPast = { index: history.length - 1, at };
      }
    }
  }

  // Leave the most recent dose open if it was in the last two hours ("due").
  if (latestPast && now.getTime() - latestPast.at < 2 * 60 * 60_000) {
    history.splice(latestPast.index, 1);
  }
  await prisma.doseLog.createMany({ data: history });
}
