/**
 * Step 10 demo data: staff IDs for the demo admin and a demo moderator,
 * health tips, and emergency contacts for the father. Called from
 * seed-demo-data.ts; never run against production (that script refuses).
 */
import type { PrismaService } from '../../src/core/prisma/prisma.service.js';
import type { ReadableIdService } from '../../src/core/readable-ids/readable-id.service.js';
import { PROVIDER_DEMO_EMAILS } from './seed-doctors-demo.js';

export const STAFF_DEMO_EMAILS = {
  moderator: 'moderator.demo@example.com',
} as const;

const TIPS: {
  title: string;
  body: string;
  category: 'GENERAL' | 'NUTRITION' | 'WOMEN' | 'CHILD' | 'MENTAL';
  byDoctor?: string;
  daysAgo: number;
  draft?: boolean;
}[] = [
  {
    title: 'প্রেশার মাপার সঠিক নিয়ম',
    body:
      'মাপার আগে ৫ মিনিট চুপচাপ বসে বিশ্রাম নিন। চা, কফি বা ধূমপানের পর অন্তত ৩০ মিনিট অপেক্ষা করুন। হাত হৃৎপিণ্ডের সমান উঁচুতে টেবিলে রাখুন, পা মাটিতে সমান করে রাখুন। প্রতিদিন একই সময়ে মেপে অ্যাপে লিখে রাখলে ডাক্তার পরিবর্তন সহজে বুঝতে পারবেন।',
    category: 'GENERAL',
    byDoctor: PROVIDER_DEMO_EMAILS.mahbub,
    daysAgo: 1,
  },
  {
    title: 'গরমে পানিশূন্যতা থেকে বাঁচুন',
    body:
      'দিনে অন্তত ৮–১০ গ্লাস পানি পান করুন। বাইরে গেলে সাথে পানির বোতল রাখুন। বেশি ঘাম হলে খাবার স্যালাইন খান। বয়স্ক মানুষ অনেক সময় পিপাসা টের পান না, তাই তাঁদের নির্দিষ্ট সময় পরপর পানি খেতে মনে করিয়ে দিন।',
    category: 'GENERAL',
    daysAgo: 3,
  },
  {
    title: 'ডায়াবেটিসে ভাতের পরিমাণ',
    body:
      'ভাত একেবারে বাদ দেওয়ার দরকার নেই, পরিমাণ কমান। প্লেটের অর্ধেক সবজি, এক-চতুর্থাংশ ভাত বা রুটি আর বাকিটা মাছ, মাংস বা ডাল রাখুন। লাল চাল আর আটার রুটি সাদা ভাতের চেয়ে ধীরে শর্করা বাড়ায়।',
    category: 'NUTRITION',
    byDoctor: PROVIDER_DEMO_EMAILS.shirin,
    daysAgo: 5,
  },
  {
    title: 'পিরিয়ডের ব্যথায় কী করবেন',
    body:
      'তলপেটে গরম পানির সেঁক দিন, হালকা হাঁটাহাঁটি করুন আর পর্যাপ্ত পানি খান। ব্যথা যদি প্রতিবার খুব বেশি হয়, দৈনন্দিন কাজ বন্ধ হয়ে যায়, বা পিরিয়ড অনিয়মিত হয়, তাহলে একজন স্ত্রীরোগ বিশেষজ্ঞকে দেখান।',
    category: 'WOMEN',
    byDoctor: PROVIDER_DEMO_EMAILS.farhana,
    daysAgo: 7,
  },
  {
    title: 'শিশুর টিকা সময়মতো দিন',
    body:
      'সরকারি ইপিআই কেন্দ্রে শিশুর সব টিকা বিনামূল্যে দেওয়া হয়। টিকা কার্ড যত্ন করে রাখুন আর পরের তারিখ মনে রাখুন। টিকার পর হালকা জ্বর হতে পারে, সেটা সাধারণত এক-দুই দিনে সেরে যায়।',
    category: 'CHILD',
    daysAgo: 10,
  },
  {
    title: 'মন খারাপ থাকলে কথা বলুন',
    body:
      'দুই সপ্তাহের বেশি মন খারাপ, ঘুম বা খাওয়ার পরিবর্তন, কিছু ভালো না লাগা — এগুলো বিষণ্ণতার লক্ষণ হতে পারে। কাছের কারো সাথে কথা বলুন। প্রয়োজনে মনোরোগ বিশেষজ্ঞের সাহায্য নিন; এটা দুর্বলতা নয়।',
    category: 'MENTAL',
    daysAgo: 14,
  },
  {
    title: 'শীতে বয়স্কদের যত্ন (খসড়া)',
    body: 'গরম কাপড়, কুসুম গরম পানিতে গোসল আর নিয়মিত ওষুধ। এই লেখাটা এখনো প্রকাশ হয়নি, প্যানেলে খসড়া দেখার জন্য।',
    category: 'GENERAL',
    daysAgo: 0,
    draft: true,
  },
];

export async function removeStaffContentDemo(prisma: PrismaService, patientIds: string[]): Promise<void> {
  const staffUsers = await prisma.user.findMany({
    where: { email: { in: [PROVIDER_DEMO_EMAILS.admin, STAFF_DEMO_EMAILS.moderator] } },
    select: { id: true },
  });
  const staffIds = staffUsers.map((u) => u.id);
  await prisma.$transaction([
    prisma.healthTip.deleteMany({ where: { createdByUserId: { in: staffIds } } }),
    prisma.staffMember.deleteMany({ where: { userId: { in: staffIds } } }),
    prisma.emergencyRequest.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.emergencyContact.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.auditLog.deleteMany({ where: { patientId: { in: patientIds } } }),
    // Sessions and devices go with the user (FK cascade).
    prisma.user.deleteMany({ where: { email: STAFF_DEMO_EMAILS.moderator } }),
  ]);
}

export async function seedStaffContentDemo(
  prisma: PrismaService,
  readableIds: ReadableIdService,
  input: { pinHash: string; fatherId: string },
): Promise<string[]> {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: PROVIDER_DEMO_EMAILS.admin } });
  const moderator = await prisma.user.create({
    data: {
      email: STAFF_DEMO_EMAILS.moderator,
      emailVerifiedAt: new Date(),
      pinHash: input.pinHash,
      role: 'MODERATOR',
    },
  });
  const adminStaff = await prisma.staffMember.create({
    data: { userId: admin.id, staffCode: await readableIds.next('ADMIN', 'Sadia Rahman'), fullName: 'সাদিয়া রহমান' },
  });
  const moderatorStaff = await prisma.staffMember.create({
    data: {
      userId: moderator.id,
      staffCode: await readableIds.next('MODERATOR', 'Jahid Hasan'),
      fullName: 'জাহিদ হাসান',
      addedByUserId: admin.id,
    },
  });

  const doctorUsers = await prisma.user.findMany({
    where: { email: { in: TIPS.flatMap((t) => (t.byDoctor ? [t.byDoctor] : [])) } },
    select: { id: true, email: true },
  });
  const providers = await prisma.provider.findMany({
    where: { userId: { in: doctorUsers.map((u) => u.id) } },
    select: { id: true, userId: true },
  });
  const providerByEmail = new Map(
    doctorUsers.map((u) => [u.email, providers.find((p) => p.userId === u.id)?.id ?? null]),
  );
  for (const tip of TIPS) {
    const at = new Date(Date.now() - tip.daysAgo * 86_400_000);
    await prisma.healthTip.create({
      data: {
        title: tip.title,
        body: tip.body,
        category: tip.category,
        authorProviderId: tip.byDoctor ? (providerByEmail.get(tip.byDoctor) ?? null) : null,
        status: tip.draft ? 'DRAFT' : 'PUBLISHED',
        publishedAt: tip.draft ? null : at,
        createdByUserId: admin.id,
        createdAt: at,
      },
    });
  }

  // The father's emergency contacts: a neighbour and the local pharmacy.
  await prisma.emergencyContact.createMany({
    data: [
      { patientId: input.fatherId, name: 'জসিম উদ্দিন (প্রতিবেশী)', phone: '+8801711000111', relation: 'প্রতিবেশী' },
      { patientId: input.fatherId, name: 'রফিক ভাই', phone: '+8801811000222', relation: 'ভাতিজা', notifyOnSos: false },
    ],
  });

  return [
    `  ${PROVIDER_DEMO_EMAILS.admin.padEnd(38)} ${adminStaff.staffCode}  admin (also handles emergencies and tips)`,
    `  ${STAFF_DEMO_EMAILS.moderator.padEnd(38)} ${moderatorStaff.staffCode}  moderator (emergency queue, health tips)`,
  ];
}
