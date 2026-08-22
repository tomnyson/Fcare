import type { PrismaClient } from '@prisma/client';
import type * as ExcelJS from 'exceljs';
import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';

export type PrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface ImportContext {
  term: string;
  user: AuthUser;
  prisma: PrismaService;
}

export interface ParsedRow {
  sheet: string;
  rowIndex: number;
  /** Dữ liệu đã chuẩn hoá. KHÔNG BAO GIỜ chứa email/SĐT/CCCD/địa chỉ (RULE 1). */
  payload: Record<string, unknown>;
  /** Dòng lỗi vẫn được lưu để admin thấy ở bản xem trước, nhưng không commit. */
  error?: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  warnings: string[];
  /** Mã bộ môn trong file chưa có trong bảng `DepartmentAlias`. */
  unmappedAliases: string[];
}

export interface CommitResult {
  created: number;
  updated: number;
  skipped: number;
}

/** Parser thuần: chỉ đọc workbook, KHÔNG chạm DB. Test được không cần Postgres. */
export interface ImportParser {
  parse(workbook: ExcelJS.Workbook, ctx: ImportContext): Promise<ParseResult>;
}

/** Committer nhận dòng đã parse + transaction, ghi DB. */
export interface ImportCommitter {
  commit(
    rows: ParsedRow[],
    tx: PrismaTx,
    ctx: ImportContext,
  ): Promise<CommitResult>;
}
