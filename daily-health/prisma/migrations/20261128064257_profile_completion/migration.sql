-- AlterTable
ALTER TABLE "users"."PatientProfile" ADD COLUMN     "healthInfoCompletedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "womens_health"."CycleSettings" ADD COLUMN     "aboutMe" BYTEA;
