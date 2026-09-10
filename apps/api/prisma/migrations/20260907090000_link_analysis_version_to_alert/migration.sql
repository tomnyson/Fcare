-- Bản phân tích gửi đi luôn kèm một cảnh báo ở cấp độ đã xác nhận.
-- Cột nằm ở version để job giao hàng chạy sau vẫn tìm lại được cảnh báo.
ALTER TABLE "student_term_analysis_versions" ADD COLUMN "alertId" TEXT;

CREATE INDEX "student_term_analysis_versions_alertId_idx" ON "student_term_analysis_versions"("alertId");

ALTER TABLE "student_term_analysis_versions"
  ADD CONSTRAINT "student_term_analysis_versions_alertId_fkey"
  FOREIGN KEY ("alertId") REFERENCES "alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
