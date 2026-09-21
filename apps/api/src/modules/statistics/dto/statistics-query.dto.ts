import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/** Kỳ học chỉ gồm chữ và số (vd `SU25`); chặn mảng/ký tự lạ trước khi tới Prisma. */
export class StatisticsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9]+$/)
  term?: string;

  /** Block trong kỳ (`ClassSection.block`) — chỉ tab lớp học phần dùng. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2])
  block?: number;
}
