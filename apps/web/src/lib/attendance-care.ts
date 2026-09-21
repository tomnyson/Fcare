import type { PendingAttendanceAlert } from './types';

export type PanelTone = 'info' | 'warning' | 'orange' | 'danger';

export interface LevelGroup {
  level: number;
  items: PendingAttendanceAlert[];
}

/** Vai trò được xem cảnh báo điểm danh ngoài lớp mình dạy (bảng thứ hai trên dashboard). */
const DEPARTMENT_VIEW_ROLES = [
  'HEAD_OF_DEPT',
  'SA_OFFICER',
  'SA_HEAD',
  'TRAINING_OFFICER',
  'ADMIN',
];

const NAV_BADGE_CAP = 99;

/** Gom theo mức, mức cao nhất đứng trước; giữ nguyên thứ tự API (createdAt tăng dần) trong mỗi nhóm. */
export function groupByLevel(items: readonly PendingAttendanceAlert[]): LevelGroup[] {
  const byLevel = new Map<number, PendingAttendanceAlert[]>();
  for (const alert of items) {
    byLevel.set(alert.level, [...(byLevel.get(alert.level) ?? []), alert]);
  }
  return [...byLevel.entries()]
    .sort(([a], [b]) => b - a)
    .map(([level, grouped]) => ({ level, items: grouped }));
}

/** Tông màu viền trái của bảng theo mức cao nhất — cùng thang 1→4 với badge cảnh báo. */
export function panelTone(items: readonly PendingAttendanceAlert[]): PanelTone {
  const highest = items.reduce((max, alert) => Math.max(max, alert.level), 0);
  if (highest >= 4) return 'danger';
  if (highest === 3) return 'orange';
  if (highest === 2) return 'warning';
  return 'info';
}

export function splitByOwner(items: readonly PendingAttendanceAlert[]): {
  owned: PendingAttendanceAlert[];
  others: PendingAttendanceAlert[];
} {
  return {
    owned: items.filter((alert) => alert.isOwner),
    others: items.filter((alert) => !alert.isOwner),
  };
}

/** Nội dung gợi ý cho nhật ký — chỉ nêu lớp và số buổi, không kèm thông tin cá nhân. */
export function defaultCareContent(alert: PendingAttendanceAlert): string {
  const section = `lớp ${alert.classSection.code} (${alert.classSection.subjectName})`;
  return alert.absentSessions === null
    ? `Trao đổi với sinh viên về tình hình chuyên cần ${section}.`
    : `Trao đổi với sinh viên sau khi vắng ${alert.absentSessions} buổi ${section}.`;
}

export function canViewDepartmentAttendance(roles: readonly string[]): boolean {
  return roles.some((role) => DEPARTMENT_VIEW_ROLES.includes(role));
}

export function formatNavBadge(count: number | undefined): string | null {
  if (!count || count <= 0) return null;
  return count > NAV_BADGE_CAP ? `${NAV_BADGE_CAP}+` : String(count);
}
