import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

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
}
