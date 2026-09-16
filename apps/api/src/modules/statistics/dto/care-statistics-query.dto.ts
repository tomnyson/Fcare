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

  @IsOptional()
  @IsIn(['all', 'cared', 'uncared'])
  status?: 'all' | 'cared' | 'uncared';

  @IsOptional()
  @IsIn(['summary', 'detailed'])
  mode?: 'summary' | 'detailed';
}
