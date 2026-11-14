import type { StoredUploadsService } from '../../core/uploads/stored-uploads.service.js';
import type {
  Brand,
  DeliveryZone,
  DiscountPartner,
  Product,
  ProductCategory,
  ShopBanner,
} from '../../generated/prisma/client.js';
import type {
  BrandResponse,
  DeliveryZoneResponse,
  DiscountPartnerResponse,
  ProductResponse,
  ProductSummaryResponse,
  ShopBannerResponse,
} from '../../shared-contracts/shop.contract.js';

/** Shop pictures are public WebP with 200/800px thumbnails. */
export const SHOP_IMAGE_MIME = 'image/webp';

export type ProductWithBrand = Product & { brand: Brand | null };
export type ProductWithRelations = Product & { brand: Brand | null; category: ProductCategory };

/** Pictures and the brand name for product cards. */
export class ShopViews {
  constructor(private readonly uploads: StoredUploadsService) {}

  thumb(key: string | null): string | null {
    return key ? this.uploads.thumbnailUrl(key, 200) : null;
  }

  large(key: string | null): string | null {
    return key ? this.uploads.thumbnailUrl(key, 800) : null;
  }

  productSummary(row: ProductWithBrand): ProductSummaryResponse {
    const price = row.price.toNumber();
    const mrp = row.mrp.toNumber();
    return {
      id: row.id,
      name: row.name,
      genericName: row.genericName,
      strength: row.strength,
      packSize: row.packSize,
      brandName: row.brand?.isActive ? row.brand.name : null,
      price,
      mrp,
      discountPercent: mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0,
      inStock: row.isActive && row.stockQty > 0,
      requiresPrescription: row.requiresPrescription,
      imageThumbnailUrl: this.thumb(row.imageStorageKey),
    };
  }

  product(row: ProductWithRelations): ProductResponse {
    return {
      ...this.productSummary(row),
      description: row.description,
      dosageForm: row.dosageForm,
      manufacturer: row.manufacturer,
      category: { id: row.category.id, name: row.category.name, slug: row.category.slug },
      brand: row.brand?.isActive ? this.brand(row.brand) : null,
      imageUrl: this.large(row.imageStorageKey),
      maxQty: row.isActive ? Math.min(row.stockQty, row.maxPerOrder) : 0,
    };
  }

  brand(row: Brand): BrandResponse {
    return { id: row.id, name: row.name, slug: row.slug, logoThumbnailUrl: this.thumb(row.logoStorageKey) };
  }

  zone(row: DeliveryZone): DeliveryZoneResponse {
    return { id: row.id, name: row.name, charge: row.charge.toNumber(), estimate: row.estimate };
  }

  banner(row: ShopBanner): ShopBannerResponse {
    return {
      id: row.id,
      title: row.title,
      imageUrl: this.large(row.imageStorageKey),
      linkType: row.linkType,
      linkValue: row.linkValue,
    };
  }

  partner(row: DiscountPartner): DiscountPartnerResponse {
    return {
      id: row.id,
      name: row.name,
      offerText: row.offerText,
      description: row.description,
      address: row.address,
      phone: row.phone,
      logoThumbnailUrl: this.thumb(row.logoStorageKey),
    };
  }
}
