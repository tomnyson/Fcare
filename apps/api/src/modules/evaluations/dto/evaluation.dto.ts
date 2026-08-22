import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
  PickType,
} from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateEvaluationDto {
  @ApiProperty({ description: 'ID sinh viên' })
  @IsUUID()
  studentId!: string;

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
    minimum: 1,
    maximum: 4,
    description: 'Nhóm vấn đề cần can thiệp (1-4)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  issueGroup?: number;

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
    'issueGroup',
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
