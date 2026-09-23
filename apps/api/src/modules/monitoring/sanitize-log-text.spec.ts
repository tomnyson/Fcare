import {
  HIDDEN_LINE,
  MAX_MESSAGE_LENGTH,
  MAX_STACK_LENGTH,
  sanitizeLogMessage,
  sanitizeLogText,
  sanitizeStack,
} from './sanitize-log-text';

describe('sanitizeLogText — che PII và bí mật trước khi lưu/gửi Discord', () => {
  it.each([
    ['email', 'Không gửi được tới nguyen.van.a@fpt.edu.vn', '[email]'],
    ['số điện thoại', 'SĐT 0912345678 lỗi', '[số điện thoại]'],
    ['số điện thoại +84', 'gọi +84912345678 thất bại', '[số điện thoại]'],
    ['CCCD 12 số', 'trùng 038203001234', '[mã số]'],
    ['CMND 9 số', 'trùng 201456789', '[mã số]'],
    ['IPv4', 'connect ECONNREFUSED 10.0.12.5:5432', '[ip]'],
    ['JWT', 'token eyJhbGciOi.eyJzdWIiOiIx.c2lnbmF0dXJl hết hạn', '[jwt]'],
    ['Bearer', 'header Bearer abc.def-123 sai', 'Bearer [ẩn]'],
    ['password=', 'login password=Secr3t! fail', 'password=[ẩn]'],
    ['secret: json', '{"secret":"s3cr3t"}', '"secret":"[ẩn]"'],
  ])('%s', (_label, input, expected) => {
    const out = sanitizeLogText(input);
    expect(out).toContain(expected);
  });

  it('chuỗi kết nối có user:pass → ẩn thông tin đăng nhập, giữ host', () => {
    const out = sanitizeLogText(
      "Can't reach postgres://fcare:supersecret@db.internal:5432/fcare",
    );
    expect(out).not.toContain('supersecret');
    expect(out).toContain('postgres://[ẩn]@db.internal');
  });

  it('URL webhook Discord bị ẩn hoàn toàn', () => {
    const out = sanitizeLogText(
      'POST https://discord.com/api/webhooks/123456/abcDEF_ghi-jkl failed',
    );
    expect(out).not.toContain('abcDEF');
    expect(out).toContain('[discord-webhook]');
  });

  it('giữ nguyên dữ liệu học vụ thường gặp (mã SV, mã lớp, uuid, cổng)', () => {
    const input =
      'Student PS12345 in SE1801 id=3f2b8c1e-9a4d-4c2e-8f1a-0b2c3d4e5f60 port 6379';
    expect(sanitizeLogText(input)).toBe(input);
  });
});

describe('sanitizeLogMessage / sanitizeStack', () => {
  it('cắt message theo MAX_MESSAGE_LENGTH', () => {
    expect(sanitizeLogMessage('x'.repeat(2000))).toHaveLength(
      MAX_MESSAGE_LENGTH,
    );
  });

  it('dòng vẫn còn dấu hiệu PII sau khi che → ẩn cả dòng', () => {
    // SĐT viết giãn nhóm lạ lọt regex nhưng detectPii vẫn bắt.
    const out = sanitizeLogMessage('gọi 0912 345 678 không được');
    expect(out).toBe(HIDDEN_LINE);
  });

  it('stack: giữ dòng "at …" sạch, cắt theo MAX_STACK_LENGTH', () => {
    const stack = [
      'Error: boom for a@fpt.edu.vn',
      '    at StudentsService.find (/app/dist/src/students.service.js:120:15)',
      ...Array.from({ length: 200 }, (_, i) => `    at fn${i} (/app/x.js:1:1)`),
    ].join('\n');
    const out = sanitizeStack(stack);
    expect(out).not.toBeNull();
    expect(out!).toContain('[email]');
    expect(out!).toContain('students.service.js:120:15');
    expect(out!.length).toBeLessThanOrEqual(MAX_STACK_LENGTH);
  });

  it('stack rỗng → null', () => {
    expect(sanitizeStack(undefined)).toBeNull();
    expect(sanitizeStack('')).toBeNull();
  });
});
