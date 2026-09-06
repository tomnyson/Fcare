import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';

export class CreateSubjectDto {
  @ApiProperty({ example: 'PRF192', description: 'Mã môn học' })
  @IsString({ message: 'Mã môn học phải là chuỗi' })
  @IsNotEmpty({ message: 'Mã môn học không được để trống' })
  @MaxLength(20, { message: 'Mã môn học tối đa 20 ký tự' })
  @Matches(/^[a-zA-Z0-9-]+$/, {
    message: 'Mã môn học chỉ gồm chữ cái, số và dấu gạch ngang, không dấu',
  })
  code!: string;

  @ApiProperty({ example: 'Programming Fundamentals' })
  @IsString({ message: 'Tên môn học phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên môn học không được để trống' })
  @MaxLength(200, { message: 'Tên môn học tối đa 200 ký tự' })
  name!: string;

  @ApiProperty({ example: 3, minimum: 1, maximum: 10 })
  @IsInt({ message: 'Số tín chỉ phải là số nguyên' })
  @Min(1, { message: 'Số tín chỉ tối thiểu là 1' })
  @Max(10, { message: 'Số tín chỉ tối đa là 10' })
  credits!: number;

  @ApiProperty({ description: 'ID bộ môn phụ trách' })
  @IsUUID(4, { message: 'ID bộ môn không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng chọn bộ môn' })
  departmentId!: string;
}

export class UpdateSubjectDto extends PartialType(CreateSubjectDto) {}
