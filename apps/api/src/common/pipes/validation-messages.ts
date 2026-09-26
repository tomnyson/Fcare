import {
  BadRequestException,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';

/**
 * Lỗi kiểm tra dữ liệu mặc định của class-validator là tiếng Anh ("majorId must be a UUID")
 * và lọt thẳng ra giao diện. Dịch tập trung ở đây để mọi màn hình đều hiện tiếng Việt;
 * thông báo đã viết sẵn bằng tiếng Việt trong DTO được giữ nguyên.
 */

const FIELD_LABELS: Record<string, string> = {
  majorId: 'Ngành',
  departmentId: 'Bộ môn',
  lecturerId: 'Giảng viên',
  studentId: 'Sinh viên',
  studentIds: 'Danh sách sinh viên',
  classSectionId: 'Lớp học phần',
  sectionId: 'Lớp học phần',
  subjectId: 'Môn học',
  alertId: 'Cảnh báo',
  staffId: 'Nhân viên',
  userId: 'Người dùng',
  term: 'Học kỳ',
  classCode: 'Lớp',
  status: 'Trạng thái',
  alertLevel: 'Mức cảnh báo',
  level: 'Mức cảnh báo',
  page: 'Trang',
  limit: 'Số dòng mỗi trang',
  pageSize: 'Số dòng mỗi trang',
  sortBy: 'Cột sắp xếp',
  sortDir: 'Chiều sắp xếp',
  search: 'Từ khóa tìm kiếm',
  q: 'Từ khóa tìm kiếm',
  content: 'Nội dung',
  reason: 'Lý do',
  channel: 'Hình thức trao đổi',
  outcome: 'Kết quả',
  nextAction: 'Hành động tiếp theo',
  notify: 'Thông báo',
  email: 'Email',
  fullName: 'Họ tên',
  password: 'Mật khẩu',
  from: 'Từ ngày',
  to: 'Đến ngày',
};

const fieldLabel = (property: string): string =>
  FIELD_LABELS[property] ?? property;

/** Giá trị cuối cùng sau dấu ":" trong thông báo mặc định (danh sách hợp lệ). */
const allowedValues = (message: string): string =>
  message.split(':').slice(1).join(':').trim();

/** Ngưỡng số trong thông báo mặc định, vd "must not be less than 1" → "1". */
const lastNumber = (message: string): string =>
  message.match(/-?\d+(\.\d+)?(?!.*\d)/)?.[0] ?? '';

type Translator = (label: string, message: string) => string;

const TRANSLATORS: Record<string, Translator> = {
  isUuid: (l) => `${l} không hợp lệ (mã định danh sai định dạng).`,
  isIn: (l, m) => `${l} phải là một trong các giá trị: ${allowedValues(m)}.`,
  isEnum: (l, m) => `${l} phải là một trong các giá trị: ${allowedValues(m)}.`,
  isNotEmpty: (l) => `${l} không được để trống.`,
  isDefined: (l) => `${l} là bắt buộc.`,
  isString: (l) => `${l} phải là chuỗi ký tự.`,
  isInt: (l) => `${l} phải là số nguyên.`,
  isNumber: (l) => `${l} phải là số.`,
  isBoolean: (l) => `${l} phải là true hoặc false.`,
  min: (l, m) => `${l} không được nhỏ hơn ${lastNumber(m)}.`,
  max: (l, m) => `${l} không được lớn hơn ${lastNumber(m)}.`,
  minLength: (l, m) => `${l} phải có ít nhất ${lastNumber(m)} ký tự.`,
  maxLength: (l, m) => `${l} tối đa ${lastNumber(m)} ký tự.`,
  matches: (l) => `${l} sai định dạng.`,
  isEmail: (l) => `${l} không đúng định dạng email.`,
  isDateString: (l) => `${l} phải là ngày hợp lệ.`,
  isIso8601: (l) => `${l} phải là ngày hợp lệ.`,
  isArray: (l) => `${l} phải là danh sách.`,
  arrayNotEmpty: (l) => `${l} không được để trống.`,
  arrayMinSize: (l, m) => `${l} cần ít nhất ${lastNumber(m)} phần tử.`,
  arrayMaxSize: (l, m) => `${l} tối đa ${lastNumber(m)} phần tử.`,
  arrayUnique: (l) => `${l} không được có phần tử trùng.`,
  isObject: (l) => `${l} phải là đối tượng.`,
};

/** Thông báo mặc định của class-validator luôn mở đầu bằng tên trường (hoặc "each value in"). */
function isDefaultMessage(property: string, message: string): boolean {
  return (
    message.startsWith(`${property} `) || message.startsWith('each value in ')
  );
}

function translate(
  property: string,
  constraint: string,
  message: string,
): string {
  if (constraint === 'whitelistValidation') {
    return `Trường "${property}" không được phép gửi lên.`;
  }
  if (!isDefaultMessage(property, message)) return message;
  const translator = TRANSLATORS[constraint];
  return translator ? translator(fieldLabel(property), message) : message;
}

export function toVietnameseMessages(
  errors: readonly ValidationError[],
): string[] {
  return errors.flatMap((error) => [
    ...Object.entries(error.constraints ?? {}).map(([constraint, message]) =>
      translate(error.property, constraint, message),
    ),
    ...toVietnameseMessages(error.children ?? []),
  ]);
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new BadRequestException(toVietnameseMessages(errors)),
  });
}
