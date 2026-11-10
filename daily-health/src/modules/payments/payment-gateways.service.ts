import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../core/config/app-config.service.js';
import type { PaymentGatewayName } from '../../shared-contracts/payments.contract.js';
import type { PaymentGateway } from './gateways/payment-gateway.js';
import { ShurjoPayGatewayService } from './gateways/shurjopay-gateway.service.js';
import { SslCommerzGatewayService } from './gateways/sslcommerz-gateway.service.js';

/**
 * New payments go through the gateway chosen by PAYMENT_GATEWAY. A payment
 * is always verified and refunded by the gateway that took it, so switching
 * does not strand payments made before the switch.
 */
@Injectable()
export class PaymentGatewaysService {
  private readonly gateways: Record<PaymentGatewayName, PaymentGateway>;

  constructor(
    private readonly config: AppConfigService,
    shurjoPay: ShurjoPayGatewayService,
    sslCommerz: SslCommerzGatewayService,
  ) {
    this.gateways = { SHURJOPAY: shurjoPay, SSLCOMMERZ: sslCommerz };
  }

  active(): PaymentGateway {
    return this.gateways[this.config.payments.gateway];
  }

  byName(name: PaymentGatewayName): PaymentGateway {
    return this.gateways[name];
  }

  /** `shurjopay` / `sslcommerz` in callback URLs. */
  bySlug(slug: string): PaymentGateway | null {
    const name = slug.toUpperCase() as PaymentGatewayName;
    return name in this.gateways ? this.gateways[name] : null;
  }
}
