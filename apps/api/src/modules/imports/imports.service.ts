import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ImportKind, ImportStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { assertNoForbiddenValues, loadWorkbook } from '../excel/excel-utils';
import type {
  ImportCommitter,
  ImportContext,
  ImportParser,
  ParsedRow,
} from './types';

interface Registration {
  parser: ImportParser;
  committer: ImportCommitter;
}

@Injectable()
export class ImportsService {
  private readonly registry = new Map<ImportKind, Registration>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Mỗi loại file đăng ký một cặp parser + committer (gọi trong module). */
  register(
    kind: ImportKind,
    parser: ImportParser,
    committer: ImportCommitter,
  ): void {
    this.registry.set(kind, { parser, committer });
  }

  private require(kind: ImportKind): Registration {
    const registration = this.registry.get(kind);
    if (!registration) {
      throw new BadRequestException(
        `Chưa hỗ trợ import loại "${kind.toLowerCase()}".`,
      );
    }
    return registration;
  }

  async upload(
    user: AuthUser,
    kind: ImportKind,
    buffer: Buffer,
    fileName: string,
    term: string,
  ) {
    const { parser } = this.require(kind);
    const workbook = await loadWorkbook(buffer);

    // RULE 1 — chốt chặn đứng TRƯỚC parser: quét giá trị mọi ô, mọi sheet.
    assertNoForbiddenValues(workbook);

    const ctx: ImportContext = { term, user, prisma: this.prisma };
    const result = await parser.parse(workbook, ctx);
    const errorCount = result.rows.filter((row) => row.error).length;

    const batch = await this.prisma.importBatch.create({
      data: {
        kind,
        status: ImportStatus.PENDING,
        fileName,
        term,
        uploadedById: user.id,
        summary: {
          totalRows: result.rows.length,
          validRows: result.rows.length - errorCount,
          errorCount,
          warnings: result.warnings,
          unmappedAliases: result.unmappedAliases,
        },
      },
    });

    if (result.rows.length > 0) {
      await this.prisma.importRow.createMany({
        data: result.rows.map((row) => ({
          batchId: batch.id,
          sheet: row.sheet,
          rowIndex: row.rowIndex,
          payload: row.payload as Prisma.JsonObject,
          error: row.error ?? null,
        })),
      });
    }

    await this.auditService.log({
      staffId: user.id,
      action: 'IMPORT_UPLOAD',
      entity: 'ImportBatch',
      entityId: batch.id,
      metadata: { kind, fileName, term, totalRows: result.rows.length },
    });

    return this.preview(user, batch.id);
  }

  async preview(user: AuthUser, batchId: string) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
      include: { rows: { orderBy: [{ sheet: 'asc' }, { rowIndex: 'asc' }] } },
    });
    if (!batch) {
      throw new NotFoundException('Không tìm thấy lượt import.');
    }
    return {
      id: batch.id,
      kind: batch.kind,
      status: batch.status,
      fileName: batch.fileName,
      term: batch.term,
      summary: batch.summary,
      createdAt: batch.createdAt,
      committedAt: batch.committedAt,
      rows: batch.rows.map((row) => ({
        sheet: row.sheet,
        rowIndex: row.rowIndex,
        payload: row.payload,
        error: row.error,
      })),
    };
  }

  async commit(user: AuthUser, batchId: string) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
      include: { rows: true },
    });
    if (!batch) {
      throw new NotFoundException('Không tìm thấy lượt import.');
    }
    if (batch.status !== ImportStatus.PENDING) {
      throw new BadRequestException(
        'Lượt import này đã được xử lý, không thể commit lại.',
      );
    }

    const { committer } = this.require(batch.kind);
    const validRows: ParsedRow[] = batch.rows
      .filter((row) => !row.error)
      .map((row) => ({
        sheet: row.sheet,
        rowIndex: row.rowIndex,
        payload: row.payload as Record<string, unknown>,
      }));

    const ctx: ImportContext = {
      term: batch.term,
      user,
      prisma: this.prisma,
    };

    const result = await this.prisma.$transaction((tx) =>
      committer.commit(validRows, tx, ctx),
    );

    await this.prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: ImportStatus.COMMITTED,
        committedAt: new Date(),
        summary: {
          ...(batch.summary as Prisma.JsonObject),
          ...result,
        },
      },
    });

    await this.auditService.log({
      staffId: user.id,
      action: 'IMPORT_COMMIT',
      entity: 'ImportBatch',
      entityId: batch.id,
      metadata: { kind: batch.kind, ...result },
    });

    return result;
  }

  // Không cần dept scope: ImportBatch không có departmentId (thao tác ở tầng
  // toàn trường, quyền đã chặn ở CASL — chỉ HEAD_OF_DEPT/TRAINING_OFFICER/
  // SA_OFFICER/SA_HEAD/ADMIN mới truy cập được endpoint này).
  async list() {
    const batches = await this.prisma.importBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return batches.map((batch) => ({
      id: batch.id,
      kind: batch.kind,
      status: batch.status,
      fileName: batch.fileName,
      term: batch.term,
      summary: batch.summary,
      createdAt: batch.createdAt,
      committedAt: batch.committedAt,
    }));
  }

  async discard(user: AuthUser, batchId: string) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundException('Không tìm thấy lượt import.');
    }
    if (batch.status === ImportStatus.COMMITTED) {
      throw new BadRequestException('Lượt import đã commit, không thể huỷ.');
    }
    await this.prisma.importBatch.delete({ where: { id: batchId } });
    await this.auditService.log({
      staffId: user.id,
      action: 'IMPORT_DISCARD',
      entity: 'ImportBatch',
      entityId: batchId,
    });
    return { id: batchId };
  }
}
