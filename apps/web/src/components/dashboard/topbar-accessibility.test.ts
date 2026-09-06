import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// LOW-G: chỉ báo trao đổi từng dựa vào `title=` để giải thích "bấm vào đâu".
// Tooltip đó chỉ hiện khi rê chuột — người dùng bàn phím và cảm ứng không bao
// giờ thấy. Chưa có jsdom/testing-library (LOW-F đã park) nên canh ở mức mã
// nguồn: cấm `title=` quay lại, và bắt buộc phải còn nhãn đọc được bằng trình
// đọc màn hình.
const source = readFileSync(join(__dirname, 'topbar.tsx'), 'utf8');

describe('topbar — nhãn truy cập của chỉ báo trao đổi', () => {
  it('không dùng thuộc tính title ở bất kỳ đâu trong topbar', () => {
    expect(source).not.toMatch(/\stitle=/);
  });

  it('khối role="status" mang nhãn truy cập được thay cho tooltip', () => {
    const start = source.indexOf('role="status"');
    const badge = source.slice(start, source.indexOf('</p>', start));
    expect(badge).toContain('aria-label=');
    expect(badge).toMatch(/hồ sơ sinh viên/);
  });

  it('vẫn còn phần text ẩn nói rõ số luồng chưa đọc', () => {
    expect(source).toContain('luồng trao đổi có tin chưa đọc');
  });
});
