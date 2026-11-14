import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { AdminOnly, StaffOnly } from '../../common/auth/staff-role.guard.js';
import { UuidParam } from '../../common/pipes/uuid-param.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import {
  requireUploadedFile,
  SingleFileUpload,
  type UploadedMultipartFile,
} from '../../core/uploads/single-file-upload.decorator.js';
import {
  paginationQuerySchema,
  type PaginatedResponse,
  type PaginationQuery,
} from '../../shared-contracts/common-fields.contract.js';
import {
  adjustStockRequestSchema,
  cancelOrderRequestSchema,
  createBrandRequestSchema,
  createDeliveryZoneRequestSchema,
  createDiscountPartnerRequestSchema,
  createProductCategoryRequestSchema,
  createProductRequestSchema,
  createShopBannerRequestSchema,
  listStaffOrdersQuerySchema,
  listStaffProductsQuerySchema,
  orderStepRequestSchema,
  returnOrderRequestSchema,
  reviewOrderPrescriptionRequestSchema,
  updateBrandRequestSchema,
  updateDeliveryZoneRequestSchema,
  updateDiscountPartnerRequestSchema,
  updateProductCategoryRequestSchema,
  updateProductRequestSchema,
  updateShopBannerRequestSchema,
  updateShopSettingsRequestSchema,
  type AdjustStockRequest,
  type CancelOrderRequest,
  type CreateBrandRequest,
  type CreateDeliveryZoneRequest,
  type CreateDiscountPartnerRequest,
  type CreateProductCategoryRequest,
  type CreateProductRequest,
  type CreateShopBannerRequest,
  type ListStaffOrdersQuery,
  type ListStaffProductsQuery,
  type OrderStepRequest,
  type ReturnOrderRequest,
  type ReviewOrderPrescriptionRequest,
  type ShopSettingsChangeResponse,
  type ShopSettingsResponse,
  type ShopStaffCountsResponse,
  type StaffBrandResponse,
  type StaffDeliveryZoneResponse,
  type StaffDiscountPartnerResponse,
  type StaffOrderResponse,
  type StaffProductCategoryResponse,
  type StaffProductResponse,
  type StaffShopBannerResponse,
  type StockMovementResponse,
  type UpdateBrandRequest,
  type UpdateDeliveryZoneRequest,
  type UpdateDiscountPartnerRequest,
  type UpdateProductCategoryRequest,
  type UpdateProductRequest,
  type UpdateShopBannerRequest,
  type UpdateShopSettingsRequest,
} from '../../shared-contracts/shop.contract.js';
import { ShopAdminCatalogService } from './shop-admin-catalog.service.js';
import { ShopSettingsService } from './shop-settings.service.js';
import { ShopStaffOrdersService, type StaffOrderSummaryResponse } from './shop-staff-orders.service.js';
import { ShopStockService } from './shop-stock.service.js';

/**
 * Panel: any staff handle orders and read the catalog; ADMIN switches the shop on/off,
 * edits the catalog, stock, zones, banners and partners, and marks returns.
 */
@ApiTags('staff: shop')
@ApiBearerAuth()
@StaffOnly()
@Controller('staff/shop')
export class StaffShopController {
  constructor(
    private readonly settings: ShopSettingsService,
    private readonly catalog: ShopAdminCatalogService,
    private readonly stock: ShopStockService,
    private readonly orders: ShopStaffOrdersService,
  ) {}

  // ---- Settings ----------------------------------------------------------

  @Get('settings')
  settingsView(): Promise<ShopSettingsResponse> {
    return this.settings.view();
  }

  @Patch('settings')
  @AdminOnly()
  @ApiOperation({ summary: 'Switch the whole shop on/off, cash on delivery, minimum order, free delivery' })
  @ApiZodBody(updateShopSettingsRequestSchema)
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateShopSettingsRequestSchema)) body: UpdateShopSettingsRequest,
  ): Promise<ShopSettingsResponse> {
    return this.settings.update(user.userId, body);
  }

  @Get('settings/history')
  @AdminOnly()
  settingsHistory(
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<PaginatedResponse<ShopSettingsChangeResponse>> {
    return this.settings.history(query);
  }

  @Get('counts')
  @ApiOperation({ summary: 'Orders to handle, prescriptions to review, low and out of stock' })
  counts(): Promise<ShopStaffCountsResponse> {
    return this.orders.counts();
  }

  // ---- Categories --------------------------------------------------------

  @Get('categories')
  categories(): Promise<StaffProductCategoryResponse[]> {
    return this.catalog.categories();
  }

  @Post('categories')
  @AdminOnly()
  @ApiZodBody(createProductCategoryRequestSchema)
  createCategory(
    @Body(new ZodValidationPipe(createProductCategoryRequestSchema)) body: CreateProductCategoryRequest,
  ): Promise<StaffProductCategoryResponse> {
    return this.catalog.createCategory(body);
  }

  @Patch('categories/:id')
  @AdminOnly()
  @ApiZodBody(updateProductCategoryRequestSchema)
  updateCategory(
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateProductCategoryRequestSchema)) body: UpdateProductCategoryRequest,
  ): Promise<StaffProductCategoryResponse> {
    return this.catalog.updateCategory(id, body);
  }

  @Delete('categories/:id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  removeCategory(@UuidParam('id') id: string): Promise<void> {
    return this.catalog.removeCategory(id);
  }

  @Put('categories/:id/image')
  @AdminOnly()
  @SingleFileUpload()
  async categoryImage(
    @UuidParam('id') id: string,
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<void> {
    await this.catalog.setImage('category', id, requireUploadedFile(file).buffer);
  }

  // ---- Brands ------------------------------------------------------------

  @Get('brands')
  brands(): Promise<StaffBrandResponse[]> {
    return this.catalog.brands();
  }

  @Post('brands')
  @AdminOnly()
  @ApiZodBody(createBrandRequestSchema)
  createBrand(
    @Body(new ZodValidationPipe(createBrandRequestSchema)) body: CreateBrandRequest,
  ): Promise<StaffBrandResponse> {
    return this.catalog.createBrand(body);
  }

  @Patch('brands/:id')
  @AdminOnly()
  @ApiZodBody(updateBrandRequestSchema)
  updateBrand(
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateBrandRequestSchema)) body: UpdateBrandRequest,
  ): Promise<StaffBrandResponse> {
    return this.catalog.updateBrand(id, body);
  }

  @Delete('brands/:id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  removeBrand(@UuidParam('id') id: string): Promise<void> {
    return this.catalog.removeBrand(id);
  }

  @Put('brands/:id/logo')
  @AdminOnly()
  @SingleFileUpload()
  async brandLogo(
    @UuidParam('id') id: string,
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<void> {
    await this.catalog.setImage('brand', id, requireUploadedFile(file).buffer);
  }

  // ---- Products and stock -----------------------------------------------

  @Get('products')
  products(
    @Query(new ZodValidationPipe(listStaffProductsQuerySchema)) query: ListStaffProductsQuery,
  ): Promise<PaginatedResponse<StaffProductResponse>> {
    return this.catalog.products(query);
  }

  @Get('products/:id')
  product(@UuidParam('id') id: string): Promise<StaffProductResponse> {
    return this.catalog.product(id);
  }

  @Post('products')
  @AdminOnly()
  @ApiOperation({ summary: 'New product (stock 0; add stock with POST …/stock)' })
  @ApiZodBody(createProductRequestSchema)
  createProduct(
    @Body(new ZodValidationPipe(createProductRequestSchema)) body: CreateProductRequest,
  ): Promise<StaffProductResponse> {
    return this.catalog.createProduct(body);
  }

  @Patch('products/:id')
  @AdminOnly()
  @ApiZodBody(updateProductRequestSchema)
  updateProduct(
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateProductRequestSchema)) body: UpdateProductRequest,
  ): Promise<StaffProductResponse> {
    return this.catalog.updateProduct(id, body);
  }

  @Put('products/:id/image')
  @AdminOnly()
  @SingleFileUpload()
  async productImage(
    @UuidParam('id') id: string,
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<StaffProductResponse> {
    await this.catalog.setImage('product', id, requireUploadedFile(file).buffer);
    return this.catalog.product(id);
  }

  @Delete('products/:id/image')
  @AdminOnly()
  async removeProductImage(@UuidParam('id') id: string): Promise<StaffProductResponse> {
    await this.catalog.setImage('product', id, null);
    return this.catalog.product(id);
  }

  @Post('products/:id/stock')
  @AdminOnly()
  @ApiOperation({ summary: 'Stock in/out by hand: restock, count fix, damaged, expired' })
  @ApiZodBody(adjustStockRequestSchema)
  adjustStock(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(adjustStockRequestSchema)) body: AdjustStockRequest,
  ): Promise<StaffProductResponse> {
    return this.catalog.adjustStock(user.userId, id, body);
  }

  @Get('products/:id/stock-movements')
  @ApiOperation({ summary: 'Inventory ledger of one product, newest first' })
  stockMovements(
    @UuidParam('id') id: string,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<PaginatedResponse<StockMovementResponse>> {
    return this.stock.history(id, query);
  }

  // ---- Delivery zones ----------------------------------------------------

  @Get('delivery-zones')
  zones(): Promise<StaffDeliveryZoneResponse[]> {
    return this.catalog.zones();
  }

  @Post('delivery-zones')
  @AdminOnly()
  @ApiZodBody(createDeliveryZoneRequestSchema)
  createZone(
    @Body(new ZodValidationPipe(createDeliveryZoneRequestSchema)) body: CreateDeliveryZoneRequest,
  ): Promise<StaffDeliveryZoneResponse> {
    return this.catalog.createZone(body);
  }

  @Patch('delivery-zones/:id')
  @AdminOnly()
  @ApiZodBody(updateDeliveryZoneRequestSchema)
  updateZone(
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateDeliveryZoneRequestSchema)) body: UpdateDeliveryZoneRequest,
  ): Promise<StaffDeliveryZoneResponse> {
    return this.catalog.updateZone(id, body);
  }

  @Delete('delivery-zones/:id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  removeZone(@UuidParam('id') id: string): Promise<void> {
    return this.catalog.removeZone(id);
  }

  // ---- Banners -----------------------------------------------------------

  @Get('banners')
  banners(): Promise<StaffShopBannerResponse[]> {
    return this.catalog.banners();
  }

  @Post('banners')
  @AdminOnly()
  @ApiZodBody(createShopBannerRequestSchema)
  createBanner(
    @Body(new ZodValidationPipe(createShopBannerRequestSchema)) body: CreateShopBannerRequest,
  ): Promise<StaffShopBannerResponse> {
    return this.catalog.createBanner(body);
  }

  @Patch('banners/:id')
  @AdminOnly()
  @ApiZodBody(updateShopBannerRequestSchema)
  updateBanner(
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateShopBannerRequestSchema)) body: UpdateShopBannerRequest,
  ): Promise<StaffShopBannerResponse> {
    return this.catalog.updateBanner(id, body);
  }

  @Delete('banners/:id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  removeBanner(@UuidParam('id') id: string): Promise<void> {
    return this.catalog.removeBanner(id);
  }

  @Put('banners/:id/image')
  @AdminOnly()
  @SingleFileUpload()
  async bannerImage(
    @UuidParam('id') id: string,
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<void> {
    await this.catalog.setImage('banner', id, requireUploadedFile(file).buffer);
  }

  // ---- Discount partners -------------------------------------------------

  @Get('partners')
  partners(): Promise<StaffDiscountPartnerResponse[]> {
    return this.catalog.partners();
  }

  @Post('partners')
  @AdminOnly()
  @ApiZodBody(createDiscountPartnerRequestSchema)
  createPartner(
    @Body(new ZodValidationPipe(createDiscountPartnerRequestSchema)) body: CreateDiscountPartnerRequest,
  ): Promise<StaffDiscountPartnerResponse> {
    return this.catalog.createPartner(body);
  }

  @Patch('partners/:id')
  @AdminOnly()
  @ApiZodBody(updateDiscountPartnerRequestSchema)
  updatePartner(
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateDiscountPartnerRequestSchema)) body: UpdateDiscountPartnerRequest,
  ): Promise<StaffDiscountPartnerResponse> {
    return this.catalog.updatePartner(id, body);
  }

  @Delete('partners/:id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  removePartner(@UuidParam('id') id: string): Promise<void> {
    return this.catalog.removePartner(id);
  }

  @Put('partners/:id/logo')
  @AdminOnly()
  @SingleFileUpload()
  async partnerLogo(
    @UuidParam('id') id: string,
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<void> {
    await this.catalog.setImage('partner', id, requireUploadedFile(file).buffer);
  }

  // ---- Orders ------------------------------------------------------------

  @Get('orders')
  orderList(
    @Query(new ZodValidationPipe(listStaffOrdersQuerySchema)) query: ListStaffOrdersQuery,
  ): Promise<PaginatedResponse<StaffOrderSummaryResponse>> {
    return this.orders.list(query);
  }

  @Get('orders/:orderId')
  @ApiOperation({ summary: 'One order with items, address and prescription (audited)' })
  order(@CurrentUser() user: AuthenticatedUser, @UuidParam('orderId') orderId: string): Promise<StaffOrderResponse> {
    return this.orders.get(user.userId, orderId);
  }

  @Post('orders/:orderId/prescription-review')
  @ApiOperation({ summary: 'Approve the prescription, or reject it (cancels and refunds)' })
  @ApiZodBody(reviewOrderPrescriptionRequestSchema)
  review(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('orderId') orderId: string,
    @Body(new ZodValidationPipe(reviewOrderPrescriptionRequestSchema)) body: ReviewOrderPrescriptionRequest,
  ): Promise<StaffOrderResponse> {
    return this.orders.reviewPrescription(user.userId, orderId, body);
  }

  @Post('orders/:orderId/confirm')
  @ApiZodBody(orderStepRequestSchema)
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('orderId') orderId: string,
    @Body(new ZodValidationPipe(orderStepRequestSchema)) body: OrderStepRequest,
  ): Promise<StaffOrderResponse> {
    return this.orders.confirm(user.userId, orderId, body.note);
  }

  @Post('orders/:orderId/dispatch')
  @ApiZodBody(orderStepRequestSchema)
  dispatch(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('orderId') orderId: string,
    @Body(new ZodValidationPipe(orderStepRequestSchema)) body: OrderStepRequest,
  ): Promise<StaffOrderResponse> {
    return this.orders.dispatch(user.userId, orderId, body.note);
  }

  @Post('orders/:orderId/deliver')
  @ApiZodBody(orderStepRequestSchema)
  deliver(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('orderId') orderId: string,
    @Body(new ZodValidationPipe(orderStepRequestSchema)) body: OrderStepRequest,
  ): Promise<StaffOrderResponse> {
    return this.orders.deliver(user.userId, orderId, body.note);
  }

  @Post('orders/:orderId/cancel')
  @ApiOperation({ summary: 'Cancel before delivery (stock back, refund when paid)' })
  @ApiZodBody(cancelOrderRequestSchema)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('orderId') orderId: string,
    @Body(new ZodValidationPipe(cancelOrderRequestSchema)) body: CancelOrderRequest,
  ): Promise<StaffOrderResponse> {
    return this.orders.cancel(user.userId, orderId, body.reason);
  }

  @Post('orders/:orderId/return')
  @AdminOnly()
  @ApiOperation({ summary: 'Returned after delivery (optional restock; online payments refunded)' })
  @ApiZodBody(returnOrderRequestSchema)
  markReturned(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('orderId') orderId: string,
    @Body(new ZodValidationPipe(returnOrderRequestSchema)) body: ReturnOrderRequest,
  ): Promise<StaffOrderResponse> {
    return this.orders.markReturned(user.userId, orderId, body);
  }
}
