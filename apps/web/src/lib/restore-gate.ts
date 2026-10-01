/**
 * Từ khóa API vẫn yêu cầu trong body `POST /admin/backup/:id/restore`. Người
 * dùng không gõ từ khóa này — xác nhận thật là PIN cá nhân kiểm ở server
 * (header `X-Pin-Proof`), web tự gửi kèm từ khóa để giữ hợp đồng với API.
 */
export const RESTORE_CONFIRMATION_KEYWORD = 'XAC NHAN';
