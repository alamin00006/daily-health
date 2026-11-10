import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import type { PaymentPurpose } from '../../shared-contracts/payments.contract.js';
import { PaymentsErrorCode } from './payments-error-codes.js';

/** Something a user is about to pay for, described by the module that owns it. */
export interface PayableItem {
  /** ref users.PatientProfile */
  patientId: string;
  /** Who earns from it (null: the platform). */
  providerId: string | null;
  amount: number;
  /** Shown on the receipt and the gateway page. */
  description: string;
  /** The city on the gateway form (profile district). */
  city: string | null;
  payerName: string;
}

/**
 * Checks that `userId` may pay for `referenceId` now (access, status, hold)
 * and returns what it costs. Throws an AppException otherwise.
 */
export type PayableResolver = (
  userId: string,
  referenceId: string,
) => Promise<PayableItem>;

/**
 * Modules register what can be paid for (appointments → APPOINTMENT; quick
 * consults in step 7), so this module never reads their tables.
 */
@Injectable()
export class PayableRegistryService {
  private readonly resolvers = new Map<PaymentPurpose, PayableResolver>();

  register(purpose: PaymentPurpose, resolver: PayableResolver): void {
    this.resolvers.set(purpose, resolver);
  }

  resolve(purpose: PaymentPurpose, userId: string, referenceId: string): Promise<PayableItem> {
    const resolver = this.resolvers.get(purpose);
    if (!resolver) {
      throw new AppException(
        PaymentsErrorCode.PAYMENT_NOT_ALLOWED,
        `${purpose} payments are not available yet`,
        HttpStatus.CONFLICT,
      );
    }
    return resolver(userId, referenceId);
  }
}
