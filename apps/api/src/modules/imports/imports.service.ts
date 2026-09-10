import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ImportKind, ImportStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import { isDeptScoped } from '../../common/utils/dept-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { assertNoForbiddenValues, loadWorkbook } from '../excel/excel-utils';
import { aliasKey, isAliasKnown } from './alias-match';
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

  /**
   * Một lượt import thuộc về người đã upload nó — ImportBatch không có
   * departmentId nên `deptFilter` không áp được lên nó (RULE 2). Từ Task 9
   * payload các dòng chứa dữ liệu sinh viên (studentCode/fullName/điểm), nên
   * một HEAD_OF_DEPT xem được batchId của bộ môn khác sẽ đọc được sinh viên
   * bộ môn đó. Ném NotFoundException (KHÔNG ForbiddenException) để không xác
   * nhận sự tồn tại của batch người khác.
   */
  private requireOwnBatch(
    user: AuthUser,
    batch: { uploadedById: string },
  ): void {
    if (isDeptScoped(user) && batch.uploadedById !== user.id) {
      throw new NotFoundException('Không tìm thấy lượt import.');
    }
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

    // Mã bộ môn/ngành có trong file nhưng chưa ánh xạ được → hiện ở bản xem
    // trước để admin gán trước khi commit (spec §8 rủi ro 3). Hai loại tách
    // riêng vì HẬU QUẢ khác nhau: thiếu ánh xạ bộ môn thì dòng bị bỏ qua,
    // thiếu ánh xạ ngành thì sinh viên vẫn được tạo nhưng để trống ngành.
    result.unmappedAliases.push(
      ...(await this.findUnmappedAliases(
        result.rows,
        'deptAlias',
        () => this.loadDepartmentKeys(),
        false,
      )),
    );
    const unmappedMajorAliases = await this.findUnmappedAliases(
      result.rows,
      'majorAlias',
      () => this.loadMajorKeys(),
      true,
    );

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
          unmappedMajorAliases,
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
      include: {
        rows: { orderBy: [{ sheet: 'asc' }, { rowIndex: 'asc' }] },
        // RULE 1: chỉ họ tên — tuyệt đối không select email/SĐT/CCCD/địa chỉ.
        uploadedBy: { select: { fullName: true } },
      },
    });
    if (!batch) {
      throw new NotFoundException('Không tìm thấy lượt import.');
    }
    this.requireOwnBatch(user, batch);
    return {
      id: batch.id,
      kind: batch.kind,
      status: batch.status,
      fileName: batch.fileName,
      term: batch.term,
      summary: batch.summary,
      createdAt: batch.createdAt,
      committedAt: batch.committedAt,
      uploadedByName: batch.uploadedBy?.fullName ?? null,
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
    this.requireOwnBatch(user, batch);
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

    // Ghi kết quả committer VÀ chuyển trạng thái batch trong CÙNG một
    // transaction: nếu update trạng thái thất bại (mất kết nối, deadlock),
    // toàn bộ giao dịch rollback theo — tránh trường hợp dữ liệu đã ghi
    // nhưng batch vẫn PENDING (dẫn đến commit lại double-apply dữ liệu vì
    // ImportCommitter không đảm bảo idempotent).
    //
    // maxWait/timeout tăng so với mặc định Prisma (2s/5s): import là thao
    // tác dài (committer chạy ~2 round-trip DB mỗi dòng, file thật ~300+
    // dòng), không phải request nóng — timeout 5s mặc định làm rollback
    // toàn bộ transaction (P2028) trên DB chậm hơn máy dev hoặc file lớn.
    const result = await this.prisma.$transaction(
      async (tx) => {
        const commitResult = await committer.commit(validRows, tx, ctx);
        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            status: ImportStatus.COMMITTED,
            committedAt: new Date(),
            summary: {
              ...(batch.summary as Prisma.JsonObject),
              ...commitResult,
            },
          },
        });
        return commitResult;
      },
      { maxWait: 15_000, timeout: 120_000 },
    );

    await this.auditService.log({
      staffId: user.id,
      action: 'IMPORT_COMMIT',
      entity: 'ImportBatch',
      entityId: batch.id,
      metadata: { kind: batch.kind, ...result },
    });

    return result;
  }

  // ImportBatch không có departmentId nên deptFilter không áp được (RULE 2):
  // lọc theo người đã upload thay vì bộ môn — người dùng bị scope chỉ thấy
  // lượt import của chính mình, vai trò không bị scope thấy tất cả.
  async list(user: AuthUser) {
    const batches = await this.prisma.importBatch.findMany({
      where: isDeptScoped(user) ? { uploadedById: user.id } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
      // RULE 1: chỉ họ tên — tuyệt đối không select email/SĐT/CCCD/địa chỉ.
      include: { uploadedBy: { select: { fullName: true } } },
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
      uploadedByName: batch.uploadedBy?.fullName ?? null,
    }));
  }

  /**
   * Soft-cancel: giữ lại ImportBatch trong lịch sử (status = CANCELLED),
   * chỉ xoá các ImportRow con (dữ liệu staging, không cần giữ). Batch đã
   * CANCELLED gọi lại discard là idempotent (không chặn) — vẫn cùng kết quả.
   */
  async discard(user: AuthUser, batchId: string) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundException('Không tìm thấy lượt import.');
    }
    this.requireOwnBatch(user, batch);
    if (batch.status === ImportStatus.COMMITTED) {
      throw new BadRequestException('Lượt import đã commit, không thể huỷ.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.importRow.deleteMany({ where: { batchId } });
      await tx.importBatch.update({
        where: { id: batchId },
        data: { status: ImportStatus.CANCELLED },
      });
    });
    await this.auditService.log({
      staffId: user.id,
      action: 'IMPORT_DISCARD',
      entity: 'ImportBatch',
      entityId: batchId,
    });
    return { id: batchId };
  }

  /**
   * Khoá tra bộ môn: alias đã gán CỘNG mã bộ môn thật — file nhà trường nhiều
   * khi ghi thẳng mã trong DB, không cần bắt admin tự ánh xạ trùng lặp.
   */
  private async loadDepartmentKeys(): Promise<string[]> {
    const [aliases, departments] = await Promise.all([
      this.prisma.departmentAlias.findMany({ select: { alias: true } }),
      this.prisma.department.findMany({ select: { code: true } }),
    ]);
    return [
      ...aliases.map((entry) => entry.alias),
      ...departments.map((entry) => entry.code),
    ];
  }

  /** Khoá tra ngành: alias đã gán cộng mã ngành thật (xem `loadDepartmentKeys`). */
  private async loadMajorKeys(): Promise<string[]> {
    const [aliases, majors] = await Promise.all([
      this.prisma.majorAlias.findMany({ select: { alias: true } }),
      this.prisma.major.findMany({ select: { code: true } }),
    ]);
    return [
      ...aliases.map((entry) => entry.alias),
      ...majors.map((entry) => entry.code),
    ];
  }

  /**
   * Mã trong file ("CHNA" cho ngành, "SE" cho bộ môn) không phải mã trong DB —
   * phải đi qua bảng ánh xạ tương ứng. Trả về các mã chưa ánh xạ để admin gán
   * trước khi commit. Không truy vấn DB khi file không có cột đó.
   *
   * `allowBaseMatch` PHẢI khớp với cách committer tra: bật cho ngành (bỏ hậu tố
   * khoá tuyển sinh), tắt cho bộ môn. Lệch nhau thì bản xem trước nói một đằng,
   * lúc ghi làm một nẻo.
   */
  private async findUnmappedAliases(
    rows: ParsedRow[],
    field: 'deptAlias' | 'majorAlias',
    loadKnown: () => Promise<string[]>,
    allowBaseMatch: boolean,
  ): Promise<string[]> {
    const fileAliases = new Set(
      rows
        .map((row) => {
          const value = row.payload[field];
          return typeof value === 'string' ? value.trim() : '';
        })
        .filter((alias) => alias !== ''),
    );
    if (fileAliases.size === 0) {
      return [];
    }
    const known = await loadKnown();
    const knownKeys = new Set(known.map((key) => aliasKey(key)));
    return Array.from(fileAliases).filter(
      (alias) => !isAliasKnown(knownKeys, alias, allowBaseMatch),
    );
  }
}
