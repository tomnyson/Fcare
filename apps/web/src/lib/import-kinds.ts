import type { ImportKind } from './types';

/**
 * Nguồn file của mỗi loại import. Chỉ các loại CÙNG nguồn mới tick chung được
 * và chạy chuỗi từ một lần upload; khác nguồn là khác file nên loại trừ nhau.
 * - `assignment`: file phân công (3 sheet khác nhau).
 * - `gradebook`: file gradebook riêng.
 * - `term-*`: bộ 3 file nhà trường gửi đầu kỳ, mỗi loại một file riêng.
 */
export type ImportSource =
  'assignment' | 'gradebook' | 'term-sections' | 'term-roster' | 'term-grades';

/** Các loại import, theo đúng thứ tự phải chạy: danh mục trước, dữ liệu sau. */
export const IMPORT_KINDS = [
  {
    slug: 'catalog',
    kind: 'CATALOG',
    label: 'Danh mục môn học',
    hint: 'Sheet "3.1.Môn-BM" của file phân công. Chạy đầu tiên — các bước sau cần môn học đã có.',
    source: 'assignment',
  },
  {
    slug: 'lecturer',
    kind: 'LECTURER',
    label: 'Danh sách giảng viên',
    hint: 'Sheet "T.Kê". Tạo tài khoản với mật khẩu tạm; cấp lại mật khẩu ở trang Người dùng.',
    source: 'assignment',
  },
  {
    slug: 'schedule',
    kind: 'SCHEDULE',
    label: 'Lịch và phân công lớp',
    hint: 'Hai sheet "BL1+BL2" và "Lịch tool". Lớp chưa có giảng viên sẽ ở trạng thái chờ gán.',
    source: 'assignment',
  },
  {
    slug: 'gradebook',
    kind: 'GRADEBOOK',
    label: 'Bảng điểm',
    hint: 'File gradebook nhiều sheet. Chỉ lấy điểm tổng kết và trạng thái.',
    source: 'gradebook',
  },
  {
    slug: 'section-list',
    kind: 'SECTION_LIST',
    label: 'Đầu kỳ 1/3 — Danh sách lớp',
    hint: 'File "Danh_sach_lop". Tạo lớp học phần kèm giảng viên, ca, phòng. Chạy trước hai file còn lại.',
    source: 'term-sections',
  },
  {
    slug: 'roster',
    kind: 'ROSTER',
    label: 'Đầu kỳ 2/3 — Sinh viên lớp môn',
    hint: 'File "DSSV lớp môn". Tạo hồ sơ sinh viên và ghi danh. Lớp chưa có sẽ bị bỏ qua.',
    source: 'term-roster',
  },
  {
    slug: 'grade-attendance',
    kind: 'GRADE_ATTENDANCE',
    label: 'Đầu kỳ 3/3 — Điểm và chuyên cần',
    hint: 'File "LHCT". Ghi điểm tổng kết, số buổi nghỉ và cấm thi vào ghi danh đã có.',
    source: 'term-grades',
  },
] as const satisfies ReadonlyArray<{
  slug: string;
  kind: ImportKind;
  label: string;
  hint: string;
  source: ImportSource;
}>;

export type ImportKindSlug = (typeof IMPORT_KINDS)[number]['slug'];

const KIND_ORDER: readonly ImportKindSlug[] = IMPORT_KINDS.map((kind) => kind.slug);

export function importKindLabel(slug: ImportKindSlug): string {
  return IMPORT_KINDS.find((kind) => kind.slug === slug)?.label ?? slug;
}

/** Nguồn file của một loại — hai loại khác nguồn không tick chung được. */
export function importKindSource(slug: ImportKindSlug): ImportSource | undefined {
  return IMPORT_KINDS.find((kind) => kind.slug === slug)?.source;
}

/** Loại này có đọc từ file phân công dùng chung (tick được nhiều loại) không. */
export function isSharedAssignmentFile(slug: ImportKindSlug): boolean {
  return importKindSource(slug) === 'assignment';
}

/**
 * Giá trị `ImportKind` của API → slug đường dẫn. KHÔNG suy ra bằng
 * `toLowerCase()`: `SECTION_LIST` phải thành `section-list`, không phải
 * `section_list`.
 */
export function slugOfKind(kind: ImportKind): ImportKindSlug {
  const found = IMPORT_KINDS.find((item) => item.kind === kind);
  if (!found) {
    throw new Error(`Loại import không xác định: ${kind}`);
  }
  return found.slug;
}

/**
 * Nhãn tra theo giá trị `ImportKind` của API (lịch sử import nhận `kind`, không
 * nhận slug). KHÔNG dựng bằng `slug.toUpperCase()`: `section-list` sẽ ra
 * `SECTION-LIST` chứ không phải `SECTION_LIST` và bảng lịch sử sẽ hiện mã thô.
 */
export const IMPORT_KIND_LABEL_BY_KIND = Object.fromEntries(
  IMPORT_KINDS.map((item) => [item.kind, item.label]),
) as Record<ImportKind, string>;

/**
 * Sắp xếp các loại đã chọn theo thứ tự import bắt buộc (danh mục → giảng viên
 * → lịch lớp → bảng điểm → bộ file đầu kỳ 1/3 → 2/3 → 3/3) và bỏ trùng — thứ tự người dùng tick KHÔNG có ý nghĩa,
 * vì lịch lớp cần môn học và giảng viên đã tồn tại.
 */
export function orderImportKinds(selected: readonly ImportKindSlug[]): ImportKindSlug[] {
  return KIND_ORDER.filter((slug) => selected.includes(slug));
}

/**
 * Tick/bỏ tick một loại. Chỉ giữ lại các loại ĐỌC CÙNG MỘT FILE với loại vừa
 * tick — wizard chạy chuỗi bằng cách upload lại đúng file đó, nên tick hai
 * loại khác file sẽ ghi sai dữ liệu. Trả về mảng mới.
 */
export function toggleImportKind(
  selected: readonly ImportKindSlug[],
  slug: ImportKindSlug,
): ImportKindSlug[] {
  if (selected.includes(slug)) {
    return selected.filter((item) => item !== slug);
  }
  const source = importKindSource(slug);
  const compatible = selected.filter((item) => importKindSource(item) === source);
  return orderImportKinds([...compatible, slug]);
}

/**
 * Allowlist cột hiển thị ở bản xem trước, theo TỪNG loại import — thay vì đổ
 * nguyên `Object.entries(payload)` ra bảng. Payload đã sạch vì `stripForbiddenData`
 * xoá CCCD/SĐT/email/địa chỉ ngay lúc upload (RULE 1), nhưng allowlist này là lớp
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
  SECTION_LIST: [
    { key: 'code', label: 'Mã lớp học phần' },
    { key: 'classCode', label: 'Tên lớp' },
    { key: 'subjectCode', label: 'Mã môn' },
    { key: 'block', label: 'Block' },
    { key: 'slot', label: 'Ca' },
    { key: 'room', label: 'Phòng' },
    { key: 'capacity', label: 'Sĩ số' },
    { key: 'startDate', label: 'Ngày bắt đầu' },
    { key: 'lecturerUsername', label: 'Giảng viên' },
  ],
  ROSTER: [
    { key: 'studentCode', label: 'MSSV' },
    { key: 'fullName', label: 'Họ tên' },
    { key: 'majorAlias', label: 'Mã ngành' },
    { key: 'classCode', label: 'Lớp' },
    { key: 'subjectCode', label: 'Mã môn' },
    { key: 'sectionCode', label: 'Lớp học phần' },
    { key: 'status', label: 'Trạng thái' },
  ],
  GRADE_ATTENDANCE: [
    { key: 'studentCode', label: 'MSSV' },
    { key: 'sectionCode', label: 'Lớp học phần' },
    { key: 'totalScore', label: 'Điểm tổng kết' },
    { key: 'result', label: 'Kết quả' },
    { key: 'isExamBanned', label: 'Cấm thi' },
    { key: 'absentSessions', label: 'Buổi nghỉ' },
    { key: 'totalSessions', label: 'Tổng buổi' },
    { key: 'attendanceRate', label: '% chuyên cần' },
  ],
};
