-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "core";

-- CreateTable
CREATE TABLE "core"."ReadableIdCounter" (
    "kind" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReadableIdCounter_pkey" PRIMARY KEY ("kind","period")
);


-- ---------------------------------------------------------------------------
-- PatientProfile.patientCode: random DS-XXXX-XXXX → readable PR-2611-0042
-- (P + name initial + YYMM in Asia/Dhaka + serial within the month).
-- New IDs come from ReadableIdService; this converts existing rows and starts
-- the counters after them. Title skipping ("ডা.", "Md.") is done by the API
-- only; existing rows use the first letter of the name.
-- ---------------------------------------------------------------------------

ALTER TABLE "users"."PatientProfile" DROP CONSTRAINT "PatientProfile_patientCode_format_check";

WITH numbered AS (
  SELECT
    "id",
    to_char("createdAt" AT TIME ZONE 'Asia/Dhaka', 'YYMM') AS period,
    row_number() OVER (
      PARTITION BY to_char("createdAt" AT TIME ZONE 'Asia/Dhaka', 'YYMM')
      ORDER BY "createdAt", "id"
    ) AS serial,
    CASE
      WHEN upper(left(btrim("fullName"), 1)) ~ '^[A-Z]$' THEN upper(left(btrim("fullName"), 1))
      WHEN translate(left(btrim(normalize("fullName", NFC)), 1), 'অআইঈউঊঋএঐওঔকখগঘঙচছজঝঞটঠডঢণতথদধনপফবভমযরলশষসহৎ', 'AAIIUUREOOOKKGGNCCJJNTTDDNTTDDNPFBBMJRLSSSHT') ~ '^[A-Z]$'
        THEN translate(left(btrim(normalize("fullName", NFC)), 1), 'অআইঈউঊঋএঐওঔকখগঘঙচছজঝঞটঠডঢণতথদধনপফবভমযরলশষসহৎ', 'AAIIUUREOOOKKGGNCCJJNTTDDNTTDDNPFBBMJRLSSSHT')
      ELSE 'X'
    END AS initial
  FROM "users"."PatientProfile"
)
UPDATE "users"."PatientProfile" AS profile
SET "patientCode" = 'P' || numbered.initial || '-' || numbered.period || '-' || lpad(numbered.serial::text, 4, '0')
FROM numbered
WHERE numbered."id" = profile."id";

INSERT INTO "core"."ReadableIdCounter" ("kind", "period", "lastValue", "updatedAt")
SELECT 'PATIENT', substr("patientCode", 4, 4), max(substr("patientCode", 9)::int), now()
FROM "users"."PatientProfile"
GROUP BY substr("patientCode", 4, 4);

ALTER TABLE "users"."PatientProfile" ADD CONSTRAINT "PatientProfile_patientCode_format_check"
  CHECK ("patientCode" ~ '^P[A-Z]-[0-9]{4}-[0-9]{4,}$');

ALTER TABLE "core"."ReadableIdCounter" ADD CONSTRAINT "ReadableIdCounter_kind_check"
  CHECK ("kind" IN ('PATIENT', 'DOCTOR', 'NUTRITIONIST', 'PHYSIO', 'MODERATOR', 'ADMIN'));
ALTER TABLE "core"."ReadableIdCounter" ADD CONSTRAINT "ReadableIdCounter_period_check"
  CHECK ("period" ~ '^[0-9]{4}$');
ALTER TABLE "core"."ReadableIdCounter" ADD CONSTRAINT "ReadableIdCounter_lastValue_check"
  CHECK ("lastValue" >= 1);
