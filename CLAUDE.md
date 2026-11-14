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
   - **The app opens on home, not on login** (owner's decision, 2026-11-14). With no saved session it starts a guest session by itself. Guests see home, finding doctors, health tips, browsing the shop and SOS helplines; the login screen opens from the header's "লগইন" button or as soon as they pick anything that needs an account (other tabs, booking, quick consult, cart…). The list of guest screens is `GUEST_ROUTES` in `src/features/auth/guest-access.tsx`; a real login replaces the guest session (the API signs out the previous user of that app install).
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
   - A **quick chat consult** with a female doctor (launch price ৳10; admins set the price in the panel).
   - A private women's forum.
   - This section can be locked with its own PIN, which stays on the device only.
8. **Nutritionist & diet chart:** nutritionist profile and booking, a daily 4-meal diet chart with check-off, calorie and water targets.
9. **Community forum:** posts (anonymous option), categories (mental health, women's health, child care, pain & therapy), verified doctor answers, likes, reports, moderation.
   - Two separate spaces (owner's decision, 2026-11-14): a **common community** every registered user can post and ask in (guests read), and a **women's community** that is closed. To join it, a user whose own (SELF) profile says FEMALE asks to join and a moderator approves once; moderators can remove or ban members on reports. Its posts are never shown outside it, and push text never carries their content.
8a. **Diet plan payment** (owner's decision, 2026-11-14): a nutritionist is always booked through a normal Appointment (`purpose = APPOINTMENT`); after the visit the nutritionist gives the diet chart from the panel or the app's provider area. No separate DietPlan purchase.
10. **HealthStore (shop)** (owner's decision, 2026-11-13; built as step 11). Decided 2026-11-13:
    - **Admins switch the whole shop on or off** (`ShopSetting.enabled`, off by default). Off: the app shows nothing of it and the public shop API answers `SHOP_DISABLED`; the panel still works so staff can prepare the catalog.
    - **Everything is our own:** our own stock (one store) and our own delivery (staff move orders through the statuses in the panel). Admins set delivery zones with charges, and whether cash on delivery is allowed.
    - Prescription-only medicines: the patient attaches a prescription photo or picks an issued `RX-…`; staff approve it in the panel before the order moves on.
    - Cancelled before dispatch: full refund. After that, admins refund by hand.

    - A catalog of medicines and health products (medicine, baby & mom care, diabetic care, first aid, devices, personal care…), with categories, brands, search, price and discount.
    - Cart, checkout through the payment aggregator, orders with status tracking, delivery addresses ("Delivery To").
    - Prescription-only medicines need a prescription (an issued `RX-…` or an uploaded one) checked before the order ships.
    - Discount partners (hospitals, labs) shown on home.
    - Admins manage products, stock, prices, banners and orders in the panel.

Also required:
- **Doctor/admin web panel.** Doctors take calls, write prescriptions and manage schedules. Admins verify BMDC numbers, moderate content and handle payouts.
- **Providers also work from the mobile app** (owner's decision, 2026-11-13), in a "সেবাদাতা" area (`app/(app)/provider/*`, reached from home and settings) of the same app and account: register, edit the profile and fees, upload verification papers, go online, take quick consults from the live queue, chat and call, see the day's visits (seen / no-show / cancel), and write and issue prescriptions. Chambers, weekly schedules, leave days and earnings stay in the web panel. Both use the same API.

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
- The quick consult (launch price ৳10) must be **chat only**. A video call costs more than the fee. This is enforced in the DB with a CHECK constraint.
- **Quick consult prices are dynamic** (owner's decision, 2026-11-11): admins change the price, on/off, max wait and chat length per kind (`GENERAL`, `WOMENS_HEALTH`) in the panel (`QuickConsultSetting`, with a change history). A consultation keeps the fee it was created with.
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
    - `expo-location` (foreground only) for the SOS location (added in step 10, 2026-11-13).
  - `expo-image-picker`, `expo-document-picker` and `expo-image-manipulator`. Resize uploads to 1600px at quality ~0.7 before sending.
  - Bangla font: **Hind Siliguri**, loaded with `expo-font`, one file per weight, exposed as `font-bangla`, `font-bangla-semibold` and so on. Display font: Baloo Da 2.
- **Backend:**
  - **NestJS modular monolith**, built as a separate app. Each feature is its own module.
  - **PostgreSQL 16/17** (`postgis/postgis` image) with extensions `postgis`, `pg_trgm` (Bangla fuzzy search) and `pgcrypto`.
  - **Prisma** with multi-schema: one Postgres schema per module. `multiSchema` was a preview feature and is GA in recent Prisma 6 releases. Check the installed version: add `previewFeatures = ["multiSchema"]` only if that version still needs it.
  - **Redis + BullMQ** for reminders, SMS and scheduled jobs. `@nestjs/event-emitter` for events between modules.
  - **Socket.io** for chat and call signaling (`core/realtime`). Clients connect with a one-time ticket from `POST /realtime/ticket` (60 s, Redis), because the panel's tokens live in httpOnly cookies. One API process for now; several need the Socket.io Redis adapter.
- **Web panel:** Next.js + Tailwind (built in step 5 as Next.js 16 + Tailwind 4, folder `daily-health-panel`).
  - API tokens stay in httpOnly cookies; the browser calls the panel's own `/bff/*` routes, which proxy to the API and refresh tokens (see the panel README).
  - Same data libraries as mobile: TanStack Query, React Hook Form + Zod.
  - Contracts are copied to the app and the panel with `node scripts/copy-shared-contracts.mjs` (API folder) until `packages/shared` exists.
- **Video calling: Agora** (owner's decision, 2026-11-10). Built in step 7.
  - Agora RTC with `react-native-agora` in the app (needs the Expo dev build) and the Agora Web SDK in the panel. Agora's own network relays calls, so no TURN server of our own is needed.
  - The API issues short-lived RTC tokens (`AGORA_APP_ID` + `AGORA_APP_CERTIFICATE` in env, never in the apps). Without them video answers `VIDEO_NOT_CONFIGURED`; chat still works.
  - Still put it behind a `VideoProvider` interface in the consultation module (`createRoom`, `issueToken`, `endRoom`).
  - Incoming-call ringing needs FCM high-priority on Android and PushKit + CallKit on iOS (`react-native-callkeep`).
- **Hosting:** a VPS with Docker Compose (Postgres, Redis, Nginx, API). Files in Cloudflare R2, switchable to AWS S3 (section 5).

## 3. Open decisions (ask the owner first)
- SMS gateway provider. (A separate bKash/Nagad integration is not needed: the payment aggregator covers both.)
## 4. Backend architecture
```
apps/api/src/
├── core/      config (zod-validated env), prisma, guards, interceptors, logger, storage, crypto
├── common/    shared DTOs, utils, decorators
└── modules/
    auth, users, health-profile, records, doctors, appointments, consultation,
    chat, prescriptions, medicine, nutrition, womens-health, community,
    payments, notifications, emergency, content, admin, shop
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
  - `PatientProfile.patientCode` and `Provider.providerCode` (D/N/T). Staff (M/A) get `admin.StaffMember.staffCode`; it stays with the person even if they are removed and added again. Contract: `shared-contracts/readable-id.contract.ts`.
  - Bookings: `Appointment.code` = `BK-2611-0042` (same counter table, kind `BOOKING`, no name letter). Receipts `Payment.invoiceNo` = `RC-2611-0042` (kind `PAYMENT`) and payouts `Payout.payoutNo` = `ST-2611-0003` (kind `PAYOUT`), prescriptions `Prescription.code` = `RX-2611-0042` (kind `PRESCRIPTION`), SOS requests `EmergencyRequest.code` = `EM-2611-0007` (kind `EMERGENCY`) and HealthStore orders `Order.code` = `OD-2611-0042` (kind `ORDER`), same format. Not `PY`/`PO`, which look like patient IDs.
  - Latin characters, not Bangla numerals.
- **Payment gateway** (owner's decision, 2026-11-10): an aggregator, **shurjoPay now**, switchable to **SSLCommerz** by setting `PAYMENT_GATEWAY=SSLCOMMERZ` plus its store credentials in env and restarting. No code change.
  - Both live behind the `PaymentGateway` abstract class (`modules/payments/gateways`). A payment is always verified and refunded by the gateway that took it (`Payment.gateway`), so old payments keep working after a switch.
  - A payment counts as paid only after verifying it through the gateway API. Return URL, IPN, the app's `POST /payments/:id/check` and a 5-minute reconciliation job all just trigger that check.
  - Modules make things payable by registering a resolver in `PayableRegistryService` (appointments registers `APPOINTMENT`).
  - shurjoPay has no refund API: refunds stay `REQUESTED` (`MANUAL_REFUND_REQUIRED`) until an admin refunds from the merchant panel and marks them processed. SSLCommerz refunds go through its API.
  - Platform fee is `PLATFORM_FEE_PERCENT` (default 10). Paid bookings cancelled in time get a full refund. Payouts are created and marked paid by admins.
  - Dev/staging only: `POST /payments/:id/dev-simulate-success` runs the real success path without the gateway. It returns 403 in production.
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
    - `prescriptions`: chief complaint, diagnosis and advice (medicine lines stay plain: alarms are made from them).
    - `womens_health`: everything except ids, patientId, query dates and flags.
- **Audit:** write an AuditLog entry, with `patientId`, whenever someone views or changes health data. Modules emit `audit.*` events and the admin module writes them.
- **Double booking:** prevent it with partial unique indexes on Appointment, added as raw SQL in the migration:
  - IN_PERSON (serial based): `(scheduleId, sessionDate, serialNo) WHERE mode = 'IN_PERSON' AND status NOT IN ('CANCELLED','EXPIRED')`. Assign `serialNo` inside a transaction that first takes `pg_advisory_xact_lock` on provider + day (the Schedule row belongs to the doctors module, so it is not locked with `FOR UPDATE`), and never above `Schedule.maxPatients`.
  - A third index allows one live booking per patient per session: `(patientId, scheduleId, sessionDate)`.
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
  - `CHECK (tier <> 'QUICK' OR channel = 'CHAT')` on Consultation (tier renamed from `QUICK_10` once the price became admin-set).
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
**Files live in Cloudflare R2 now, switchable to AWS S3** (owner's decision, 2026-11-13; replaces the earlier "local disk now, S3 later" plan). There is no local-disk storage, in dev either.

- The DB stores only a `storageKey` (for example `private/2026/11/<uuid>.webp`), never a full URL. The API builds URLs at response time.
- All file access goes through the `StorageService` abstract class (`save`, `saveAtKey`, `getUrl`, `delete`), implemented once by `S3CompatibleStorageService` (`core/storage`, `@aws-sdk/client-s3`). No direct file or SDK calls anywhere else.
- **Switching provider** works like the payment gateway: set `STORAGE_PROVIDER=S3` with `S3_REGION`, the IAM keys and bucket names, copy both buckets (`rclone copy`), point `PUBLIC_FILES_BASE_URL` at CloudFront, restart. No code or data change.
  - R2: region `auto`, endpoint `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`, path-style URLs.
  - S3: region `S3_REGION`, endpoint `https://s3.<region>.amazonaws.com`, virtual-hosted URLs (so bucket names have no dots).
  - `STORAGE_ENDPOINT` overrides the endpoint (for example an EU R2 bucket).

Buckets (env `STORAGE_*`, see `.env.example`):
- **Public bucket** (`STORAGE_PUBLIC_BUCKET`): `public/...` keys (health tip and product pictures, doctor avatars, banners). Served from its CDN domain (`PUBLIC_FILES_BASE_URL`: the R2 custom domain, or CloudFront for S3). Uploaded with `Cache-Control: public, max-age=31536000, immutable` (keys are never reused).
- **Private bucket** (`STORAGE_PRIVATE_BUCKET`, no public access): `private/...` keys (lab reports, prescriptions, patient photos). Read only through presigned GET URLs (SigV4, 5–15 minutes, `PRIVATE_FILE_URL_TTL_SECONDS`), built after the API has checked permission. The signer is checked against AWS's documented test vector.

Upload pipeline:
- multer → `file-type` magic-byte check → `sharp` converts to WebP and creates 200px and 800px thumbnails (`<visibility>/thumbs/200/<yyyy>/<mm>/<uuid>.webp`, so a thumbnail is in the same bucket and signed like its original). Lives in `core/uploads`.
- Strip EXIF (sharp's default; never call `withMetadata()`).
- Enforce size limits both in Nginx `client_max_body_size` and in multer.

Operations:
- A periodic `rclone` copy of the private bucket to a second location (or bucket versioning), with regular restore tests.
- Watch storage usage and request counts in the provider's dashboard.

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
6. **payments:** shurjoPay (switchable to SSLCommerz), refunds, earnings and payouts, in sandbox first.
7. **consultation + chat + video:** quick consults (admin-set price, queue, refunds when missed), booked VIDEO/CHAT sessions, encrypted chat, Agora calls.
8. **prescriptions:** doctors write a draft per visit/consultation and issue it (fixed; revoke with a reason). A medicine line (`1+0+½`) turns into a medicine alarm in one tap; prescribed tests get their uploaded report linked. The panel prints it (browser "Save as PDF" keeps Bangla shaping); no server PDF yet.
9. **nutrition, womens-health, community.**
10. **emergency, content, admin.**
    - SOS from the app alerts the family (push/in-app/SMS), SMSes emergency contacts and queues it for staff (Socket.io `staff` room). One live request per profile.
    - Health tips: staff write, add a picture and publish in the panel; everyone (guests too) reads them.
    - Admin: `audit.**` listener writes AuditLog; dashboard, audit log, users (suspend), staff. MODERATOR = emergencies + tips (+ forum later); ADMIN = everything. `@StaffOnly()` / `@AdminOnly()`.
11. **shop (HealthStore).** Decisions in section 1, feature 10.
    - Catalog: products, categories, brands, stock, prices and discounts, with Bangla search (`pg_trgm`).
    - Cart, checkout (payments registers an `ORDER` payable), orders with status tracking, delivery addresses, prescription check for prescription-only medicines.
    - Home sections: categories, trending products, featured brands, discount partners, admin-managed banners.
    - Panel: products, stock, orders and delivery status, banners, partners.
    - The bottom nav gets Orders/HealthStore entries then (decide the final tabs with the owner).

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
- Bangla numerals throughout the UI. Minimum touch target 44px.
- **Bottom nav** (owner's decision, 2026-11-14): হোম, প্রোফাইল, (ডাক্তার as a raised round button in the middle), ওষুধ, কমিউনিটি. Settings and the account open from the gear on the home header.
- **Admins set the app's primary colour** in the panel (অ্যাপের রং; `admin.AppSetting`, change history, public `GET /app-config`). The app turns it into shades (`primaryPalette()` in `shared-contracts/app-config.contract.ts`), sets them as NativeWind CSS variables and JS tokens (`src/theme/runtime-theme.tsx`), caches it, and applies a new colour right after launch or at the next launch. White text on it must reach 4.5:1 contrast. The teal above is the default; emergency red, rose and nutrition green never change.
- **Home layout** (owner's decision, 2026-11-14; layout modelled on a competitor's app, our own content and pictures): header with logo, "কার জন্য" profile, alerts, cart and search → 2×2 service cards (quick consult with live price, specialists, HealthStore or tips, appointments) → SOS → today's medicine → next appointment → other services row → health tips carousel → "কোন সমস্যায়" specialty cards → doctors with specialty chips → HealthStore categories and trending (only while the shop is on) → latest vitals → tips → trust row.

## 8. Bangladesh-specific concerns
- Many users have cheap Android phones (2–3 GB RAM). Test release builds on one.
- Xiaomi, Oppo and Vivo delay notifications because of battery optimization. Show a guide to turn it off. The `DOSE_BACKUP` SMS covers missed local alarms.
- Plan for slow networks: compress uploads, cache images, add retries.
- Pre-launch tasks with long lead times:
  - shurjoPay (or SSLCommerz) merchant account (needs a trade license), with the IPN URL set in its merchant panel and a public HTTPS `PAYMENT_CALLBACK_BASE_URL`.
  - SMS sender ID approval.
  - Play Store health app declaration.
  - Privacy policy and terms.
  - Onboarding 10–20 doctors and 2–3 nutritionists, including enough female doctors for the women's quick consult queue.
  - An Agora project (App ID + primary certificate) for video calls.
  - A Firebase project (`google-services.json`) so pushes, including the incoming-call ring, reach Android phones; PushKit/CallKit for iOS.
  - Forum moderators.
  - Closed beta with 50–100 users.
