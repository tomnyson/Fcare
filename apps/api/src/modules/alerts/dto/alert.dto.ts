import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  studentId?: string;

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
