import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service.js';

/** What other modules may ask about prescriptions (the shop checks an attached RX). */
@Injectable()
export class PrescriptionLookupService {
  constructor(private readonly prisma: PrismaService) {}

  /** The prescription if it is ISSUED (not draft, not revoked) for this profile; else null. */
  async issuedForPatient(prescriptionId: string, patientId: string): Promise<{ id: string; code: string } | null> {
    return this.prisma.prescription.findFirst({
      where: { id: prescriptionId, patientId, status: 'ISSUED' },
      select: { id: true, code: true },
    });
  }

  /** Codes by id (for showing "RX-2611-0042" on orders). */
  async codesByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.prescription.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, code: true },
    });
    return new Map(rows.map((r) => [r.id, r.code]));
  }
}
