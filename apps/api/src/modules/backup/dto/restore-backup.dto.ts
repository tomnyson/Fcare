import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class RestoreBackupDto {
  @ApiProperty({
    description:
      'Từ khóa xác nhận phục hồi an toàn (bắt buộc nhập XAC NHAN hoặc RESTORE)',
    example: 'XAC NHAN',
  })
  @IsNotEmpty({ message: 'Vui lòng nhập từ khóa xác nhận phục hồi' })
  @IsString()
  @IsIn(['XAC NHAN', 'RESTORE'], {
    message: 'Từ khóa xác nhận phải là "XAC NHAN" hoặc "RESTORE"',
  })
  confirmation!: string;
}
