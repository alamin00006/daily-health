// Doctors and appointments demo data, called from seed-demo-data.ts:
// specialties, hospitals, verified providers with chambers and online
// sessions (enough female doctors for the women's-health queue), one doctor
// waiting for verification, an admin, and the family's appointments.
//
// Provider accounts use the same demo password. Names, BMDC numbers and hospitals
// are sample data for development only.
import { Prisma } from '../../src/generated/prisma/client.js';
import type { PrismaService } from '../../src/core/prisma/prisma.service.js';
import type { ReadableIdService } from '../../src/core/readable-ids/readable-id.service.js';
import {
  addDays,
  dhakaDate,
  dhakaWallTimeToUtc,
  hhmmToTimeColumn,
  stringToDateColumn,
  weekdayOf,
} from '../../src/common/time/dhaka-time.js';
import type {
  ConsultationMode,
  ProviderType,
} from '../../src/shared-contracts/doctors.contract.js';

export const PROVIDER_DEMO_EMAILS = {
  admin: 'admin.demo@example.com',
  farhana: 'dr.farhana.demo@example.com',
  mahbub: 'dr.mahbub.demo@example.com',
  sabrina: 'dr.sabrina.demo@example.com',
  tanvir: 'dr.tanvir.demo@example.com',
  nusrat: 'dr.nusrat.demo@example.com',
  arif: 'dr.arif.demo@example.com',
  shirin: 'nutritionist.shirin.demo@example.com',
  kamal: 'physio.kamal.demo@example.com',
} as const;

const SPECIALTIES: {
  slug: string;
  nameBn: string;
  nameEn: string;
  iconName: string;
  forType: ProviderType;
}[] = [
  { slug: 'medicine', nameBn: 'মেডিসিন', nameEn: 'Medicine', iconName: 'stethoscope', forType: 'DOCTOR' },
  { slug: 'cardiology', nameBn: 'হৃদরোগ', nameEn: 'Cardiology', iconName: 'heart-pulse', forType: 'DOCTOR' },
  { slug: 'gynae-obs', nameBn: 'স্ত্রীরোগ ও প্রসূতি', nameEn: 'Gynae & Obs', iconName: 'baby', forType: 'DOCTOR' },
  { slug: 'pediatrics', nameBn: 'শিশুরোগ', nameEn: 'Pediatrics', iconName: 'smile', forType: 'DOCTOR' },
  { slug: 'diabetes-endocrine', nameBn: 'ডায়াবেটিস ও হরমোন', nameEn: 'Diabetes & Endocrine', iconName: 'droplet', forType: 'DOCTOR' },
  { slug: 'dermatology', nameBn: 'চর্ম ও যৌন', nameEn: 'Dermatology', iconName: 'sparkles', forType: 'DOCTOR' },
  { slug: 'orthopedics', nameBn: 'হাড় ও জোড়া', nameEn: 'Orthopedics', iconName: 'bone', forType: 'DOCTOR' },
  { slug: 'neurology', nameBn: 'স্নায়ুরোগ', nameEn: 'Neurology', iconName: 'brain', forType: 'DOCTOR' },
  { slug: 'psychiatry', nameBn: 'মানসিক স্বাস্থ্য', nameEn: 'Psychiatry', iconName: 'brain-circuit', forType: 'DOCTOR' },
  { slug: 'ent', nameBn: 'নাক কান গলা', nameEn: 'ENT', iconName: 'ear', forType: 'DOCTOR' },
  { slug: 'eye', nameBn: 'চক্ষু', nameEn: 'Eye', iconName: 'eye', forType: 'DOCTOR' },
  { slug: 'gastroenterology', nameBn: 'পরিপাকতন্ত্র ও লিভার', nameEn: 'Gastroenterology', iconName: 'activity', forType: 'DOCTOR' },
  { slug: 'nephrology', nameBn: 'কিডনি', nameEn: 'Nephrology', iconName: 'filter', forType: 'DOCTOR' },
  { slug: 'dental', nameBn: 'দন্ত', nameEn: 'Dental', iconName: 'smile-plus', forType: 'DOCTOR' },
  { slug: 'clinical-nutrition', nameBn: 'ক্লিনিক্যাল পুষ্টি', nameEn: 'Clinical Nutrition', iconName: 'apple', forType: 'NUTRITIONIST' },
  { slug: 'weight-management', nameBn: 'ওজন নিয়ন্ত্রণ', nameEn: 'Weight Management', iconName: 'scale', forType: 'NUTRITIONIST' },
  { slug: 'physiotherapy', nameBn: 'ফিজিওথেরাপি', nameEn: 'Physiotherapy', iconName: 'person-standing', forType: 'PHYSIO' },
];

const HOSPITALS = {
  labaid: {
    name: 'ল্যাবএইড স্পেশালাইজড হাসপাতাল',
    address: 'বাড়ি ১, রোড ৪, ধানমন্ডি',
    district: 'ঢাকা',
    lat: 23.7417,
    lng: 90.3826,
    phone: '+8801766660000',
  },
  square: {
    name: 'স্কয়ার হাসপাতাল',
    address: '১৮/এফ, পশ্চিম পান্থপথ',
    district: 'ঢাকা',
    lat: 23.7528,
    lng: 90.3816,
    phone: '+8801713141414',
  },
  popular: {
    name: 'পপুলার ডায়াগনস্টিক সেন্টার',
    address: 'বাড়ি ১৬, রোড ২, ধানমন্ডি',
    district: 'ঢাকা',
    lat: 23.7386,
    lng: 90.3832,
    phone: '+8801791000000',
  },
  comilla: {
    name: 'কুমিল্লা মেডিকেল সেন্টার',
    address: 'কান্দিরপাড়, কুমিল্লা সদর',
    district: 'কুমিল্লা',
    lat: 23.4607,
    lng: 91.1809,
    phone: '+8801819000000',
  },
} as const;
type HospitalKey = keyof typeof HOSPITALS;

interface SessionSeed {
  mode: ConsultationMode;
  /** IN_PERSON only. */
  hospital?: HospitalKey;
  days: number[];
  start: string;
  end: string;
  slotMinutes?: number;
  maxPatients?: number;
}

interface ProviderSeed {
  key: keyof typeof PROVIDER_DEMO_EMAILS;
  type: ProviderType;
  gender: 'MALE' | 'FEMALE';
  displayName: string;
  designation: string;
  qualifications: string;
  bmdcNo?: string;
  experienceYears: number;
  bio: string;
  specialties: string[];
  verified: boolean;
  videoFee?: number;
  chatFee?: number;
  homeVisitFee?: number;
  acceptsQuickConsult?: boolean;
  isOnline?: boolean;
  /** Chamber fee per hospital. */
  chambers?: Partial<Record<HospitalKey, { fee: number; followUpFee?: number; room?: string }>>;
  sessions: SessionSeed[];
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const SAT_TO_THU = [6, 0, 1, 2, 3, 4];

const PROVIDERS: ProviderSeed[] = [
  {
    key: 'mahbub',
    type: 'DOCTOR',
    gender: 'MALE',
    displayName: 'মাহবুবুর রহমান',
    designation: 'সহযোগী অধ্যাপক, কার্ডিওলজি বিভাগ',
    qualifications: 'MBBS, FCPS (Medicine), MD (Cardiology)',
    bmdcNo: 'A-31245',
    experienceYears: 18,
    bio: 'উচ্চ রক্তচাপ, হার্ট ফেইলিউর ও বয়স্কদের হৃদরোগের চিকিৎসায় অভিজ্ঞ।',
    specialties: ['cardiology', 'medicine'],
    verified: true,
    videoFee: 1000,
    chambers: { square: { fee: 1200, followUpFee: 800, room: 'রুম ৪১২, ৪র্থ তলা' } },
    sessions: [
      { mode: 'IN_PERSON', hospital: 'square', days: [0, 1, 2, 3, 4], start: '18:00', end: '21:00', maxPatients: 25 },
      { mode: 'VIDEO', days: [5], start: '10:00', end: '12:00', slotMinutes: 20 },
    ],
  },
  {
    key: 'farhana',
    type: 'DOCTOR',
    gender: 'FEMALE',
    displayName: 'ফারহানা ইসলাম',
    designation: 'কনসালট্যান্ট, মেডিসিন',
    qualifications: 'MBBS, FCPS (Medicine)',
    bmdcNo: 'A-45871',
    experienceYears: 11,
    bio: 'জ্বর, ডায়াবেটিস, উচ্চ রক্তচাপ ও সাধারণ অসুখের চিকিৎসা করেন।',
    specialties: ['medicine', 'diabetes-endocrine'],
    verified: true,
    videoFee: 500,
    chatFee: 300,
    acceptsQuickConsult: true,
    isOnline: true,
    chambers: { labaid: { fee: 800, followUpFee: 500, room: 'OPD-৩' } },
    sessions: [
      { mode: 'IN_PERSON', hospital: 'labaid', days: [6, 1, 3], start: '17:00', end: '21:00', maxPatients: 30 },
      { mode: 'VIDEO', days: [0, 2, 4], start: '20:00', end: '22:00', slotMinutes: 15 },
      { mode: 'CHAT', days: EVERY_DAY, start: '09:00', end: '11:00', slotMinutes: 15 },
    ],
  },
  {
    key: 'sabrina',
    type: 'DOCTOR',
    gender: 'FEMALE',
    displayName: 'সাবরিনা চৌধুরী',
    designation: 'সহকারী অধ্যাপক, গাইনি ও অবস',
    qualifications: 'MBBS, FCPS (Gynae & Obs)',
    bmdcNo: 'A-52310',
    experienceYears: 13,
    bio: 'গর্ভকালীন যত্ন, অনিয়মিত মাসিক ও বন্ধ্যাত্ব নিয়ে পরামর্শ দেন।',
    specialties: ['gynae-obs'],
    verified: true,
    videoFee: 700,
    chatFee: 300,
    acceptsQuickConsult: true,
    isOnline: true,
    chambers: { popular: { fee: 1000, followUpFee: 700, room: 'চেম্বার ৭' } },
    sessions: [
      { mode: 'IN_PERSON', hospital: 'popular', days: SAT_TO_THU, start: '16:00', end: '19:00', maxPatients: 20 },
      { mode: 'VIDEO', days: EVERY_DAY, start: '21:00', end: '22:30', slotMinutes: 15 },
    ],
  },
  {
    key: 'tanvir',
    type: 'DOCTOR',
    gender: 'MALE',
    displayName: 'তানভীর আহমেদ',
    designation: 'শিশু বিশেষজ্ঞ',
    qualifications: 'MBBS, DCH, FCPS (Paediatrics)',
    bmdcNo: 'A-60412',
    experienceYears: 9,
    bio: 'নবজাতক ও শিশুদের জ্বর, শ্বাসকষ্ট, পুষ্টি ও টিকা নিয়ে পরামর্শ।',
    specialties: ['pediatrics'],
    verified: true,
    homeVisitFee: 1500,
    chambers: { comilla: { fee: 600, followUpFee: 400 } },
    sessions: [
      { mode: 'IN_PERSON', hospital: 'comilla', days: [1, 3, 5], start: '10:00', end: '13:00', maxPatients: 30 },
      { mode: 'HOME_VISIT', days: [6], start: '15:00', end: '18:00', slotMinutes: 60 },
    ],
  },
  {
    key: 'nusrat',
    type: 'DOCTOR',
    gender: 'FEMALE',
    displayName: 'নুসরাত জাহান',
    designation: 'চর্মরোগ বিশেষজ্ঞ',
    qualifications: 'MBBS, DDV',
    bmdcNo: 'A-71028',
    experienceYears: 7,
    bio: 'ব্রণ, একজিমা, চুল পড়া ও এলার্জির চিকিৎসা অনলাইনে।',
    specialties: ['dermatology'],
    verified: true,
    videoFee: 600,
    chatFee: 300,
    acceptsQuickConsult: true,
    sessions: [
      { mode: 'VIDEO', days: EVERY_DAY, start: '19:00', end: '21:00', slotMinutes: 15 },
      { mode: 'CHAT', days: SAT_TO_THU, start: '14:00', end: '16:00', slotMinutes: 15 },
    ],
  },
  {
    key: 'arif',
    type: 'DOCTOR',
    gender: 'MALE',
    displayName: 'আরিফ হোসেন',
    designation: 'অর্থোপেডিক সার্জন',
    qualifications: 'MBBS, MS (Orthopaedics)',
    bmdcNo: 'A-58844',
    experienceYears: 10,
    bio: 'হাড় ভাঙা, কোমর ও হাঁটু ব্যথার চিকিৎসা।',
    specialties: ['orthopedics'],
    // Waits for an admin in the panel's verification queue.
    verified: false,
    chambers: { labaid: { fee: 1000 } },
    sessions: [
      { mode: 'IN_PERSON', hospital: 'labaid', days: [0, 2], start: '15:00', end: '18:00', maxPatients: 20 },
    ],
  },
  {
    key: 'shirin',
    type: 'NUTRITIONIST',
    gender: 'FEMALE',
    displayName: 'শিরিন আক্তার',
    designation: 'চিফ ক্লিনিক্যাল নিউট্রিশনিস্ট',
    qualifications: 'BSc, MSc (Food & Nutrition), CCND',
    experienceYears: 12,
    bio: 'ডায়াবেটিস, কিডনি রোগ ও ওজন কমানোর জন্য ব্যক্তিগত ডায়েট চার্ট।',
    specialties: ['clinical-nutrition', 'weight-management'],
    verified: true,
    videoFee: 800,
    chambers: { labaid: { fee: 1000, followUpFee: 600, room: 'নিউট্রিশন কর্নার' } },
    sessions: [
      { mode: 'IN_PERSON', hospital: 'labaid', days: [0, 2], start: '15:00', end: '18:00', maxPatients: 12 },
      { mode: 'VIDEO', days: SAT_TO_THU, start: '10:00', end: '13:00', slotMinutes: 30 },
    ],
  },
  {
    key: 'kamal',
    type: 'PHYSIO',
    gender: 'MALE',
    displayName: 'কামাল হোসেন',
    designation: 'সিনিয়র ফিজিওথেরাপিস্ট',
    qualifications: 'BPT, MPT (Musculoskeletal)',
    experienceYears: 8,
    bio: 'কোমর, ঘাড় ও হাঁটু ব্যথা, স্ট্রোক-পরবর্তী থেরাপি; বাসায় গিয়েও সেবা দেন।',
    specialties: ['physiotherapy'],
    verified: true,
    homeVisitFee: 1200,
    chambers: { square: { fee: 800 } },
    sessions: [
      { mode: 'IN_PERSON', hospital: 'square', days: [6, 1, 3], start: '09:00', end: '12:00', maxPatients: 12 },
      { mode: 'HOME_VISIT', days: [0, 2, 4], start: '15:00', end: '19:00', slotMinutes: 60 },
    ],
  },
];

export interface DoctorsDemoInput {
  passwordHash: string;
  /** PLATFORM_FEE_PERCENT, for the seeded earnings. */
  platformFeePercent: number;
  fatherId: string;
  rahimProfileId: string;
  rahimId: string;
  nasrinId: string;
}

/** Removes demo provider accounts and what they own (called before re-seeding). */
export async function removeDoctorsDemo(
  prisma: PrismaService,
  patientIds: string[],
): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(PROVIDER_DEMO_EMAILS) } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  const providers = await prisma.provider.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const providerIds = providers.map((p) => p.id);
  const appointmentFilter = {
    OR: [{ patientId: { in: patientIds } }, { providerId: { in: providerIds } }],
  };
  const appointmentIds = (
    await prisma.appointment.findMany({ where: appointmentFilter, select: { id: true } })
  ).map((a) => a.id);
  const followUpIds = (
    await prisma.followUpReminder.findMany({
      where: { patientId: { in: patientIds } },
      select: { id: true },
    })
  ).map((f) => f.id);

  const paymentFilter = {
    OR: [{ patientId: { in: patientIds } }, { providerId: { in: providerIds } }],
  };
  const consultationIds = (
    await prisma.consultation.findMany({
      where: { OR: [{ patientId: { in: patientIds } }, { providerId: { in: providerIds } }] },
      select: { id: true },
    })
  ).map((c) => c.id);
  await prisma.$transaction([
    // Items and tests go with the prescription (FK cascade).
    prisma.prescription.deleteMany({
      where: { OR: [{ patientId: { in: patientIds } }, { providerId: { in: providerIds } }] },
    }),
    // Messages and participants go with the conversation; queue entries with the consultation.
    prisma.conversation.deleteMany({ where: { consultationId: { in: consultationIds } } }),
    prisma.consultation.deleteMany({ where: { id: { in: consultationIds } } }),
    // Earnings, refunds and payouts before their payments (FK restrict).
    prisma.providerEarning.deleteMany({
      where: { OR: [{ providerId: { in: providerIds } }, { payment: paymentFilter }] },
    }),
    prisma.refund.deleteMany({ where: { payment: paymentFilter } }),
    prisma.payout.deleteMany({ where: { providerId: { in: providerIds } } }),
    prisma.providerPayoutAccount.deleteMany({ where: { providerId: { in: providerIds } } }),
    prisma.payment.deleteMany({ where: paymentFilter }),
    prisma.scheduledReminder.deleteMany({
      where: { refId: { in: [...appointmentIds, ...followUpIds] } },
    }),
    prisma.notification.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.followUpReminder.deleteMany({ where: { patientId: { in: patientIds } } }),
    // Status logs go with the appointment (FK cascade).
    prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } }),
    prisma.favoriteProvider.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.review.deleteMany({ where: { patientId: { in: patientIds } } }),
    // Chambers, schedules, documents, reviews go with the provider (FK cascade).
    prisma.provider.deleteMany({ where: { id: { in: providerIds } } }),
    prisma.session.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
  ]);
}

/** Next date (from today, inclusive) on one of these weekdays. */
function nextDateOn(days: number[], fromOffset = 0): string {
  for (let offset = fromOffset; offset < fromOffset + 7; offset += 1) {
    const date = addDays(dhakaDate(), offset);
    if (days.includes(weekdayOf(date))) return date;
  }
  throw new Error('No matching weekday');
}

/** Last date before today on one of these weekdays, at least `minDaysAgo` back. */
function lastDateOn(days: number[], minDaysAgo: number): string {
  for (let offset = minDaysAgo; offset < minDaysAgo + 7; offset += 1) {
    const date = addDays(dhakaDate(), -offset);
    if (days.includes(weekdayOf(date))) return date;
  }
  throw new Error('No matching weekday');
}

export async function seedDoctorsDemo(
  prisma: PrismaService,
  readableIds: ReadableIdService,
  input: DoctorsDemoInput,
): Promise<string[]> {
  // Shared catalogs: upserted, never deleted.
  const specialtyIds = new Map<string, string>();
  for (const [index, specialty] of SPECIALTIES.entries()) {
    const row = await prisma.specialty.upsert({
      where: { slug: specialty.slug },
      create: { ...specialty, sortOrder: index },
      update: { ...specialty, sortOrder: index },
    });
    specialtyIds.set(specialty.slug, row.id);
  }
  const hospitalIds = new Map<HospitalKey, string>();
  for (const [key, hospital] of Object.entries(HOSPITALS) as [HospitalKey, (typeof HOSPITALS)[HospitalKey]][]) {
    const row = await prisma.hospital.upsert({
      where: { name_district: { name: hospital.name, district: hospital.district } },
      create: { ...hospital, lat: new Prisma.Decimal(hospital.lat), lng: new Prisma.Decimal(hospital.lng) },
      update: { address: hospital.address, phone: hospital.phone },
    });
    hospitalIds.set(key, row.id);
  }

  const admin = await prisma.user.create({
    data: {
      email: PROVIDER_DEMO_EMAILS.admin,
      emailVerifiedAt: new Date(),
      passwordHash: input.passwordHash,
      role: 'ADMIN',
    },
  });

  const providerIds = new Map<ProviderSeed['key'], string>();
  const scheduleIds = new Map<string, string>();
  const lines: string[] = [];
  for (const seed of PROVIDERS) {
    const user = await prisma.user.create({
      data: {
        email: PROVIDER_DEMO_EMAILS[seed.key],
        emailVerifiedAt: new Date(),
        passwordHash: input.passwordHash,
        role: seed.type,
      },
    });
    const provider = await prisma.provider.create({
      data: {
        userId: user.id,
        providerCode: await readableIds.next(seed.type, seed.displayName),
        type: seed.type,
        gender: seed.gender,
        displayName: seed.displayName,
        designation: seed.designation,
        qualifications: seed.qualifications,
        bmdcNo: seed.bmdcNo ?? null,
        experienceYears: seed.experienceYears,
        bio: seed.bio,
        verificationStatus: seed.verified ? 'VERIFIED' : 'PENDING',
        verifiedAt: seed.verified ? new Date() : null,
        verifiedByUserId: seed.verified ? admin.id : null,
        videoFee: seed.videoFee === undefined ? null : new Prisma.Decimal(seed.videoFee),
        chatFee: seed.chatFee === undefined ? null : new Prisma.Decimal(seed.chatFee),
        homeVisitFee: seed.homeVisitFee === undefined ? null : new Prisma.Decimal(seed.homeVisitFee),
        offersHomeVisit: seed.homeVisitFee !== undefined,
        acceptsQuickConsult: seed.acceptsQuickConsult ?? false,
        isOnline: seed.isOnline ?? false,
        lastOnlineAt: seed.isOnline ? new Date() : null,
        specialties: {
          create: seed.specialties.map((slug) => ({ specialtyId: specialtyIds.get(slug)! })),
        },
      },
    });
    providerIds.set(seed.key, provider.id);

    const chamberIds = new Map<HospitalKey, string>();
    for (const [hospital, chamber] of Object.entries(seed.chambers ?? {}) as [HospitalKey, { fee: number; followUpFee?: number; room?: string }][]) {
      const row = await prisma.chamber.create({
        data: {
          providerId: provider.id,
          hospitalId: hospitalIds.get(hospital)!,
          room: chamber.room ?? null,
          fee: new Prisma.Decimal(chamber.fee),
          followUpFee: chamber.followUpFee === undefined ? null : new Prisma.Decimal(chamber.followUpFee),
        },
      });
      chamberIds.set(hospital, row.id);
    }
    for (const session of seed.sessions) {
      for (const day of session.days) {
        const row = await prisma.schedule.create({
          data: {
            providerId: provider.id,
            chamberId: session.hospital ? chamberIds.get(session.hospital)! : null,
            mode: session.mode,
            dayOfWeek: day,
            startTime: hhmmToTimeColumn(session.start),
            endTime: hhmmToTimeColumn(session.end),
            slotMinutes: session.mode === 'IN_PERSON' ? null : (session.slotMinutes ?? 15),
            maxPatients: session.mode === 'IN_PERSON' ? (session.maxPatients ?? 20) : null,
          },
        });
        scheduleIds.set(`${seed.key}:${session.mode}:${day}`, row.id);
      }
    }
    lines.push(
      `  ${PROVIDER_DEMO_EMAILS[seed.key].padEnd(38)} ${provider.providerCode}  ${seed.displayName}${seed.verified ? '' : ' (waiting for verification)'}`,
    );
  }

  // --- The family's appointments --------------------------------------------
  const mahbub = PROVIDERS.find((p) => p.key === 'mahbub')!;
  const mahbubChamber = await prisma.chamber.findFirstOrThrow({
    where: { providerId: providerIds.get('mahbub')! },
  });
  const chamberDays = mahbub.sessions[0]!.days;
  const minutesPerSerial = Math.floor((3 * 60) / 25);

  async function inPerson(
    date: string,
    serialNo: number,
    status: 'COMPLETED' | 'CONFIRMED',
    kind: 'NEW' | 'FOLLOW_UP',
    parentAppointmentId: string | null,
    fee: number,
  ) {
    const scheduledAt = dhakaWallTimeToUtc(date, '18:00');
    const appointment = await prisma.appointment.create({
      data: {
        code: await readableIds.nextBookingCode(),
        patientId: input.fatherId,
        bookedByUserId: input.rahimId,
        providerId: providerIds.get('mahbub')!,
        chamberId: mahbubChamber.id,
        scheduleId: scheduleIds.get(`mahbub:IN_PERSON:${weekdayOf(date)}`)!,
        mode: 'IN_PERSON',
        kind,
        parentAppointmentId,
        sessionDate: stringToDateColumn(date),
        scheduledAt,
        sessionEndAt: dhakaWallTimeToUtc(date, '21:00'),
        durationMin: minutesPerSerial,
        serialNo,
        status,
        confirmedAt: new Date(scheduledAt.getTime() - 3 * 24 * 60 * 60_000),
        reason: kind === 'NEW' ? 'বুক ধড়ফড় আর হাঁটলে হাঁপিয়ে যান' : 'ফলো-আপ: রিপোর্ট দেখানো',
        fee: new Prisma.Decimal(fee),
        history: {
          create: [
            { fromStatus: null, toStatus: 'CONFIRMED', changedByUserId: input.rahimId },
            ...(status === 'COMPLETED'
              ? [{ fromStatus: 'CONFIRMED' as const, toStatus: 'COMPLETED' as const, changedByUserId: null }]
              : []),
          ],
        },
      },
    });
    return appointment;
  }

  /** The bKash payment a seeded paid booking would have, with the doctor's earning. */
  async function paid(appointment: { id: string; patientId: string; providerId: string; fee: Prisma.Decimal; code: string; createdAt: Date }, payerUserId: string, description: string) {
    const fee = appointment.fee.mul(input.platformFeePercent).div(100).toDecimalPlaces(2);
    await prisma.payment.create({
      data: {
        invoiceNo: await readableIds.nextReference('PAYMENT'),
        payerUserId,
        patientId: appointment.patientId,
        purpose: 'APPOINTMENT',
        referenceId: appointment.id,
        providerId: appointment.providerId,
        description: `${description} (${appointment.code})`,
        amount: appointment.fee,
        listAmount: appointment.fee,
        gateway: 'SHURJOPAY',
        method: 'BKASH',
        status: 'SUCCESS',
        gatewayPaymentId: `seed-${appointment.id}`,
        gatewayTrxId: `SEED${appointment.code.replace(/-/g, '')}`,
        paidAt: appointment.createdAt,
        earnings: {
          create: {
            providerId: appointment.providerId,
            kind: 'EARNING',
            gross: appointment.fee,
            platformFee: fee,
            net: appointment.fee.minus(fee),
          },
        },
      },
    });
  }

  const firstVisitDate = lastDateOn(chamberDays, 20);
  const firstVisit = await inPerson(firstVisitDate, 4, 'COMPLETED', 'NEW', null, 1200);
  await paid(firstVisit, input.rahimId, 'ডা. মাহবুবুর রহমান, চেম্বার');
  await prisma.review.create({
    data: {
      providerId: providerIds.get('mahbub')!,
      patientId: input.fatherId,
      authorUserId: input.rahimId,
      appointmentId: firstVisit.id,
      rating: 5,
      comment: 'খুব ধৈর্য নিয়ে বাবার সব কথা শুনেছেন, ওষুধ ঠিকমতো বুঝিয়ে দিয়েছেন।',
    },
  });
  // Ratings come only from real reviews (as ProviderReviewsService keeps them).
  await prisma.provider.update({
    where: { id: providerIds.get('mahbub')! },
    data: { ratingAvg: new Prisma.Decimal(5), ratingCount: 1 },
  });
  await prisma.favoriteProvider.create({
    data: { patientId: input.fatherId, providerId: providerIds.get('mahbub')! },
  });
  // The doctor asked him to come back in a month; the family booked it.
  const followUpDate = nextDateOn(chamberDays, 2);
  await prisma.followUpReminder.create({
    data: {
      patientId: input.fatherId,
      createdByUserId: input.rahimId,
      appointmentId: firstVisit.id,
      providerId: providerIds.get('mahbub')!,
      doctorName: 'ডা. মাহবুবুর রহমান',
      location: HOSPITALS.square.name,
      mode: 'IN_PERSON',
      dueAt: dhakaWallTimeToUtc(followUpDate, '18:00'),
      status: 'DONE',
      note: 'ইকো আর লিপিড প্রোফাইল রিপোর্ট নিয়ে আসবেন।',
    },
  });
  const followUpVisit = await inPerson(followUpDate, 2, 'CONFIRMED', 'FOLLOW_UP', firstVisit.id, 800);
  await paid(followUpVisit, input.rahimId, 'ডা. মাহবুবুর রহমান, চেম্বার (ফলো-আপ)');

  // An eye check-up with a doctor outside the app.
  await prisma.followUpReminder.create({
    data: {
      patientId: input.fatherId,
      createdByUserId: input.nasrinId,
      doctorName: 'ডা. সেলিনা হক (চক্ষু)',
      location: 'কুমিল্লা চক্ষু হাসপাতাল',
      mode: 'IN_PERSON',
      dueAt: dhakaWallTimeToUtc(addDays(dhakaDate(), 5), '11:00'),
      note: 'ছানির অপারেশনের পরের চেকআপ',
    },
  });

  // Rahim's own video consultation for his allergy.
  const videoDate = nextDateOn(EVERY_DAY, 1);
  const videoAt = dhakaWallTimeToUtc(videoDate, '19:30');
  const videoVisit = await prisma.appointment.create({
    data: {
      code: await readableIds.nextBookingCode(),
      patientId: input.rahimProfileId,
      bookedByUserId: input.rahimId,
      providerId: providerIds.get('nusrat')!,
      scheduleId: scheduleIds.get(`nusrat:VIDEO:${weekdayOf(videoDate)}`)!,
      mode: 'VIDEO',
      sessionDate: stringToDateColumn(videoDate),
      scheduledAt: videoAt,
      sessionEndAt: new Date(videoAt.getTime() + 15 * 60_000),
      durationMin: 15,
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      reason: 'হাতে লাল চাকা চাকা দাগ, চুলকায়',
      fee: new Prisma.Decimal(600),
      history: {
        create: [{ fromStatus: null, toStatus: 'CONFIRMED', changedByUserId: input.rahimId }],
      },
    },
  });
  await paid(videoVisit, input.rahimId, 'ডা. নুসরাত জাহান, ভিডিও কল');

  return [
    `  ${PROVIDER_DEMO_EMAILS.admin.padEnd(38)} admin (verifies providers in the panel)`,
    ...lines,
  ];
}
