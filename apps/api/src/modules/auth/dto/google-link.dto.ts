import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleTokenDto {
  @ApiProperty({ description: 'Google ID Token' })
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}

export class GoogleLinkDto {
  @ApiProperty({ description: 'Challenge token nhận được từ bước verify' })
  @IsString()
  @IsNotEmpty()
  challenge!: string;

  @ApiProperty({ description: 'Mã nhân viên' })
  @IsString()
  @IsNotEmpty()
  staffCode!: string;

  @ApiProperty({ description: 'Mật khẩu tài khoản nhân viên' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
