import { describe, expect, it } from 'vitest';
import { buildCareStaffLogsQuery, careStaffLogsHref } from './care-staff-logs';
import { canAccessRoute } from './route-access';

describe('careStaffLogsHref — link từ dòng người chăm sóc sang nhật ký của họ', () => {
  it('giữ học kỳ đang xem để số liệu khớp bảng', () => {
    expect(careStaffLogsHref('gv-a', 'FA26')).toBe('/statistics/care-staff/gv-a?term=FA26');
  });

  it('không có kỳ → để API lấy kỳ hiện tại', () => {
    expect(careStaffLogsHref('gv-a', '')).toBe('/statistics/care-staff/gv-a');
  });

  it('mã hoá id lạ, không cho chèn path', () => {
    expect(careStaffLogsHref('a/../b', '')).toBe('/statistics/care-staff/a%2F..%2Fb');
  });
});

describe('buildCareStaffLogsQuery', () => {
  it('ghép kỳ + trang + cỡ trang', () => {
    expect(buildCareStaffLogsQuery('FA26', 2, 10)).toBe('?term=FA26&page=2&limit=10');
  });

  it('bỏ kỳ khi rỗng', () => {
    expect(buildCareStaffLogsQuery('', 1, 20)).toBe('?page=1&limit=20');
  });
});

describe('quyền vào trang nhật ký theo người chăm sóc', () => {
  it('cùng vai với bảng chăm sóc trên Tổng quan', () => {
    expect(canAccessRoute('/statistics/care-staff/x', ['HEAD_OF_DEPT'])).toBe(true);
    expect(canAccessRoute('/statistics/care-staff/x', ['TRAINING_OFFICER'])).toBe(true);
    expect(canAccessRoute('/statistics/care-staff/x', ['LECTURER'])).toBe(false);
  });
});
