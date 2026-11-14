import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  type CanActivate,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, PublicRoute, RegisteredUsersOnly } from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { UuidParam } from '../../common/pipes/uuid-param.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import {
  requireUploadedFile,
  SingleFileUpload,
  type UploadedMultipartFile,
} from '../../core/uploads/single-file-upload.decorator.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import {
  cancelOrderRequestSchema,
  checkoutPreviewRequestSchema,
  createDeliveryAddressRequestSchema,
  linkOrderPrescriptionRequestSchema,
  listMyOrdersQuerySchema,
  listProductsQuerySchema,
  placeOrderRequestSchema,
  setCartItemRequestSchema,
  updateDeliveryAddressRequestSchema,
  type BrandResponse,
  type CancelOrderRequest,
  type CartResponse,
  type CheckoutPreviewRequest,
  type CheckoutPreviewResponse,
  type CreateDeliveryAddressRequest,
  type DeliveryAddressResponse,
  type DeliveryZoneResponse,
  type DiscountPartnerResponse,
  type LinkOrderPrescriptionRequest,
  type ListMyOrdersQuery,
  type ListProductsQuery,
  type OrderResponse,
  type OrderSummaryResponse,
  type PlaceOrderRequest,
  type ProductCategoryResponse,
  type ProductResponse,
  type ProductSummaryResponse,
  type SetCartItemRequest,
  type ShopHomeResponse,
  type ShopStatusResponse,
  type UpdateDeliveryAddressRequest,
} from '../../shared-contracts/shop.contract.js';
import { ShopCartService } from './shop-cart.service.js';
import { ShopCatalogService } from './shop-catalog.service.js';
import { ShopOrdersService } from './shop-orders.service.js';
import { ShopSettingsService } from './shop-settings.service.js';

/** Answers SHOP_DISABLED while the admins have the shop switched off. */
@Injectable()
export class ShopEnabledGuard implements CanActivate {
  constructor(private readonly settings: ShopSettingsService) {}

  async canActivate(): Promise<boolean> {
    await this.settings.assertEnabled();
    return true;
  }
}

@ApiTags('shop')
@PublicRoute()
@Controller('shop/status')
export class ShopStatusController {
  constructor(private readonly settings: ShopSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Is the shop switched on? (the app shows or hides it)' })
  async status(): Promise<ShopStatusResponse> {
    return { enabled: await this.settings.isEnabled() };
  }
}

@ApiTags('shop')
@PublicRoute()
@UseGuards(ShopEnabledGuard)
@Controller('shop')
export class ShopCatalogController {
  constructor(private readonly catalog: ShopCatalogService) {}

  @Get('home')
  @ApiOperation({ summary: 'Banners, categories, trending, home sections, brands, partners' })
  home(): Promise<ShopHomeResponse> {
    return this.catalog.home();
  }

  @Get('categories')
  categories(): Promise<ProductCategoryResponse[]> {
    return this.catalog.categories();
  }

  @Get('brands')
  brands(): Promise<BrandResponse[]> {
    return this.catalog.brands();
  }

  @Get('partners')
  @ApiOperation({ summary: 'Discount partners (hospitals, labs)' })
  partners(): Promise<DiscountPartnerResponse[]> {
    return this.catalog.partners();
  }

  @Get('delivery-zones')
  zones(): Promise<DeliveryZoneResponse[]> {
    return this.catalog.zones();
  }

  @Get('products')
  @ApiOperation({ summary: 'Search (fuzzy, Bangla too) and lists by category / brand / trending' })
  products(
    @Query(new ZodValidationPipe(listProductsQuerySchema)) query: ListProductsQuery,
  ): Promise<PaginatedResponse<ProductSummaryResponse>> {
    return this.catalog.products(query);
  }

  @Get('products/:productId')
  product(@UuidParam('productId') productId: string): Promise<ProductResponse> {
    return this.catalog.product(productId);
  }
}

@ApiTags('shop')
@ApiBearerAuth()
@RegisteredUsersOnly()
@UseGuards(ShopEnabledGuard)
@Controller('shop')
export class ShopCartController {
  constructor(
    private readonly cart: ShopCartService,
    private readonly settings: ShopSettingsService,
    private readonly orders: ShopOrdersService,
  ) {}

  @Get('cart')
  getCart(@CurrentUser() user: AuthenticatedUser): Promise<CartResponse> {
    return this.cart.cart(user.userId);
  }

  @Put('cart/items/:productId')
  @ApiOperation({ summary: 'Set the quantity (0 removes it)' })
  @ApiZodBody(setCartItemRequestSchema)
  setItem(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('productId') productId: string,
    @Body(new ZodValidationPipe(setCartItemRequestSchema)) body: SetCartItemRequest,
  ): Promise<CartResponse> {
    return this.cart.setItem(user.userId, productId, body.qty);
  }

  @Delete('cart')
  @HttpCode(HttpStatus.NO_CONTENT)
  clear(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.cart.clear(user.userId);
  }

  @Get('addresses')
  addresses(@CurrentUser() user: AuthenticatedUser): Promise<DeliveryAddressResponse[]> {
    return this.cart.addresses(user.userId);
  }

  @Post('addresses')
  @ApiZodBody(createDeliveryAddressRequestSchema)
  createAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createDeliveryAddressRequestSchema)) body: CreateDeliveryAddressRequest,
  ): Promise<DeliveryAddressResponse> {
    return this.cart.createAddress(user.userId, body);
  }

  @Patch('addresses/:addressId')
  @ApiZodBody(updateDeliveryAddressRequestSchema)
  updateAddress(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('addressId') addressId: string,
    @Body(new ZodValidationPipe(updateDeliveryAddressRequestSchema)) body: UpdateDeliveryAddressRequest,
  ): Promise<DeliveryAddressResponse> {
    return this.cart.updateAddress(user.userId, addressId, body);
  }

  @Delete('addresses/:addressId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAddress(@CurrentUser() user: AuthenticatedUser, @UuidParam('addressId') addressId: string): Promise<void> {
    return this.cart.removeAddress(user.userId, addressId);
  }

  @Post('checkout/preview')
  @ApiOperation({ summary: 'Totals with delivery, and what stops the order' })
  @ApiZodBody(checkoutPreviewRequestSchema)
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(checkoutPreviewRequestSchema)) body: CheckoutPreviewRequest,
  ): Promise<CheckoutPreviewResponse> {
    return this.cart.preview(user.userId, await this.settings.get(), body.addressId);
  }

  @Post('orders')
  @ApiOperation({ summary: 'Order the cart (online: pay with POST /payments, purpose ORDER)' })
  @ApiZodBody(placeOrderRequestSchema)
  place(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(placeOrderRequestSchema)) body: PlaceOrderRequest,
  ): Promise<OrderResponse> {
    return this.orders.place(user.userId, body);
  }
}

/** The buyer's orders stay reachable while the shop is off (to follow or cancel them). */
@ApiTags('shop')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('shop/orders')
export class ShopOrdersController {
  constructor(private readonly orders: ShopOrdersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listMyOrdersQuerySchema)) query: ListMyOrdersQuery,
  ): Promise<PaginatedResponse<OrderSummaryResponse>> {
    return this.orders.listMine(user.userId, query);
  }

  @Get(':orderId')
  get(@CurrentUser() user: AuthenticatedUser, @UuidParam('orderId') orderId: string): Promise<OrderResponse> {
    return this.orders.getMine(user.userId, orderId);
  }

  @Post(':orderId/cancel')
  @ApiOperation({ summary: 'Cancel before dispatch (full refund when paid)' })
  @ApiZodBody(cancelOrderRequestSchema)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('orderId') orderId: string,
    @Body(new ZodValidationPipe(cancelOrderRequestSchema)) body: CancelOrderRequest,
  ): Promise<OrderResponse> {
    return this.orders.cancelMine(user.userId, orderId, body.reason);
  }

  @Put(':orderId/prescription')
  @SingleFileUpload()
  @ApiOperation({ summary: 'Photo of a paper prescription (private)' })
  attachPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('orderId') orderId: string,
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<OrderResponse> {
    return this.orders.attachPrescriptionPhoto(user.userId, orderId, requireUploadedFile(file).buffer);
  }

  @Post(':orderId/prescription-link')
  @ApiOperation({ summary: 'Use an issued prescription (RX-…) of the profile' })
  @ApiZodBody(linkOrderPrescriptionRequestSchema)
  linkPrescription(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('orderId') orderId: string,
    @Body(new ZodValidationPipe(linkOrderPrescriptionRequestSchema)) body: LinkOrderPrescriptionRequest,
  ): Promise<OrderResponse> {
    return this.orders.linkPrescription(user.userId, orderId, body.prescriptionId);
  }
}
