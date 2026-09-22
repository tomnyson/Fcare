export interface AuditStaff {
  id: string;
  staffCode: string;
  fullName: string;
  email: string | null;
}

export interface AuditLogItem {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  staff: AuditStaff | null;
}

export interface PaginatedAuditLogs {
  items: AuditLogItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface AuditLogFilters {
  search: string;
  staffCode: string;
  action: string;
  entity: string;
  from: string;
  to: string;
  page: number;
  limit: number;
}

export const ACTION_PRESETS: ReadonlyArray<{ key: string; label: string; group: string }> = [
  // Auth
  { key: 'AUTH_LOGIN', label: 'Đăng nhập', group: 'Xác thực' },
  { key: 'AUTH_LOGOUT', label: 'Đăng xuất', group: 'Xác thực' },
  { key: 'AUTH_GOOGLE_LOGIN', label: 'Đăng nhập Google', group: 'Xác thực' },
  { key: 'AUTH_PASSWORD_CHANGED', label: 'Đổi mật khẩu', group: 'Xác thực' },

  // Care logs & Alerts
  { key: 'CARE_LOG_CREATE', label: 'Thêm nhật ký chăm sóc', group: 'Chăm sóc' },
  { key: 'CARE_LOG_UPDATE', label: 'Cập nhật nhật ký chăm sóc', group: 'Chăm sóc' },
  { key: 'CARE_LOG_DELETE', label: 'Xóa nhật ký chăm sóc', group: 'Chăm sóc' },
  { key: 'ALERT_RAISED', label: 'Phát cảnh báo sinh viên', group: 'Cảnh báo' },
  { key: 'ALERT_RESOLVED', label: 'Xử lý cảnh báo', group: 'Cảnh báo' },
  { key: 'ATTENDANCE_REVIEW', label: 'Duyệt điểm danh', group: 'Cảnh báo' },

  // Excel & Import
  { key: 'EXCEL_IMPORT_STUDENTS', label: 'Import sinh viên', group: 'Dữ liệu' },
  { key: 'EXCEL_IMPORT_GRADES', label: 'Import bảng điểm', group: 'Dữ liệu' },
  { key: 'EXCEL_EXPORT_STUDENTS', label: 'Xuất Excel sinh viên', group: 'Dữ liệu' },
  { key: 'EXCEL_EXPORT_GRADES', label: 'Xuất Excel điểm', group: 'Dữ liệu' },
  { key: 'IMPORT_COMMIT', label: 'Xác nhận import dữ liệu', group: 'Dữ liệu' },

  // Phân tích & Học vụ
  { key: 'STUDENT_TERM_ANALYSIS_SUBMIT', label: 'Nộp phân tích kỳ', group: 'Học vụ' },
  { key: 'STUDENT_UPDATE', label: 'Cập nhật sinh viên', group: 'Học vụ' },

  // Admin & Hệ thống
  { key: 'ADMIN_CREATE_STAFF', label: 'Tạo tài khoản nhân viên', group: 'Quản trị' },
  { key: 'ADMIN_UPDATE_STAFF', label: 'Cập nhật nhân viên', group: 'Quản trị' },
  { key: 'ADMIN_RESET_PASSWORD', label: 'Cấp lại mật khẩu', group: 'Quản trị' },
  { key: 'ADMIN_BULK_EMAILS', label: 'Gán email hàng loạt', group: 'Quản trị' },
  { key: 'ADMIN_BULK_DEPARTMENT', label: 'Gán bộ môn hàng loạt', group: 'Quản trị' },
  { key: 'BACKUP_CREATE', label: 'Tạo sao lưu hệ thống', group: 'Hệ thống' },
  { key: 'BACKUP_RESTORE', label: 'Khôi phục bản sao lưu', group: 'Hệ thống' },
  { key: 'BACKUP_DELETE', label: 'Xóa bản sao lưu', group: 'Hệ thống' },
  { key: 'MONITORING_SETTINGS_UPDATE', label: 'Cập nhật giám sát', group: 'Hệ thống' },
  { key: 'MAIL_SETTINGS_UPDATE', label: 'Cập nhật cấu hình mail', group: 'Hệ thống' },
];

export const ACTION_LABEL_MAP: Record<string, string> = Object.fromEntries(
  ACTION_PRESETS.map((p) => [p.key, p.label]),
);

export function getActionLabel(action: string): string {
  return ACTION_LABEL_MAP[action] ?? action;
}

export type ActionCategory = 'auth' | 'care' | 'alert' | 'excel' | 'admin' | 'system' | 'other';

export function getActionCategory(action: string): ActionCategory {
  const upper = action.toUpperCase();
  if (upper.startsWith('AUTH_')) return 'auth';
  if (upper.startsWith('CARE_')) return 'care';
  if (upper.startsWith('ALERT_') || upper.startsWith('ATTENDANCE_')) return 'alert';
  if (upper.startsWith('EXCEL_') || upper.startsWith('IMPORT_')) return 'excel';
  if (upper.startsWith('ADMIN_') || upper.startsWith('STAFF_')) return 'admin';
  if (upper.startsWith('BACKUP_') || upper.startsWith('MONITORING_') || upper.startsWith('MAIL_'))
    return 'system';
  return 'other';
}

export function getActionBadgeStyle(category: ActionCategory): {
  bg: string;
  text: string;
  border: string;
} {
  switch (category) {
    case 'auth':
      return {
        bg: 'bg-blue-50 dark:bg-blue-950/40',
        text: 'text-blue-700 dark:text-blue-300',
        border: 'border-blue-200 dark:border-blue-800',
      };
    case 'care':
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-950/40',
        text: 'text-emerald-700 dark:text-emerald-300',
        border: 'border-emerald-200 dark:border-emerald-800',
      };
    case 'alert':
      return {
        bg: 'bg-amber-50 dark:bg-amber-950/40',
        text: 'text-amber-700 dark:text-amber-300',
        border: 'border-amber-200 dark:border-amber-800',
      };
    case 'excel':
      return {
        bg: 'bg-teal-50 dark:bg-teal-950/40',
        text: 'text-teal-700 dark:text-teal-300',
        border: 'border-teal-200 dark:border-teal-800',
      };
    case 'admin':
      return {
        bg: 'bg-indigo-50 dark:bg-indigo-950/40',
        text: 'text-indigo-700 dark:text-indigo-300',
        border: 'border-indigo-200 dark:border-indigo-800',
      };
    case 'system':
      return {
        bg: 'bg-rose-50 dark:bg-rose-950/40',
        text: 'text-rose-700 dark:text-rose-300',
        border: 'border-rose-200 dark:border-rose-800',
      };
    default:
      return {
        bg: 'bg-slate-50 dark:bg-slate-900/40',
        text: 'text-slate-700 dark:text-slate-300',
        border: 'border-slate-200 dark:border-slate-700',
      };
  }
}

export function formatAuditDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    const pad = (n: number) => String(n).padStart(2, '0');
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  } catch {
    return dateStr;
  }
}

export function getAuditBadgeTone(
  action: string,
): 'info' | 'success' | 'warning' | 'danger' | 'neutral' {
  const category = getActionCategory(action);
  switch (category) {
    case 'auth':
      return 'info';
    case 'care':
      return 'success';
    case 'alert':
      return 'warning';
    case 'excel':
      return 'info';
    case 'admin':
      return 'neutral';
    case 'system':
      return 'neutral';
    default:
      return 'neutral';
  }
}
