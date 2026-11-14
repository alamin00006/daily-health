/**
 * Nutrition demo data: Rahim saw the nutritionist (Shirin) by video five days ago, and she
 * gave an active four-meal diet plan; yesterday's log has two meals and some water.
 * Called from seed-demo-data.ts after the doctors' demo (never in production).
 */
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
import { PROVIDER_DEMO_EMAILS } from './seed-doctors-demo.js';

const MEALS = [
  { mealType: 'BREAKFAST', time: '08:00', description: '২টি লাল আটার রুটি, ১ বাটি সবজি, ১টি সেদ্ধ ডিম (কুসুম ছাড়া)', approxKcal: 380 },
  { mealType: 'LUNCH', time: '13:30', description: '১ কাপ ভাত, ১ টুকরা মাছ, ডাল, প্রচুর শাক-সবজি', approxKcal: 550 },
  { mealType: 'SNACKS', time: '17:00', description: '১টি ফল (পেয়ারা বা আপেল), ১০টি বাদাম, চিনি ছাড়া চা', approxKcal: 180 },
  { mealType: 'DINNER', time: '20:30', description: '২টি রুটি, মুরগির মাংস (চামড়া ছাড়া), সালাদ', approxKcal: 450 },
] as const;

export async function removeNutritionDemo(prisma: PrismaService, profileIds: string[]): Promise<void> {
  if (profileIds.length === 0) return;
  await prisma.intakeLog.deleteMany({ where: { patientId: { in: profileIds } } });
  await prisma.dietPlan.deleteMany({ where: { patientId: { in: profileIds } } });
}

export async function seedNutritionDemo(
  prisma: PrismaService,
  readableIds: ReadableIdService,
  input: { rahimId: string; rahimProfileId: string },
): Promise<string[]> {
  const shirinUser = await prisma.user.findUnique({ where: { email: PROVIDER_DEMO_EMAILS.shirin } });
  const shirin = shirinUser ? await prisma.provider.findUnique({ where: { userId: shirinUser.id } }) : null;
  if (!shirin) return ['Nutrition: skipped (no demo nutritionist)'];

  // A video visit five days ago on one of her video schedules (any weekday will do for a past visit).
  const date = addDays(dhakaDate(), -5);
  const schedule =
    (await prisma.schedule.findFirst({ where: { providerId: shirin.id, mode: 'VIDEO', dayOfWeek: weekdayOf(date) } })) ??
    (await prisma.schedule.findFirst({ where: { providerId: shirin.id, mode: 'VIDEO' } }));
  if (!schedule) return ['Nutrition: skipped (the nutritionist has no video schedule)'];
  const scheduledAt = dhakaWallTimeToUtc(date, '19:00');
  const visit = await prisma.appointment.create({
    data: {
      code: await readableIds.nextBookingCode(),
      patientId: input.rahimProfileId,
      bookedByUserId: input.rahimId,
      providerId: shirin.id,
      scheduleId: schedule.id,
      mode: 'VIDEO',
      sessionDate: stringToDateColumn(date),
      scheduledAt,
      sessionEndAt: new Date(scheduledAt.getTime() + 20 * 60_000),
      durationMin: 20,
      status: 'COMPLETED',
      confirmedAt: new Date(scheduledAt.getTime() - 24 * 3_600_000),
      reason: 'ওজন কমানো আর সুগার নিয়ন্ত্রণে খাবারের পরামর্শ',
      fee: new Prisma.Decimal(500),
      history: {
        create: [
          { fromStatus: null, toStatus: 'CONFIRMED', changedByUserId: input.rahimId },
          { fromStatus: 'CONFIRMED', toStatus: 'COMPLETED', changedByUserId: null },
        ],
      },
    },
  });

  const plan = await prisma.dietPlan.create({
    data: {
      patientId: input.rahimProfileId,
      providerId: shirin.id,
      appointmentId: visit.id,
      title: 'ওজন কমানো ও সুগার নিয়ন্ত্রণ',
      calorieTargetKcal: 1600,
      waterTargetMl: 3000,
      startDate: stringToDateColumn(addDays(date, 1)),
      status: 'ACTIVE',
      publishedAt: new Date(scheduledAt.getTime() + 60 * 60_000),
      notes: 'চিনি, মিষ্টি আর ভাজাপোড়া বাদ। রাতের খাবারের পর ১৫ মিনিট হাঁটুন। প্রতি সপ্তাহে ওজন মেপে অ্যাপে লিখুন।',
      meals: {
        create: MEALS.map((m, sortOrder) => ({
          mealType: m.mealType,
          time: hhmmToTimeColumn(m.time),
          description: m.description,
          approxKcal: m.approxKcal,
          sortOrder,
        })),
      },
    },
    include: { meals: true },
  });

  const yesterday = addDays(dhakaDate(), -1);
  const followed = plan.meals.filter((m) => m.mealType === 'BREAKFAST' || m.mealType === 'LUNCH');
  await prisma.intakeLog.create({
    data: {
      patientId: input.rahimProfileId,
      dietPlanId: plan.id,
      date: stringToDateColumn(yesterday),
      waterMl: 2250,
      caloriesKcal: followed.reduce((sum, m) => sum + (m.approxKcal ?? 0), 0),
      updatedByUserId: input.rahimId,
      checks: { create: plan.meals.map((m) => ({ mealId: m.id, followed: followed.some((f) => f.id === m.id) })) },
    },
  });

  return [`Nutrition: ${visit.code} with the nutritionist; active diet plan for rahim (4 meals, 1600 kcal, 3 L water)`];
}
