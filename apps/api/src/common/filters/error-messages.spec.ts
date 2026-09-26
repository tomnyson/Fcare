import { toVietnameseError } from './error-messages';

describe('toVietnameseError — lỗi mặc định của framework hiện bằng tiếng Việt', () => {
  it.each([
    [
      'Validation failed (uuid is expected)',
      'Mã định danh trên đường dẫn không hợp lệ.',
    ],
    [
      'Validation failed (uuid v4 is expected)',
      'Mã định danh trên đường dẫn không hợp lệ.',
    ],
    [
      'Validation failed (boolean string is expected)',
      'Tham số trên đường dẫn phải là true hoặc false.',
    ],
    [
      'Validation failed (numeric string is expected)',
      'Tham số trên đường dẫn phải là số.',
    ],
    ['Forbidden resource', 'Bạn không có quyền thực hiện thao tác này.'],
    ['Unauthorized', 'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.'],
    ['Cannot GET /api/khong-co', 'Không tìm thấy chức năng được yêu cầu.'],
    ['Cannot DELETE /api/students', 'Không tìm thấy chức năng được yêu cầu.'],
    [
      "Expected property name or '}' in JSON at position 1 (line 1 column 2)",
      'Dữ liệu gửi lên không đúng định dạng.',
    ],
    ['Unexpected end of JSON input', 'Dữ liệu gửi lên không đúng định dạng.'],
    [
      'ThrottlerException: Too Many Requests',
      'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
    ],
    ['File too large', 'Tệp vượt quá dung lượng cho phép.'],
    [
      'request entity too large',
      'Dữ liệu gửi lên vượt quá dung lượng cho phép.',
    ],
    ['Unexpected field', 'Tệp gửi lên không đúng trường dữ liệu.'],
    ['Unexpected field - wrong', 'Tệp gửi lên không đúng trường dữ liệu.'],
    ['Too many files - file', 'Gửi lên quá nhiều tệp.'],
    ['Too many files', 'Gửi lên quá nhiều tệp.'],
  ])('"%s"', (message, expected) => {
    expect(toVietnameseError(message)).toBe(expected);
  });

  it.each([
    ['Bad Request', 'Yêu cầu không hợp lệ.'],
    ['Not Found', 'Không tìm thấy dữ liệu yêu cầu.'],
    ['Conflict', 'Dữ liệu bị trùng hoặc xung đột.'],
    [
      'Service Unavailable',
      'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.',
    ],
  ])('tên trạng thái HTTP chung "%s"', (message, expected) => {
    expect(toVietnameseError(message)).toBe(expected);
  });

  it('giữ nguyên câu tiếng Việt đã viết trong code', () => {
    expect(toVietnameseError('Không tìm thấy sinh viên.')).toBe(
      'Không tìm thấy sinh viên.',
    );
  });

  it('câu lạ không nhận ra thì giữ nguyên, không đoán', () => {
    expect(toVietnameseError('Some custom thing')).toBe('Some custom thing');
  });
});
