import { Injectable } from '@nestjs/common';
import { dhakaDate } from '../../common/time/dhaka-time.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  formatBookingCode,
  formatReadableId,
  nameInitial,
  type ReadableIdKind,
} from '../../shared-contracts/readable-id.contract.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** The Prisma client or a transaction client (`$transaction(async (tx) => …)`). */
type Db = PrismaService | Prisma.TransactionClient;

/**
 * Creates readable IDs (`PR-2611-0042`, see readable-id.contract.ts) for
 * patients, providers (doctors, nutritionists, physios) and staff, plus
 * booking codes (`BK-2611-0042`).
 *
 * The serial is "the last one + 1", taken from a counter row per kind and
 * month in a single atomic statement. A plain SELECT max(...) + 1 would give
 * two simultaneous signups the same number.
 */
@Injectable()
export class ReadableIdService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pass the transaction client when creating the row in a transaction, so a
   * rolled-back creation does not keep its number (a gap is harmless anyway).
   */
  async next(
    kind: ReadableIdKind,
    name: string,
    db: Db = this.prisma,
    now: Date = new Date(),
  ): Promise<string> {
    const period = periodOf(now);
    const serial = await this.increment(kind, period, db);
    return formatReadableId(kind, nameInitial(name), period, serial);
  }

  /** "BK-2611-0042" for an appointment (counter kind BOOKING). */
  async nextBookingCode(
    db: Db = this.prisma,
    now: Date = new Date(),
  ): Promise<string> {
    const period = periodOf(now);
    return formatBookingCode(period, await this.increment('BOOKING', period, db));
  }

  private async increment(
    kind: ReadableIdKind | 'BOOKING',
    period: string,
    db: Db,
  ): Promise<number> {
    const rows = await db.$queryRaw<{ lastValue: number }[]>`
      INSERT INTO "core"."ReadableIdCounter" ("kind", "period", "lastValue", "updatedAt")
      VALUES (${kind}, ${period}, 1, now())
      ON CONFLICT ("kind", "period")
      DO UPDATE SET "lastValue" = "ReadableIdCounter"."lastValue" + 1, "updatedAt" = now()
      RETURNING "lastValue"`;
    const serial = rows[0]?.lastValue;
    if (!serial) throw new Error('Readable ID counter returned nothing');
    return serial;
  }
}

/** "2611": YYMM in Asia/Dhaka. */
function periodOf(now: Date): string {
  return dhakaDate(now).slice(2, 7).replace('-', '');
}
