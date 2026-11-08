import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import {
  afterCursor,
  toKeysetPage,
} from '../../common/pagination/keyset-cursor.js';
import { EmailOutboxService } from '../../core/mail/email-outbox.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type {
  ListProvidersForReviewQuery,
  ProviderForReviewResponse,
} from '../../shared-contracts/doctors.contract.js';
import { UserAccountsService } from '../auth/user-accounts.service.js';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service.js';
import { DoctorsErrorCode } from './doctors-error-codes.js';
import { providerNotFound } from './provider-directory.service.js';
import { ProviderProfileService } from './provider-profile.service.js';
import {
  providerRejectedEmail,
  providerVerifiedEmail,
} from './provider-verification-emails.js';

/**
 * Admins check BMDC numbers and documents before a provider is shown to
 * patients (CLAUDE.md §1). The rest of the admin panel comes in step 10.
 */
@Injectable()
export class ProviderVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profile: ProviderProfileService,
    private readonly accounts: UserAccountsService,
    private readonly emails: EmailOutboxService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  async list(
    query: ListProvidersForReviewQuery,
  ): Promise<PaginatedResponse<ProviderForReviewResponse>> {
    const rows = await this.prisma.provider.findMany({
      where: {
        verificationStatus: query.status,
        ...afterCursor('updatedAt', query.cursor),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: { id: true, updatedAt: true },
    });
    const page = toKeysetPage(
      rows,
      query.limit,
      (row) => row.updatedAt,
      (row) => row.id,
    );
    return {
      data: await Promise.all(page.data.map((id) => this.get(id))),
      meta: page.meta,
    };
  }

  async get(providerId: string): Promise<ProviderForReviewResponse> {
    const provider = await this.prisma.provider.findUnique({
      where: { id: providerId },
      select: { userId: true, updatedAt: true },
    });
    if (!provider) throw providerNotFound();
    const [view, account] = await Promise.all([
      this.profile.view(providerId),
      this.accounts.findById(provider.userId),
    ]);
    return {
      ...view,
      accountEmail: account?.email ?? null,
      submittedAt: provider.updatedAt.toISOString(),
    };
  }

  async verify(
    adminUserId: string,
    providerId: string,
  ): Promise<ProviderForReviewResponse> {
    const provider = await this.requireReviewable(providerId);
    await this.prisma.$transaction([
      this.prisma.provider.update({
        where: { id: providerId },
        data: {
          verificationStatus: 'VERIFIED',
          verifiedAt: new Date(),
          verifiedByUserId: adminUserId,
          rejectionReason: null,
        },
      }),
      this.prisma.verificationDocument.updateMany({
        where: { providerId, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          reviewedByUserId: adminUserId,
          reviewedAt: new Date(),
        },
      }),
    ]);
    await this.tell(provider.userId, provider.displayName, null);
    return this.get(providerId);
  }

  async reject(
    adminUserId: string,
    providerId: string,
    reason: string,
  ): Promise<ProviderForReviewResponse> {
    const provider = await this.requireReviewable(providerId);
    await this.prisma.$transaction([
      this.prisma.provider.update({
        where: { id: providerId },
        data: {
          verificationStatus: 'REJECTED',
          rejectionReason: reason,
          verifiedAt: null,
          verifiedByUserId: null,
          isOnline: false,
        },
      }),
      this.prisma.verificationDocument.updateMany({
        where: { providerId, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          reviewedByUserId: adminUserId,
          reviewedAt: new Date(),
        },
      }),
    ]);
    await this.tell(provider.userId, provider.displayName, reason);
    return this.get(providerId);
  }

  /** PENDING can be decided; a VERIFIED provider can also be suspended by rejecting. */
  private async requireReviewable(providerId: string) {
    const provider = await this.prisma.provider.findUnique({
      where: { id: providerId },
    });
    if (!provider) throw providerNotFound();
    if (provider.verificationStatus === 'REJECTED') {
      throw new AppException(
        DoctorsErrorCode.VERIFICATION_NOT_ALLOWED,
        'Already rejected; wait for the provider to resubmit',
        HttpStatus.CONFLICT,
      );
    }
    return provider;
  }

  /** In the panel's inbox and by email. */
  private async tell(
    userId: string,
    name: string,
    rejectionReason: string | null,
  ): Promise<void> {
    await this.delivery.deliver([
      {
        userId,
        type: rejectionReason ? 'provider.rejected' : 'provider.verified',
        title: rejectionReason
          ? 'প্রোফাইলে সংশোধন দরকার'
          : 'আপনার প্রোফাইল যাচাই হয়েছে',
        body: rejectionReason ?? 'রোগীরা এখন আপনাকে অ্যাপে খুঁজে পাবেন।',
        channels: ['IN_APP'],
      },
    ]);
    const account = await this.accounts.findById(userId);
    if (!account?.email) return;
    await this.emails.enqueue(
      rejectionReason
        ? providerRejectedEmail(account.email, name, rejectionReason)
        : providerVerifiedEmail(account.email, name),
    );
  }
}
