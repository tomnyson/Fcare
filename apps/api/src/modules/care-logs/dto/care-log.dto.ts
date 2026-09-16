import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CareChannel } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCareLogDto {
  @ApiProperty({ description: 'ID sinh viên' })
  @IsUUID()
  studentId!: string;

  @ApiProperty({ enum: CareChannel, description: 'Hình thức trao đổi' })
  @IsEnum(CareChannel)
  channel!: CareChannel;

  @ApiProperty({ description: 'Nội dung trao đổi/chăm sóc' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'Nội dung chăm sóc quá ngắn.' })
  @MaxLength(4000)
  content!: string;

  @ApiPropertyOptional({ description: 'Kết quả' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  outcome?: string;

  @ApiPropertyOptional({ description: 'Hành động tiếp theo' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  nextAction?: string;

  @ApiPropertyOptional({
    description:
      'Cảnh báo được chăm sóc (điểm danh tự động): GV đứng lớp ghi nhật ký gắn cảnh báo sẽ tắt hiện liên tục',
  })
  @IsOptional()
  @IsUUID()
  alertId?: string;
}

export class ListCareLogsQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  studentId?: string;
}
