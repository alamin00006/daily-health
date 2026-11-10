/*
  Warnings:

  - Added the required column `sessionEndAt` to the `Appointment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "appointments"."Appointment" ADD COLUMN     "sessionEndAt" TIMESTAMPTZ(3) NOT NULL;
