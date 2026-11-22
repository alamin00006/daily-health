import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service.js';

/**
 * Where a user can be reached, for the notifications module (which must not
 * read auth tables itself). Push tokens count only on devices with a live
 * session: after logout or a password reset that phone stops getting pushes.
 */
@Injectable()
export class UserContactPointsService {
  constructor(private readonly prisma: PrismaService) {}

  async pushTokensByUser(userIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (userIds.length === 0) return result;

    const devices = await this.prisma.device.findMany({
      where: {
        userId: { in: userIds },
        pushToken: { not: null },
        user: { status: 'ACTIVE' },
        sessions: { some: { revokedAt: null, expiresAt: { gt: new Date() } } },
      },
      select: { userId: true, pushToken: true },
    });
    for (const device of devices) {
      if (!device.pushToken) continue;
      const tokens = result.get(device.userId) ?? [];
      tokens.push(device.pushToken);
      result.set(device.userId, tokens);
    }
    return result;
  }

  /** E.164 numbers of users who have one (accounts opened or verified with a phone). */
  async smsPhonesByUser(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, phone: { not: null }, status: 'ACTIVE' },
      select: { id: true, phone: true },
    });
    return new Map(
      users.flatMap((user) => (user.phone ? [[user.id, user.phone]] : [])),
    );
  }

  /** The push service said these tokens no longer exist (app uninstalled). */
  async removePushTokens(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    await this.prisma.device.updateMany({
      where: { pushToken: { in: tokens } },
      data: { pushToken: null },
    });
  }
}
