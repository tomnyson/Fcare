/**
 * Hai bảng ánh xạ mã trong file Excel → danh mục trong hệ thống. Gom vào một
 * chỗ vì cùng lúc phục vụ ba nơi: bản xem trước import (cảnh báo + gán nhanh),
 * tab danh mục Đào tạo, và test.
 *
 * HẬU QUẢ khi thiếu ánh xạ KHÁC nhau giữa hai loại — nói sai khiến admin tưởng
 * mất dữ liệu (hoặc ngược lại): thiếu ánh xạ bộ môn thì dòng bị bỏ qua khi ghi,
 * thiếu ánh xạ ngành thì sinh viên vẫn được tạo, chỉ để trống ngành.
 */
export type MappingTargetKind = 'department' | 'major';

export interface MappingTargetConfig {
  /** Endpoint bảng ánh xạ — cũng là nơi POST khi gán nhanh. */
  aliasPath: string;
  /** Endpoint danh mục đích, đổ vào <select>. */
  targetPath: string;
  /** Khoá cache TanStack Query của danh sách ánh xạ (trùng key của tab). */
  aliasQueryKey: string;
  /** Khoá cache của danh mục đích. */
  targetQueryKey: string;
  /** Tên trường ID đích trong body POST. */
  targetField: 'departmentId' | 'majorId';
  /** Nhãn tuỳ chọn "tạo mới" trong ô chọn đích. */
  newOptionLabel: string;
  /** Ngành phải thuộc một bộ môn; bộ môn thì không. */
  createNeedsDepartment: boolean;
  targetLabel: string;
  codeLabel: string;
  consequence: string;
  screen: string;
}

export const MAPPING_TARGETS: Record<MappingTargetKind, MappingTargetConfig> = {
  department: {
    aliasPath: '/department-aliases',
    targetPath: '/departments',
    aliasQueryKey: 'department-aliases',
    targetQueryKey: 'departments',
    targetField: 'departmentId',
    targetLabel: 'Bộ môn đích',
    codeLabel: 'mã bộ môn',
    consequence: 'dòng dùng mã này sẽ bị bỏ qua khi ghi',
    newOptionLabel: '+ Tạo bộ môn mới…',
    createNeedsDepartment: false,
    screen: 'Đào tạo → Ánh xạ bộ môn',
  },
  major: {
    aliasPath: '/major-aliases',
    targetPath: '/majors',
    aliasQueryKey: 'major-aliases',
    targetQueryKey: 'majors',
    targetField: 'majorId',
    targetLabel: 'Ngành đích',
    codeLabel: 'mã ngành',
    consequence: 'sinh viên vẫn được tạo nhưng để trống ngành',
    newOptionLabel: '+ Tạo ngành mới…',
    createNeedsDepartment: true,
    screen: 'Đào tạo → Ánh xạ ngành',
  },
};

/** Một mã chỉ định danh được khi kèm loại: "CNTT" có thể là cả bộ môn lẫn ngành. */
export function mappingCodeKey(kind: MappingTargetKind, code: string): string {
  return `${kind}:${code}`;
}

/**
 * Các mã còn thiếu ánh xạ sau khi trừ những mã vừa gán nhanh trong phiên.
 * Committer đọc lại bảng ánh xạ NGAY TRONG transaction commit (xem
 * `loadDepartmentByAlias` và `RosterCommitter`), nên mã vừa gán có hiệu lực mà
 * KHÔNG cần tải lại file — vì thế trừ tại chỗ ở UI là đúng, không phải mẹo hiển thị.
 */
export function remainingUnmapped(
  kind: MappingTargetKind,
  codes: readonly string[],
  mapped: ReadonlySet<string>,
): string[] {
  return codes.filter((code) => !mapped.has(mappingCodeKey(kind, code)));
}

/** Giá trị sentinel của tuỳ chọn "tạo mới" — không phải id nên không đụng dữ liệu thật. */
export const NEW_TARGET_VALUE = '__new__';

/**
 * Có cần tạo thêm bản ghi ánh xạ sau khi tạo mới bộ môn/ngành không.
 *
 * Committer đã tra `Department.code`/`Major.code` làm fallback (xem
 * `department-lookup.ts`, `roster.committer.ts`), nên ánh xạ trùng đúng mã vừa
 * tạo là bản ghi thừa — đúng quy ước seed "không seed alias trùng Major.code".
 * Mã trong file khác mã danh mục (tạo ngành "LTAI" cho nhãn "CHNA") thì vẫn
 * phải có ánh xạ, nếu không dòng import vẫn mồ côi.
 */
export function shouldCreateAlias(targetCode: string, aliasCode: string): boolean {
  return targetCode.trim().toLowerCase() !== aliasCode.trim().toLowerCase();
}
