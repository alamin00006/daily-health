import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { FavoriteProviderResponse } from '../../shared-contracts/doctors.contract.js';
import type { ProfileAccess } from '../users/profile-access.service.js';
import { ProviderDirectoryService } from './provider-directory.service.js';

/** A patient profile's "my doctors" list (health profile → আমার ডাক্তার). */
@Injectable()
export class FavoriteProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: ProviderDirectoryService,
  ) {}

  async list(access: ProfileAccess): Promise<FavoriteProviderResponse[]> {
    const rows = await this.prisma.favoriteProvider.findMany({
      where: { patientId: access.profile.id },
      orderBy: { addedAt: 'desc' },
    });
    const summaries = await this.directory.summariesByIds(
      rows.map((row) => row.providerId),
    );
    return rows.flatMap((row) => {
      const provider = summaries.get(row.providerId);
      return provider
        ? [{ provider, addedAt: row.addedAt.toISOString() }]
        : [];
    });
  }

  /** Idempotent. */
  async add(access: ProfileAccess, providerId: string): Promise<void> {
    await this.directory.requireVerified(providerId);
    await this.prisma.favoriteProvider.upsert({
      where: {
        patientId_providerId: { patientId: access.profile.id, providerId },
      },
      create: { patientId: access.profile.id, providerId },
      update: {},
    });
  }

  /** Idempotent. */
  async remove(access: ProfileAccess, providerId: string): Promise<void> {
    await this.prisma.favoriteProvider.deleteMany({
      where: { patientId: access.profile.id, providerId },
    });
  }

  /** Called after a completed visit, so the doctor shows up in "my doctors". */
  async addSilently(patientId: string, providerId: string): Promise<void> {
    await this.prisma.favoriteProvider.upsert({
      where: { patientId_providerId: { patientId, providerId } },
      create: { patientId, providerId },
      update: {},
    });
  }
}
