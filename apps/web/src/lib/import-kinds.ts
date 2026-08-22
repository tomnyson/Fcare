import type { ImportKind } from './types';

/** Bốn loại import, theo đúng thứ tự phải chạy: danh mục trước, dữ liệu sau. */
export const IMPORT_KINDS = [
  {
    slug: 'catalog',
    label: 'Danh mục môn học',
    hint: 'Sheet "3.1.Môn-BM" của file phân công. Chạy đầu tiên — các bước sau cần môn học đã có.',
  },
  {
    slug: 'lecturer',
    label: 'Danh sách giảng viên',
    hint: 'Sheet "T.Kê". Tạo tài khoản với mật khẩu tạm; cấp lại mật khẩu ở trang Người dùng.',
  },
  {
    slug: 'schedule',
    label: 'Lịch và phân công lớp',
    hint: 'Hai sheet "BL1+BL2" và "Lịch tool". Lớp chưa có giảng viên sẽ ở trạng thái chờ gán.',
  },
  {
    slug: 'gradebook',
    label: 'Bảng điểm',
    hint: 'File gradebook nhiều sheet. Chỉ lấy điểm tổng kết và trạng thái.',
  },
] as const;

export type ImportKindSlug = (typeof IMPORT_KINDS)[number]['slug'];

/**
 * Allowlist cột hiển thị ở bản xem trước, theo TỪNG loại import — thay vì đổ
 * nguyên `Object.entries(payload)` ra bảng. Payload đã được `assertNoForbiddenValues`
 * chặn CCCD/SĐT/email/địa chỉ từ lúc upload (RULE 1), nhưng allowlist này là lớp
 * phòng thủ thứ hai ở UI: nếu parser ở apps/api sau này thêm field mới, cột đó sẽ
 * KHÔNG tự động hiện ra cho tới khi được thêm vào đây một cách tường minh.
 * Khớp đúng field các parser thật đang emit (apps/api/src/modules/imports/parsers/*).
 */
export const IMPORT_PAYLOAD_COLUMNS: Record<ImportKind, Array<{ key: string; label: string }>> = {
  CATALOG: [
    { key: 'code', label: 'Mã môn' },
    { key: 'name', label: 'Tên môn' },
    { key: 'credits', label: 'Số TC' },
    { key: 'deptAlias', label: 'Bộ môn' },
    { key: 'subjectGroup', label: 'Nhóm môn' },
    { key: 'hoursTotal', label: 'Số giờ' },
    { key: 'learningMethod', label: 'Hình thức học' },
    { key: 'maxStudents', label: 'SV max/lớp' },
    { key: 'examForm', label: 'Hình thức thi' },
    { key: 'attendanceRateRequired', label: '% đi học' },
  ],
  LECTURER: [
    { key: 'username', label: 'Username' },
    { key: 'fullName', label: 'Họ tên' },
    { key: 'lecturerType', label: 'Loại GV' },
  ],
  SCHEDULE: [
    { key: 'subjectCode', label: 'Mã môn' },
    { key: 'classCode', label: 'Mã lớp' },
    { key: 'block', label: 'Block' },
    { key: 'slot', label: 'Ca' },
    { key: 'weekdays', label: 'Thứ học' },
    { key: 'room', label: 'Phòng' },
    { key: 'capacity', label: 'Sĩ số' },
    { key: 'trainingTime', label: 'Thời lượng' },
  ],
  GRADEBOOK: [
    { key: 'subjectCode', label: 'Mã môn' },
    { key: 'studentCode', label: 'MSSV' },
    { key: 'fullName', label: 'Họ tên' },
    { key: 'rawClass', label: 'Lớp học phần' },
    { key: 'totalScore', label: 'Điểm tổng kết' },
    { key: 'resultLabel', label: 'Trạng thái' },
  ],
};
