import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  // Folder schema: datasource.prisma holds generator + datasource, one .prisma file per module (auth.prisma, users.prisma, ...).
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
    // Demo data for dev/staging; also runs after `prisma migrate reset`.
    seed: 'tsx prisma/seed/seed-demo-data.ts',
  },
  datasource: {
    // Not env(): that throws when unset, which would break `prisma generate`
    // in postinstall on a fresh clone. Migrate commands still fail clearly.
    url: process.env.DATABASE_URL,
  },
});
