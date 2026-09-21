-- Cảnh báo phát từ nhận xét (MANUAL) trước đây không lưu lớp học phần/học kỳ,
-- nên cột "Lớp học phần" ở trang Cảnh báo trống. Suy ra từ nhận xét gần nhất
-- của chính người phát cho sinh viên đó, tạo trước thời điểm phát cảnh báo.
-- Không suy ra được thì giữ nguyên (NULL). Chỉ chạm dữ liệu, không đổi schema.
UPDATE "alerts" AS a
SET "classSectionId" = src."classSectionId",
    "term" = COALESCE(a."term", src."term")
FROM (
  SELECT DISTINCT ON (al."id") al."id" AS "alertId", ev."classSectionId", ev."term"
  FROM "alerts" al
  JOIN "evaluations" ev
    ON ev."studentId" = al."studentId"
   AND ev."lecturerId" = al."raisedById"
   AND ev."createdAt" <= al."createdAt"
  WHERE al."source" = 'MANUAL'
    AND al."classSectionId" IS NULL
  ORDER BY al."id", ev."updatedAt" DESC
) AS src
WHERE a."id" = src."alertId";
