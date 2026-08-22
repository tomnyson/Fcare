import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EnrollmentResult } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateEnrollmentDto {
  @ApiProperty({ description: 'ID sinh viên' })
  @IsUUID()
  studentId!: string;

  @ApiProperty({ description: 'ID lớp học phần' })
  @IsUUID()
  classSectionId!: string;
}

export class UpdateEnrollmentDto {
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 100,
    description: 'Tỷ lệ chuyên cần (%)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  attendanceRate?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  midtermScore?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  finalScore?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  totalScore?: number;

  @ApiPropertyOptional({ description: 'Cấm thi' })
  @IsOptional()
  @IsBoolean()
  isExamBanned?: boolean;

  @ApiPropertyOptional({ enum: EnrollmentResult })
  @IsOptional()
  @IsEnum(EnrollmentResult)
  result?: EnrollmentResult;
}

export class ListEnrollmentsQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  classSectionId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number;
}
