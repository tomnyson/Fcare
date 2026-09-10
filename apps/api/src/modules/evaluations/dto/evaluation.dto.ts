import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
  PickType,
} from '@nestjs/swagger';
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

export class CreateEvaluationDto {
  @ApiProperty({ description: 'ID sinh viên' })
  @IsUUID()
  studentId!: string;

  @ApiProperty({ description: 'ID lớp học phần giảng viên đang dạy' })
  @IsUUID()
  classSectionId!: string;

  @ApiProperty({ example: 'SU25', description: 'Học kỳ' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  term!: string;

  @ApiProperty({ minimum: 1, maximum: 10, description: 'Điểm học lực (1-10)' })
  @IsInt()
  @Min(1)
  @Max(10)
  academicScore!: number;

  @ApiProperty({ minimum: 1, maximum: 10, description: 'Điểm thái độ (1-10)' })
  @IsInt()
  @Min(1)
  @Max(10)
  attitudeScore!: number;

  @ApiPropertyOptional({
    minimum: 0,
    description: 'Số buổi sinh viên đã vắng (bỏ trống nếu chưa nhận xét)',
  })
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

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class UpdateEvaluationDto extends PartialType(
  PickType(CreateEvaluationDto, [
    'academicScore',
    'attitudeScore',
    'absentSessions',
    'criteria',
    'note',
  ] as const),
) {}

export class ListEvaluationsQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  term?: string;
}

export class RiskScoreQuery {
  @ApiProperty({ description: 'ID sinh viên' })
  @IsUUID()
  studentId!: string;

  @ApiProperty({ example: 'SU25', description: 'Học kỳ' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  term!: string;
}
