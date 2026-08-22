import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Mật khẩu hiện tại (hoặc mật khẩu tạm)' })
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu hiện tại không được để trống.' })
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({
    description: 'Mật khẩu mới — tối thiểu 8 ký tự, có chữ và số',
  })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu mới phải có ít nhất 8 ký tự.' })
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Mật khẩu mới phải chứa cả chữ và số.',
  })
  newPassword!: string;
}
