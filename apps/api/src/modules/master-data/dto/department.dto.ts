import { ApiPropertyOptional, ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'SE', description: 'Mã bộ môn' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code!: string;

  @ApiProperty({ example: 'Kỹ thuật phần mềm' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {
  @ApiPropertyOptional({
    description:
      'Tắt bộ môn cơ sở không mở — môn học của bộ môn cũng bị ẩn theo',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
