import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertSource, AlertStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class RaiseAlertDto {
  @ApiProperty({ description: 'ID sinh viên' })
  @IsUUID()
  studentId!: string;

  @ApiProperty({
    minimum: 1,
    maximum: 4,
    description: 'Độ khẩn 1-4 (4 = khẩn cấp)',
  })
  @IsInt()
  @Min(1)
  @Max(4)
  level!: number;

  @ApiProperty({ description: 'Lý do cảnh báo (mức 4 cần tối thiểu 40 ký tự)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Lý do cảnh báo cần tối thiểu 10 ký tự.' })
  @MaxLength(2000)
  reason!: string;
}

export class ResolveAlertDto {
  @ApiProperty({ description: 'Ghi chú xử lý' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  resolutionNote!: string;
}

export class ListAlertsQuery {
  @ApiPropertyOptional({ enum: AlertStatus })
  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;

  @ApiPropertyOptional({ minimum: 1, maximum: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  level?: number;

  @ApiPropertyOptional({
    description:
      'Chỉ cảnh báo chưa giải quyết (OPEN + ACKNOWLEDGED); thắng `status`',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  openOnly?: boolean;

  @ApiPropertyOptional({
    enum: AlertSource,
    description: 'Nguồn cảnh báo: thủ công hay rà soát điểm danh tự động',
  })
  @IsOptional()
  @IsEnum(AlertSource)
  source?: AlertSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Tìm theo MSSV hoặc họ tên sinh viên' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Lớp hành chính của sinh viên' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  classCode?: string;

  @ApiPropertyOptional({ description: 'Ngành của sinh viên' })
  @IsOptional()
  @IsUUID()
  majorId?: string;

  @ApiPropertyOptional({ description: 'Học kỳ của lớp học phần sinh viên học' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  term?: string;

  @ApiPropertyOptional({ description: 'Giảng viên phụ trách lớp học phần' })
  @IsOptional()
  @IsUUID()
  lecturerId?: string;

  @ApiPropertyOptional({ description: 'Lớp học phần cụ thể' })
  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
