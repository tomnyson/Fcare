/**
 * Lỗi mặc định của NestJS / multer / throttler / body-parser là tiếng Anh
 * ("Forbidden resource", "Cannot GET /api/x"…) và lọt thẳng ra giao diện.
 * Chỉ dịch những câu mặc định đã biết; câu tiếng Việt viết trong code và câu
 * lạ được giữ nguyên để không đoán sai ý.
 */

const PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /^Validation failed \(uuid.* is expected\)$/,
    'Mã định danh trên đường dẫn không hợp lệ.',
  ],
  [
    /^Validation failed \(boolean string is expected\)$/,
    'Tham số trên đường dẫn phải là true hoặc false.',
  ],
  [
    /^Validation failed \(numeric string is expected\)$/,
    'Tham số trên đường dẫn phải là số.',
  ],
  [
    /^Validation failed \(.+ is expected\)$/,
    'Tham số trên đường dẫn không hợp lệ.',
  ],
  [/^Forbidden resource$/, 'Bạn không có quyền thực hiện thao tác này.'],
  [/^Cannot [A-Z]+ \//, 'Không tìm thấy chức năng được yêu cầu.'],
  [
    / in JSON at position |^Unexpected (end of JSON|token)/,
    'Dữ liệu gửi lên không đúng định dạng.',
  ],
  [
    /^ThrottlerException/,
    'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
  ],
  // Lỗi của multer (upload tệp) mà Nest chuyển nguyên câu, có thể kèm " - <tên trường>".
  [/^File too large( - .*)?$/, 'Tệp vượt quá dung lượng cho phép.'],
  [
    /^request entity too large$/i,
    'Dữ liệu gửi lên vượt quá dung lượng cho phép.',
  ],
  [/^Unexpected field( - .*)?$/, 'Tệp gửi lên không đúng trường dữ liệu.'],
  [/^Too many (files|parts|fields)( - .*)?$/, 'Gửi lên quá nhiều tệp.'],
  [/^(Field name|Field value) too long( - .*)?$/, 'Dữ liệu gửi lên quá dài.'],
];

/** Câu mặc định theo tên trạng thái HTTP ("Not Found", "Conflict"…). */
const STATUS_MESSAGES: Record<string, string> = {
  'Bad Request': 'Yêu cầu không hợp lệ.',
  Unauthorized: 'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.',
  Forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  'Not Found': 'Không tìm thấy dữ liệu yêu cầu.',
  'Method Not Allowed': 'Thao tác không được hỗ trợ.',
  'Not Acceptable': 'Yêu cầu không được chấp nhận.',
  'Request Timeout': 'Yêu cầu quá thời gian chờ. Vui lòng thử lại.',
  Conflict: 'Dữ liệu bị trùng hoặc xung đột.',
  Gone: 'Dữ liệu không còn tồn tại.',
  'Payload Too Large': 'Dữ liệu gửi lên vượt quá dung lượng cho phép.',
  'Unsupported Media Type': 'Định dạng dữ liệu gửi lên không được hỗ trợ.',
  'Unprocessable Entity': 'Dữ liệu gửi lên không hợp lệ.',
  'Too Many Requests': 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
  'Internal Server Error': 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
  'Not Implemented': 'Chức năng chưa được hỗ trợ.',
  'Bad Gateway': 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.',
  'Service Unavailable':
    'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.',
  'Gateway Timeout': 'Máy chủ phản hồi quá lâu. Vui lòng thử lại sau.',
};

export function toVietnameseError(message: string): string {
  const matched = PATTERNS.find(([pattern]) => pattern.test(message));
  if (matched) return matched[1];
  return STATUS_MESSAGES[message] ?? message;
}
