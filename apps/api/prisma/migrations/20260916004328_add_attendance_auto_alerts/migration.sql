-- CreateEnum
CREATE TYPE "AlertSource" AS ENUM ('MANUAL', 'AUTO_ATTENDANCE');

-- DropForeignKey
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_raisedById_fkey";

-- AlterTable
ALTER TABLE "alerts" ADD COLUMN     "absentSessions" INTEGER,
ADD COLUMN     "classSectionId" TEXT,
ADD COLUMN     "ownerCaredAt" TIMESTAMP(3),
ADD COLUMN     "source" "AlertSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "term" TEXT,
ALTER COLUMN "raisedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "care_logs" ADD COLUMN     "alertId" TEXT;

-- CreateIndex
CREATE INDEX "alerts_source_status_classSectionId_idx" ON "alerts"("source", "status", "classSectionId");

-- CreateIndex
CREATE INDEX "alerts_studentId_classSectionId_term_idx" ON "alerts"("studentId", "classSectionId", "term");

-- CreateIndex
CREATE INDEX "care_logs_alertId_idx" ON "care_logs"("alertId");

-- AddForeignKey
ALTER TABLE "care_logs" ADD CONSTRAINT "care_logs_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "class_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Khoá nghiệp vụ cho cảnh báo điểm danh tự động: mỗi (sinh viên, lớp học phần,
-- học kỳ) chỉ có MỘT cảnh báo chưa xử lý — import lại cùng tuần hoặc hai lượt
-- import commit gần nhau không tạo trùng (service bắt P2002 và coi là "unchanged").
CREATE UNIQUE INDEX "alerts_auto_attendance_open_key"
  ON "alerts"("studentId", "classSectionId", "term")
  WHERE "source" = 'AUTO_ATTENDANCE' AND "status" <> 'RESOLVED';
