import { Param } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

/** A route param that must be a uuid; otherwise 400 VALIDATION_FAILED. */
export const UuidParam = (name: string) =>
  Param(name, new ZodValidationPipe(z.uuid()));
