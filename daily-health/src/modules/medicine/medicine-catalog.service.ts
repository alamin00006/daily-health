import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  DoseUnit,
  MedicineForm,
  MedicineResponse,
  SearchMedicinesQuery,
} from '../../shared-contracts/medicine.contract.js';

/** The unit people count each form in (চামচ for syrup, পাফ for inhalers…). */
const DOSE_UNIT_BY_FORM: Record<MedicineForm, DoseUnit> = {
  TABLET: 'TABLET',
  CAPSULE: 'CAPSULE',
  SYRUP: 'SPOON',
  SUSPENSION: 'SPOON',
  DROPS: 'DROP',
  INJECTION: 'ML',
  INSULIN: 'UNIT',
  INHALER: 'PUFF',
  CREAM: 'APPLICATION',
  OINTMENT: 'APPLICATION',
  GEL: 'APPLICATION',
  SUPPOSITORY: 'UNIT',
  POWDER: 'SACHET',
  OTHER: 'UNIT',
};

interface MedicineRow {
  id: string;
  brandName: string;
  genericName: string;
  strength: string;
  form: MedicineForm;
  manufacturer: string | null;
  unitPrice: Prisma.Decimal | null;
}

/** Below this pg_trgm similarity a name does not count as a typo match. */
const MIN_SIMILARITY = 0.3;

@Injectable()
export class MedicineCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Brand or generic name, tolerant of typos ("sergl" finds Sergel) via
   * pg_trgm; names that start with the query come first.
   */
  async search(query: SearchMedicinesQuery): Promise<MedicineResponse[]> {
    const escaped = query.q.replace(/[\\%_]/g, (char) => `\\${char}`);
    const contains = `%${escaped}%`;
    const prefix = `${escaped}%`;

    const rows = await this.prisma.$queryRaw<MedicineRow[]>`
      SELECT "id", "brandName", "genericName", "strength", "form"::text AS "form",
             "manufacturer", "unitPrice"
      FROM "medicine"."Medicine"
      WHERE "isActive"
        AND ("brandName" ILIKE ${contains}
          OR "genericName" ILIKE ${contains}
          OR public.similarity("brandName", ${query.q}) > ${MIN_SIMILARITY}
          OR public.similarity("genericName", ${query.q}) > ${MIN_SIMILARITY})
      ORDER BY ("brandName" ILIKE ${prefix}) DESC,
               GREATEST(public.similarity("brandName", ${query.q}),
                        public.similarity("genericName", ${query.q})) DESC,
               "brandName", "strength"
      LIMIT ${query.limit}`;
    return rows.map(toResponse);
  }

  async findActive(medicineId: string): Promise<MedicineResponse | null> {
    const row = await this.prisma.medicine.findFirst({
      where: { id: medicineId, isActive: true },
    });
    return row ? toResponse(row) : null;
  }
}

function toResponse(row: MedicineRow): MedicineResponse {
  return {
    id: row.id,
    brandName: row.brandName,
    genericName: row.genericName,
    strength: row.strength,
    form: row.form,
    manufacturer: row.manufacturer,
    unitPrice: row.unitPrice ? Number(row.unitPrice) : null,
    displayName: `${row.brandName} ${row.strength}`,
    suggestedDoseUnit: DOSE_UNIT_BY_FORM[row.form],
  };
}
