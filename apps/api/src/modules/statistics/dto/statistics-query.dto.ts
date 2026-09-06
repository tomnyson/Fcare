import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Kỳ học chỉ gồm chữ và số (vd `SU25`); chặn mảng/ký tự lạ trước khi tới Prisma. */
export class StatisticsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9]+$/)
  term?: string;
}
