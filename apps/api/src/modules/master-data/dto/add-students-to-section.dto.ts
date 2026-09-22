import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AddStudentItemDto {
  @ApiProperty({ example: 'PK04346', description: 'Mã số sinh viên (MSSV)' })
  @IsString()
  @IsNotEmpty({ message: 'Mã sinh viên không được để trống' })
  @MaxLength(30)
  studentCode!: string;

  @ApiProperty({ example: 'Hoàng Lê Minh Sang', description: 'Họ và tên sinh viên' })
  @IsString()
  @IsNotEmpty({ message: 'Họ và tên không được để trống' })
  @MaxLength(100)
  fullName!: string;
}

export class AddStudentsToSectionDto {
  @ApiProperty({
    type: [AddStudentItemDto],
    description: 'Danh sách sinh viên cần bổ sung vào lớp học phần',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Danh sách sinh viên không được để trống' })
  @ValidateNested({ each: true })
  @Type(() => AddStudentItemDto)
  students!: AddStudentItemDto[];
}
