import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListAuditLogsQuery {
  @ApiPropertyOptional({ description: 'Trang (bắt đầu từ 1)', default: 1 })
  @IsOptional()
  @Transform(({ value }) => {
    const num = parseInt(String(value), 10);
    return Number.isNaN(num) ? 1 : num;
  })
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ description: 'Số bản ghi mỗi trang', default: 20 })
  @IsOptional()
  @Transform(({ value }) => {
    const num = parseInt(String(value), 10);
    return Number.isNaN(num) ? 20 : num;
  })
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 20;

  @ApiPropertyOptional({
    description: 'Tìm kiếm nhanh (mã NV, họ tên, action, entity)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Lọc theo mã action (vd: AUTH_LOGIN)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({ description: 'Lọc theo mã nhân viên (staffCode)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  staffCode?: string;

  @ApiPropertyOptional({ description: 'Lọc theo entity (vd: Staff, Alert)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entity?: string;

  @ApiPropertyOptional({ description: 'Từ ngày (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Đến ngày (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
