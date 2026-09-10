-- Nguồn nội dung được gửi: bản AI tổng hợp hay bản giảng viên tự soạn.
CREATE TYPE "AnalysisContentSource" AS ENUM ('AI', 'LECTURER');

-- Đổi tên (KHÔNG drop) cột cũ: bản tự sinh nay chỉ chờ người quyết định gửi.
ALTER TABLE "student_term_analysis_versions" RENAME COLUMN "autoSend" TO "needsSendDecision";

ALTER TABLE "student_term_analysis_versions"
  ADD COLUMN "contentSource" "AnalysisContentSource",
  ADD COLUMN "lecturerNote" TEXT,
  ADD COLUMN "dismissedById" TEXT,
  ADD COLUMN "dismissedAt" TIMESTAMP(3);

CREATE INDEX "student_term_analysis_versions_dismissedById_idx"
  ON "student_term_analysis_versions"("dismissedById");

ALTER TABLE "student_term_analysis_versions"
  ADD CONSTRAINT "student_term_analysis_versions_dismissedById_fkey"
  FOREIGN KEY ("dismissedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
