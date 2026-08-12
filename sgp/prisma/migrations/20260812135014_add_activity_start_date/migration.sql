/*
  Warnings:

  - Added the required column `startDate` to the `Activity` table without a default value. This is not possible if the table is not empty.

  Backfill strategy: `Activity.startDate` didn't exist before. For the 11
  rows that already exist in production, the best available proxy for "when
  work started" is `createdAt` (US-027 acceptance — the PO signed off that
  these retroactive dates are approximate, not exact). Every activity
  created after this migration is required to supply a real `startDate` via
  `createActivity` (Zod-validated: startDate <= dueDate, startDate >=
  Project.startDate).
*/
-- AlterTable: add as nullable first, since existing rows have no value yet.
ALTER TABLE "Activity" ADD COLUMN     "startDate" TIMESTAMP(3);

-- Backfill: best available proxy for existing rows is when the row itself
-- was created.
UPDATE "Activity" SET "startDate" = "createdAt" WHERE "startDate" IS NULL;

-- Now that every row has a value, enforce NOT NULL going forward.
ALTER TABLE "Activity" ALTER COLUMN "startDate" SET NOT NULL;
