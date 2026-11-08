# দৈনিক স্বাস্থ্য (Doinik Shasthya): Project Context

This file holds every product and technical decision made so far, so you have the context before writing code.
Owner: Mohammad Al Amin, a full-stack developer in Dhaka. He usually writes in Banglish, so reply in Bangla/Banglish and keep code, comments and commit messages in English.

## Working rules for Claude
- **Do not substitute technologies without asking.** Everything below is chosen. If something seems wrong, say so and ask before changing it.
- **Write complete, production-ready code**, not scaffolding or TODO stubs.
- **Work in vertical slices.** Finish one module in the backend, then build the same module in the frontend, before moving on (see "Workflow").
- Ask before any decision listed under "Open decisions".
- `erd.md` (repo root) is the source of truth for tables. If code and `erd.md` disagree, ask, then update both together.

## 1. Product
"দৈনিক স্বাস্থ্য" is a Bangla-first daily health app for Bangladesh. Tagline: "আপনার প্রতিদিনের ডিজিটাল স্বাস্থ্যসেবা". **All features launch together** (owner's decision), but they are built module by module.

Features (from the owner's design PDF, 9 screens):
1. **Login:**
   - **For now: email + 6-digit PIN, with OTP sent by email** (nodemailer over SMTP; Mailpit locally) for signup, login-by-code and PIN reset. Owner's decision, 2026-11-07.
   - **Later: mobile number + SMS OTP**, added once the email flow is complete. Bangladeshi numbers only (+8801XXXXXXXXX). Foreign numbers are out of scope until the owner decides otherwise.
   - Guest mode (browse only; guests cannot create health profiles).
2. **Home:** greeting, emergency (আকস্মিক সেবা) button, today's medicine card with "সেবন করেছি" and progress, feature tiles, health tips.
3. **Health profile:**
   - Vitals (BP, sugar, weight/BMI) with status.
   - Chronic conditions and allergies.
   - Lab reports and prescriptions upload.
   - My doctors.
   - QR digital health card.
   - **Family profiles.** One user manages parents and children, and **several users can share one profile** (see "Family and caregivers" below).
4. **Medicine alarm:** daily dose schedule (taken / due / snoozed / pending), adherence %, add medicine, refill/stock alert. Doses can differ by time of day (e.g. `1+0+½`).
5. **Follow-up & reminders:** in-app and external follow-ups (chamber, video, home visit), with SMS / push / alarm reminders 24 hours and 2 hours before.
6. **Doctor consultation:** search, specialty filter, online-now doctors, video call, appointment booking with slot + bKash/Nagad payment, history. Doctors show their BMDC number.
7. **Women's health & period tracker:**
   - Cycle ring, period start, symptoms and mood.
   - Pregnancy tracking.
   - A **৳10 quick chat consult** with a female doctor.
   - A private women's forum.
   - This section can be locked with its own PIN, which stays on the device only.
8. **Nutritionist & diet chart:** nutritionist profile and booking, a daily 4-meal diet chart with check-off, calorie and water targets.
9. **Community forum:** posts (anonymous option), categories (mental health, women's health, child care, pain & therapy), verified doctor answers, likes, reports, moderation.

Also required:
- **Doctor/admin web panel.** Doctors take calls, write prescriptions and manage schedules. Admins verify BMDC numbers, moderate content and handle payouts.

### Family and caregivers
- A `PatientProfile` is not owned by one user. Access goes through `ProfileMember (profileId, userId, role, relation)`, and every profile must have at least one OWNER.
- What each role can do:
  - **OWNER:** everything, including adding and removing members and deleting the profile.
  - **CAREGIVER:** view the profile and add or edit its data.
  - **VIEWER:** read only.
- New members join through a `ProfileInvite` sent to their email. They accept in the app while logged in with that (OTP-verified) email, so no extra code is needed. Invites last 7 days.
- If the patient has their own account (for example an elderly father with his own phone), it is linked through `PatientProfile.linkedUserId`.
- Members with `receivesAlerts = true` get missed-dose and emergency alerts, so children can watch over their parents' care.
- **Women's health data** can be seen only by the profile's own linked user. If the profile has no linked account, its OWNER can see it. CAREGIVER and VIEWER never see it.

### Market notes
Competitors: DocTime, Maya, Arogga, MedEasy, Praava, CMED, DoctorKoi.
- The ৳10 consult must be **chat only**. A video call costs more than the fee. This is enforced in the DB with a CHECK constraint.
- Possible edge: chronic care for elderly parents, managed by their children. Children living abroad are a later phase, since foreign numbers are not supported yet.

Prototype (clickable, owner's claude.ai account): https://claude.ai/artifact/NPgeL27mdjgfmeManuNK1e
ER diagram page (may be older than `erd.md`): https://claude.ai/artifact/2Pr99kkQkfnfBjK1vPdHL7
Full table definitions: `erd.md` (repo root).

## 2. Tech stack (decided)
- **Monorepo:** Turborepo + pnpm.
  - `apps/mobile`: patient app.
  - `apps/api`: backend.
  - `apps/panel`: doctor/admin web panel.
  - `packages/shared`: zod schemas and TS types shared by API and clients.
- **Mobile:**
  - React Native **Expo**, with Expo Router and **Development Builds** (not Expo Go) via EAS. Do NOT switch to the bare React Native CLI.
  - Styling: **NativeWind v4** (Tailwind CSS 3, the stable line). Do not use v5, which is still an RC. gluestack-ui components only where useful.
  - State: **TanStack Query** for server state, **Zustand** for client state (session, multi-step flows). Owner's decision, 2026-11-07.
  - HTTP: **Axios** (one instance; access token and refresh-and-retry in interceptors). Forms: **React Hook Form + Zod** (`zodResolver`, rules from the shared contracts, Bangla messages). Owner's decision, 2026-11-07.
  - `expo-image` (caching, blurhash), `@shopify/flash-list` for long lists, Reanimated for animations.
  - Other Expo libraries:
    - `expo-notifications` for local scheduled alarms.
    - `expo-secure-store` for PIN, tokens and the women's-health lock PIN.
    - `expo-sqlite` for offline reminders.
  - `expo-image-picker`, `expo-document-picker` and `expo-image-manipulator`. Resize uploads to 1600px at quality ~0.7 before sending.
  - Bangla font: **Hind Siliguri**, loaded with `expo-font`, one file per weight, exposed as `font-bangla`, `font-bangla-semibold` and so on. Display font: Baloo Da 2.
- **Backend:**
  - **NestJS modular monolith**, built as a separate app. Each feature is its own module.
  - **PostgreSQL 16/17** (`postgis/postgis` image) with extensions `postgis`, `pg_trgm` (Bangla fuzzy search) and `pgcrypto`.
  - **Prisma** with multi-schema: one Postgres schema per module. `multiSchema` was a preview feature and is GA in recent Prisma 6 releases. Check the installed version: add `previewFeatures = ["multiSchema"]` only if that version still needs it.
  - **Redis + BullMQ** for reminders, SMS and scheduled jobs. `@nestjs/event-emitter` for events between modules.
  - **Socket.io** for chat and call signaling.
- **Web panel:** Next.js + Tailwind.
- **Hosting:** a VPS with Docker Compose (Postgres, Redis, Nginx, API).

## 3. Open decisions (ask the owner first)
- **Video calling:** self-hosted **LiveKit** (free, owner pays bandwidth) or **Twilio Video** (~$0.004 per participant-minute, no official RN SDK).
  - Either way, build a `VideoProvider` interface in the consultation module (`createRoom`, `issueToken`, `endRoom`) so the provider can be swapped.
  - In Bangladesh a TURN relay is mandatory, because mobile carriers use CGNAT.
  - Incoming-call ringing needs FCM high-priority on Android and PushKit + CallKit on iOS (`react-native-callkeep`).
- SMS gateway provider, and whether to add a separate Nagad integration.
- **Diet plan payment:** is a nutritionist always booked through a normal Appointment (`purpose = APPOINTMENT`, current assumption), or can a patient buy a DietPlan directly (`purpose = DIET_PLAN`)?
- **Women-only forum:** is a self-declared gender on the user's own profile enough, or is extra verification needed?

## 4. Backend architecture
```
apps/api/src/
├── core/      config (zod-validated env), prisma, guards, interceptors, logger, storage, crypto
├── common/    shared DTOs, utils, decorators
└── modules/
    auth, users, health-profile, records, doctors, appointments, consultation,
    chat, prescriptions, medicine, nutrition, womens-health, community,
    payments, notifications, emergency, content, admin
```

Module boundaries:
- A module never queries another module's tables. It calls that module's exported service.
- Cross-module side effects go through events. Example: `appointment.booked` makes notifications schedule reminders.
- Real FK constraints exist only inside one module's schema. A cross-module id is a plain uuid column. `erd.md` marks it `ref <Module>.<Table>`, not `FK`.
- Every route that touches a `PatientProfile` checks `ProfileMember` access through one guard or service from the users module, `ProfileAccessService.assert(userId, profileId, action)`. No module writes its own access check.

Conventions:
- **Routes:** every route under `/api/v1` (global prefix `/api`, URI versioning).
- **Errors:** one error shape, `{ code, message, details }`. The app maps `code` to Bangla text.
- **Pagination:** cursor based, `{ data, meta: { cursor, hasMore } }`.
- **Logging:** `nestjs-pino` with a request ID. Never log phone numbers, email addresses, PINs, OTP codes or health data.
- **Security:** `helmet`, CORS, and `@nestjs/throttler` with stricter limits on OTP routes.
- **Ops:** Swagger at `/api/docs` in dev and staging only. `/api/health` via terminus, checking DB and Redis.

Data rules:
- IDs are uuid. Money is `Decimal(10,2)` in BDT. Times are `timestamptz` stored in UTC and shown in Asia/Dhaka. `Schedule` and `MedicationTime` times are Asia/Dhaka local times.
- **A uuid is never shown to people.** People see a readable ID instead (owner's decision, 2026-11-08):
  - Format `PR-2611-0042`: kind letter (P patient, D doctor, N nutritionist, T physiotherapist, M moderator, A admin) + first letter of the name in Latin (Bangla transliterated, titles like "ডা."/"Md." skipped) + YYMM (Asia/Dhaka) + serial.
  - The serial is "the last one + 1" per kind and month, from `core.ReadableIdCounter` incremented atomically by `ReadableIdService.next(kind, name, tx)` (`core/readable-ids`). Never `SELECT max() + 1`.
  - IDs never change (not even when the name changes) and numbers are never reused. Unique index plus format CHECK on every ID column.
  - Today: `PatientProfile.patientCode`. Providers (doctors, nutritionists, physios) get theirs in step 5, staff in step 10. Contract: `shared-contracts/readable-id.contract.ts`.
  - Latin characters, not Bangla numerals. Booking and payment references get their own readable format when those modules are built.
- **Seed data:** `npm run db:seed` (`prisma/seed/seed-demo-data.ts`, run with `tsx`) creates demo accounts for dev/staging, PIN `274816`. It is re-runnable and refuses `APP_ENV=production`. Each module adds its demo rows there.
- **Emails are stored lowercased** (DB CHECK). `User.email` is nullable for guests and unique when set.
- **Phones are stored in E.164**, and only Bangladeshi numbers (`+8801XXXXXXXXX`) are accepted. Validate them with `bangladeshPhoneSchema` (`shared-contracts/common-fields.contract.ts`), which also accepts what people type (`01711-234567`, Bangla digits) and normalises it. `User.phone` is nullable (not collected until SMS OTP launches) and unique when set.
- **Health data belongs to `PatientProfile`, never to `User`.** This is what makes family profiles work.
- **Encryption:**
  - Sensitive columns are encrypted at the application level with AES-256-GCM, a random IV per value, a key from env, and the key version stored as a ciphertext prefix. This lives in `core/crypto`.
  - Columns needed for queries stay plain. The exact column list is the "এনক্রিপশন" table at the end of `erd.md`:
    - `health`: condition names and notes. Vital numbers stay plain for charts.
    - `records`: file titles.
    - `chat`: message body and attachment.
    - `womens_health`: everything except ids, patientId, query dates and flags.
- **Audit:** write an AuditLog entry, with `patientId`, whenever someone views or changes health data. Modules emit `audit.*` events and the admin module writes them.
- **Double booking:** prevent it with partial unique indexes on Appointment, added as raw SQL in the migration:
  - IN_PERSON (serial based): `(scheduleId, sessionDate, serialNo) WHERE mode = 'IN_PERSON' AND status NOT IN ('CANCELLED','EXPIRED')`. Assign `serialNo` inside a transaction with `SELECT ... FOR UPDATE`, and never above `Schedule.maxPatients`.
  - VIDEO / CHAT / HOME_VISIT (time slots): `(providerId, scheduledAt) WHERE mode <> 'IN_PERSON' AND status NOT IN ('CANCELLED','EXPIRED')`.
- **Slot hold:**
  - A new booking is `PENDING_PAYMENT` with `holdExpiresAt` = now + 10 min.
  - A BullMQ delayed job moves it to `EXPIRED` if it is still unpaid.
- **Payment link:**
  - `Payment(purpose, referenceId)` points at the appointment or consultation. Appointment and Consultation have no `paymentId`.
  - Only one active payment per reference: `UNIQUE (purpose, referenceId) WHERE status IN ('INITIATED','SUCCESS')`.
  - `payment.succeeded` confirms the booking.
- **Refund after payout:** create a negative `ProviderEarning` row with `kind = REFUND_ADJUSTMENT`. It is deducted from the next Payout. A paid Payout is never edited.
- **Quick consult:**
  - `CHECK (tier <> 'QUICK_10' OR channel = 'CHAT')` on Consultation.
  - Women's-health quick consults set `ConsultQueueEntry.requiredProviderGender = FEMALE`.
  - Only providers with `gender = FEMALE` and `acceptsQuickConsult = true` are assigned.
- **Medicine doses:**
  - The dose amount lives on `MedicationTime` (per time of day), not on the plan.
  - `stockQty` and dose are decimals (half tablets).
  - `DoseLog` snapshots the dose.
- **Dose alarms:**
  - Dose alarms fire **only locally** (`expo-notifications`), so they work offline. The server does not push dose alarms.
  - The server keeps only a `DOSE_BACKUP` reminder. If the dose is not TAKEN or SKIPPED within `doseBackupDelayMin` (default 30), it sends an SMS to the patient and a push to members with `receivesAlerts`. This avoids duplicate alarms.
- **Sensitive notifications** (women's health, `isSensitive` categories) never include health details in push or SMS text.
- **File columns** are always named `storageKey` or `<thing>StorageKey`, never `s3Key` or a URL (see section 5).
- **Key indexes:** `DoseLog(planId, scheduledFor)` unique, `VitalReading(patientId, type, measuredAt)`, `Message(conversationId, createdAt)`, `Notification(userId, readAt)`, `Post(categoryId, createdAt)`, `ProfileMember(userId)`.
- Reaction and ContentReport are polymorphic (`targetType + targetId`), so they have no FK.

## 5. File storage (decided)
**Use local disk on the VPS until ~10,000 users, then migrate to AWS S3 with no user-facing change.**

To keep that migration invisible:
- The DB stores only a `storageKey` (for example `private/2026/11/<uuid>.webp`), never a full URL. The API builds URLs at response time.
- All file access goes through a `StorageService` interface (`save`, `getUrl`, `delete`). Today it is `LocalDiskStorage`, later `S3Storage`. No direct `fs` calls anywhere else.
- Public images are served from our own subdomain (for example `cdn.<domain>`) by Nginx with long cache headers. Cloudflare can sit in front. Later, point the DNS at CloudFront.

Storage layout:
- Two folders: `storage/public` and `storage/private`, mounted as Docker volumes.
- Private files (lab reports, prescriptions, profile photos) are served through Nginx `secure_link` with 5–15 minute expiry, after the API has checked permission.

Upload pipeline:
- multer → `file-type` magic-byte check → `sharp` converts to WebP and creates 200px and 800px thumbnails (`<visibility>/thumbs/200/<yyyy>/<mm>/<uuid>.webp`, so a thumbnail is signed like its original). Lives in `core/uploads`.
- Strip EXIF (sharp's default; never call `withMetadata()`).
- Enforce size limits both in Nginx `client_max_body_size` and in multer.

Operations:
- Daily backups with `restic` or `rclone` to another server, with regular restore tests.
- Disk usage alert at 80%.

## 6. Workflow
Build in this order. Each module is finished end to end before the next starts.
1. **core** setup:
   - docker-compose (postgis + redis), env validation, Prisma.
   - Error filter, logger, throttler, `/v1` versioning, Swagger, health check.
   - Event emitter, BullMQ, StorageService, CryptoService (column encryption).
   - **No automated tests for now** (owner's decision, 2026-11-07): no test runner, spec files or test database in the repo. When tests are brought back: Vitest + supertest for the API and web panel, Jest (`jest-expo`) for mobile.
2. **auth + users:**
   - OTP, PIN (argon2), JWT access + refresh, devices, sessions.
   - PatientProfile, ProfileMember, ProfileInvite.
   - `ProfileAccessService`.
3. **health-profile + records + uploads.**
4. **medicine + notifications** (BullMQ, push, SMS). These work without doctors, so they can be tested early.
5. **doctors + appointments**, plus the doctor panel.
6. **payments:** bKash, then Nagad, in sandbox first.
7. **consultation + chat + video.**
8. **prescriptions** (a prescription item turns into a medicine alarm in one tap).
9. **nutrition, womens-health, community.**
10. **emergency, content, admin.**

For each module:
1. Write zod contracts in `packages/shared`.
2. Add the Prisma models and migration, plus seed data.
3. Build the service, controller, guards and events, with Swagger docs.
4. Check the flow by hand (Swagger at `/api/docs`, Mailpit for emails). No automated tests for now.
5. Build the mobile API layer and hooks.
6. Build the screens with loading, empty, error and slow-network states.
7. Test the whole flow on a real device.

Modules used by doctors (doctors, appointments, consultation, prescriptions, nutrition) also need their panel UI before they count as done.

## 7. Design tokens (from the prototype)
- **Main teal:** primary `#0f5c5a`, mint `#dcefe8`, soft card `#e4f3ed`, background `#f4f9f7`, text `#12302b`, muted text `#546b65`, line `#d3e3dd`.
- **Women's health (rose):** `#c2475e`, soft `#fbe4e8`.
- **Nutrition (green):** `#2f6b2f`, soft `#e3f1df`.
- **Emergency red:** `#c62f2f`.
- Bangla numerals throughout the UI. Minimum touch target 44px. Bottom nav: হোম, প্রোফাইল, ডাক্তার, ওষুধ, কমিউনিটি.

## 8. Bangladesh-specific concerns
- Many users have cheap Android phones (2–3 GB RAM). Test release builds on one.
- Xiaomi, Oppo and Vivo delay notifications because of battery optimization. Show a guide to turn it off. The `DOSE_BACKUP` SMS covers missed local alarms.
- Plan for slow networks: compress uploads, cache images, add retries.
- Pre-launch tasks with long lead times:
  - bKash/Nagad merchant accounts (needs a trade license).
  - SMS sender ID approval.
  - Play Store health app declaration.
  - Privacy policy and terms.
  - Onboarding 10–20 doctors and 2–3 nutritionists, including enough female doctors for the ৳10 queue.
  - Forum moderators.
  - Closed beta with 50–100 users.
