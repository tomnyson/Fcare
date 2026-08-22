import type { RoleKey } from '@fcare/shared-types';
import type { AlertStatus, CareChannel, EnrollmentResult, StudentStatus } from './types';

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  STUDYING: 'Đang học',
  RESERVED: 'Bảo lưu',
  WARNED: 'Cảnh báo',
  DROPPED_OUT: 'Thôi học',
  GRADUATED: 'Tốt nghiệp',
};

export const STUDENT_STATUS_TONES: Record<
  StudentStatus,
  'info' | 'success' | 'warning' | 'danger' | 'neutral'
> = {
  STUDYING: 'info',
  RESERVED: 'neutral',
  WARNED: 'warning',
  DROPPED_OUT: 'danger',
  GRADUATED: 'success',
};

export const ENROLLMENT_RESULT_LABELS: Record<EnrollmentResult, string> = {
  IN_PROGRESS: 'Đang học',
  PASS: 'Đạt',
  FAIL: 'Trượt',
};

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  OPEN: 'Chờ tiếp nhận',
  ACKNOWLEDGED: 'Đã tiếp nhận',
  RESOLVED: 'Đã xử lý',
};

export const ALERT_LEVEL_LABELS: Record<number, string> = {
  1: 'Thấp',
  2: 'Trung bình',
  3: 'Cao',
  4: 'Khẩn cấp',
};

export const ALERT_LEVEL_TONES: Record<number, 'info' | 'success' | 'warning' | 'danger'> = {
  1: 'info',
  2: 'warning',
  3: 'warning',
  4: 'danger',
};

export const CARE_CHANNEL_LABELS: Record<CareChannel, string> = {
  IN_PERSON: 'Gặp trực tiếp',
  ONLINE: 'Trao đổi online',
};

export const ROLE_LABELS: Record<RoleKey, string> = {
  ADMIN: 'Quản trị hệ thống',
  HEAD_OF_DEPT: 'Trưởng bộ môn',
  LECTURER: 'Giảng viên',
  TRAINING_OFFICER: 'Cán bộ Đào tạo',
  SA_OFFICER: 'Cán bộ CTSV',
  SA_HEAD: 'Trưởng phòng CTSV',
};

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleDateString('vi-VN');
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}
