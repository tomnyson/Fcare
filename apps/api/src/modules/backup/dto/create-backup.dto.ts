import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBackupDto {
  @ApiPropertyOptional({
    description: 'Ghi chú mô tả mục đích sao lưu',
    example: 'Trước khi import dữ liệu điểm danh đợt FA26',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Ghi chú không được vượt quá 255 ký tự' })
  comment?: string;
}
