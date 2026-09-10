-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ImportKind" ADD VALUE 'SECTION_LIST';
ALTER TYPE "ImportKind" ADD VALUE 'ROSTER';
ALTER TYPE "ImportKind" ADD VALUE 'GRADE_ATTENDANCE';

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "absentSessions" INTEGER,
ADD COLUMN     "totalSessions" INTEGER;

-- CreateTable
CREATE TABLE "major_aliases" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "majorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "major_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "major_aliases_alias_key" ON "major_aliases"("alias");

-- AddForeignKey
ALTER TABLE "major_aliases" ADD CONSTRAINT "major_aliases_majorId_fkey" FOREIGN KEY ("majorId") REFERENCES "majors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
