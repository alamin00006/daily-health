import { ApiBody } from '@nestjs/swagger';
import { z } from 'zod';

/** @nestjs/swagger does not export SchemaObject; take it from ApiBody's options. */
type SwaggerSchema = NonNullable<
  Extract<Parameters<typeof ApiBody>[0], { schema?: unknown }>['schema']
>;

/** Documents a zod contract as the request body in Swagger. */
export const ApiZodBody = (schema: z.ZodType) =>
  ApiBody({
    schema: z.toJSONSchema(schema, {
      target: 'openapi-3.0',
      io: 'input',
      unrepresentable: 'any',
    }) as SwaggerSchema,
  });
