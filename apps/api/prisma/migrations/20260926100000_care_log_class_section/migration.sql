-- Nhật ký chăm sóc gắn lớp học phần (→ học kỳ + môn học). Nhật ký cũ để trống,
-- riêng nhật ký gắn cảnh báo thì kế thừa lớp của cảnh báo.
ALTER TABLE "care_logs" ADD COLUMN "classSectionId" TEXT;

ALTER TABLE "care_logs" ADD CONSTRAINT "care_logs_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "class_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "care_logs_classSectionId_idx" ON "care_logs"("classSectionId");

UPDATE "care_logs" AS cl
SET "classSectionId" = a."classSectionId"
FROM "alerts" AS a
WHERE cl."alertId" = a."id" AND a."classSectionId" IS NOT NULL;
