/**
 * Câu hiển thị thay cho nội dung của một tin trao đổi đã thu hồi.
 *
 * Dùng ở HAI nơi và phải giống hệt nhau: API ghi đè `Notification.body` khi
 * thu hồi (để nội dung không sống sót trong chuông báo), còn web vẽ đúng câu
 * này trong khung hội thoại. Lệch nhau thì hai chỗ nói hai giọng về cùng một
 * sự kiện — nên hằng nằm ở đây, không chép tay ở từng kho.
 */
export const RECALLED_MESSAGE_TEXT = 'Tin nhắn đã thu hồi';
