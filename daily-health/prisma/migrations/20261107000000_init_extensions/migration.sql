-- Extensions required by the app (CLAUDE.md §2).
-- They live in `public`, which is not in the Prisma `schemas` list, so Prisma
-- never tries to manage or drop their objects (e.g. public.spatial_ref_sys).
-- Module schemas are created by each module's own first migration.

-- Geo queries: hospitals, home visits, emergency requests.
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;

-- Trigram indexes for fuzzy Bangla search (doctors, medicines, forum).
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- gen_random_uuid() and digest() for raw SQL and seeds.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
