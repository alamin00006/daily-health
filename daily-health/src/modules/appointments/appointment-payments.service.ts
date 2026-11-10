import { HttpStatus, Injectable, type OnModuleInit } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import { toBanglaDigits } from '../../common/formatting/bangla-digits.js';
import { dateColumnToString } from '../../common/time/dhaka-time.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { ProviderDirectoryService } from '../doctors/provider-directory.service.js';
import {
  PayableRegistryService,
  type PayableItem,
} from '../payments/payable-registry.service.js';
import { PaymentsErrorCode } from '../payments/payments-error-codes.js';
import {
  ProfileAccessService,
  ProfileAction,
} from '../users/profile-access.service.js';
import { appointmentNotFound } from './appointment-booking.service.js';

/** The gateway page must not open with only seconds of the hold left. */
const MIN_HOLD_LEFT_MS = 60_000;

const MODE_TEXT = {
  IN_PERSON: 'চেম্বার',
  VIDEO: 'ভিডিও কল',
  CHAT: 'চ্যাট',
  HOME_VISIT: 'হোম ভিজিট',
} as const;

const MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];

/**
 * Tells the payments module what an appointment costs and whether it can be
 * paid now: the payer needs EDIT access to the profile, and the booking must
 * still be holding its slot.
 */
@Injectable()
export class AppointmentPaymentsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PayableRegistryService,
    private readonly access: ProfileAccessService,
    private readonly directory: ProviderDirectoryService,
  ) {}

  onModuleInit(): void {
    this.registry.register('APPOINTMENT', (userId, referenceId) =>
      this.payable(userId, referenceId),
    );
  }

  private async payable(userId: string, appointmentId: string): Promise<PayableItem> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });
    if (!appointment) throw appointmentNotFound();
    const { profile } = await this.access.assert(
      userId,
      appointment.patientId,
      ProfileAction.EDIT,
    );
    const holdLeft = (appointment.holdExpiresAt?.getTime() ?? 0) - Date.now();
    if (appointment.status !== 'PENDING_PAYMENT' || holdLeft < MIN_HOLD_LEFT_MS) {
      throw new AppException(
        PaymentsErrorCode.PAYMENT_NOT_ALLOWED,
        'This booking is not waiting for payment',
        HttpStatus.CONFLICT,
        { status: appointment.status, holdExpired: holdLeft < MIN_HOLD_LEFT_MS },
      );
    }
    const provider = await this.directory.findById(appointment.providerId);
    const [, month, day] = dateColumnToString(appointment.sessionDate).split('-').map(Number) as [number, number, number];
    const who = provider ? `${provider.type === 'DOCTOR' ? 'ডা. ' : ''}${provider.displayName}` : '';
    return {
      patientId: appointment.patientId,
      providerId: appointment.providerId,
      amount: appointment.fee.toNumber(),
      description: `${who}, ${MODE_TEXT[appointment.mode]} ${toBanglaDigits(day)} ${MONTHS[month - 1]} (${appointment.code})`,
      city: profile.district,
      payerName: profile.fullName,
    };
  }
}
