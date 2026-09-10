import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
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

export class SendAnalysisDto {
  @ApiProperty({
    description:
      'Độ khẩn người duyệt chốt (1-4), không thấp hơn mức hệ thống tính',
    minimum: 1,
    maximum: 4,
  })
  @IsInt()
  @Min(1)
  @Max(4)
  confirmedLevel!: number;

  @ApiProperty({
    description:
      'Nội dung gửi đi: AI = dùng nguyên bản AI tổng hợp, LECTURER = giảng viên tự soạn (gửi kèm lịch sử chăm sóc)',
    enum: ['AI', 'LECTURER'],
  })
  @IsIn(['AI', 'LECTURER'])
  contentSource!: 'AI' | 'LECTURER';

  @ApiPropertyOptional({
    description:
      'Nội dung giảng viên tự soạn; bắt buộc từ 40 ký tự khi contentSource = LECTURER',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  lecturerNote?: string;
}
