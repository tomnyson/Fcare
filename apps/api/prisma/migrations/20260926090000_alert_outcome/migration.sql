-- CreateEnum
CREATE TYPE "AlertOutcome" AS ENUM ('PASSED', 'EXAM_BANNED', 'FAILED');

-- AlterTable
ALTER TABLE "alerts" ADD COLUMN "outcome" "AlertOutcome";
