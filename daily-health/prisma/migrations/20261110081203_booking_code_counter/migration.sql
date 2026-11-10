-- Booking codes (BK-2611-0042) share the readable-ID counter table.
ALTER TABLE "core"."ReadableIdCounter" DROP CONSTRAINT "ReadableIdCounter_kind_check";
ALTER TABLE "core"."ReadableIdCounter" ADD CONSTRAINT "ReadableIdCounter_kind_check"
  CHECK ("kind" IN ('PATIENT', 'DOCTOR', 'NUTRITIONIST', 'PHYSIO', 'MODERATOR', 'ADMIN', 'BOOKING'));
