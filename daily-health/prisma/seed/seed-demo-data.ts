// Demo data for development and staging: a family that shares an elderly
// father's profile, with a month of vitals, conditions, a QR card and files.
//
//   npm run db:seed            (also runs after `prisma migrate reset`)
//
// Re-runnable: it first removes the previous demo data (only the accounts
// below and what they created), then creates everything again.
// Refuses to run when APP_ENV=production.
//
// Services are constructed by hand instead of through Nest DI: tsx (esbuild)
// does not emit decorator metadata, which Nest's constructor injection needs.
import '../../src/core/config/load-env-file.js';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { AppConfigService } from '../../src/core/config/app-config.service.js';
import { parseEnvironmentVariables } from '../../src/core/config/environment-variables.schema.js';
import { ColumnEncryptionService } from '../../src/core/crypto/column-encryption.service.js';
import { PrismaService } from '../../src/core/prisma/prisma.service.js';
import { LocalDiskStorageService } from '../../src/core/storage/local-disk-storage.service.js';
import { StoredUploadsService } from '../../src/core/uploads/stored-uploads.service.js';
import { UploadedFileProcessorService } from '../../src/core/uploads/uploaded-file-processor.service.js';
import {
  Prisma,
  type ConditionKind,
  type MedicalFileType,
  type ProfileRelation,
  type VitalContext,
  type VitalType,
} from '../../src/generated/prisma/client.js';
import { PinHashingService } from '../../src/modules/auth/pin-hashing.service.js';
import { computeVitalStatus } from '../../src/modules/health-profile/vital-status.js';
import { ReadableIdService } from '../../src/core/readable-ids/readable-id.service.js';
import { VITAL_UNITS } from '../../src/shared-contracts/health.contract.js';
import {
  removeDoctorsDemo,
  seedDoctorsDemo,
} from './seed-doctors-demo.js';
import {
  seedDemoMedicationPlans,
  seedMedicineCatalog,
} from './seed-medicine-demo.js';

/** Same PIN for every demo account; never use these accounts outside dev/staging. */
export const DEMO_PIN = '274816';

const DEMO_EMAILS = {
  rahim: 'rahim.demo@example.com',
  nasrin: 'nasrin.demo@example.com',
  /** Invited (pending) to link the father's profile to his own account. */
  karim: 'karim.demo@example.com',
} as const;

const DAY_MS = 24 * 60 * 60_000;
/** Asia/Dhaka is UTC+6 all year (no daylight saving). */
const DHAKA_OFFSET_MS = 6 * 60 * 60_000;

const config = new AppConfigService(parseEnvironmentVariables(process.env));
const prisma = new PrismaService(config);
const encryption = new ColumnEncryptionService(config);
const storedUploads = new StoredUploadsService(
  new LocalDiskStorageService(config),
  config,
);
const uploadProcessor = new UploadedFileProcessorService();
const readableIds = new ReadableIdService(prisma);

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
const random = seededRandom(20261108);
const between = (min: number, max: number) => min + random() * (max - min);
const round1 = (value: number) => Math.round(value * 10) / 10;

/** A Dhaka wall-clock time `daysAgo` days before today, as a UTC Date. */
function dhakaTime(daysAgo: number, hour: number, minute = 0): Date {
  const dhakaNow = new Date(Date.now() + DHAKA_OFFSET_MS);
  const dhakaMidnight = Date.UTC(
    dhakaNow.getUTCFullYear(),
    dhakaNow.getUTCMonth(),
    dhakaNow.getUTCDate(),
  );
  return new Date(
    dhakaMidnight -
      daysAgo * DAY_MS +
      (hour * 60 + minute) * 60_000 -
      DHAKA_OFFSET_MS,
  );
}

const calendarDate = (date: string) => new Date(`${date}T00:00:00.000Z`);

async function removePreviousDemoData(): Promise<void> {
  const emails = Object.values(DEMO_EMAILS);
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const profiles = await prisma.patientProfile.findMany({
    where: { createdByUserId: { in: userIds } },
    select: { id: true, avatarStorageKey: true },
  });
  const profileIds = profiles.map((profile) => profile.id);
  await removeDoctorsDemo(prisma, profileIds);

  const files = await prisma.medicalFile.findMany({
    where: { patientId: { in: profileIds } },
    select: { storageKey: true, mimeType: true, deletedAt: true },
  });
  for (const file of files) {
    await storedUploads.remove(file.storageKey, file.mimeType);
  }
  for (const profile of profiles) {
    if (profile.avatarStorageKey) {
      await storedUploads.remove(profile.avatarStorageKey, 'image/webp');
    }
  }

  await prisma.$transaction([
    // Times and dose logs go with the plan (FK cascade).
    prisma.medicationPlan.deleteMany({
      where: { patientId: { in: profileIds } },
    }),
    prisma.notification.deleteMany({
      where: {
        OR: [{ userId: { in: userIds } }, { patientId: { in: profileIds } }],
      },
    }),
    prisma.scheduledReminder.deleteMany({
      where: {
        OR: [{ userId: { in: userIds } }, { patientId: { in: profileIds } }],
      },
    }),
    prisma.notificationPreference.deleteMany({
      where: { userId: { in: userIds } },
    }),
    prisma.medicalFile.deleteMany({ where: { patientId: { in: profileIds } } }),
    prisma.healthCard.deleteMany({ where: { patientId: { in: profileIds } } }),
    prisma.medicalCondition.deleteMany({
      where: { patientId: { in: profileIds } },
    }),
    prisma.vitalReading.deleteMany({
      where: { patientId: { in: profileIds } },
    }),
    // Members and invites go with the profile (FK cascade).
    prisma.patientProfile.deleteMany({ where: { id: { in: profileIds } } }),
    prisma.profileInvite.deleteMany({
      where: { invitedEmail: { in: emails } },
    }),
    prisma.profileMember.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.otpCode.deleteMany({ where: { destination: { in: emails } } }),
    // Devices and sessions go with the user (FK cascade).
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
  ]);
}

async function createAccount(email: string, pinHash: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email,
      emailVerifiedAt: new Date(),
      pinHash,
      role: 'PATIENT',
      isGuest: false,
    },
  });
  return user.id;
}

interface ProfileSeed {
  fullName: string;
  gender: 'MALE' | 'FEMALE';
  dateOfBirth: string;
  bloodGroup: Prisma.PatientProfileCreateInput['bloodGroup'];
  heightCm: number;
  district: string;
}

async function createProfile(
  ownerUserId: string,
  relation: ProfileRelation,
  seed: ProfileSeed,
): Promise<{ id: string; heightCm: number }> {
  const profile = await prisma.patientProfile.create({
    data: {
      patientCode: await readableIds.next('PATIENT', seed.fullName),
      fullName: seed.fullName,
      gender: seed.gender,
      dateOfBirth: calendarDate(seed.dateOfBirth),
      bloodGroup: seed.bloodGroup,
      heightCm: new Prisma.Decimal(seed.heightCm),
      district: seed.district,
      linkedUserId: relation === 'SELF' ? ownerUserId : null,
      createdByUserId: ownerUserId,
      members: {
        create: {
          userId: ownerUserId,
          role: 'OWNER',
          relation,
          receivesAlerts: true,
        },
      },
    },
  });
  return { id: profile.id, heightCm: seed.heightCm };
}

interface VitalSeed {
  type: VitalType;
  measuredAt: Date;
  systolic?: number;
  diastolic?: number;
  value?: number;
  context?: VitalContext;
  note?: string;
}

async function addVitals(
  profile: { id: string; heightCm: number },
  recordedByUserId: string,
  vitals: VitalSeed[],
): Promise<void> {
  await prisma.vitalReading.createMany({
    data: vitals.map((vital) => ({
      patientId: profile.id,
      type: vital.type,
      systolic: vital.systolic ?? null,
      diastolic: vital.diastolic ?? null,
      value: vital.value === undefined ? null : new Prisma.Decimal(vital.value),
      unit: VITAL_UNITS[vital.type],
      context: vital.context ?? null,
      status: computeVitalStatus({
        type: vital.type,
        systolic: vital.systolic ?? null,
        diastolic: vital.diastolic ?? null,
        value: vital.value ?? null,
        context: vital.context ?? null,
        heightCm: profile.heightCm,
      }),
      note: encryption.encryptNullable(vital.note, 'health.VitalReading.note'),
      recordedByUserId,
      measuredAt: vital.measuredAt,
    })),
  });
}

async function addConditions(
  profileId: string,
  conditions: {
    name: string;
    kind: ConditionKind;
    since?: string;
    note?: string;
  }[],
): Promise<void> {
  await prisma.medicalCondition.createMany({
    data: conditions.map((condition) => ({
      patientId: profileId,
      kind: condition.kind,
      name: encryption.encrypt(condition.name, 'health.MedicalCondition.name'),
      since: condition.since ? calendarDate(condition.since) : null,
      note: encryption.encryptNullable(
        condition.note,
        'health.MedicalCondition.note',
      ),
    })),
  });
}

/** A month of the father's readings: BP morning and evening, fasting sugar, weekly weight. */
function fatherVitals(): VitalSeed[] {
  const vitals: VitalSeed[] = [];
  for (let daysAgo = 29; daysAgo >= 0; daysAgo -= 1) {
    // BP improves over the month after the dose change two weeks ago.
    const trend = daysAgo > 14 ? 8 : 0;
    for (const [hour, extra] of [
      [8, 0],
      [20, 4],
    ] as const) {
      vitals.push({
        type: 'BP',
        measuredAt: dhakaTime(daysAgo, hour, Math.floor(between(0, 40))),
        systolic: Math.round(between(126, 140) + trend + extra),
        diastolic: Math.round(between(78, 88) + trend / 2),
        ...(daysAgo === 14 && hour === 8
          ? { note: 'ডাক্তার ওষুধের ডোজ বাড়িয়েছেন' }
          : {}),
      });
    }
    vitals.push({
      type: 'GLUCOSE',
      context: 'FASTING',
      measuredAt: dhakaTime(daysAgo, 7, 30),
      value: round1(between(6.1, 7.6)),
    });
    if (daysAgo % 3 === 0) {
      vitals.push({
        type: 'GLUCOSE',
        context: 'AFTER_MEAL',
        measuredAt: dhakaTime(daysAgo, 15, 0),
        value: round1(between(8.2, 11.6)),
      });
    }
    if (daysAgo % 7 === 0) {
      vitals.push({
        type: 'WEIGHT',
        measuredAt: dhakaTime(daysAgo, 7, 15),
        value: round1(between(68.5, 70.5)),
      });
    }
    if (daysAgo % 5 === 0) {
      vitals.push({
        type: 'PULSE',
        measuredAt: dhakaTime(daysAgo, 8, 5),
        value: Math.round(between(68, 84)),
      });
    }
  }
  vitals.push({
    type: 'SPO2',
    measuredAt: dhakaTime(2, 9, 0),
    value: 97,
  });
  return vitals;
}

/** A lab report "photo": an image with report-like text, through the real upload pipeline. */
async function labReportImage(): Promise<Buffer> {
  const rows = [
    ['Haemoglobin', '13.2 g/dL', '13.0 - 17.0'],
    ['WBC', '7,400 /cumm', '4,000 - 11,000'],
    ['Platelets', '2,45,000 /cumm', '1,50,000 - 4,00,000'],
    ['HbA1c', '7.4 %', '&lt; 5.7'],
    ['Serum Creatinine', '1.1 mg/dL', '0.7 - 1.3'],
  ];
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <rect width="100%" height="160" fill="#0f5c5a"/>
  <text x="60" y="100" font-family="Arial" font-size="56" fill="#ffffff">Demo Diagnostic Centre</text>
  <text x="60" y="260" font-family="Arial" font-size="40" fill="#12302b">Laboratory Report (sample data)</text>
  <text x="60" y="330" font-family="Arial" font-size="30" fill="#546b65">Patient: Abdul Karim   Age: 68   Sex: M</text>
  ${rows
    .map(
      ([test, result, range], index) => `
  <text x="60" y="${460 + index * 90}" font-family="Arial" font-size="32" fill="#12302b">${test}</text>
  <text x="520" y="${460 + index * 90}" font-family="Arial" font-size="32" fill="#12302b">${result}</text>
  <text x="860" y="${460 + index * 90}" font-family="Arial" font-size="28" fill="#546b65">${range}</text>`,
    )
    .join('')}
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

/** A tiny valid one-page PDF standing in for a scanned prescription. */
function prescriptionPdf(): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null, // content stream, filled below
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const content =
    'BT /F1 22 Tf 60 780 Td (Prescription - sample data) Tj 0 -40 Td /F1 14 Tf (Tab. Amlodipine 5 mg   1+0+1   30 days) Tj 0 -24 Td (Tab. Metformin 500 mg   1+0+1   after meal) Tj ET';
  objects[3] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

async function addFile(
  profileId: string,
  uploadedByUserId: string,
  file: Buffer,
  fields: {
    type: MedicalFileType;
    title: string;
    reportDate: string;
    uploadedDaysAgo: number;
  },
): Promise<void> {
  const processed = await uploadProcessor.process(file, { allowPdf: true });
  const storageKey = await storedUploads.store(processed, 'private');
  await prisma.medicalFile.create({
    data: {
      patientId: profileId,
      type: fields.type,
      title: encryption.encrypt(fields.title, 'records.MedicalFile.title'),
      storageKey,
      mimeType: processed.mimeType,
      sizeBytes: processed.data.length,
      reportDate: calendarDate(fields.reportDate),
      uploadedByUserId,
      createdAt: dhakaTime(fields.uploadedDaysAgo, 18),
    },
  });
}

async function seed(): Promise<void> {
  if (config.isProduction) {
    throw new Error('Refusing to seed demo data with APP_ENV=production');
  }

  await removePreviousDemoData();

  const pinHash = await new PinHashingService().hash(DEMO_PIN);
  const rahimId = await createAccount(DEMO_EMAILS.rahim, pinHash);
  const nasrinId = await createAccount(DEMO_EMAILS.nasrin, pinHash);

  // Each child has their own profile.
  const rahim = await createProfile(rahimId, 'SELF', {
    fullName: 'রহিম উদ্দিন',
    gender: 'MALE',
    dateOfBirth: '1992-03-14',
    bloodGroup: 'O_POS',
    heightCm: 172,
    district: 'ঢাকা',
  });
  const nasrin = await createProfile(nasrinId, 'SELF', {
    fullName: 'নাসরিন আক্তার',
    gender: 'FEMALE',
    dateOfBirth: '1995-11-02',
    bloodGroup: 'B_POS',
    heightCm: 158,
    district: 'চট্টগ্রাম',
  });

  // The father's profile: Rahim created it (OWNER); Nasrin helps as CAREGIVER
  // and also gets missed-dose alerts.
  const father = await createProfile(rahimId, 'FATHER', {
    fullName: 'আব্দুল করিম',
    gender: 'MALE',
    dateOfBirth: '1958-08-02',
    bloodGroup: 'B_POS',
    heightCm: 165,
    district: 'কুমিল্লা',
  });
  await prisma.profileMember.create({
    data: {
      profileId: father.id,
      userId: nasrinId,
      role: 'CAREGIVER',
      relation: 'FATHER',
      receivesAlerts: true,
    },
  });
  // The father is invited to link his own new phone to the profile.
  await prisma.profileInvite.create({
    data: {
      profileId: father.id,
      invitedEmail: DEMO_EMAILS.karim,
      role: 'OWNER',
      relation: 'SELF',
      invitedByUserId: rahimId,
      expiresAt: new Date(Date.now() + 7 * DAY_MS),
    },
  });

  await addVitals(father, rahimId, fatherVitals());
  await addConditions(father.id, [
    {
      name: 'উচ্চ রক্তচাপ',
      kind: 'CHRONIC',
      since: '2015-06-01',
      note: 'অ্যামলোডিপিন ৫ মি.গ্রা. দিনে দুবার',
    },
    {
      name: 'ডায়াবেটিস (টাইপ ২)',
      kind: 'CHRONIC',
      since: '2018-02-10',
      note: 'মেটফরমিন ৫০০ মি.গ্রা., খাবারের পরে',
    },
    { name: 'পেনিসিলিন', kind: 'ALLERGY', note: 'শরীরে র‍্যাশ হয়' },
    { name: 'চোখের ছানি অপারেশন', kind: 'SURGERY', since: '2021-09-15' },
  ]);
  const fatherCardToken = randomBytes(24).toString('base64url');
  await prisma.healthCard.create({
    data: {
      patientId: father.id,
      qrToken: fatherCardToken,
      isActive: true,
    },
  });
  await addFile(father.id, nasrinId, await labReportImage(), {
    type: 'LAB_REPORT',
    title: 'CBC ও HbA1c রিপোর্ট',
    reportDate: dhakaTime(10, 12).toISOString().slice(0, 10),
    uploadedDaysAgo: 10,
  });
  await addFile(father.id, rahimId, prescriptionPdf(), {
    type: 'PRESCRIPTION_SCAN',
    title: 'ডা. হাসানের প্রেসক্রিপশন',
    reportDate: dhakaTime(14, 12).toISOString().slice(0, 10),
    uploadedDaysAgo: 14,
  });

  await addVitals(rahim, rahimId, [
    {
      type: 'BP',
      measuredAt: dhakaTime(3, 21),
      systolic: 118,
      diastolic: 76,
    },
    { type: 'WEIGHT', measuredAt: dhakaTime(3, 7), value: 74.5 },
    { type: 'PULSE', measuredAt: dhakaTime(3, 21, 5), value: 72 },
  ]);
  await addConditions(rahim.id, [
    { name: 'ধুলাবালি', kind: 'ALLERGY', note: 'হাঁচি ও শ্বাসকষ্ট' },
  ]);

  await addVitals(nasrin, nasrinId, [
    { type: 'WEIGHT', measuredAt: dhakaTime(1, 8), value: 56 },
    {
      type: 'GLUCOSE',
      context: 'RANDOM',
      measuredAt: dhakaTime(1, 13),
      value: 6.4,
    },
  ]);

  const catalog = await seedMedicineCatalog(prisma);
  await seedDemoMedicationPlans(prisma, {
    patientId: father.id,
    createdByUserId: rahimId,
    actorUserIds: [rahimId, nasrinId],
    catalog,
    seed: 4242,
    plans: [
      {
        catalogKey: 'Amdocal 5 mg',
        displayName: 'Amdocal 5 mg',
        doseUnit: 'TABLET',
        mealTiming: 'AFTER_MEAL',
        startedDaysAgo: 10,
        times: [
          { time: '08:00', dose: 1 },
          { time: '20:00', dose: 1 },
        ],
        stockQty: 24,
      },
      {
        catalogKey: 'Comet 500 mg',
        displayName: 'Comet 500 mg',
        doseUnit: 'TABLET',
        mealTiming: 'AFTER_MEAL',
        mealOffsetMin: 15,
        startedDaysAgo: 10,
        times: [
          { time: '08:30', dose: 1 },
          { time: '21:00', dose: 1 },
        ],
        stockQty: 30,
      },
      {
        catalogKey: 'Atova 10 mg',
        displayName: 'Atova 10 mg',
        doseUnit: 'TABLET',
        mealTiming: 'ANY',
        startedDaysAgo: 10,
        times: [{ time: '22:00', dose: 1 }],
        // Low on purpose: shows the refill alert.
        stockQty: 3,
      },
      {
        catalogKey: 'Ecosprin 75 mg',
        displayName: 'Ecosprin 75 mg',
        doseUnit: 'TABLET',
        mealTiming: 'AFTER_MEAL',
        startedDaysAgo: 10,
        times: [{ time: '14:00', dose: 1 }],
      },
    ],
  });
  await seedDemoMedicationPlans(prisma, {
    patientId: rahim.id,
    createdByUserId: rahimId,
    actorUserIds: [rahimId],
    catalog,
    seed: 777,
    plans: [
      {
        catalogKey: 'Fexo 120 mg',
        displayName: 'Fexo 120 mg',
        doseUnit: 'TABLET',
        mealTiming: 'ANY',
        startedDaysAgo: 3,
        endsInDays: 7,
        times: [{ time: '21:30', dose: 1 }],
      },
    ],
  });

  const providerLines = await seedDoctorsDemo(prisma, readableIds, {
    pinHash,
    platformFeePercent: config.payments.platformFeePercent,
    fatherId: father.id,
    rahimProfileId: rahim.id,
    rahimId,
    nasrinId,
  });

  // The father's last chamber visit got a prescription (one tap → medicine alarms in the app).
  const visit = await prisma.appointment.findFirst({
    where: { patientId: father.id, status: 'COMPLETED' },
    orderBy: { scheduledAt: 'desc' },
  });
  if (visit) {
    const doctor = await prisma.provider.findUniqueOrThrow({ where: { id: visit.providerId } });
    await prisma.prescription.create({
      data: {
        code: await readableIds.nextReference('PRESCRIPTION', prisma, visit.scheduledAt),
        patientId: father.id,
        providerId: doctor.id,
        providerUserId: doctor.userId,
        appointmentId: visit.id,
        chiefComplaint: encryption.encrypt('মাথা ঘোরা, মাঝে মাঝে বুক ধড়ফড়', 'prescriptions.Prescription.chiefComplaint'),
        diagnosis: encryption.encrypt('উচ্চ রক্তচাপ (নিয়ন্ত্রণে নেই)', 'prescriptions.Prescription.diagnosis'),
        advice: encryption.encrypt('লবণ কম খাবেন। প্রতিদিন ৩০ মিনিট হাঁটবেন। প্রতি সপ্তাহে প্রেশার মেপে অ্যাপে লিখে রাখবেন।', 'prescriptions.Prescription.advice'),
        followUpAfterDays: 30,
        status: 'ISSUED',
        issuedAt: visit.scheduledAt,
        items: {
          create: [
            { position: 0, medicineName: 'Bisocor', strength: '5 mg', form: 'TABLET', doseUnit: 'TABLET', dosePattern: '1+0+0', mealTiming: 'AFTER_MEAL', durationDays: null, instruction: 'নিয়মিত, বন্ধ করবেন না' },
            { position: 1, medicineName: 'Anril', strength: '25 mg', form: 'TABLET', doseUnit: 'TABLET', dosePattern: '½+0+½', mealTiming: 'AFTER_MEAL', durationDays: 30 },
            { position: 2, medicineName: 'Pantonix', strength: '20 mg', form: 'TABLET', doseUnit: 'TABLET', dosePattern: '1+0+1', mealTiming: 'BEFORE_MEAL', durationDays: 14, instruction: 'খাবারের ৩০ মিনিট আগে' },
          ],
        },
        tests: {
          create: [
            { position: 0, testName: 'Lipid profile', note: 'খালি পেটে' },
            { position: 1, testName: 'Serum creatinine' },
          ],
        },
      },
    });
  }

  const codes = await prisma.patientProfile.findMany({
    where: { id: { in: [rahim.id, nasrin.id, father.id] } },
    select: { fullName: true, patientCode: true },
  });
  console.log('Demo data seeded. Log in with PIN', DEMO_PIN);
  console.log(
    `  ${DEMO_EMAILS.rahim}   owner of his own and his father's profile`,
  );
  console.log(`  ${DEMO_EMAILS.nasrin}  caregiver on her father's profile`);
  for (const profile of codes) {
    console.log(`  ${profile.patientCode}  ${profile.fullName}`);
  }
  console.log(
    `  Father's QR card: ${config.healthCardBaseUrl}/${fatherCardToken}`,
  );
  console.log('Providers and staff (web panel), same PIN:');
  for (const line of providerLines) console.log(line);
}

try {
  await seed();
} finally {
  await prisma.$disconnect();
}
