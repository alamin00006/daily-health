-- Human-readable patient ID (DS-XXXX-XXXX) for PatientProfile. The uuid stays the primary key.
-- Alphabet without look-alikes: no 0/O, 1/I/L, U (keep in sync with patient-code.contract.ts).

ALTER TABLE "users"."PatientProfile" ADD COLUMN "patientCode" TEXT;

-- Backfill profiles created before this migration. New profiles get their code from the API.
DO $$
DECLARE
  alphabet CONSTANT TEXT := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  profile RECORD;
  candidate TEXT;
BEGIN
  FOR profile IN SELECT "id" FROM "users"."PatientProfile" WHERE "patientCode" IS NULL LOOP
    LOOP
      candidate := 'DS-';
      FOR position IN 1..8 LOOP
        IF position = 5 THEN
          candidate := candidate || '-';
        END IF;
        candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM "users"."PatientProfile" WHERE "patientCode" = candidate
      );
    END LOOP;
    UPDATE "users"."PatientProfile" SET "patientCode" = candidate WHERE "id" = profile."id";
  END LOOP;
END $$;

ALTER TABLE "users"."PatientProfile" ALTER COLUMN "patientCode" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_patientCode_key" ON "users"."PatientProfile"("patientCode");

ALTER TABLE "users"."PatientProfile" ADD CONSTRAINT "PatientProfile_patientCode_format_check"
  CHECK ("patientCode" ~ '^DS-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$');