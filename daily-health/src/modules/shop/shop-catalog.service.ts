import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { StoredUploadsService } from '../../core/uploads/stored-uploads.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type {
  BrandResponse,
  DeliveryZoneResponse,
  DiscountPartnerResponse,
  ListProductsQuery,
  ProductCategoryResponse,
  ProductResponse,
  ProductSummaryResponse,
  ShopHomeResponse,
} from '../../shared-contracts/shop.contract.js';
import { ShopErrorCode } from './shop-error-codes.js';
import { ShopViews } from './shop-views.js';

const HOME_TRENDING = 10;
const HOME_SECTION_PRODUCTS = 10;
const HOME_SECTIONS = 6;
const MIN_TRIGRAM_QUERY = 3;

/** What buyers (and guests) see: only active items. */
const sellable = { isActive: true, category: { isActive: true } } satisfies Prisma.ProductWhereInput;

/** The catalog as buyers see it (guests too). The shop must be on (checked by the controller). */
@Injectable()
export class ShopCatalogService {
  readonly views: ShopViews;

  constructor(
    private readonly prisma: PrismaService,
    uploads: StoredUploadsService,
  ) {
    this.views = new ShopViews(uploads);
  }

  async home(): Promise<ShopHomeResponse> {
    const now = new Date();
    const [banners, categories, trending, homeCategories, brands, partners] = await Promise.all([
      this.prisma.shopBanner.findMany({
        where: {
          isActive: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          ],
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        take: 10,
      }),
      this.categories(),
      this.prisma.product.findMany({
        where: { ...sellable, isTrending: true, stockQty: { gt: 0 } },
        include: { brand: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: HOME_TRENDING,
      }),
      this.prisma.productCategory.findMany({
        where: { isActive: true, showOnHome: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        take: HOME_SECTIONS,
      }),
      this.prisma.brand.findMany({
        where: { isActive: true, isFeatured: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        take: 20,
      }),
      this.partners(),
    ]);
    const sections = await Promise.all(
      homeCategories.map(async (category) => ({
        category: { id: category.id, name: category.name, slug: category.slug },
        products: (
          await this.prisma.product.findMany({
            where: { ...sellable, categoryId: category.id },
            include: { brand: true },
            orderBy: [{ stockQty: 'desc' }, { updatedAt: 'desc' }],
            take: HOME_SECTION_PRODUCTS,
          })
        ).map((p) => this.views.productSummary(p)),
      })),
    );
    return {
      banners: banners.filter((b) => b.imageStorageKey).map((b) => this.views.banner(b)),
      categories,
      trending: trending.map((p) => this.views.productSummary(p)),
      sections: sections.filter((s) => s.products.length > 0),
      featuredBrands: brands.map((b) => this.views.brand(b)),
      partners,
    };
  }

  async categories(): Promise<ProductCategoryResponse[]> {
    const rows = await this.prisma.productCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: { where: { isActive: true } } } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      badge: row.badge,
      imageThumbnailUrl: this.views.thumb(row.imageStorageKey),
      productCount: row._count.products,
    }));
  }

  async brands(): Promise<BrandResponse[]> {
    const rows = await this.prisma.brand.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((b) => this.views.brand(b));
  }

  async partners(): Promise<DiscountPartnerResponse[]> {
    const rows = await this.prisma.discountPartner.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((p) => this.views.partner(p));
  }

  async zones(): Promise<DeliveryZoneResponse[]> {
    const rows = await this.prisma.deliveryZone.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((z) => this.views.zone(z));
  }

  /**
   * Search and lists. A search (3+ letters) ranks by trigram similarity of the name and
   * generic name, so typos still match ("parasitamol"); shorter text matches the start.
   * Search results come in one page (best 50); other lists page by an offset cursor.
   */
  async products(query: ListProductsQuery): Promise<PaginatedResponse<ProductSummaryResponse>> {
    const where: Prisma.ProductWhereInput = {
      ...sellable,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.trending ? { isTrending: true } : {}),
    };

    if (query.q) {
      const ids = await this.searchIds(query.q);
      const rows = await this.prisma.product.findMany({
        where: { ...where, id: { in: ids } },
        include: { brand: true },
      });
      const rank = new Map(ids.map((id, i) => [id, i]));
      const sorted =
        query.sort === 'RELEVANCE'
          ? rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
          : this.sortInMemory(rows, query.sort);
      return {
        data: sorted.slice(0, query.limit).map((p) => this.views.productSummary(p)),
        meta: { cursor: null, hasMore: false },
      };
    }

    const offset = decodeOffsetCursor(query.cursor);
    const rows = await this.prisma.product.findMany({
      where,
      include: { brand: true },
      orderBy: this.orderBy(query.sort),
      skip: offset,
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    return {
      data: rows.slice(0, query.limit).map((p) => this.views.productSummary(p)),
      meta: {
        cursor: hasMore ? encodeOffsetCursor(offset + query.limit) : null,
        hasMore,
      },
    };
  }

  async product(productId: string): Promise<ProductResponse> {
    const row = await this.prisma.product.findFirst({
      where: { id: productId, ...sellable },
      include: { brand: true, category: true },
    });
    if (!row) throw productNotFound();
    return this.views.product(row);
  }

  private async searchIds(text: string): Promise<string[]> {
    const q = text.trim();
    if (q.length < MIN_TRIGRAM_QUERY) {
      const rows = await this.prisma.product.findMany({
        where: {
          ...sellable,
          OR: [
            { name: { startsWith: q, mode: 'insensitive' } },
            { genericName: { startsWith: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
        orderBy: { name: 'asc' },
        take: 50,
      });
      return rows.map((r) => r.id);
    }
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "shop"."Product"
      WHERE "isActive"
        AND ("name" ILIKE '%' || ${q} || '%'
          OR "genericName" ILIKE '%' || ${q} || '%'
          OR public.similarity("name", ${q}) > 0.25
          OR public.similarity(coalesce("genericName", ''), ${q}) > 0.25)
      ORDER BY greatest(public.similarity("name", ${q}), public.similarity(coalesce("genericName", ''), ${q})) DESC,
               "name" ASC
      LIMIT 50`;
    return rows.map((r) => r.id);
  }

  private orderBy(sort: ListProductsQuery['sort']): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case 'PRICE_LOW':
        return [{ price: 'asc' }, { id: 'asc' }];
      case 'PRICE_HIGH':
        return [{ price: 'desc' }, { id: 'asc' }];
      case 'NEWEST':
        return [{ createdAt: 'desc' }, { id: 'desc' }];
      default:
        // In stock first, then trending, then by name.
        return [{ isTrending: 'desc' }, { name: 'asc' }, { id: 'asc' }];
    }
  }

  private sortInMemory<T extends { price: Prisma.Decimal; mrp: Prisma.Decimal; createdAt: Date }>(
    rows: T[],
    sort: ListProductsQuery['sort'],
  ): T[] {
    const off = (r: T) => r.mrp.minus(r.price).div(r.mrp).toNumber();
    switch (sort) {
      case 'PRICE_LOW':
        return rows.sort((a, b) => a.price.comparedTo(b.price));
      case 'PRICE_HIGH':
        return rows.sort((a, b) => b.price.comparedTo(a.price));
      case 'NEWEST':
        return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      case 'DISCOUNT':
        return rows.sort((a, b) => off(b) - off(a));
      default:
        return rows;
    }
  }
}

/** Opaque "how many to skip" cursor for sorted product lists (prices change, so no keyset). */
function encodeOffsetCursor(offset: number): string {
  return Buffer.from(`o:${offset}`).toString('base64url');
}

function decodeOffsetCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const match = /^o:(\d{1,6})$/.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!match) throw new AppException(ErrorCode.VALIDATION_FAILED, 'Invalid cursor');
  return Number(match[1]);
}

export function productNotFound(): AppException {
  return new AppException(ShopErrorCode.PRODUCT_NOT_FOUND, 'Product not found', HttpStatus.NOT_FOUND);
}
