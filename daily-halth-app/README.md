# দৈনিক স্বাস্থ্য: mobile app

Expo (SDK 56) + Expo Router + NativeWind v4, TanStack Query (server state), Zustand (session, multi-step flows),
Axios (HTTP, token refresh in interceptors), React Hook Form + Zod (forms) and Expo SecureStore (tokens).
Product and technical decisions: `../CLAUDE.md`.

## Run locally

1. Start the API first (`../daily-health`: `npm run services:up`, `npm run db:migrate`, `npm run start:dev`).
2. `cp .env.example .env` and set `EXPO_PUBLIC_API_URL` (emulator, simulator or your PC's LAN IP; see the file).
3. `npm start`, then press `a` for Android.

OTP emails do not leave your PC in development: open Mailpit at http://localhost:8025 to read the code.

## Layout

```
src/
  app/                 Expo Router routes
    (auth)/            logged-out screens: welcome, login, request-code, verify-code, set-pin
    (app)/(tabs)/      home, health (profile), medicine
    (app)/             profile switcher, profiles, family + invitations, vitals, conditions,
                       records, health card, medicine plans, notifications inbox, settings
  api/                 Axios client (timeouts, token refresh, uploads) and typed endpoints per module
  stores/              Zustand: session, auth flow, active profile (persisted)
  features/            TanStack Query hooks + logic per module (auth, profiles, health, records,
                       medicine, notifications, app services)
  components/          ui/ building blocks, charts/, and per-feature components
  lib/                 secure storage, kv store, Bangla formatting, file pickers, toasts
  shared-contracts/    copy of the API's zod contracts (until packages/shared exists)
modules/
  exact-alarm-permission/  local Expo module (Kotlin): Android 12+ exact-alarm check + settings
```

## Dose alarms

- Alarms are local (`expo-notifications`) so they ring offline; the server only sends a
  `DOSE_BACKUP` SMS/push if a dose is not marked within 30 minutes.
- They ring on this phone for the user's own profile and for family profiles without their own
  account (see `ringsOnThisPhone`). `syncDoseAlarms` reschedules only when plans change.
- Android 14+ turns "Alarms & reminders" off by default, and then alarms can arrive minutes late.
  The medicine tab shows a card that opens that switch (`modules/exact-alarm-permission`).
- The alarm has "সেবন করেছি" and "১০ মিনিট পরে" buttons. Taking or skipping a dose in the app
  cancels its snoozed repeat; stopping or deleting a plan cancels all of its alarms.
- Adding a native module or permission needs a rebuild (`npx expo prebuild`, then build again).

## Auth flows

- Signup: welcome → request-code (SIGNUP) → verify-code → set-pin → home
- Login: login (email + PIN) → home, or request-code (LOGIN) → verify-code → home
- Forgot PIN: login → request-code (RESET_PIN) → verify-code → set-pin → home
- Guest: welcome → "অতিথি হিসেবে দেখুন" → home

The refresh token and user summary are kept in `expo-secure-store`; the access token lives in memory only
and is refreshed automatically. The app opens offline with the saved session.
