import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateMessageDto {
  @ApiProperty({ description: 'Nội dung trao đổi (không được chứa PII)' })
  // Trim TRƯỚC validator: nếu không, body toàn khoảng trắng vẫn lọt @IsNotEmpty
  // và tạo ra tin rỗng trong luồng.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Nội dung trao đổi không được để trống.' })
  @MaxLength(2000, { message: 'Nội dung trao đổi tối đa 2000 ký tự.' })
  body!: string;
}

export class ListMessagesQuery {
  @ApiPropertyOptional({
    description: 'Con trỏ cuộn ngược: chỉ lấy tin tạo TRƯỚC mốc ISO này',
  })
  @IsOptional()
  @IsISO8601()
  before?: string;

  @ApiPropertyOptional({
    description: 'Số tin mỗi trang (mặc định 30, tối đa 100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
