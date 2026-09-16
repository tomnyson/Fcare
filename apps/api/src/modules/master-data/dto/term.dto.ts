import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { TermSeason } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTermDto {
  @ApiProperty({
    example: 'SP25',
    description: 'Mã kỳ học (viết hoa không dấu cách, vd: SP25)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Mã kỳ không được để trống' })
  @MaxLength(20)
  @Matches(/^[A-Z0-9]+$/, {
    message: 'Mã kỳ chỉ chứa chữ in hoa và số, không chứa dấu cách',
  })
  code!: string;

  @ApiProperty({
    example: 'Spring 2025',
    description: 'Tên hiển thị của kỳ học',
  })
  @IsString()
  @IsNotEmpty({ message: 'Tên kỳ không được để trống' })
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    enum: TermSeason,
    example: TermSeason.SPRING,
    description: 'Mùa học',
  })
  @IsEnum(TermSeason, { message: 'Mùa học phải là SPRING, SUMMER hoặc FALL' })
  season!: TermSeason;

  @ApiProperty({ example: 2025, description: 'Năm học' })
  @IsInt({ message: 'Năm học phải là số nguyên' })
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiProperty({
    example: '2025-01-01T00:00:00.000Z',
    description: 'Ngày bắt đầu kỳ',
  })
  @IsDateString({}, { message: 'Ngày bắt đầu không đúng định dạng ISO date' })
  startDate!: string;

  @ApiProperty({
    example: '2025-04-30T23:59:59.999Z',
    description: 'Ngày kết thúc kỳ',
  })
  @IsDateString({}, { message: 'Ngày kết thúc không đúng định dạng ISO date' })
  endDate!: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Bật cờ ghi đè kỳ hiện tại',
  })
  @IsOptional()
  @IsBoolean()
  isCurrentOverride?: boolean;
}

export class UpdateTermDto extends PartialType(CreateTermDto) {}

export class SetCurrentTermDto {
  @ApiProperty({ example: true, description: 'Trạng thái ghi đè kỳ hiện tại' })
  @IsBoolean()
  isCurrent!: boolean;
}
