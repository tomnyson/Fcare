import type { ImportKind } from './types';

/**
 * Nguồn file của mỗi loại import:
 * - `assignment`: cùng một file phân công (3 sheet khác nhau) → có thể tick
 *   nhiều loại và chạy chuỗi từ một lần upload.
 * - `gradebook`: file gradebook riêng → lựa chọn loại trừ với nhóm trên.
 */
export type ImportSource = 'assignment' | 'gradebook';

/** Bốn loại import, theo đúng thứ tự phải chạy: danh mục trước, dữ liệu sau. */
export const IMPORT_KINDS = [
  {
    slug: 'catalog',
    label: 'Danh mục môn học',
    hint: 'Sheet "3.1.Môn-BM" của file phân công. Chạy đầu tiên — các bước sau cần môn học đã có.',
    source: 'assignment',
  },
  {
    slug: 'lecturer',
    label: 'Danh sách giảng viên',
    hint: 'Sheet "T.Kê". Tạo tài khoản với mật khẩu tạm; cấp lại mật khẩu ở trang Người dùng.',
    source: 'assignment',
  },
  {
    slug: 'schedule',
    label: 'Lịch và phân công lớp',
    hint: 'Hai sheet "BL1+BL2" và "Lịch tool". Lớp chưa có giảng viên sẽ ở trạng thái chờ gán.',
    source: 'assignment',
  },
  {
    slug: 'gradebook',
    label: 'Bảng điểm',
    hint: 'File gradebook nhiều sheet. Chỉ lấy điểm tổng kết và trạng thái.',
    source: 'gradebook',
  },
] as const satisfies ReadonlyArray<{
  slug: string;
  label: string;
  hint: string;
  source: ImportSource;
}>;

export type ImportKindSlug = (typeof IMPORT_KINDS)[number]['slug'];

const KIND_ORDER: readonly ImportKindSlug[] = IMPORT_KINDS.map((kind) => kind.slug);

export function importKindLabel(slug: ImportKindSlug): string {
  return IMPORT_KINDS.find((kind) => kind.slug === slug)?.label ?? slug;
}

/** Loại này có đọc từ file phân công dùng chung (tick được nhiều loại) không. */
export function isSharedAssignmentFile(slug: ImportKindSlug): boolean {
  return IMPORT_KINDS.find((kind) => kind.slug === slug)?.source === 'assignment';
}

/**
 * Sắp xếp các loại đã chọn theo thứ tự import bắt buộc (catalog → lecturer →
 * schedule → gradebook) và bỏ trùng — thứ tự người dùng tick KHÔNG có ý nghĩa,
 * vì lịch lớp cần môn học và giảng viên đã tồn tại.
 */
export function orderImportKinds(selected: readonly ImportKindSlug[]): ImportKindSlug[] {
  return KIND_ORDER.filter((slug) => selected.includes(slug));
}

/**
 * Tick/bỏ tick một loại. Bảng điểm đến từ file khác nên là lựa chọn loại trừ:
 * tick nó thì bỏ mọi loại cùng file phân công, và ngược lại. Trả về mảng mới.
 */
export function toggleImportKind(
  selected: readonly ImportKindSlug[],
  slug: ImportKindSlug,
): ImportKindSlug[] {
  if (selected.includes(slug)) {
    return selected.filter((item) => item !== slug);
  }
  const compatible = selected.filter(
    (item) => isSharedAssignmentFile(item) === isSharedAssignmentFile(slug),
  );
  return orderImportKinds([...compatible, slug]);
}

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
    { key: 'deptAlias', label: 'Bộ môn' },
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
    { key: 'lecturerName', label: 'Giảng viên' },
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
