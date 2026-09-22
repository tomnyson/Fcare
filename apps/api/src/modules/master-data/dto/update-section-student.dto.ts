import { ApiPropertyOptional } from '@nestjs/swagger';
import { EnrollmentResult } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateSectionStudentDto {
  @ApiPropertyOptional({
    example: 'Hoàng Lê Minh Sang',
    description: 'Họ và tên sinh viên (cập nhật nếu sai sót)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fullName?: string;

  @ApiPropertyOptional({
    example: 8.5,
    description: 'Điểm tổng kết (thang điểm 0..10)',
    nullable: true,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10)
  totalScore?: number | null;

  @ApiPropertyOptional({
    enum: EnrollmentResult,
    example: EnrollmentResult.PASS,
    description: 'Kết quả học phần',
  })
  @IsOptional()
  @IsEnum(EnrollmentResult)
  result?: EnrollmentResult;
}
