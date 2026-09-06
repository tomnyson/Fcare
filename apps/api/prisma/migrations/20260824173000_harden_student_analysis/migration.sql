-- Preserve AI analysis audit history when a student is removed.
ALTER TABLE "student_term_analyses"
DROP CONSTRAINT "student_term_analyses_studentId_fkey";

ALTER TABLE "student_term_analyses"
ADD CONSTRAINT "student_term_analyses_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "students"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enforce at most one queue/generation/delivery version per student-term analysis.
CREATE UNIQUE INDEX "student_term_analysis_versions_one_active_idx"
ON "student_term_analysis_versions"("analysisId")
WHERE "status" IN ('QUEUED', 'GENERATING', 'SEND_QUEUED');

CREATE INDEX "student_term_analysis_versions_createdById_idx"
ON "student_term_analysis_versions"("createdById");

CREATE INDEX "student_term_analysis_versions_reviewedById_idx"
ON "student_term_analysis_versions"("reviewedById");

CREATE INDEX "notifications_recipientId_createdAt_idx"
ON "notifications"("recipientId", "createdAt" DESC);
