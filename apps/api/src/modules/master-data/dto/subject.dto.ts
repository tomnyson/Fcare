import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSubjectDto {
  @ApiProperty({ example: 'PRF192', description: 'Mã môn học' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code!: string;

  @ApiProperty({ example: 'Programming Fundamentals' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 3, minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  credits!: number;

  @ApiProperty({ description: 'ID bộ môn phụ trách' })
  @IsUUID()
  departmentId!: string;
}

export class UpdateSubjectDto extends PartialType(CreateSubjectDto) {}
