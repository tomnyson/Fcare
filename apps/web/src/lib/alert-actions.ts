import type {
  AlertBulkDeletionPreview,
  AlertDeletionCounts,
  AlertDeletionPreview,
  AlertStatus,
} from './types';

/** Trần một lượt xoá — phải khớp `ALERT_BULK_DELETE_MAX` của API (bằng cỡ trang lớn nhất). */
export const ALERT_BULK_DELETE_MAX = 100;

/** Vai trò được "Tiếp nhận"/"Xử lý" cảnh báo — khớp CASL `resolve Alert` phía API. */
export const RESOLVER_ROLES = ['ADMIN', 'HEAD_OF_DEPT', 'TRAINING_OFFICER', 'SA_HEAD'] as const;

/** Chỉ ADMIN có `delete Alert` (CASL `manage all`); web chặn thêm bằng PIN hệ thống. */
const DELETER_ROLES = ['ADMIN'] as const;

export interface AlertRowActions {
  canAcknowledge: boolean;
  canResolve: boolean;
  canDelete: boolean;
}

/**
 * Nút nào hiện ở cột THAO TÁC cho một dòng cảnh báo. Thuần để test được mà
 * không phải dựng trang: quyền theo vai + trạng thái hiện tại của cảnh báo.
 * Xoá cho phép ở MỌI trạng thái (kể cả đã xử lý) — mục đích là dọn dữ liệu.
 */
export function alertRowActions(input: {
  roles: ReadonlyArray<string> | undefined;
  status: AlertStatus;
}): AlertRowActions {
  const roles = input.roles ?? [];
  const isResolver = roles.some((role) => (RESOLVER_ROLES as ReadonlyArray<string>).includes(role));
  const isDeleter = roles.some((role) => (DELETER_ROLES as ReadonlyArray<string>).includes(role));
  const unresolved = input.status !== 'RESOLVED';
  return {
    canAcknowledge: isResolver && input.status === 'OPEN',
    canResolve: isResolver && unresolved,
    canDelete: isDeleter,
  };
}

export type DeletionLineKind =
  | 'alert'
  | 'evaluations'
  | 'discussionMessages'
  | 'careLogs'
  | 'notifications'
  | 'analysisVersionsUnlinked';

export interface DeletionLine {
  kind: DeletionLineKind;
  text: string;
  /** true = bị xoá; false = chỉ mất liên kết. */
  destructive: boolean;
}

/**
 * Danh sách "sẽ mất gì" cho modal xoá. Nhận xét và trao đổi LUÔN có dòng (kể
 * cả bằng 0) vì đó là phạm vi rộng người xoá phải nhìn thấy; các dòng phụ
 * (nhật ký, thông báo, phân tích) bằng 0 thì ẩn cho gọn.
 */
export function deletionPreviewLines(preview: AlertDeletionPreview): DeletionLine[] {
  return [
    {
      kind: 'alert',
      text: 'Cảnh báo này (cùng trạng thái, lý do, ghi chú xử lý)',
      destructive: true,
    },
    ...countLines(preview, { alerts: 1, students: 1 }),
  ];
}

/** Bản cho một lô: dòng đầu nêu cỡ lô, phần còn lại giống xoá đơn lẻ. */
export function bulkDeletionPreviewLines(preview: AlertBulkDeletionPreview): DeletionLine[] {
  return [
    {
      kind: 'alert',
      text: `${preview.alerts} cảnh báo của ${preview.students} sinh viên (cùng trạng thái, lý do, ghi chú xử lý)`,
      destructive: true,
    },
    ...countLines(preview, preview),
  ];
}

function countLines(
  counts: AlertDeletionCounts,
  size: { alerts: number; students: number },
): DeletionLine[] {
  const count = (n: number, unit: string) => (n === 0 ? `không có ${unit}` : `${n} ${unit}`);
  const studentWord = size.students > 1 ? 'các sinh viên' : 'sinh viên';
  const alertWord = size.alerts > 1 ? 'các cảnh báo này' : 'cảnh báo này';
  const lines: DeletionLine[] = [
    {
      kind: 'evaluations',
      text: `Toàn bộ nhận xét giảng viên của ${studentWord} — ${count(counts.evaluations, 'nhận xét')}`,
      destructive: true,
    },
    {
      kind: 'discussionMessages',
      text: `Toàn bộ luồng trao đổi nội bộ về ${studentWord} — ${count(counts.discussionMessages, 'tin')}`,
      destructive: true,
    },
  ];
  if (counts.careLogs > 0) {
    lines.push({
      kind: 'careLogs',
      text: `${counts.careLogs} nhật ký chăm sóc gắn với ${alertWord}`,
      destructive: true,
    });
  }
  if (counts.notifications > 0) {
    lines.push({
      kind: 'notifications',
      text: `${counts.notifications} thông báo đã gửi cho ${alertWord}`,
      destructive: true,
    });
  }
  if (counts.analysisVersionsUnlinked > 0) {
    lines.push({
      kind: 'analysisVersionsUnlinked',
      text: `${counts.analysisVersionsUnlinked} bản phân tích AI chỉ mất liên kết tới cảnh báo (không xoá)`,
      destructive: false,
    });
  }
  return lines;
}

/** Bật/tắt một id trong bộ chọn — trả Set mới, không mutate; không vượt trần một lượt. */
export function toggleSelected(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else if (next.size < ALERT_BULK_DELETE_MAX) next.add(id);
  return next;
}

/**
 * Ô "chọn cả trang": trang đã chọn hết → bỏ chọn cả trang (id trang khác giữ
 * nguyên); ngược lại chọn thêm đến khi đầy trang hoặc chạm trần.
 */
export function toggleAllSelected(
  selected: ReadonlySet<string>,
  pageIds: ReadonlyArray<string>,
): Set<string> {
  const next = new Set(selected);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => next.has(id));
  if (allSelected) {
    for (const id of pageIds) next.delete(id);
    return next;
  }
  for (const id of pageIds) {
    if (next.size >= ALERT_BULK_DELETE_MAX) break;
    next.add(id);
  }
  return next;
}

/**
 * Query key gốc cần làm tươi sau khi xoá: bảng cảnh báo, banner điểm danh,
 * chuông thông báo, tab nhận xét/trao đổi/nhật ký của hồ sơ sinh viên, và mọi
 * thống kê đếm cảnh báo/chăm sóc.
 */
export const ALERT_DELETE_INVALIDATION_KEYS: ReadonlyArray<readonly [string]> = [
  ['alerts'],
  ['attendance-alerts'],
  ['notifications'],
  ['evaluations'],
  ['discussions'],
  ['care-logs'],
  ['statistics'],
  ['care-statistics'],
];
