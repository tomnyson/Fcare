import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { StudentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateStudentDto {
  @ApiProperty({ example: 'SE190001', description: 'Mã số sinh viên' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  studentCode!: string;

  @ApiProperty({ example: 'Nguyễn Văn An' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  @ApiPropertyOptional({ example: '2005-04-12' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'Nam' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  gender?: string;

  // BẮT BUỘC dù schema cho nullable: tạo tay qua UI luôn phải chọn ngành để
  // suy ra departmentId (trục của deptFilter). Chỉ importer mới để trống.
  @ApiProperty({ description: 'ID ngành học' })
  @IsUUID()
  majorId!: string;

  @ApiProperty({ example: 'K19', description: 'Khóa' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  cohort!: string;

  @ApiProperty({ example: 'SE1901', description: 'Lớp hành chính' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  classCode!: string;

  @ApiPropertyOptional({ enum: StudentStatus })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;
}

export class UpdateStudentDto extends PartialType(CreateStudentDto) {}

export class ListStudentsQuery {
  @ApiPropertyOptional({ description: 'Tìm theo MSSV hoặc họ tên' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  classCode?: string;

  @ApiPropertyOptional({ enum: StudentStatus })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;

  @ApiPropertyOptional({
    description: 'Lọc theo bộ môn (chỉ với vai trò toàn trường)',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
