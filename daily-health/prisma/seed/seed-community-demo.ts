/**
 * Community demo data: categories of both spaces, a few questions with doctors'
 * answers in the common community, and Nasrin as an approved member of the women's
 * community with one post there. Called from seed-demo-data.ts (never in production).
 */
import type { PrismaService } from '../../src/core/prisma/prisma.service.js';
import { PROVIDER_DEMO_EMAILS } from './seed-doctors-demo.js';

const CATEGORIES = [
  { slug: 'general', nameBn: 'সাধারণ স্বাস্থ্য', space: 'COMMON', isSensitive: false },
  { slug: 'mental-health', nameBn: 'মানসিক স্বাস্থ্য', space: 'COMMON', isSensitive: true },
  { slug: 'child-care', nameBn: 'শিশুর যত্ন', space: 'COMMON', isSensitive: false },
  { slug: 'pain-therapy', nameBn: 'ব্যথা ও থেরাপি', space: 'COMMON', isSensitive: false },
  { slug: 'diabetes-bp', nameBn: 'ডায়াবেটিস ও প্রেশার', space: 'COMMON', isSensitive: false },
  { slug: 'women-periods', nameBn: 'পিরিয়ড ও মাসিক', space: 'WOMEN', isSensitive: true },
  { slug: 'women-pregnancy', nameBn: 'গর্ভাবস্থা ও মাতৃত্ব', space: 'WOMEN', isSensitive: true },
  { slug: 'women-wellbeing', nameBn: 'মন ও সম্পর্ক', space: 'WOMEN', isSensitive: true },
] as const;

/** The demo users' posts and memberships (categories are upserted, never removed). */
export async function removeCommunityDemo(prisma: PrismaService, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const posts = await prisma.post.findMany({ where: { authorUserId: { in: userIds } }, select: { id: true } });
  const answers = await prisma.answer.findMany({ where: { authorUserId: { in: userIds } }, select: { id: true } });
  const targetIds = [...posts.map((p) => p.id), ...answers.map((a) => a.id)];
  await prisma.reaction.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { targetId: { in: targetIds } }] } });
  await prisma.contentReport.deleteMany({ where: { OR: [{ reporterUserId: { in: userIds } }, { targetId: { in: targetIds } }] } });
  await prisma.answer.deleteMany({ where: { authorUserId: { in: userIds } } });
  await prisma.post.deleteMany({ where: { authorUserId: { in: userIds } } });
  await prisma.womenCommunityMember.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.communityBan.deleteMany({ where: { userId: { in: userIds } } });
}

export async function seedCommunityDemo(
  prisma: PrismaService,
  input: { rahimId: string; nasrinId: string },
): Promise<string[]> {
  const categoryIds = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) {
    const row = await prisma.forumCategory.upsert({
      where: { slug: c.slug },
      create: { ...c, sortOrder: i },
      update: { nameBn: c.nameBn, space: c.space, isSensitive: c.isSensitive, sortOrder: i, isActive: true },
    });
    categoryIds.set(c.slug, row.id);
  }

  const doctors = await prisma.provider.findMany({
    where: { verificationStatus: 'VERIFIED' },
    select: { id: true, userId: true, displayName: true },
  });
  const users = await prisma.user.findMany({
    where: { email: { in: [PROVIDER_DEMO_EMAILS.mahbub, PROVIDER_DEMO_EMAILS.sabrina, PROVIDER_DEMO_EMAILS.admin] } },
    select: { id: true, email: true },
  });
  const byEmail = (email: string) => users.find((u) => u.email === email)?.id;
  const providerOf = (userId: string | undefined) => doctors.find((d) => d.userId === userId);
  const mahbubUser = byEmail(PROVIDER_DEMO_EMAILS.mahbub);
  const sabrinaUser = byEmail(PROVIDER_DEMO_EMAILS.sabrina);
  const adminUser = byEmail(PROVIDER_DEMO_EMAILS.admin);

  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

  const q1 = await prisma.post.create({
    data: {
      authorUserId: input.rahimId,
      categoryId: categoryIds.get('diabetes-bp')!,
      space: 'COMMON',
      title: 'বাবার প্রেশার সকালে বেশি থাকে, কী করব?',
      body: 'আমার বাবার বয়স ৬৮। সকালে প্রেশার ১৫০/৯৫ এর মতো থাকে, বিকেলে কমে আসে। ওষুধ নিয়মিত খান। সকালে বেশি থাকা কি স্বাভাবিক? কী খেয়াল রাখব?',
      createdAt: hoursAgo(30),
    },
  });
  const q2 = await prisma.post.create({
    data: {
      authorUserId: input.nasrinId,
      categoryId: categoryIds.get('mental-health')!,
      space: 'COMMON',
      title: 'রাতে ঘুম আসে না, দুশ্চিন্তা হয়',
      body: 'কয়েক সপ্তাহ ধরে রাতে ঘুম আসতে অনেক দেরি হয়। মাথায় নানা চিন্তা ঘোরে। ঘুমের ওষুধ না খেয়ে কী করা যায়?',
      isAnonymous: true,
      anonAlias: 'বেনামী সদস্য ৪৮২১',
      createdAt: hoursAgo(10),
    },
  });
  await prisma.post.create({
    data: {
      authorUserId: input.rahimId,
      categoryId: categoryIds.get('child-care')!,
      space: 'COMMON',
      title: 'বাচ্চার জ্বর ১০২, কখন হাসপাতালে নেব?',
      body: 'আমার ভাগ্নের বয়স ৩ বছর। জ্বর ১০২ পর্যন্ত উঠছে, প্যারাসিটামলে নামে। কোন লক্ষণ দেখলে সাথে সাথে হাসপাতালে নিতে হবে?',
      createdAt: hoursAgo(3),
    },
  });

  const answer = async (postId: string, userId: string | undefined, body: string, h: number) => {
    if (!userId) return;
    const provider = providerOf(userId);
    await prisma.answer.create({ data: { postId, authorUserId: userId, providerId: provider?.id ?? null, body, createdAt: hoursAgo(h) } });
    await prisma.post.update({
      where: { id: postId },
      data: { answerCount: { increment: 1 }, ...(provider ? { doctorAnswerCount: { increment: 1 } } : {}) },
    });
  };
  await answer(
    q1.id,
    mahbubUser,
    'সকালে প্রেশার একটু বেশি থাকা অনেকের হয় (morning surge)। ওষুধ ঠিক সময়ে খাচ্ছেন কি না দেখুন, লবণ কমান, আর এক সপ্তাহ সকাল-বিকাল মেপে অ্যাপে লিখে রাখুন। ১৬০-এর বেশি থাকলে ডাক্তারকে দেখান; ওষুধের সময় বদলানো লাগতে পারে।',
    26,
  );
  await answer(
    q2.id,
    sabrinaUser,
    'প্রতিদিন একই সময়ে ঘুমাতে যান আর উঠুন। ঘুমের এক ঘণ্টা আগে মোবাইল রাখুন, বিকেলের পর চা-কফি বাদ দিন। দুশ্চিন্তা দুই সপ্তাহের বেশি থাকলে একজন মনোরোগ বিশেষজ্ঞের সাথে কথা বলুন। এখানে লিখেছেন, এটাই প্রথম ভালো পদক্ষেপ।',
    6,
  );

  // Nasrin: approved member of the women's community, with a post there.
  if (adminUser) {
    await prisma.womenCommunityMember.upsert({
      where: { userId: input.nasrinId },
      create: { userId: input.nasrinId, status: 'APPROVED', decidedByUserId: adminUser, decidedAt: hoursAgo(48), requestedAt: hoursAgo(50) },
      update: { status: 'APPROVED', decidedByUserId: adminUser, decidedAt: hoursAgo(48) },
    });
  }
  await prisma.post.create({
    data: {
      authorUserId: input.nasrinId,
      categoryId: categoryIds.get('women-periods')!,
      space: 'WOMEN',
      title: 'পিরিয়ডের সময় খুব পেট ব্যথা, কী করব?',
      body: 'প্রতি মাসে প্রথম দুই দিন খুব ব্যথা হয়, কাজ করতে কষ্ট হয়। গরম সেঁক দেই। আর কী করা যায়? কখন ডাক্তার দেখানো উচিত?',
      isAnonymous: true,
      anonAlias: 'বেনামী সদস্য ১৯০৭',
      createdAt: hoursAgo(20),
    },
  });

  return [`Community: ${CATEGORIES.length} categories, 4 posts; nasrin is an approved women's community member`];
}
