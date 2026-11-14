import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { StoredUploadsService } from '../../core/uploads/stored-uploads.service.js';
import { UploadedFileProcessorService } from '../../core/uploads/uploaded-file-processor.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type {
  AdjustStockRequest,
  CreateBrandRequest,
  CreateDeliveryZoneRequest,
  CreateDiscountPartnerRequest,
  CreateProductCategoryRequest,
  CreateProductRequest,
  CreateShopBannerRequest,
  ListStaffProductsQuery,
  ShopStaffCountsResponse,
  StaffBrandResponse,
  StaffDeliveryZoneResponse,
  StaffDiscountPartnerResponse,
  StaffProductCategoryResponse,
  StaffProductResponse,
  StaffShopBannerResponse,
  UpdateBrandRequest,
  UpdateDeliveryZoneRequest,
  UpdateDiscountPartnerRequest,
  UpdateProductCategoryRequest,
  UpdateProductRequest,
  UpdateShopBannerRequest,
} from '../../shared-contracts/shop.contract.js';
import { productNotFound } from './shop-catalog.service.js';
import { ShopErrorCode } from './shop-error-codes.js';
import { ShopStockService } from './shop-stock.service.js';
import { SHOP_IMAGE_MIME, ShopViews, type ProductWithRelations } from './shop-views.js';

type ImageTable = 'category' | 'brand' | 'product' | 'banner' | 'partner';

/** Staff side of the catalog: categories, brands, products, stock, zones, banners, partners. */
@Injectable()
export class ShopAdminCatalogService {
  private readonly views: ShopViews;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: StoredUploadsService,
    private readonly processor: UploadedFileProcessorService,
    private readonly stock: ShopStockService,
  ) {
    this.views = new ShopViews(uploads);
  }

  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------

  async categories(): Promise<StaffProductCategoryResponse[]> {
    const rows = await this.prisma.productCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      badge: row.badge,
      imageThumbnailUrl: this.views.thumb(row.imageStorageKey),
      productCount: row._count.products,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      showOnHome: row.showOnHome,
    }));
  }

  async createCategory(input: CreateProductCategoryRequest): Promise<StaffProductCategoryResponse> {
    const row = await uniqueGuard(() => this.prisma.productCategory.create({ data: input }));
    return this.category(row.id);
  }

  async updateCategory(id: string, input: UpdateProductCategoryRequest): Promise<StaffProductCategoryResponse> {
    await this.requireCategory(id);
    await uniqueGuard(() => this.prisma.productCategory.update({ where: { id }, data: input }));
    return this.category(id);
  }

  async removeCategory(id: string): Promise<void> {
    const row = await this.requireCategory(id);
    if ((await this.prisma.product.count({ where: { categoryId: id } })) > 0) throw inUse('Category has products');
    await this.prisma.productCategory.delete({ where: { id } });
    await this.dropImage(row.imageStorageKey);
  }

  private async category(id: string): Promise<StaffProductCategoryResponse> {
    return (await this.categories()).find((c) => c.id === id)!;
  }

  private async requireCategory(id: string) {
    const row = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!row) throw notFound(ShopErrorCode.PRODUCT_CATEGORY_NOT_FOUND, 'Category not found');
    return row;
  }

  // -------------------------------------------------------------------------
  // Brands
  // -------------------------------------------------------------------------

  async brands(): Promise<StaffBrandResponse[]> {
    const rows = await this.prisma.brand.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    return rows.map((row) => ({
      ...this.views.brand(row),
      isFeatured: row.isFeatured,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      productCount: row._count.products,
    }));
  }

  async createBrand(input: CreateBrandRequest): Promise<StaffBrandResponse> {
    const row = await uniqueGuard(() => this.prisma.brand.create({ data: input }));
    return (await this.brands()).find((b) => b.id === row.id)!;
  }

  async updateBrand(id: string, input: UpdateBrandRequest): Promise<StaffBrandResponse> {
    await this.requireBrand(id);
    await uniqueGuard(() => this.prisma.brand.update({ where: { id }, data: input }));
    return (await this.brands()).find((b) => b.id === id)!;
  }

  /** Products keep existing without a brand (brandId set to null by the FK). */
  async removeBrand(id: string): Promise<void> {
    const row = await this.requireBrand(id);
    await this.prisma.brand.delete({ where: { id } });
    await this.dropImage(row.logoStorageKey);
  }

  private async requireBrand(id: string) {
    const row = await this.prisma.brand.findUnique({ where: { id } });
    if (!row) throw notFound(ShopErrorCode.BRAND_NOT_FOUND, 'Brand not found');
    return row;
  }

  // -------------------------------------------------------------------------
  // Products
  // -------------------------------------------------------------------------

  async products(query: ListStaffProductsQuery): Promise<PaginatedResponse<StaffProductResponse>> {
    const where: Prisma.ProductWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.active !== undefined ? { isActive: query.active } : {}),
      ...(query.stock === 'OUT' ? { stockQty: 0 } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { genericName: { contains: query.q, mode: 'insensitive' } },
              { sku: { contains: query.q.toUpperCase() } },
            ],
          }
        : {}),
    };
    if (query.stock === 'LOW') {
      const low = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "shop"."Product" WHERE "stockQty" > 0 AND "stockQty" <= "lowStockThreshold"`;
      where.id = { in: low.map((r) => r.id) };
    }
    const offset = query.cursor ? Number(Buffer.from(query.cursor, 'base64url').toString('utf8')) || 0 : 0;
    const rows = await this.prisma.product.findMany({
      where,
      include: { brand: true, category: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    return {
      data: rows.slice(0, query.limit).map((r) => this.staffProduct(r)),
      meta: {
        cursor: hasMore ? Buffer.from(String(offset + query.limit)).toString('base64url') : null,
        hasMore,
      },
    };
  }

  async product(id: string): Promise<StaffProductResponse> {
    const row = await this.prisma.product.findUnique({
      where: { id },
      include: { brand: true, category: true },
    });
    if (!row) throw productNotFound();
    return this.staffProduct(row);
  }

  async createProduct(input: CreateProductRequest): Promise<StaffProductResponse> {
    await this.requireCategory(input.categoryId);
    if (input.brandId) await this.requireBrand(input.brandId);
    const row = await uniqueGuard(() => this.prisma.product.create({ data: { ...input, stockQty: 0 } }));
    return this.product(row.id);
  }

  async updateProduct(id: string, input: UpdateProductRequest): Promise<StaffProductResponse> {
    const row = await this.prisma.product.findUnique({ where: { id } });
    if (!row) throw productNotFound();
    if (input.categoryId) await this.requireCategory(input.categoryId);
    if (input.brandId) await this.requireBrand(input.brandId);
    const price = input.price ?? row.price.toNumber();
    const mrp = input.mrp ?? row.mrp.toNumber();
    if (price > mrp) {
      throw new AppException('VALIDATION_FAILED', 'Price cannot be above the MRP', HttpStatus.BAD_REQUEST, {
        fields: { price: ['Price cannot be above the MRP'] },
      });
    }
    await this.prisma.product.update({ where: { id }, data: input });
    return this.product(id);
  }

  /** Stock in or out by hand (restock, count fix, damaged, expired). */
  async adjustStock(userId: string, id: string, input: AdjustStockRequest): Promise<StaffProductResponse> {
    await this.product(id);
    await this.prisma.$transaction((tx) =>
      this.stock.move(tx, {
        productId: id,
        change: input.change,
        reason: input.reason,
        note: input.note ?? null,
        byUserId: userId,
      }),
    );
    return this.product(id);
  }

  async counts(): Promise<Omit<ShopStaffCountsResponse, 'ordersToHandle' | 'prescriptionsToReview'>> {
    const [low, out] = await Promise.all([
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM "shop"."Product"
        WHERE "isActive" AND "stockQty" > 0 AND "stockQty" <= "lowStockThreshold"`,
      this.prisma.product.count({ where: { isActive: true, stockQty: 0 } }),
    ]);
    return { lowStockProducts: Number(low[0]?.n ?? 0), outOfStockProducts: out };
  }

  private staffProduct(row: ProductWithRelations): StaffProductResponse {
    return {
      ...this.views.product(row),
      // Staff see the brand even when it is hidden from buyers.
      brand: row.brand ? this.views.brand(row.brand) : null,
      brandName: row.brand?.name ?? null,
      sku: row.sku,
      stockQty: row.stockQty,
      lowStockThreshold: row.lowStockThreshold,
      maxPerOrder: row.maxPerOrder,
      isTrending: row.isTrending,
      isActive: row.isActive,
      isLowStock: row.stockQty <= row.lowStockThreshold,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Delivery zones
  // -------------------------------------------------------------------------

  async zones(): Promise<StaffDeliveryZoneResponse[]> {
    const rows = await this.prisma.deliveryZone.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map((r) => ({ ...this.views.zone(r), sortOrder: r.sortOrder, isActive: r.isActive }));
  }

  async createZone(input: CreateDeliveryZoneRequest): Promise<StaffDeliveryZoneResponse> {
    const row = await this.prisma.deliveryZone.create({ data: input });
    return (await this.zones()).find((z) => z.id === row.id)!;
  }

  async updateZone(id: string, input: UpdateDeliveryZoneRequest): Promise<StaffDeliveryZoneResponse> {
    await this.requireZone(id);
    await this.prisma.deliveryZone.update({ where: { id }, data: input });
    return (await this.zones()).find((z) => z.id === id)!;
  }

  /** A zone with saved addresses can only be switched off (addresses point at it). */
  async removeZone(id: string): Promise<void> {
    await this.requireZone(id);
    if ((await this.prisma.deliveryAddress.count({ where: { zoneId: id } })) > 0) {
      throw inUse('Addresses use this zone; switch it off instead');
    }
    await this.prisma.deliveryZone.delete({ where: { id } });
  }

  private async requireZone(id: string) {
    const row = await this.prisma.deliveryZone.findUnique({ where: { id } });
    if (!row) throw notFound(ShopErrorCode.DELIVERY_ZONE_NOT_FOUND, 'Delivery zone not found');
    return row;
  }

  // -------------------------------------------------------------------------
  // Banners
  // -------------------------------------------------------------------------

  async banners(): Promise<StaffShopBannerResponse[]> {
    const rows = await this.prisma.shopBanner.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
    return rows.map((r) => ({
      ...this.views.banner(r),
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      startsAt: r.startsAt?.toISOString() ?? null,
      endsAt: r.endsAt?.toISOString() ?? null,
    }));
  }

  async createBanner(input: CreateShopBannerRequest): Promise<StaffShopBannerResponse> {
    const row = await this.prisma.shopBanner.create({ data: bannerData(input) });
    return (await this.banners()).find((b) => b.id === row.id)!;
  }

  async updateBanner(id: string, input: UpdateShopBannerRequest): Promise<StaffShopBannerResponse> {
    await this.requireBanner(id);
    await this.prisma.shopBanner.update({ where: { id }, data: bannerData(input) });
    return (await this.banners()).find((b) => b.id === id)!;
  }

  async removeBanner(id: string): Promise<void> {
    const row = await this.requireBanner(id);
    await this.prisma.shopBanner.delete({ where: { id } });
    await this.dropImage(row.imageStorageKey);
  }

  private async requireBanner(id: string) {
    const row = await this.prisma.shopBanner.findUnique({ where: { id } });
    if (!row) throw notFound(ShopErrorCode.SHOP_BANNER_NOT_FOUND, 'Banner not found');
    return row;
  }

  // -------------------------------------------------------------------------
  // Discount partners
  // -------------------------------------------------------------------------

  async partners(): Promise<StaffDiscountPartnerResponse[]> {
    const rows = await this.prisma.discountPartner.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map((r) => ({ ...this.views.partner(r), sortOrder: r.sortOrder, isActive: r.isActive }));
  }

  async createPartner(input: CreateDiscountPartnerRequest): Promise<StaffDiscountPartnerResponse> {
    const row = await this.prisma.discountPartner.create({ data: input });
    return (await this.partners()).find((p) => p.id === row.id)!;
  }

  async updatePartner(id: string, input: UpdateDiscountPartnerRequest): Promise<StaffDiscountPartnerResponse> {
    await this.requirePartner(id);
    await this.prisma.discountPartner.update({ where: { id }, data: input });
    return (await this.partners()).find((p) => p.id === id)!;
  }

  async removePartner(id: string): Promise<void> {
    const row = await this.requirePartner(id);
    await this.prisma.discountPartner.delete({ where: { id } });
    await this.dropImage(row.logoStorageKey);
  }

  private async requirePartner(id: string) {
    const row = await this.prisma.discountPartner.findUnique({ where: { id } });
    if (!row) throw notFound(ShopErrorCode.DISCOUNT_PARTNER_NOT_FOUND, 'Partner not found');
    return row;
  }

  // -------------------------------------------------------------------------
  // Pictures (public WebP; the old one is removed after the new one is saved)
  // -------------------------------------------------------------------------

  async setImage(table: ImageTable, id: string, file: Buffer | null): Promise<void> {
    const old = await this.currentImage(table, id);
    let storageKey: string | null = null;
    if (file) {
      const processed = await this.processor.process(file, { allowPdf: false });
      storageKey = await this.uploads.store(processed, 'public');
    }
    try {
      await this.writeImage(table, id, storageKey);
    } catch (error) {
      if (storageKey) await this.uploads.remove(storageKey, SHOP_IMAGE_MIME);
      throw error;
    }
    await this.dropImage(old);
  }

  private async currentImage(table: ImageTable, id: string): Promise<string | null> {
    switch (table) {
      case 'category':
        return (await this.requireCategory(id)).imageStorageKey;
      case 'brand':
        return (await this.requireBrand(id)).logoStorageKey;
      case 'product': {
        const row = await this.prisma.product.findUnique({ where: { id }, select: { imageStorageKey: true } });
        if (!row) throw productNotFound();
        return row.imageStorageKey;
      }
      case 'banner':
        return (await this.requireBanner(id)).imageStorageKey;
      case 'partner':
        return (await this.requirePartner(id)).logoStorageKey;
    }
  }

  private async writeImage(table: ImageTable, id: string, key: string | null): Promise<void> {
    switch (table) {
      case 'category':
        await this.prisma.productCategory.update({ where: { id }, data: { imageStorageKey: key } });
        return;
      case 'brand':
        await this.prisma.brand.update({ where: { id }, data: { logoStorageKey: key } });
        return;
      case 'product':
        await this.prisma.product.update({ where: { id }, data: { imageStorageKey: key } });
        return;
      case 'banner':
        await this.prisma.shopBanner.update({ where: { id }, data: { imageStorageKey: key } });
        return;
      case 'partner':
        await this.prisma.discountPartner.update({ where: { id }, data: { logoStorageKey: key } });
        return;
    }
  }

  private async dropImage(key: string | null): Promise<void> {
    if (key) await this.uploads.remove(key, SHOP_IMAGE_MIME);
  }
}

function bannerData(input: UpdateShopBannerRequest): Prisma.ShopBannerUpdateInput & Prisma.ShopBannerCreateInput {
  return {
    ...input,
    title: input.title as string,
    ...(input.linkType === 'NONE' ? { linkValue: null } : {}),
    ...(input.startsAt !== undefined ? { startsAt: input.startsAt ? new Date(input.startsAt) : null } : {}),
    ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? new Date(input.endsAt) : null } : {}),
  };
}

/** A unique slug or SKU is reported as SHOP_CODE_TAKEN (409) instead of a 500. */
async function uniqueGuard<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppException(ShopErrorCode.SHOP_CODE_TAKEN, 'Slug or SKU already used', HttpStatus.CONFLICT, {
        fields: error.meta?.target ?? null,
      });
    }
    throw error;
  }
}

function notFound(code: string, message: string): AppException {
  return new AppException(code, message, HttpStatus.NOT_FOUND);
}

function inUse(message: string): AppException {
  return new AppException(ShopErrorCode.SHOP_ITEM_IN_USE, message, HttpStatus.CONFLICT);
}
