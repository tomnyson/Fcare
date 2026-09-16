import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = () =>
  Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  );

export class UpdateMailSettingsDto {
  @ApiProperty({ example: 'smtp.office365.com' })
  @trim()
  @IsString({ message: 'Máy chủ SMTP phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Máy chủ SMTP không được để trống' })
  @MaxLength(255, { message: 'Máy chủ SMTP tối đa 255 ký tự' })
  host!: string;

  @ApiProperty({ example: 587 })
  @Type(() => Number)
  @IsInt({ message: 'Cổng SMTP phải là số nguyên' })
  @Min(1, { message: 'Cổng SMTP phải từ 1 đến 65535' })
  @Max(65535, { message: 'Cổng SMTP phải từ 1 đến 65535' })
  port!: number;

  @ApiProperty({
    description: 'true = TLS ngầm (cổng 465); false = STARTTLS/không mã hoá',
  })
  @IsBoolean({ message: 'Trường bảo mật kết nối phải là true/false' })
  secure!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString({ message: 'Tên đăng nhập SMTP phải là chuỗi ký tự' })
  @MaxLength(255, { message: 'Tên đăng nhập SMTP tối đa 255 ký tự' })
  username?: string | null;

  @ApiPropertyOptional({ description: 'Bỏ trống = giữ mật khẩu cũ' })
  @IsOptional()
  @IsString({ message: 'Mật khẩu SMTP phải là chuỗi ký tự' })
  @MaxLength(512, { message: 'Mật khẩu SMTP tối đa 512 ký tự' })
  password?: string;

  @ApiPropertyOptional({ description: 'true = xoá mật khẩu đã lưu' })
  @IsOptional()
  @IsBoolean({ message: 'Trường xoá mật khẩu phải là true/false' })
  clearPassword?: boolean;

  @ApiProperty({ example: 'FCare — Chăm sóc & Giám sát Học vụ' })
  @trim()
  @IsString({ message: 'Tên người gửi phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tên người gửi không được để trống' })
  @MaxLength(120, { message: 'Tên người gửi tối đa 120 ký tự' })
  fromName!: string;

  @ApiProperty({ example: 'fcare-noreply@fpt.edu.vn' })
  @trim()
  @IsEmail({}, { message: 'Email người gửi không hợp lệ' })
  fromEmail!: string;

  @ApiProperty()
  @IsBoolean({ message: 'Trường kích hoạt phải là true/false' })
  enabled!: boolean;
}

export class SendTestMailDto {
  @ApiProperty({ example: 'admin@fpt.edu.vn' })
  @trim()
  @IsEmail({}, { message: 'Email người nhận thử nghiệm không hợp lệ' })
  to!: string;

  @ApiPropertyOptional({
    type: UpdateMailSettingsDto,
    description: 'Cấu hình đang nhập trên form (chưa lưu)',
  })
  @IsOptional()
  @ValidateNested({ message: 'Cấu hình nháp không hợp lệ' })
  @Type(() => UpdateMailSettingsDto)
  draft?: UpdateMailSettingsDto;
}
