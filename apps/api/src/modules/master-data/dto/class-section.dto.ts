import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateClassSectionDto {
  @ApiProperty({
    example: 'PRF192-SE1901-SU25',
    description: 'Mã lớp học phần',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @ApiProperty({ description: 'ID môn học' })
  @IsUUID()
  subjectId!: string;

  @ApiProperty({ description: 'ID giảng viên phụ trách' })
  @IsUUID()
  lecturerId!: string;

  @ApiProperty({ example: 'SU25', description: 'Học kỳ' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  term!: string;
}

export class UpdateClassSectionDto extends PartialType(CreateClassSectionDto) {}

export class ListClassSectionsQuery {
  @ApiPropertyOptional({ description: 'Lọc theo học kỳ' })
  @IsOptional()
  @IsString()
  term?: string;

  @ApiPropertyOptional({ description: 'Lọc theo giảng viên' })
  @IsOptional()
  @IsUUID()
  lecturerId?: string;
}
