import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  searchMedicinesQuerySchema,
  type MedicineResponse,
  type SearchMedicinesQuery,
} from '../../shared-contracts/medicine.contract.js';
import { MedicineCatalogService } from './medicine-catalog.service.js';

@ApiTags('medicine: catalog')
@ApiBearerAuth()
@Controller('medicines')
export class MedicineCatalogController {
  constructor(private readonly catalog: MedicineCatalogService) {}

  @Get()
  @ApiOperation({
    summary:
      'Search by brand or generic name (typo tolerant), e.g. ?q=napa (guests too)',
  })
  search(
    @Query(new ZodValidationPipe(searchMedicinesQuerySchema))
    query: SearchMedicinesQuery,
  ): Promise<MedicineResponse[]> {
    return this.catalog.search(query);
  }
}
