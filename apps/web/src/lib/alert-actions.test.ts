import { describe, expect, it } from 'vitest';
import {
  ALERT_DELETE_INVALIDATION_KEYS,
  ALERT_BULK_DELETE_MAX,
  alertRowActions,
  bulkDeletionPreviewLines,
  deletionPreviewLines,
  ACKNOWLEDGER_ROLES,
  toggleAllSelected,
  toggleSelected,
} from './alert-actions';
import type { AlertBulkDeletionPreview, AlertDeletionPreview } from './types';

describe('alertRowActions', () => {
  const row = {
    userId: 'me',
    sectionLecturerId: 'gv-lop' as string | null,
    raisedById: 'nguoi-tao' as string | null,
  };

  it('ADMIN: tiếp nhận khi OPEN, chốt khi chưa RESOLVED, xoá ở mọi trạng thái', () => {
    expect(alertRowActions({ ...row, roles: ['ADMIN'], status: 'OPEN' })).toEqual({
      canAcknowledge: true,
      canResolve: true,
      canDelete: true,
    });
    expect(alertRowActions({ ...row, roles: ['ADMIN'], status: 'RESOLVED' })).toEqual({
      canAcknowledge: false,
      canResolve: false,
      canDelete: true,
    });
  });

  it('TBM: chốt được cảnh báo của lớp người khác, không xoá', () => {
    expect(alertRowActions({ ...row, roles: ['HEAD_OF_DEPT'], status: 'ACKNOWLEDGED' })).toEqual({
      canAcknowledge: false,
      canResolve: true,
      canDelete: false,
    });
  });

  it('CB Đào tạo / Trưởng CTSV: chỉ tiếp nhận, KHÔNG chốt', () => {
    for (const role of ['TRAINING_OFFICER', 'SA_HEAD']) {
      expect(alertRowActions({ ...row, roles: [role], status: 'OPEN' })).toEqual({
        canAcknowledge: true,
        canResolve: false,
        canDelete: false,
      });
    }
    expect(ACKNOWLEDGER_ROLES).not.toContain('LECTURER');
  });

  it('GV đứng lớp của cảnh báo chốt được; GV khác thì không', () => {
    const own = { ...row, sectionLecturerId: 'me' };
    expect(alertRowActions({ ...own, roles: ['LECTURER'], status: 'OPEN' })).toEqual({
      canAcknowledge: false,
      canResolve: true,
      canDelete: false,
    });
    expect(alertRowActions({ ...row, roles: ['LECTURER'], status: 'OPEN' }).canResolve).toBe(false);
  });

  it('cảnh báo không có GV lớp: người tạo (GV) chốt', () => {
    const noSection = { ...row, sectionLecturerId: null, raisedById: 'me' };
    expect(alertRowActions({ ...noSection, roles: ['LECTURER'], status: 'OPEN' }).canResolve).toBe(
      true,
    );
  });

  it('CB CTSV: không thao tác gì', () => {
    expect(alertRowActions({ ...row, roles: ['SA_OFFICER'], status: 'OPEN' })).toEqual({
      canAcknowledge: false,
      canResolve: false,
      canDelete: false,
    });
  });

  it('roles undefined (chưa tải /auth/me) → không thao tác gì', () => {
    expect(alertRowActions({ ...row, roles: undefined, status: 'OPEN' })).toEqual({
      canAcknowledge: false,
      canResolve: false,
      canDelete: false,
    });
  });
});

describe('deletionPreviewLines', () => {
  const preview: AlertDeletionPreview = {
    id: 'al-1',
    level: 3,
    status: 'OPEN',
    source: 'AUTO_ATTENDANCE',
    student: { studentCode: 'PK1', fullName: 'Sinh viên A' },
    careLogs: 2,
    notifications: 4,
    evaluations: 5,
    discussionMessages: 7,
    analysisVersionsUnlinked: 1,
  };

  it('liệt kê những gì sẽ mất kèm số lượng, bỏ dòng có số 0', () => {
    const lines = deletionPreviewLines(preview);
    expect(lines.map((l) => l.kind)).toEqual([
      'alert',
      'evaluations',
      'discussionMessages',
      'careLogs',
      'notifications',
      'analysisVersionsUnlinked',
    ]);
    expect(lines.find((l) => l.kind === 'evaluations')?.text).toContain('5');
    expect(lines.find((l) => l.kind === 'discussionMessages')?.text).toContain('7');
    expect(lines.find((l) => l.kind === 'analysisVersionsUnlinked')?.text).toMatch(/không xoá/i);

    const sparse = deletionPreviewLines({
      ...preview,
      careLogs: 0,
      notifications: 0,
      analysisVersionsUnlinked: 0,
    });
    expect(sparse.map((l) => l.kind)).toEqual(['alert', 'evaluations', 'discussionMessages']);
  });

  it('nhận xét/trao đổi bằng 0 vẫn hiện "không có" để người xoá biết phạm vi', () => {
    const lines = deletionPreviewLines({ ...preview, evaluations: 0, discussionMessages: 0 });
    expect(lines.find((l) => l.kind === 'evaluations')?.text).toMatch(/không có/i);
    expect(lines.find((l) => l.kind === 'discussionMessages')?.text).toMatch(/không có/i);
  });
});

describe('ALERT_DELETE_INVALIDATION_KEYS', () => {
  it('làm tươi mọi màn hình đang cache dữ liệu vừa xoá', () => {
    const roots = ALERT_DELETE_INVALIDATION_KEYS.map(([root]) => root);
    for (const key of [
      'alerts',
      'attendance-alerts',
      'notifications',
      'evaluations',
      'discussions',
      'care-logs',
      'statistics',
      'care-statistics',
    ]) {
      expect(roots).toContain(key);
    }
  });
});

describe('bulkDeletionPreviewLines', () => {
  const preview: AlertBulkDeletionPreview = {
    alerts: 3,
    students: 2,
    autoAttendance: 1,
    careLogs: 0,
    notifications: 9,
    evaluations: 6,
    discussionMessages: 0,
    analysisVersionsUnlinked: 2,
    items: [],
  };

  it('dòng đầu nêu số cảnh báo + số sinh viên; còn lại như xoá đơn', () => {
    const lines = bulkDeletionPreviewLines(preview);
    expect(lines.map((l) => l.kind)).toEqual([
      'alert',
      'evaluations',
      'discussionMessages',
      'notifications',
      'analysisVersionsUnlinked',
    ]);
    expect(lines[0].text).toContain('3 cảnh báo');
    expect(lines[0].text).toContain('2 sinh viên');
    expect(lines.find((l) => l.kind === 'evaluations')?.text).toContain('6');
    expect(lines.find((l) => l.kind === 'discussionMessages')?.text).toMatch(/không có/i);
  });

  it('một cảnh báo → câu số ít, không nhắc "2 sinh viên"', () => {
    const lines = bulkDeletionPreviewLines({ ...preview, alerts: 1, students: 1 });
    expect(lines[0].text).toContain('1 cảnh báo');
    expect(lines[0].text).toContain('1 sinh viên');
  });
});

describe('chọn nhiều cảnh báo', () => {
  it('toggleSelected: thêm/bỏ một id, không mutate Set cũ', () => {
    const initial = new Set(['a']);
    const added = toggleSelected(initial, 'b');
    expect([...added]).toEqual(['a', 'b']);
    expect([...initial]).toEqual(['a']);
    expect([...toggleSelected(added, 'a')]).toEqual(['b']);
  });

  it('toggleAllSelected: chưa chọn hết trang → chọn hết; đã chọn hết → bỏ hết trang (giữ id trang khác)', () => {
    const page = ['a', 'b'];
    const some = new Set(['a', 'z']);
    expect([...toggleAllSelected(some, page)].sort()).toEqual(['a', 'b', 'z']);
    const all = new Set(['a', 'b', 'z']);
    expect([...toggleAllSelected(all, page)]).toEqual(['z']);
    expect([...toggleAllSelected(new Set(), [])]).toEqual([]);
  });

  it('không chọn quá giới hạn API một lượt', () => {
    expect(ALERT_BULK_DELETE_MAX).toBe(100);
    const page = Array.from({ length: 5 }, (_, i) => `id-${i}`);
    const nearFull = new Set(Array.from({ length: 98 }, (_, i) => `x-${i}`));
    expect(toggleAllSelected(nearFull, page).size).toBe(100);
    expect(
      toggleSelected(new Set(Array.from({ length: 100 }, (_, i) => `x-${i}`)), 'new').size,
    ).toBe(100);
  });
});
