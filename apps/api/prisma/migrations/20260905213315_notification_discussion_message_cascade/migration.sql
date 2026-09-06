-- HIGH-A: xoá sinh viên CASCADE xoá discussion_messages, nhưng khoá ngoại này
-- đang là SET NULL nên dòng notifications còn nguyên 120 ký tự nội dung cán bộ
-- gõ, mồ côi và không còn đường nào tẩy (bộ tẩy khi thu hồi khoá theo đúng cột
-- vừa bị NULL). Đổi sang CASCADE để thông báo chết theo tin.

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_discussionMessageId_fkey";

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_discussionMessageId_fkey" FOREIGN KEY ("discussionMessageId") REFERENCES "discussion_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
