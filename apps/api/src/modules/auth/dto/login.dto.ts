import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'Mã nhân viên', example: 'admin' })
  @IsString()
  @IsNotEmpty({ message: 'Mã nhân viên không được để trống.' })
  @MaxLength(50)
  staffCode!: string;

  @ApiProperty({ description: 'Mật khẩu', example: 'Fcare@123' })
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được để trống.' })
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({
    description:
      'Token reCAPTCHA v2 (ô tick) — bắt buộc khi API bật RECAPTCHA_SECRET_KEY',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  recaptchaToken?: string;
}
