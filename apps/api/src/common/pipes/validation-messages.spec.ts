import {
  ArrayNotEmpty,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  validate,
} from 'class-validator';
import { Type, plainToInstance } from 'class-transformer';
import { toVietnameseMessages } from './validation-messages';

enum Channel {
  PHONE = 'PHONE',
  EMAIL = 'EMAIL',
}

class Nested {
  @IsUUID()
  classSectionId!: string;
}

class Dto {
  @IsOptional()
  @IsUUID()
  majorId?: string;

  @IsOptional()
  @IsIn(['any', '1', '2'])
  alertLevel?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(5)
  content?: string;

  @IsOptional()
  @IsEnum(Channel)
  channel?: Channel;

  @IsOptional()
  @IsBoolean()
  notify?: boolean;

  @IsOptional()
  @IsNotEmpty({ message: 'Nội dung chăm sóc quá ngắn.' })
  note?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}\d{2}$/)
  customField?: string;

  @IsOptional()
  @ArrayNotEmpty()
  studentIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => Nested)
  nested?: Nested;
}

async function messagesFor(plain: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(Dto, plain), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return toVietnameseMessages(errors);
}

describe('toVietnameseMessages — lỗi kiểm tra dữ liệu hiển thị bằng tiếng Việt', () => {
  it('UUID sai: dùng tên trường tiếng Việt', async () => {
    expect(await messagesFor({ majorId: 'abc' })).toEqual([
      'Ngành không hợp lệ (mã định danh sai định dạng).',
    ]);
  });

  it('giá trị ngoài danh sách cho phép: liệt kê giá trị hợp lệ', async () => {
    expect(await messagesFor({ alertLevel: '9' })).toEqual([
      'Mức cảnh báo phải là một trong các giá trị: any, 1, 2.',
    ]);
  });

  it('min / max giữ nguyên ngưỡng', async () => {
    expect(await messagesFor({ page: 0 })).toEqual([
      'Trang không được nhỏ hơn 1.',
    ]);
    expect(await messagesFor({ page: 101 })).toEqual([
      'Trang không được lớn hơn 100.',
    ]);
    expect(await messagesFor({ page: 1.5 })).toEqual([
      'Trang phải là số nguyên.',
    ]);
  });

  it('độ dài chuỗi', async () => {
    expect(await messagesFor({ content: 'ab' })).toEqual([
      'Nội dung phải có ít nhất 3 ký tự.',
    ]);
    expect(await messagesFor({ content: 'abcdef' })).toEqual([
      'Nội dung tối đa 5 ký tự.',
    ]);
  });

  it('enum, boolean, mảng rỗng, không khớp định dạng', async () => {
    expect(await messagesFor({ channel: 'FAX' })).toEqual([
      'Hình thức trao đổi phải là một trong các giá trị: PHONE, EMAIL.',
    ]);
    expect(await messagesFor({ notify: 'yes' })).toEqual([
      'Thông báo phải là true hoặc false.',
    ]);
    expect(await messagesFor({ studentIds: [] })).toEqual([
      'Danh sách sinh viên không được để trống.',
    ]);
    expect(await messagesFor({ customField: 'x' })).toEqual([
      'customField sai định dạng.',
    ]);
  });

  it('giữ nguyên thông báo tiếng Việt đã viết sẵn trong DTO', async () => {
    expect(await messagesFor({ note: '' })).toEqual([
      'Nội dung chăm sóc quá ngắn.',
    ]);
  });

  it('trường không được phép gửi lên', async () => {
    expect(await messagesFor({ hacker: 1 })).toEqual([
      'Trường "hacker" không được phép gửi lên.',
    ]);
  });

  it('lỗi ở đối tượng lồng nhau', async () => {
    expect(await messagesFor({ nested: { classSectionId: 'x' } })).toEqual([
      'Lớp học phần không hợp lệ (mã định danh sai định dạng).',
    ]);
  });
});
