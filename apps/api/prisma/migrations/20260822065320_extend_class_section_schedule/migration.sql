-- Chặn migration nếu đã tồn tại (code, term) trùng — @@unique sẽ fail giữa chừng.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM class_sections GROUP BY code, term HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Có lớp học phần trùng (code, term) — xử lý dữ liệu trước khi migrate.';
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "class_sections" DROP CONSTRAINT "class_sections_lecturerId_fkey";

-- DropIndex
DROP INDEX "class_sections_code_key";

-- AlterTable
ALTER TABLE "class_sections" ADD COLUMN     "block" INTEGER,
ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "room" TEXT,
ADD COLUMN     "slot" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "totalHours" INTEGER,
ADD COLUMN     "trainingTime" TEXT,
ADD COLUMN     "weekdays" TEXT,
ALTER COLUMN "lecturerId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "class_sections_code_term_key" ON "class_sections"("code", "term");

-- AddForeignKey
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_lecturerId_fkey" FOREIGN KEY ("lecturerId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
