import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateStudentTermAnalysisDto {
  @ApiProperty({ example: 'SU25' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  term!: string;

  @ApiProperty({ description: 'UUID chống tạo trùng khi client retry' })
  @IsUUID()
  idempotencyKey!: string;
}

export class ListStudentTermAnalysesQuery {
  @ApiPropertyOptional({ example: 'SU25' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  term?: string;
}

export class UpdateStudentAnalysisDraftDto {
  @ApiProperty({
    description: 'Bản phân tích có cấu trúc đã được người duyệt chỉnh sửa',
  })
  @IsObject()
  editedOutput!: Record<string, unknown>;
}
