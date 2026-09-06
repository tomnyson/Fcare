import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, Matches } from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'SE', description: 'Mã bộ môn' })
  @IsString({ message: 'Mã bộ môn phải là chuỗi' })
  @IsNotEmpty({ message: 'Mã bộ môn không được để trống' })
  @MaxLength(20, { message: 'Mã bộ môn tối đa 20 ký tự' })
  @Matches(/^[A-Z0-9-]+$/, {
    message: 'Mã bộ môn chỉ gồm chữ in hoa, số và dấu gạch ngang, không dấu',
  })
  code!: string;

  @ApiProperty({ example: 'Kỹ thuật phần mềm' })
  @IsString({ message: 'Tên bộ môn phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên bộ môn không được để trống' })
  @MaxLength(200, { message: 'Tên bộ môn tối đa 200 ký tự' })
  name!: string;
}

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {}
