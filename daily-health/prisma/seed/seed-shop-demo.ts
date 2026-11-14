/**
 * Step 11 demo data: a small HealthStore catalog with stock, delivery zones and
 * discount partners. The shop stays switched OFF (admins turn it on in the panel).
 * Called from seed-demo-data.ts; never run against production (that script refuses).
 * Pictures are left out (they live in object storage); the panel adds them.
 */
import type { PrismaService } from '../../src/core/prisma/prisma.service.js';

const CATEGORIES = [
  { slug: 'medicine', name: 'ঔষধ', badge: 'TRENDING', showOnHome: true },
  { slug: 'baby-care', name: 'শিশুর যত্ন', badge: 'MUST_HAVE', showOnHome: false },
  { slug: 'diabetic-care', name: 'ডায়াবেটিস কেয়ার', badge: 'POPULAR', showOnHome: true },
  { slug: 'first-aid', name: 'ফার্স্ট এইড', badge: 'MUST_HAVE', showOnHome: false },
  { slug: 'health-devices', name: 'হেলথ ডিভাইস', badge: 'FEATURED', showOnHome: false },
  { slug: 'personal-care', name: 'পার্সোনাল কেয়ার', badge: null, showOnHome: false },
] as const;

const BRANDS = [
  { slug: 'beximco', name: 'Beximco Pharma', isFeatured: true },
  { slug: 'square', name: 'Square Pharmaceuticals', isFeatured: true },
  { slug: 'incepta', name: 'Incepta Pharmaceuticals', isFeatured: true },
  { slug: 'omron', name: 'Omron', isFeatured: true },
] as const;

type CategorySlug = (typeof CATEGORIES)[number]['slug'];
type BrandSlug = (typeof BRANDS)[number]['slug'];

const PRODUCTS: {
  sku: string;
  name: string;
  genericName?: string;
  strength?: string;
  dosageForm?: string;
  packSize: string;
  category: CategorySlug;
  brand?: BrandSlug;
  mrp: number;
  price: number;
  stock: number;
  rx?: boolean;
  trending?: boolean;
  description?: string;
}[] = [
  { sku: 'NAPA-500-10', name: 'Napa', genericName: 'Paracetamol', strength: '500 mg', dosageForm: 'ট্যাবলেট', packSize: '১০টি ট্যাবলেট', category: 'medicine', brand: 'beximco', mrp: 12, price: 11, stock: 400, trending: true, description: 'জ্বর ও ব্যথা কমাতে। দিনে ৪ বারের বেশি নয়।' },
  { sku: 'SECLO-20-10', name: 'Seclo', genericName: 'Omeprazole', strength: '20 mg', dosageForm: 'ক্যাপসুল', packSize: '১০টি ক্যাপসুল', category: 'medicine', brand: 'square', mrp: 60, price: 54, stock: 150, trending: true },
  { sku: 'AMLO-5-10', name: 'Amlodipine', genericName: 'Amlodipine', strength: '5 mg', dosageForm: 'ট্যাবলেট', packSize: '১০টি ট্যাবলেট', category: 'medicine', brand: 'incepta', mrp: 80, price: 72, stock: 90, rx: true },
  { sku: 'METF-500-10', name: 'Comet', genericName: 'Metformin', strength: '500 mg', dosageForm: 'ট্যাবলেট', packSize: '১০টি ট্যাবলেট', category: 'diabetic-care', brand: 'square', mrp: 50, price: 45, stock: 120, rx: true },
  { sku: 'GLUCO-STRIP-50', name: 'গ্লুকোমিটার স্ট্রিপ', packSize: '৫০টি স্ট্রিপ', category: 'diabetic-care', mrp: 1500, price: 1250, stock: 4, trending: true },
  { sku: 'ORS-SALINE-20', name: 'ওরস্যালাইন-এন', packSize: '২০টি প্যাকেট', category: 'first-aid', brand: 'square', mrp: 120, price: 110, stock: 300 },
  { sku: 'BANDAGE-ROLL', name: 'ক্রেপ ব্যান্ডেজ', packSize: '১টি রোল (৪ ইঞ্চি)', category: 'first-aid', mrp: 150, price: 130, stock: 0 },
  { sku: 'OMRON-BP-M2', name: 'Omron M2 ব্লাড প্রেশার মেশিন', packSize: '১টি মেশিন', category: 'health-devices', brand: 'omron', mrp: 4800, price: 4350, stock: 12, trending: true, description: 'বাসায় প্রেশার মাপার ডিজিটাল মেশিন।' },
  { sku: 'BABY-WIPES-80', name: 'বেবি ওয়াইপস', packSize: '৮০টি', category: 'baby-care', mrp: 250, price: 220, stock: 60 },
  { sku: 'HAND-SANITIZER-200', name: 'হ্যান্ড স্যানিটাইজার', packSize: '২০০ মিলি', category: 'personal-care', mrp: 180, price: 160, stock: 80 },
];

const ZONES = [
  { name: 'ঢাকা সিটির ভেতরে', charge: 60, estimate: '১–২ দিন', sortOrder: 0 },
  { name: 'ঢাকার বাইরে', charge: 120, estimate: '৩–৫ দিন', sortOrder: 1 },
];

const PARTNERS = [
  { name: 'নিউ লাইফ হাসপাতাল (ডেমো)', offerText: 'সব টেস্টে ২০% ছাড়', address: 'মিরপুর ১০, ঢাকা', sortOrder: 0 },
  { name: 'সিটি ডায়াগনস্টিক (ডেমো)', offerText: 'রক্তের পরীক্ষায় ১৫% ছাড়', address: 'ধানমন্ডি ২৭, ঢাকা', sortOrder: 1 },
];

/** The demo users' carts, addresses and orders (the catalog itself is kept and upserted). */
export async function removeShopDemo(prisma: PrismaService, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  await prisma.cartItem.deleteMany({ where: { userId: { in: userIds } } });
  const orders = await prisma.order.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  await prisma.stockMovement.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
  await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.deliveryAddress.deleteMany({ where: { userId: { in: userIds } } });
}

export async function seedShopDemo(prisma: PrismaService): Promise<string[]> {
  const categoryIds = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) {
    const row = await prisma.productCategory.upsert({
      where: { slug: c.slug },
      create: { ...c, sortOrder: i },
      update: { name: c.name, badge: c.badge, showOnHome: c.showOnHome, sortOrder: i, isActive: true },
    });
    categoryIds.set(c.slug, row.id);
  }
  const brandIds = new Map<string, string>();
  for (const [i, b] of BRANDS.entries()) {
    const row = await prisma.brand.upsert({
      where: { slug: b.slug },
      create: { ...b, sortOrder: i },
      update: { name: b.name, isFeatured: b.isFeatured, sortOrder: i, isActive: true },
    });
    brandIds.set(b.slug, row.id);
  }
  for (const p of PRODUCTS) {
    const data = {
      name: p.name,
      genericName: p.genericName ?? null,
      strength: p.strength ?? null,
      dosageForm: p.dosageForm ?? null,
      packSize: p.packSize,
      description: p.description ?? null,
      categoryId: categoryIds.get(p.category)!,
      brandId: p.brand ? brandIds.get(p.brand)! : null,
      mrp: p.mrp,
      price: p.price,
      requiresPrescription: p.rx ?? false,
      isTrending: p.trending ?? false,
      isActive: true,
    };
    const existing = await prisma.product.findUnique({ where: { sku: p.sku } });
    const product = existing
      ? await prisma.product.update({ where: { id: existing.id }, data })
      : await prisma.product.create({ data: { ...data, sku: p.sku } });
    // Stock goes through the ledger: one row bringing it to the demo amount.
    const diff = p.stock - product.stockQty;
    if (diff !== 0) {
      const updated = await prisma.product.update({ where: { id: product.id }, data: { stockQty: p.stock } });
      await prisma.stockMovement.create({
        data: {
          productId: product.id,
          change: diff,
          balanceAfter: updated.stockQty,
          reason: diff > 0 ? 'RESTOCK' : 'ADJUSTMENT',
          note: 'ডেমো স্টক',
        },
      });
    }
  }
  for (const z of ZONES) {
    const existing = await prisma.deliveryZone.findFirst({ where: { name: z.name } });
    if (existing) await prisma.deliveryZone.update({ where: { id: existing.id }, data: { ...z, isActive: true } });
    else await prisma.deliveryZone.create({ data: z });
  }
  for (const partner of PARTNERS) {
    const existing = await prisma.discountPartner.findFirst({ where: { name: partner.name } });
    if (existing) await prisma.discountPartner.update({ where: { id: existing.id }, data: partner });
    else await prisma.discountPartner.create({ data: partner });
  }
  await prisma.shopSetting.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  return [
    `HealthStore: ${PRODUCTS.length} products in ${CATEGORIES.length} categories, ${ZONES.length} delivery zones (the shop is OFF; switch it on in the panel)`,
  ];
}
