import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateMajorDto {
  @ApiProperty({ example: 'SE-K19', description: 'Mã ngành' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code!: string;

  @ApiProperty({ example: 'Kỹ thuật phần mềm' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'ID bộ môn phụ trách' })
  @IsUUID()
  departmentId!: string;
}

export class UpdateMajorDto extends PartialType(CreateMajorDto) {}
