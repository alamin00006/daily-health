# দৈনিক স্বাস্থ্য: provider and admin panel

The web panel for doctors, nutritionists and physiotherapists (appointments, chambers, weekly
sessions, days off, profile and verification documents) and for admins (provider verification).
Next.js 16 (App Router, Cache Components) + Tailwind CSS 4, TanStack Query, React Hook Form + Zod.

## Run locally

```bash
cp .env.example .env.local      # API_BASE_URL=http://localhost:3000/api/v1
npm install
npm run dev -- -p 3001          # the API uses port 3000
```

Demo accounts come from the API's `npm run db:seed` (PIN `274816`):
`dr.farhana.demo@example.com`, `dr.mahbub.demo@example.com` (doctors),
`dr.arif.demo@example.com` (waiting for verification), `admin.demo@example.com` (admin).
New providers sign up at `/signup` (email code from Mailpit, http://localhost:8025).

## How it talks to the API

The browser never holds API tokens:

- `src/app/bff/auth/[action]` logs in, signs up, resets the PIN or logs out. It adds this
  browser's device block and keeps the access and refresh tokens in **httpOnly cookies**.
- `src/app/bff/api/[...path]` forwards every other call to the API with the access token. It
  refreshes an expired token once, and shares one refresh between parallel requests, because a
  reused refresh token revokes the session.
- `src/proxy.ts` (Next 16's renamed middleware) sends visitors without a session to `/login`.

The panel runs as one Node process (`next start`) on the VPS, behind Nginx, which the in-memory
refresh sharing relies on.

## Layout

```
src/
  app/(auth)/          login (PIN or email code), signup, reset-pin
  app/onboarding/      professional details after signup (type, BMDC number, specialties)
  app/(panel)/         dashboard, appointments, schedule, profile, admin/verification
  app/bff/             session cookies + API proxy (server only)
  components/          ui/ primitives, appointments/, schedule/, provider/, auth/
  features/            TanStack Query hooks (panel-queries) and Bangla labels
  lib/                 API client, Bangla formatting, error messages
  shared-contracts/    copy of the API's zod contracts
```

Contracts are edited in the API only; run `node scripts/copy-shared-contracts.mjs` there to copy
them to the panel and the mobile app.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->
