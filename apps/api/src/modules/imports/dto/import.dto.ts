import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class UploadImportDto {
  @ApiProperty({
    description:
      'Học kỳ áp dụng, vd "SU26". Bắt buộc — file nguồn không chứa học kỳ đáng tin cậy.',
    example: 'SU26',
  })
  @IsString()
  @Matches(/^[A-Z]{2}\d{2}$/, {
    message: 'Học kỳ phải có dạng 2 chữ cái + 2 chữ số, vd "SU26".',
  })
  term!: string;
}

/** Phân trang lịch sử import — mặc định 20 lô/trang, tối đa 100. */
export class ListImportsQuery {
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

/**
 * Phân trang dòng staging của một lô import. Một file điểm danh có thể tới
 * ~3000 dòng nên KHÔNG trả hết một lượt; `onlyErrors` để người dùng nhảy
 * thẳng tới các dòng bị bỏ qua thay vì lật từng trang.
 */
export class ListImportRowsQuery {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ description: 'true → chỉ trả dòng có lỗi.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  onlyErrors?: boolean;
}
