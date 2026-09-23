-- Xoá cảnh báo (ADMIN): thông báo đã phát cho cảnh báo phải chết theo cảnh báo.
-- SET NULL để lại dòng thông báo mang tên + mã SV + lý do, mất con trỏ về nguồn.
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_alertId_fkey";

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
