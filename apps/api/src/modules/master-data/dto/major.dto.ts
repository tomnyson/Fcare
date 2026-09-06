import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateMajorDto {
  @ApiProperty({ example: 'SE-K19', description: 'Mã ngành' })
  @IsString({ message: 'Mã ngành phải là chuỗi' })
  @IsNotEmpty({ message: 'Mã ngành không được để trống' })
  @MaxLength(20, { message: 'Mã ngành tối đa 20 ký tự' })
  @Matches(/^[A-Z0-9-]+$/, {
    message: 'Mã ngành chỉ gồm chữ in hoa, số và dấu gạch ngang, không dấu',
  })
  code!: string;

  @ApiProperty({ example: 'Kỹ thuật phần mềm' })
  @IsString({ message: 'Tên ngành phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên ngành không được để trống' })
  @MaxLength(200, { message: 'Tên ngành tối đa 200 ký tự' })
  name!: string;

  @ApiProperty({ description: 'ID bộ môn phụ trách' })
  @IsUUID(4, { message: 'ID bộ môn không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng chọn bộ môn' })
  departmentId!: string;
}

export class UpdateMajorDto extends PartialType(CreateMajorDto) {}
