import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { StudentStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsBoolean,
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

  @ApiPropertyOptional({ description: 'Lọc theo ngành học' })
  @IsOptional()
  @IsUUID()
  majorId?: string;

  @ApiPropertyOptional({
    example: 'SU25',
    description: 'Chỉ lấy sinh viên có học phần trong học kỳ này',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  term?: string;

  @ApiPropertyOptional({
    description: 'Chỉ lấy sinh viên có học phần do giảng viên này phụ trách',
  })
  @IsOptional()
  @IsUUID()
  lecturerId?: string;

  @ApiPropertyOptional({
    description: 'Chỉ lấy sinh viên đang học một lớp học phần cụ thể',
  })
  @IsOptional()
  @IsUUID()
  sectionId?: string;

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

  @ApiPropertyOptional({
    description: 'Chỉ lấy sinh viên chưa gán ngành (hàng chờ dọn sau import)',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  missingMajor?: boolean;
}

export class BulkAssignMajorDto {
  @ApiProperty({
    type: [String],
    description: 'Danh sách id sinh viên cần gán ngành',
  })
  @ArrayNotEmpty()
  // Trang sinh viên phân trang 20 dòng; 500 là trần an toàn chặn payload rác.
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  studentIds!: string[];

  @ApiProperty()
  @IsUUID()
  majorId!: string;
}
