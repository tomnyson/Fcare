-- Chuẩn hóa nhận xét theo tài liệu II.2: gắn nhận xét vào lớp học phần,
-- ghi số buổi vắng, và thay `issueGroup` bằng bảng tiêu chí có enum.
-- Thứ tự bắt buộc: thêm cột nullable → backfill → mới siết ràng buộc.

-- CreateEnum
CREATE TYPE "EvaluationCriterion" AS ENUM ('P_NOT_FIT_MAJOR', 'P_PART_TIME_JOB', 'P_OTHER_ACTIVITIES', 'P_FAMILY_HARDSHIP', 'P_FINANCIAL_HARDSHIP', 'P_PSYCHOLOGICAL', 'P_DROPOUT_INTENT', 'H_NO_QUIZ_CMS', 'H_EXAM_BAN_RISK', 'H_NO_RESPONSE');

-- CreateTable
CREATE TABLE "evaluation_criteria" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "criterion" "EvaluationCriterion" NOT NULL,

    CONSTRAINT "evaluation_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_criteria_evaluationId_criterion_key" ON "evaluation_criteria"("evaluationId", "criterion");

-- AddForeignKey
ALTER TABLE "evaluation_criteria" ADD CONSTRAINT "evaluation_criteria_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 1. Thêm cột ở dạng nullable trước
ALTER TABLE "evaluations" ADD COLUMN "classSectionId" TEXT;
ALTER TABLE "evaluations" ADD COLUMN "absentSessions" INTEGER;

-- 2. Backfill lớp học phần: lớp có code nhỏ nhất mà GV đó dạy SV đó trong kỳ đó
UPDATE "evaluations" e
SET "classSectionId" = sub.id
FROM (
  SELECT DISTINCT ON (cs."lecturerId", cs.term, en."studentId")
         cs.id, cs."lecturerId", cs.term, en."studentId"
  FROM "class_sections" cs
  JOIN "enrollments" en ON en."classSectionId" = cs.id
  ORDER BY cs."lecturerId", cs.term, en."studentId", cs.code ASC
) sub
WHERE sub."lecturerId" = e."lecturerId"
  AND sub.term = e.term
  AND sub."studentId" = e."studentId";

-- 3. Backfill tiêu chí từ nhóm vấn đề cũ
INSERT INTO "evaluation_criteria" ("id", "evaluationId", "criterion")
SELECT gen_random_uuid(), e.id,
  CASE e."issueGroup"
    WHEN 1 THEN 'P_NOT_FIT_MAJOR'::"EvaluationCriterion"
    WHEN 2 THEN 'P_PART_TIME_JOB'::"EvaluationCriterion"
    WHEN 3 THEN 'P_OTHER_ACTIVITIES'::"EvaluationCriterion"
    WHEN 4 THEN 'P_PSYCHOLOGICAL'::"EvaluationCriterion"
  END
FROM "evaluations" e
WHERE e."issueGroup" IS NOT NULL AND e."issueGroup" BETWEEN 1 AND 4;

-- 4. Chốt ràng buộc rồi mới bỏ cột cũ
ALTER TABLE "evaluations" ALTER COLUMN "classSectionId" SET NOT NULL;
ALTER TABLE "evaluations" DROP COLUMN "issueGroup";

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_lecturerId_classSectionId_studentId_key" ON "evaluations"("lecturerId", "classSectionId", "studentId");

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "class_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
