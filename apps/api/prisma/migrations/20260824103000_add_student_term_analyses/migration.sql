-- CreateEnum
CREATE TYPE "StudentTermAnalysisStatus" AS ENUM (
    'QUEUED',
    'GENERATING',
    'DRAFT',
    'FAILED',
    'SUPERSEDED',
    'SEND_QUEUED',
    'SENT'
);

-- AlterTable
ALTER TABLE "notifications"
ADD COLUMN "analysisVersionId" TEXT,
ADD COLUMN "targetUrl" TEXT;

-- CreateTable
CREATE TABLE "student_term_analyses" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_term_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_term_analysis_versions" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "StudentTermAnalysisStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "aiOriginal" JSONB,
    "editedOutput" JSONB,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "reasoningTokens" INTEGER,
    "totalTokens" INTEGER,
    "errorMessage" TEXT,
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_term_analysis_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_term_analysis_recipients" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "recipientStaffCode" TEXT NOT NULL,
    "recipientFullName" TEXT NOT NULL,
    "recipientDepartmentId" TEXT,
    "notificationId" TEXT,
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_term_analysis_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_analysisVersionId_recipientId_key"
ON "notifications"("analysisVersionId", "recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "student_term_analyses_studentId_term_key"
ON "student_term_analyses"("studentId", "term");

-- CreateIndex
CREATE INDEX "student_term_analyses_ownerId_idx"
ON "student_term_analyses"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "student_term_analysis_versions_idempotencyKey_key"
ON "student_term_analysis_versions"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "student_term_analysis_versions_analysisId_version_key"
ON "student_term_analysis_versions"("analysisId", "version");

-- CreateIndex
CREATE INDEX "student_term_analysis_versions_analysisId_status_idx"
ON "student_term_analysis_versions"("analysisId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "student_term_analysis_recipients_notificationId_key"
ON "student_term_analysis_recipients"("notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "student_term_analysis_recipients_versionId_recipientId_key"
ON "student_term_analysis_recipients"("versionId", "recipientId");

-- CreateIndex
CREATE INDEX "student_term_analysis_recipients_recipientId_openedAt_idx"
ON "student_term_analysis_recipients"("recipientId", "openedAt");

-- AddForeignKey
ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_analysisVersionId_fkey"
FOREIGN KEY ("analysisVersionId") REFERENCES "student_term_analysis_versions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_term_analyses"
ADD CONSTRAINT "student_term_analyses_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "students"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_term_analyses"
ADD CONSTRAINT "student_term_analyses_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "staff"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_term_analysis_versions"
ADD CONSTRAINT "student_term_analysis_versions_analysisId_fkey"
FOREIGN KEY ("analysisId") REFERENCES "student_term_analyses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_term_analysis_versions"
ADD CONSTRAINT "student_term_analysis_versions_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "staff"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_term_analysis_versions"
ADD CONSTRAINT "student_term_analysis_versions_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "staff"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_term_analysis_recipients"
ADD CONSTRAINT "student_term_analysis_recipients_versionId_fkey"
FOREIGN KEY ("versionId") REFERENCES "student_term_analysis_versions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_term_analysis_recipients"
ADD CONSTRAINT "student_term_analysis_recipients_recipientId_fkey"
FOREIGN KEY ("recipientId") REFERENCES "staff"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_term_analysis_recipients"
ADD CONSTRAINT "student_term_analysis_recipients_notificationId_fkey"
FOREIGN KEY ("notificationId") REFERENCES "notifications"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
