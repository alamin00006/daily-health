import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import { decodeCursor, encodeCursor } from '../../common/pagination/keyset-cursor.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type { ReviewResponse } from '../../shared-contracts/doctors.contract.js';
import { DoctorsErrorCode } from './doctors-error-codes.js';
import { ProviderDirectoryService } from './provider-directory.service.js';

export interface NewReview {
  providerId: string;
  patientId: string;
  authorUserId: string;
  appointmentId: string;
  rating: number;
  comment: string | null;
}

/**
 * Patient reviews of providers. The appointments module checks that the
 * visit was completed before calling add(); the rating average is updated in
 * the same transaction.
 */
@Injectable()
export class ProviderReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: ProviderDirectoryService,
  ) {}

  async list(
    providerId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<PaginatedResponse<ReviewResponse>> {
    await this.directory.requireVerified(providerId);
    const before = cursor ? decodeCursor(cursor) : undefined;
    const reviews = await this.directory.latestReviews(
      providerId,
      limit + 1,
      before,
    );
    const hasMore = reviews.length > limit;
    const page = hasMore ? reviews.slice(0, limit) : reviews;
    const last = page.at(-1);
    return {
      data: page,
      meta: {
        cursor:
          hasMore && last
            ? encodeCursor({ at: new Date(last.createdAt), id: last.id })
            : null,
        hasMore,
      },
    };
  }

  async add(review: NewReview): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.review.create({ data: review });
        const stats = await tx.review.aggregate({
          where: { providerId: review.providerId, status: 'VISIBLE' },
          _avg: { rating: true },
          _count: { _all: true },
        });
        await tx.provider.update({
          where: { id: review.providerId },
          data: {
            ratingAvg: new Prisma.Decimal(
              (stats._avg.rating ?? 0).toFixed(2),
            ),
            ratingCount: stats._count._all,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          DoctorsErrorCode.REVIEW_EXISTS,
          'This visit was already reviewed',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  /** The review of each appointment, if any (for "can review" flags). */
  async byAppointmentIds(
    appointmentIds: string[],
  ): Promise<Map<string, { rating: number; comment: string | null }>> {
    if (appointmentIds.length === 0) return new Map();
    const rows = await this.prisma.review.findMany({
      where: { appointmentId: { in: appointmentIds } },
      select: { appointmentId: true, rating: true, comment: true },
    });
    return new Map(
      rows.map((row) => [
        row.appointmentId,
        { rating: row.rating, comment: row.comment },
      ]),
    );
  }
}
