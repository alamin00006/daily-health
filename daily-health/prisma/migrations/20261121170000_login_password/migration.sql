-- Login PIN -> login password (owner's decision, 2026-11-21). Renames only: existing
-- hashes keep working, so a 6-digit PIN set earlier is now that account's password.
ALTER TYPE "auth"."OtpPurpose" RENAME VALUE 'RESET_PIN' TO 'RESET_PASSWORD';

ALTER TABLE "auth"."User" RENAME COLUMN "pinHash" TO "passwordHash";
ALTER TABLE "auth"."User" RENAME COLUMN "failedPinAttempts" TO "failedPasswordAttempts";
ALTER TABLE "auth"."User" RENAME COLUMN "pinLockedUntil" TO "passwordLockedUntil";

-- The CHECKs follow the renamed columns by themselves; only this name still says PIN.
ALTER TABLE "auth"."User" RENAME CONSTRAINT "User_failedPinAttempts_check" TO "User_failedPasswordAttempts_check";
