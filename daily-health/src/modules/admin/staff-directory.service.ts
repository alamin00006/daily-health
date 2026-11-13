import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { StaffMember } from '../../generated/prisma/client.js';

/**
 * Read side of staff accounts (admin.StaffMember) for other modules: names to
 * show next to what staff did. Lives in StaffModule, which other modules can
 * import without pulling in the whole admin module (no import cycles).
 */
@Injectable()
export class StaffDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  async namesByUserIds(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.staffMember.findMany({
      where: { userId: { in: [...new Set(userIds)] } },
      select: { userId: true, fullName: true },
    });
    return new Map(rows.map((row) => [row.userId, row.fullName]));
  }

  findByUserId(userId: string): Promise<StaffMember | null> {
    return this.prisma.staffMember.findUnique({ where: { userId } });
  }
}
