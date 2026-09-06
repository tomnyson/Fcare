import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateDepartmentAliasDto {
  @ApiProperty({
    example: 'Lịch tool',
    description: 'Nhãn bộ môn xuất hiện trong file Excel nguồn',
  })
  @IsString({ message: 'Nhãn bộ môn phải là chuỗi' })
  @IsNotEmpty({ message: 'Nhãn bộ môn không được để trống' })
  @MaxLength(100, { message: 'Nhãn bộ môn tối đa 100 ký tự' })
  alias!: string;

  @ApiProperty({ description: 'ID bộ môn đích' })
  @IsUUID(4, { message: 'ID bộ môn không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng chọn bộ môn đích' })
  departmentId!: string;
}

export class UpdateDepartmentAliasDto extends PartialType(
  CreateDepartmentAliasDto,
) {}

export class CreateClassMajorRuleDto {
  @ApiProperty({
    example: 'AI',
    description: 'Tiền tố 2 chữ cái của mã lớp hành chính',
  })
  @IsString({ message: 'Tiền tố lớp phải là chuỗi' })
  @IsNotEmpty({ message: 'Tiền tố lớp không được để trống' })
  @Matches(/^[A-Za-z]{2}$/, {
    message: 'Tiền tố lớp phải gồm đúng 2 chữ cái, ví dụ "AI".',
  })
  classPrefix!: string;

  @ApiProperty({ description: 'ID ngành đích' })
  @IsUUID(4, { message: 'ID ngành đích không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng chọn ngành đích' })
  majorId!: string;
}

export class UpdateClassMajorRuleDto extends PartialType(
  CreateClassMajorRuleDto,
) {}
