import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ImportKind, ImportStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import type { AuthUser } from '../../common/types/auth-user';
import { ImportsService } from './imports.service';
import type { ImportCommitter, ImportParser, ParsedRow } from './types';

const user = {
  id: 'staff-1',
  staffCode: 'admin',
  roles: ['ADMIN'],
  departmentId: null,
} as unknown as AuthUser;

// Vai trò bị scope (không thuộc UNSCOPED_ROLES) — dùng để test item 1: một
// lượt import chỉ thuộc về người đã upload nó, batch fixture có
// uploadedById: 'staff-1' nên user này (staff-2) KHÔNG phải chủ sở hữu.
const scopedUser = {
  id: 'staff-2',
  staffCode: 'lecturer',
  roles: ['HEAD_OF_DEPT'],
  departmentId: 'dept-1',
} as unknown as AuthUser;

/** Hình dạng tham số gọi `importBatch.create` — chỉ để test đọc lại an toàn kiểu. */
interface CreateBatchArgs {
  data: {
    kind: ImportKind;
    status: ImportStatus;
    fileName: string;
    term: string;
    uploadedById: string;
    summary: Record<string, unknown>;
  };
}

/** Hình dạng tham số gọi `importRow.createMany`. */
interface CreateRowsArgs {
  data: Array<{ error: string | null }>;
}

async function workbookBuffer(headers: string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('3.1.Môn-BM');
  worksheet.getRow(1).values = ['', ...headers];
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function makePrismaMock() {
  const batch = {
    id: 'batch-1',
    kind: ImportKind.CATALOG,
    status: ImportStatus.PENDING,
    fileName: 'a.xlsx',
    term: 'SU26',
    uploadedById: 'staff-1',
    // RULE 1: chỉ họ tên — test dưới đây khẳng định select thật của quan hệ
    // này (không phải fixture) không nới ra quá fullName.
    uploadedBy: { fullName: 'Nguyễn Văn A' },
    summary: {},
    createdAt: new Date(),
    committedAt: null,
    rows: [
      {
        id: 'r1',
        batchId: 'batch-1',
        sheet: 'S',
        rowIndex: 2,
        payload: { code: 'A' },
        error: null,
      },
      {
        id: 'r2',
        batchId: 'batch-1',
        sheet: 'S',
        rowIndex: 3,
        payload: {},
        error: 'hỏng',
      },
    ],
  };
  // Mock client transaction (tx): commit() phải gọi tx.importBatch.update
  // để việc ghi dữ liệu committer và chuyển trạng thái COMMITTED cùng
  // thành công/thất bại trong một transaction duy nhất. discard() dùng
  // cùng cơ chế: tx.importRow.deleteMany + tx.importBatch.update(CANCELLED).
  const txImportBatchUpdate = jest
    .fn()
    .mockResolvedValue({ ...batch, status: ImportStatus.COMMITTED });
  const txImportRowDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const tx = {
    importBatch: { update: txImportBatchUpdate },
    importRow: { deleteMany: txImportRowDeleteMany },
  };
  return {
    importBatch: {
      create: jest.fn().mockResolvedValue(batch),
      findUnique: jest.fn().mockResolvedValue(batch),
      update: jest
        .fn()
        .mockResolvedValue({ ...batch, status: ImportStatus.COMMITTED }),
      findMany: jest.fn().mockResolvedValue([batch]),
      delete: jest.fn().mockResolvedValue(batch),
    },
    importRow: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    departmentAlias: { findMany: jest.fn().mockResolvedValue([]) },
    txImportBatchUpdate,
    txImportRowDeleteMany,
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
  };
}

describe('ImportsService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: { log: jest.Mock };
  let parseMock: jest.Mock;
  let parser: ImportParser;
  let commitMock: jest.Mock;
  let committer: ImportCommitter;
  let service: ImportsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    parseMock = jest.fn().mockResolvedValue({
      rows: [
        { sheet: 'S', rowIndex: 2, payload: { code: 'A' } },
        { sheet: 'S', rowIndex: 3, payload: {}, error: 'hỏng' },
      ],
      warnings: ['một cảnh báo'],
      unmappedAliases: ['THUC-TAP-TN'],
    });
    parser = { parse: parseMock };
    commitMock = jest
      .fn()
      .mockResolvedValue({ created: 1, updated: 0, skipped: 0 });
    committer = { commit: commitMock };
    service = new ImportsService(prisma as never, audit as never);
    service.register(ImportKind.CATALOG, parser, committer);
  });

  it('quét PII trước khi parse — file có email bị từ chối, không tạo batch', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('T.Kê');
    worksheet.getRow(2).getCell(9).value = 'vandtb2@fe.edu.vn';
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(
      service.upload(user, ImportKind.CATALOG, buffer, 'a.xlsx', 'SU26'),
    ).rejects.toThrow(BadRequestException);
    expect(parseMock).not.toHaveBeenCalled();
    expect(prisma.importBatch.create).not.toHaveBeenCalled();
  });

  it('upload tạo batch PENDING và lưu mọi dòng, kể cả dòng lỗi', async () => {
    const buffer = await workbookBuffer(['Mã môn']);
    await service.upload(user, ImportKind.CATALOG, buffer, 'a.xlsx', 'SU26');

    const [createArgs] = prisma.importBatch.create.mock.calls[0] as [
      CreateBatchArgs,
    ];
    expect(createArgs.data).toMatchObject({
      kind: ImportKind.CATALOG,
      status: ImportStatus.PENDING,
      term: 'SU26',
      uploadedById: 'staff-1',
    });

    const [createManyArgs] = prisma.importRow.createMany.mock.calls[0] as [
      CreateRowsArgs,
    ];
    expect(createManyArgs.data).toContainEqual(
      expect.objectContaining({ error: 'hỏng' }),
    );
  });

  it('summary đếm đúng số dòng hợp lệ, dòng lỗi và alias chưa ánh xạ', async () => {
    const buffer = await workbookBuffer(['Mã môn']);
    await service.upload(user, ImportKind.CATALOG, buffer, 'a.xlsx', 'SU26');

    const [createArgs] = prisma.importBatch.create.mock.calls[0] as [
      CreateBatchArgs,
    ];
    expect(createArgs.data.summary).toEqual(
      expect.objectContaining({
        totalRows: 2,
        validRows: 1,
        errorCount: 1,
        warnings: ['một cảnh báo'],
        unmappedAliases: ['THUC-TAP-TN'],
      }),
    );
  });

  it('commit chỉ đưa dòng KHÔNG lỗi xuống committer', async () => {
    await service.commit(user, 'batch-1');
    const [rows] = commitMock.mock.calls[0] as [ParsedRow[]];
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toEqual({ code: 'A' });
  });

  it('commit chạy trong một transaction và ghi audit log', async () => {
    await service.commit(user, 'batch-1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'IMPORT_COMMIT',
        entity: 'ImportBatch',
        entityId: 'batch-1',
      }),
    );
  });

  it('từ chối commit lần hai trên cùng batch', async () => {
    prisma.importBatch.findUnique.mockResolvedValue({
      id: 'batch-1',
      kind: ImportKind.CATALOG,
      status: ImportStatus.COMMITTED,
      term: 'SU26',
      rows: [],
    });
    await expect(service.commit(user, 'batch-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('committer ném lỗi → batch vẫn PENDING, không đánh dấu COMMITTED', async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(
      new Error('vi phạm ràng buộc'),
    );
    await expect(service.commit(user, 'batch-1')).rejects.toThrow(
      'vi phạm ràng buộc',
    );
    // $transaction đã rollback; batch giữ nguyên PENDING nên commit lại được sau khi sửa dữ liệu.
    expect(prisma.importBatch.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('update trạng thái COMMITTED thất bại trong transaction → rollback cùng dữ liệu committer, không đánh dấu COMMITTED, không audit', async () => {
    prisma.txImportBatchUpdate.mockRejectedValue(
      new Error('mất kết nối khi cập nhật trạng thái'),
    );

    await expect(service.commit(user, 'batch-1')).rejects.toThrow(
      'mất kết nối khi cập nhật trạng thái',
    );

    // Việc cập nhật trạng thái được thử NGAY TRONG transaction (cùng khối
    // với committer.commit), nên khi nó lỗi, toàn bộ transaction rollback:
    // dữ liệu committer đã ghi cũng bị huỷ theo, batch không bị đánh dấu
    // COMMITTED một cách "mồ côi", và không ghi audit log cho một lượt
    // commit thất bại.
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(prisma.txImportBatchUpdate).toHaveBeenCalledTimes(1);
    expect(prisma.importBatch.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('batch không tồn tại → NotFoundException', async () => {
    prisma.importBatch.findUnique.mockResolvedValue(null);
    await expect(service.preview(user, 'khong-co')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('gom alias bộ môn chưa ánh xạ từ payload vào summary', async () => {
    prisma.departmentAlias = {
      findMany: jest.fn().mockResolvedValue([{ alias: 'CNTT' }]),
    };
    (parser.parse as jest.Mock).mockResolvedValue({
      rows: [
        { sheet: 'S', rowIndex: 3, payload: { deptAlias: 'CNTT' } },
        { sheet: 'S', rowIndex: 4, payload: { deptAlias: 'THUC-TAP-TN' } },
      ],
      warnings: [],
      unmappedAliases: [],
    });
    const buffer = await workbookBuffer(['Mã môn']);
    await service.upload(user, ImportKind.CATALOG, buffer, 'a.xlsx', 'SU26');
    const [createArgs] = prisma.importBatch.create.mock.calls[0] as [
      CreateBatchArgs,
    ];
    expect(createArgs.data.summary).toEqual(
      expect.objectContaining({ unmappedAliases: ['THUC-TAP-TN'] }),
    );
  });

  it('loại file chưa đăng ký parser → BadRequestException', async () => {
    const buffer = await workbookBuffer(['Mã môn']);
    await expect(
      service.upload(user, ImportKind.SCHEDULE, buffer, 'a.xlsx', 'SU26'),
    ).rejects.toThrow(BadRequestException);
  });

  describe('item 1 — một lượt import chỉ thuộc về người đã upload nó', () => {
    it('preview: người dùng bị scope xem batch của người khác → 404', async () => {
      await expect(service.preview(scopedUser, 'batch-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('preview: người dùng KHÔNG bị scope xem được batch của người khác', async () => {
      await expect(service.preview(user, 'batch-1')).resolves.toMatchObject({
        id: 'batch-1',
      });
    });

    it('commit: người dùng bị scope commit batch của người khác → 404, committer không được gọi', async () => {
      await expect(service.commit(scopedUser, 'batch-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(commitMock).not.toHaveBeenCalled();
    });

    it('discard: người dùng bị scope xoá batch của người khác → 404, không xoá', async () => {
      // discard chỉ findUnique (không include rows) — mock findUnique trả
      // batch PENDING đã có sẵn từ makePrismaMock().
      await expect(service.discard(scopedUser, 'batch-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.importBatch.delete).not.toHaveBeenCalled();
    });

    it('discard: chủ sở hữu huỷ mềm được batch PENDING của chính mình (soft-cancel, không xoá cứng)', async () => {
      await service.discard(user, 'batch-1');
      expect(prisma.txImportRowDeleteMany).toHaveBeenCalledWith({
        where: { batchId: 'batch-1' },
      });
      expect(prisma.txImportBatchUpdate).toHaveBeenCalledWith({
        where: { id: 'batch-1' },
        data: { status: ImportStatus.CANCELLED },
      });
      expect(prisma.importBatch.delete).not.toHaveBeenCalled();
    });

    it('discard: batch COMMITTED → BadRequestException, không đụng DB', async () => {
      prisma.importBatch.findUnique.mockResolvedValue({
        id: 'batch-1',
        status: ImportStatus.COMMITTED,
        uploadedById: 'staff-1',
      });
      await expect(service.discard(user, 'batch-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.importBatch.delete).not.toHaveBeenCalled();
    });

    it('discard: batch đã CANCELLED gọi discard lần nữa → idempotent, không ném lỗi', async () => {
      prisma.importBatch.findUnique.mockResolvedValue({
        id: 'batch-1',
        status: ImportStatus.CANCELLED,
        uploadedById: 'staff-1',
      });
      await expect(service.discard(user, 'batch-1')).resolves.toEqual({
        id: 'batch-1',
      });
      expect(prisma.txImportBatchUpdate).toHaveBeenCalledWith({
        where: { id: 'batch-1' },
        data: { status: ImportStatus.CANCELLED },
      });
    });

    it('list: người dùng bị scope chỉ thấy batch của chính họ (where lọc uploadedById)', async () => {
      await service.list(scopedUser);
      expect(prisma.importBatch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { uploadedById: 'staff-2' } }),
      );
    });

    it('list: người dùng KHÔNG bị scope thấy tất cả (where không lọc)', async () => {
      await service.list(user);
      expect(prisma.importBatch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
    });
  });

  describe('item 2 — list()/preview() trả tên người upload', () => {
    it('list: trả uploadedByName đọc từ quan hệ uploadedBy', async () => {
      const result = await service.list(user);
      expect(result[0]).toMatchObject({ uploadedByName: 'Nguyễn Văn A' });
    });

    it('preview: trả uploadedByName đọc từ quan hệ uploadedBy', async () => {
      const result = await service.preview(user, 'batch-1');
      expect(result).toMatchObject({ uploadedByName: 'Nguyễn Văn A' });
    });

    it('list: uploadedByName null khi quan hệ không trả fullName (batch mồ côi)', async () => {
      prisma.importBatch.findMany.mockResolvedValue([
        {
          id: 'batch-2',
          kind: ImportKind.CATALOG,
          status: ImportStatus.PENDING,
          fileName: 'b.xlsx',
          term: 'SU26',
          summary: {},
          createdAt: new Date(),
          committedAt: null,
          uploadedBy: null,
        },
      ]);
      const result = await service.list(user);
      expect(result[0]).toMatchObject({ uploadedByName: null });
    });

    it('RULE 1: select của quan hệ uploadedBy trong list() CHỈ chứa fullName', async () => {
      await service.list(user);
      const [args] = prisma.importBatch.findMany.mock.calls[0] as [
        { include?: { uploadedBy?: { select?: Record<string, boolean> } } },
      ];
      expect(args.include?.uploadedBy?.select).toEqual({ fullName: true });
    });

    it('RULE 1: select của quan hệ uploadedBy trong preview() CHỈ chứa fullName', async () => {
      await service.preview(user, 'batch-1');
      const calls = prisma.importBatch.findUnique.mock.calls as Array<
        [{ include?: { uploadedBy?: { select?: Record<string, boolean> } } }]
      >;
      const [args] = calls[calls.length - 1];
      expect(args.include?.uploadedBy?.select).toEqual({ fullName: true });
    });
  });
});
