// Smoke test of both payment gateways against their sandboxes:
//   npx tsx scripts/check-payment-gateways.ts
// Opens a checkout, verifies it (unpaid → PENDING) and, for SSLCommerz, tries
// a refund without a bank transaction (→ FAILED, without calling the gateway).
import '../src/core/config/load-env-file.js';
import { AppConfigService } from '../src/core/config/app-config.service.js';
import { parseEnvironmentVariables } from '../src/core/config/environment-variables.schema.js';
import type { PaymentGateway } from '../src/modules/payments/gateways/payment-gateway.js';
import { ShurjoPayGatewayService } from '../src/modules/payments/gateways/shurjopay-gateway.service.js';
import { SslCommerzGatewayService } from '../src/modules/payments/gateways/sslcommerz-gateway.service.js';

const config = new AppConfigService(parseEnvironmentVariables(process.env));
const base = config.payments.callbackBaseUrl;

async function check(gateway: PaymentGateway): Promise<void> {
  const invoiceNo = `RC-9999-${String(Date.now() % 10_000).padStart(4, '0')}`;
  const slug = gateway.name.toLowerCase();
  const checkout = await gateway.createCheckout({
    paymentId: '00000000-0000-4000-8000-000000000000',
    invoiceNo,
    amount: 500,
    description: 'Gateway smoke test',
    customer: { name: 'Test', email: 'test@example.com', phone: '01700000000', address: 'Dhaka', city: 'Dhaka' },
    returnUrl: `${base}/payments/return/${slug}`,
    ipnUrl: `${base}/payments/ipn/${slug}`,
    clientIp: '127.0.0.1',
  });
  console.log(`${gateway.name}: checkout ${new URL(checkout.checkoutUrl).host}, id ${checkout.gatewayPaymentId.slice(0, 12)}…`);
  const verify = await gateway.verify({ gatewayPaymentId: checkout.gatewayPaymentId, invoiceNo });
  console.log(`${gateway.name}: verify → ${verify.state} (${verify.gatewayStatus})`);
  const refund = await gateway.refund({
    gatewayPaymentId: checkout.gatewayPaymentId,
    gatewayTrxId: null,
    invoiceNo,
    amount: 500,
    reason: 'test',
    refundId: 'test',
  });
  console.log(`${gateway.name}: refund without payment → ${refund.state} (${refund.reason}), api=${gateway.supportsRefundApi}`);
}

for (const gateway of [new ShurjoPayGatewayService(config), new SslCommerzGatewayService(config)]) {
  try {
    await check(gateway);
  } catch (error) {
    console.log(`${gateway.name}: ERROR ${(error as Error).message}`);
  }
}
