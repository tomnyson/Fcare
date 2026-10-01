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

  @ApiPropertyOptional({
    description:
      'Lớp học phần đang chăm sóc (→ học kỳ + môn). Bỏ trống khi gắn cảnh báo thì lấy lớp của cảnh báo',
  })
  @IsOptional()
  @IsUUID()
  classSectionId?: string;
}

/**
 * Sửa lượt chăm sóc: chỉ phần nội dung. Cố ý KHÔNG cho đổi sinh viên, cảnh
 * báo hay lớp học phần — các trường đó quyết định `ownerCaredAt` và số liệu
 * "đã chăm sóc", sửa sau sẽ làm lệch thống kê.
 */
export class UpdateCareLogDto {
  @ApiPropertyOptional({ enum: CareChannel })
  @IsOptional()
  @IsEnum(CareChannel)
  channel?: CareChannel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'Nội dung chăm sóc quá ngắn.' })
  @MaxLength(4000)
  content?: string;

  @ApiPropertyOptional({ description: 'Chuỗi rỗng → xoá kết quả' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  outcome?: string;

  @ApiPropertyOptional({ description: 'Chuỗi rỗng → xoá hành động tiếp theo' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  nextAction?: string;
}

export class ListCareLogsQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  studentId?: string;
}
