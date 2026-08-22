import { ApiProperty } from '@nestjs/swagger';
import { EnrollmentResult } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SectionGradeRowDto {
  @ApiProperty({ description: 'ID bản ghi ghi danh' })
  @IsUUID()
  enrollmentId!: string;

  @ApiProperty({
    nullable: true,
    example: 7.5,
    description: 'Điểm tổng kết 0..10, null nghĩa là chưa có điểm',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10)
  totalScore!: number | null;

  @ApiProperty({ enum: EnrollmentResult })
  @IsEnum(EnrollmentResult)
  result!: EnrollmentResult;
}

export class UpdateSectionGradesDto {
  @ApiProperty({ type: [SectionGradeRowDto] })
  @ArrayNotEmpty()
  // Lớp đông nhất trong dữ liệu thật ~40 SV; 200 là trần an toàn chặn payload rác.
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SectionGradeRowDto)
  rows!: SectionGradeRowDto[];
}
