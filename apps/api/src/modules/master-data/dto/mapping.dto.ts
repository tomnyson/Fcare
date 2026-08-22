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
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  alias!: string;

  @ApiProperty({ description: 'ID bộ môn đích' })
  @IsUUID()
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
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, {
    message: 'Tiền tố lớp phải gồm đúng 2 chữ cái, ví dụ "AI".',
  })
  classPrefix!: string;

  @ApiProperty({ description: 'ID ngành đích' })
  @IsUUID()
  majorId!: string;
}

export class UpdateClassMajorRuleDto extends PartialType(
  CreateClassMajorRuleDto,
) {}
