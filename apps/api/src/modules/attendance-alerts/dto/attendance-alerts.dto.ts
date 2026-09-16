import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewAttendanceDto {
  @ApiPropertyOptional({
    description: 'Học kỳ cần rà soát; bỏ trống = học kỳ hiện tại',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  term?: string;
}

export class PendingAttendanceAlertsQuery {
  @ApiPropertyOptional({ description: 'Học kỳ; bỏ trống = học kỳ hiện tại' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  term?: string;

  @ApiPropertyOptional({
    enum: ['owned', 'all'],
    default: 'owned',
    description:
      'owned = chỉ cảnh báo ở lớp mình đứng lớp mà mình chưa chăm sóc (hiện liên tục); all = mọi cảnh báo điểm danh trong phạm vi',
  })
  @IsOptional()
  @IsIn(['owned', 'all'])
  scope?: 'owned' | 'all';
}
