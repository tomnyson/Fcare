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
  Matches,
} from 'class-validator';

export class CreateStaffDto {
  @ApiProperty({
    example: 'gv.nguyen',
    description: 'Mã nhân viên (dùng để đăng nhập)',
  })
  @IsString({ message: 'Mã nhân viên phải là chuỗi' })
  @IsNotEmpty({ message: 'Mã nhân viên không được để trống' })
  @MaxLength(50, { message: 'Mã nhân viên tối đa 50 ký tự' })
  @Matches(/^[a-zA-Z0-9.-]+$/, {
    message: 'Mã nhân viên chỉ gồm chữ cái, số, dấu chấm và gạch ngang',
  })
  staffCode!: string;

  @ApiProperty({ example: 'Nguyễn Văn Bình' })
  @IsString({ message: 'Tên nhân viên phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên nhân viên không được để trống' })
  @MaxLength(200, { message: 'Tên nhân viên tối đa 200 ký tự' })
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
  @IsString({ message: 'Tên nhân viên phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên nhân viên không được để trống' })
  @MaxLength(200, { message: 'Tên nhân viên tối đa 200 ký tự' })
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
