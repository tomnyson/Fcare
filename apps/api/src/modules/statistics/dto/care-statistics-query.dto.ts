import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CareStatisticsQuery {
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9]+$/)
  term!: string;

  @IsOptional()
  @IsUUID()
  lecturerId?: string;

  /** Bộ môn của giảng viên đứng lớp — chỉ thu hẹp thêm phạm vi đã có. */
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsIn(['all', 'cared', 'uncared'])
  status?: 'all' | 'cared' | 'uncared';

  @IsOptional()
  @IsIn(['summary', 'detailed'])
  mode?: 'summary' | 'detailed';
}
