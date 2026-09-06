import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ROLE_KEYS, type RoleKey } from '@fcare/shared-types';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateStaffDto {
  @ApiProperty({
    example: 'gv.nguyen',
    description: 'Mã nhân viên (dùng để đăng nhập)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  staffCode!: string;

  @ApiProperty({ example: 'Nguyễn Văn Bình' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  @ApiPropertyOptional({
    description: 'ID bộ môn (bắt buộc với giảng viên/trưởng bộ môn)',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiProperty({ enum: ROLE_KEYS, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(ROLE_KEYS, { each: true })
  roles!: RoleKey[];
}

export class UpdateStaffDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ enum: ROLE_KEYS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(ROLE_KEYS, { each: true })
  roles?: RoleKey[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListStaffQuery {
  @ApiPropertyOptional({ description: 'Tìm theo mã NV hoặc họ tên' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ enum: ROLE_KEYS })
  @IsOptional()
  @IsIn(ROLE_KEYS)
  role?: RoleKey;

  @ApiPropertyOptional({
    description:
      'Chỉ lấy nhân viên chưa thuộc bộ môn nào (hàng chờ dọn sau import giảng viên)',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  missingDepartment?: boolean;
}

export class BulkAssignDepartmentDto {
  @ApiProperty({
    type: [String],
    description: 'Danh sách id nhân viên cần gán',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  staffIds!: string[];

  @ApiProperty({
    description: 'ID bộ môn sẽ gán cho toàn bộ nhân viên đã chọn',
  })
  @IsUUID()
  departmentId!: string;
}
