import { attendanceLevelFor } from '@fcare/shared-types';

/** Cảnh báo điểm danh đang mở (chưa RESOLVED) của cùng (SV, lớp học phần, kỳ). */
export interface OpenAttendanceAlert {
  level: number;
  absentSessions: number | null;
}

export type ReviewAction =
  | { type: 'skip' }
  | { type: 'create'; level: 2 | 3 }
  | { type: 'upgrade'; level: 3 }
  | { type: 'refresh'; level: number }
  | { type: 'unchanged' };

/**
 * Hàm thuần: quyết định làm gì với một dòng điểm danh sau import.
 * - Không hạ cấp tự động (số buổi giảm do sửa dữ liệu → giữ nguyên, người xử lý).
 * - Không tự lên cấp 4 (`attendanceLevelFor` chỉ trả 2 | 3).
 * - Cùng cấp nhưng vắng thêm → chỉ cập nhật số buổi, KHÔNG thông báo lại
 *   (quyết định H: import lại không làm phiền giảng viên).
 */
export function decideAction(
  absentSessions: number | null | undefined,
  existing: OpenAttendanceAlert | null,
): ReviewAction {
  const level = attendanceLevelFor(absentSessions);
  if (!existing) {
    return level ? { type: 'create', level } : { type: 'skip' };
  }
  if (level !== null && level > existing.level) {
    return { type: 'upgrade', level: 3 };
  }
  const absent = absentSessions ?? null;
  if (absent !== null && absent > (existing.absentSessions ?? -1)) {
    return { type: 'refresh', level: existing.level };
  }
  return { type: 'unchanged' };
}
