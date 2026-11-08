import { HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import { AppException } from '../errors/app-exception.js';
import { ErrorCode } from '../errors/error-codes.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';

/**
 * Opaque cursor for lists ordered by (timestamp DESC, id DESC): the last row's
 * sort time and id, base64url JSON. The id breaks ties between equal times.
 */
export interface KeysetPosition {
  at: Date;
  id: string;
}

const cursorPayloadSchema = z.object({ at: z.iso.datetime(), id: z.uuid() });

export function encodeCursor(position: KeysetPosition): string {
  return Buffer.from(
    JSON.stringify({ at: position.at.toISOString(), id: position.id }),
  ).toString('base64url');
}

/** 400 VALIDATION_FAILED for a cursor the API did not issue. */
export function decodeCursor(cursor: string): KeysetPosition {
  try {
    const parsed = cursorPayloadSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    );
    return { at: new Date(parsed.at), id: parsed.id };
  } catch {
    throw new AppException(
      ErrorCode.VALIDATION_FAILED,
      'Invalid cursor',
      HttpStatus.BAD_REQUEST,
      {
        issues: [
          { path: 'cursor', code: 'invalid', message: 'Invalid cursor' },
        ],
      },
    );
  }
}

/** Prisma `where` for "rows after this cursor" in (field DESC, id DESC) order. */
export function afterCursor<TField extends string>(
  field: TField,
  cursor: string | undefined,
): Record<string, unknown> {
  if (!cursor) return {};
  const { at, id } = decodeCursor(cursor);
  return {
    OR: [{ [field]: { lt: at } }, { [field]: at, id: { lt: id } }],
  };
}

/**
 * Builds the response from `limit + 1` fetched rows: the extra row only tells
 * whether another page exists.
 */
export function toKeysetPage<TRow extends { id: string }, TItem>(
  rows: TRow[],
  limit: number,
  sortTime: (row: TRow) => Date,
  toItem: (row: TRow) => TItem,
): PaginatedResponse<TItem> {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  return {
    data: page.map(toItem),
    meta: {
      cursor:
        hasMore && last
          ? encodeCursor({ at: sortTime(last), id: last.id })
          : null,
      hasMore,
    },
  };
}
