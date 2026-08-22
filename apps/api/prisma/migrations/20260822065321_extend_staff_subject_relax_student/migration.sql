-- DropForeignKey
ALTER TABLE "students" DROP CONSTRAINT "students_majorId_fkey";

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "lecturerType" TEXT,
ADD COLUMN     "username" TEXT;

-- AlterTable
ALTER TABLE "students" ALTER COLUMN "majorId" DROP NOT NULL,
ALTER COLUMN "cohort" DROP NOT NULL;

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "attendanceRateRequired" DOUBLE PRECISION,
ADD COLUMN     "examForm" TEXT,
ADD COLUMN     "hoursTotal" INTEGER,
ADD COLUMN     "learningMethod" TEXT,
ADD COLUMN     "maxStudents" INTEGER,
ADD COLUMN     "subjectGroup" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "staff_username_key" ON "staff"("username");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_majorId_fkey" FOREIGN KEY ("majorId") REFERENCES "majors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
