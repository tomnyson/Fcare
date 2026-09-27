import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  EVALUATION_CRITERIA,
  type EvaluationCriterion,
} from '@fcare/shared-types';

/** Dữ liệu đang nhập trên form nhận xét — chưa lưu, chỉ để AI viết nháp. */
export class EvaluationNoteDraftDto {
  @ApiProperty({ description: 'ID lớp học phần giảng viên đang dạy' })
  @IsUUID()
  classSectionId!: string;

  @ApiProperty({ example: 'FA26' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  term!: string;

  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  academicScore!: number;

  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  attitudeScore!: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  absentSessions?: number;

  @ApiPropertyOptional({ enum: EVALUATION_CRITERIA, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(EVALUATION_CRITERIA, { each: true })
  criteria?: EvaluationCriterion[];
}
