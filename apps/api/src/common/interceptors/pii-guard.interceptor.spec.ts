import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { PiiGuardInterceptor, stripPii } from './pii-guard.interceptor';

/** Context tối giản: interceptor chỉ đọc `originalUrl` của request. */
function contextFor(originalUrl: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ originalUrl }) }),
  } as unknown as ExecutionContext;
}

function handlerOf(payload: unknown): CallHandler {
  return { handle: () => of(payload) };
}

describe('stripPii', () => {
  it('loại bỏ các trường PII bị cấm ở mọi cấp lồng nhau', () => {
    const input = {
      studentCode: 'SE190001',
      fullName: 'Nguyễn Văn An',
      cccd: '0123456789',
      phoneNumber: '0900000000',
      email: 'test@example.com',
      address: 'Hà Nội',
      nested: {
        homeAddress: 'Q1',
        items: [{ parentPhone: '0911', ok: true }],
      },
    };

    const result = stripPii(input) as Record<string, unknown>;

    expect(result).toEqual({
      studentCode: 'SE190001',
      fullName: 'Nguyễn Văn An',
      nested: { items: [{ ok: true }] },
    });
  });

  it('cho phép email khi response là staff admin được ủy quyền', () => {
    expect(
      stripPii({ email: 'gv@fpt.edu.vn' }, { allowStaffEmail: true }),
    ).toEqual({
      email: 'gv@fpt.edu.vn',
    });
  });

  it('không tạo side-effect trên object gốc', () => {
    const input = { email: 'a@b.c', keep: 1 };
    stripPii(input);
    expect(input.email).toBe('a@b.c');
  });

  it('giữ nguyên Date và giá trị nguyên thủy', () => {
    const now = new Date();
    const result = stripPii({ createdAt: now, count: 3, label: 'ok' });
    expect(result.createdAt).toBe(now);
    expect(result.count).toBe(3);
    expect(result.label).toBe('ok');
  });

  it('xử lý mảng ở cấp cao nhất', () => {
    const result = stripPii([{ email: 'x@y.z', id: 1 }]);
    expect(result).toEqual([{ id: 1 }]);
  });
});

describe('PiiGuardInterceptor', () => {
  it('cho phép staff email khi route là /api/admin/staff', (done) => {
    const interceptor = new PiiGuardInterceptor();
    const context = contextFor('/api/admin/staff');
    const next = handlerOf([
      { staffCode: 'VANDTB2', email: 'vandtb2@fe.edu.vn' },
    ]);

    interceptor.intercept(context, next).subscribe((result) => {
      expect(result).toEqual([
        { staffCode: 'VANDTB2', email: 'vandtb2@fe.edu.vn' },
      ]);
      done();
    });
  });

  it('vẫn loại bỏ email khi route là sinh viên /api/students', (done) => {
    const interceptor = new PiiGuardInterceptor();
    const context = contextFor('/api/students');
    const next = handlerOf([
      { studentCode: 'SE19001', email: 'student@fpt.edu.vn' },
    ]);

    interceptor.intercept(context, next).subscribe((result) => {
      expect(result).toEqual([{ studentCode: 'SE19001' }]);
      done();
    });
  });
});
