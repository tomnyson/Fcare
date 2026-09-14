-- CreateEnum
CREATE TYPE "TermSeason" AS ENUM ('SPRING', 'SUMMER', 'FALL');

-- CreateTable
CREATE TABLE "terms" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "season" "TermSeason" NOT NULL,
    "year" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isCurrentOverride" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "terms_code_key" ON "terms"("code");

-- CreateIndex
CREATE INDEX "terms_startDate_endDate_idx" ON "terms"("startDate", "endDate");
