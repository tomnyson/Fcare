import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateClassSectionDto {
  @ApiProperty({
    example: 'PRF192-SE1901-SU25',
    description: 'Mã lớp học phần',
  })
  @IsString({ message: 'Mã lớp học phần phải là chuỗi' })
  @IsNotEmpty({ message: 'Mã lớp học phần không được để trống' })
  @MaxLength(50, { message: 'Mã lớp học phần tối đa 50 ký tự' })
  @Matches(/^[a-zA-Z0-9-]+$/, {
    message: 'Mã lớp học phần chỉ gồm chữ cái, số và dấu gạch ngang, không dấu',
  })
  code!: string;

  @ApiProperty({ description: 'ID môn học' })
  @IsUUID(4, { message: 'ID môn học không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng chọn môn học' })
  subjectId!: string;

  @ApiPropertyOptional({
    description: 'ID giảng viên phụ trách — để trống nếu chưa phân công',
  })
  @IsOptional()
  @IsUUID(4, { message: 'ID giảng viên không hợp lệ' })
  lecturerId?: string;

  @ApiProperty({ example: 'SU25', description: 'Học kỳ' })
  @IsString({ message: 'Học kỳ phải là chuỗi' })
  @IsNotEmpty({ message: 'Học kỳ không được để trống' })
  @MaxLength(20, { message: 'Học kỳ tối đa 20 ký tự' })
  @Matches(/^[a-zA-Z0-9-]+$/, {
    message: 'Học kỳ chỉ gồm chữ cái, số và dấu gạch ngang, không dấu',
  })
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

  @ApiPropertyOptional({ description: 'Chỉ lấy lớp chưa phân công giảng viên' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unassigned?: boolean;
}
