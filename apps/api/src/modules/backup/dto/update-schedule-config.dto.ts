import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateScheduleConfigDto {
  @ApiProperty({
    description: 'Bật hoặc tắt lịch sao lưu tự động định kỳ',
    example: true,
  })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({
    description: 'Biểu thức Cron định kỳ (5 trường: phút giờ ngày tháng thứ)',
    example: '0 2 * * *',
  })
  @IsNotEmpty({ message: 'Biểu thức cron không được để trống' })
  @IsString()
  cronExpression!: string;

  @ApiProperty({
    description: 'Số lượng bản sao lưu tự động tối đa cần lưu trữ (1 đến 100)',
    example: 7,
  })
  @IsInt({ message: 'Số lượng lưu trữ phải là số nguyên' })
  @Min(1, { message: 'Cần lưu trữ tối thiểu 1 bản sao lưu' })
  @Max(100, { message: 'Chỉ lưu trữ tối đa 100 bản sao lưu' })
  retentionCount!: number;
}
