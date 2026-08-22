import * as ExcelJS from 'exceljs';
import type { ImportContext } from '../types';
import { ScheduleParser } from './schedule.parser';

const BL_HEADERS: Record<number, string> = {
  2: 'Ngành',
  3: 'Kỳ',
  4: 'Mã ghép',
  5: 'Mã môn',
  6: 'Tên môn',
  7: 'P.Pháp',
  8: 'Bộ môn',
  10: 'Lớp',
  11: 'Lớp gộp',
  12: 'Phân công giảng viên',
  13: 'Block',
  14: 'Ca',
  15: 'Thứ',
  16: 'Thứ học thực tế',
  17: 'Phòng',
  19: 'Thời gian bắt đầu',
  20: 'Số lượng sinh viên',
  26: 'Số giờ',
};

const TOOL_HEADERS: Record<number, string> = {
  2: 'Class',
  3: 'Subject',
  4: 'Lecturer',
  5: 'Slot',
  6: 'Date',
  7: 'Room',
  8: 'Block',
  9: 'Dept',
  10: 'NumStudent',
  11: 'TrainingTime',
};

function setRow(
  worksheet: ExcelJS.Worksheet,
  rowIndex: number,
  cells: Record<number, unknown>,
): void {
  const row = worksheet.getRow(rowIndex);
  for (const [column, value] of Object.entries(cells)) {
    row.getCell(Number(column)).value = value as ExcelJS.CellValue;
  }
}

function buildWorkbook(
  blRows: Array<Record<number, unknown>>,
  toolRows: Array<Record<number, unknown>>,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const bl = workbook.addWorksheet('BL1+BL2');
  setRow(bl, 8, BL_HEADERS); // header ở DÒNG 8
  blRows.forEach((cells, index) => setRow(bl, 9 + index, cells));

  const tool = workbook.addWorksheet('Lịch tool');
  setRow(tool, 1, TOOL_HEADERS);
  toolRows.forEach((cells, index) => setRow(tool, 2 + index, cells));
  return workbook;
}

const ctx = { term: 'SU26' } as ImportContext;

describe('ScheduleParser', () => {
  const parser = new ScheduleParser();

  it('merge lịch từ "Lịch tool" với giảng viên thật từ "BL1+BL2"', async () => {
    const workbook = buildWorkbook(
      [
        {
          5: 'ITA107',
          10: 'AI21301',
          12: 'Nguyễn Văn Thật',
          13: 1,
          20: 30,
          26: 45,
        },
      ],
      [
        {
          2: 'AI21301',
          3: 'ITA107',
          4: 'giangvien12',
          5: 'S1',
          6: '246',
          7: 'P301',
          8: 1,
          10: 30,
          11: 'AM',
        },
      ],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].payload).toMatchObject({
      subjectCode: 'ITA107',
      classCode: 'AI21301',
      block: 1,
      slot: 'S1',
      weekdays: '246',
      room: 'P301',
      trainingTime: 'AM',
      lecturerName: 'Nguyễn Văn Thật',
    });
  });

  it('KHÔNG lấy giảng viên ẩn danh từ "Lịch tool"', async () => {
    const workbook = buildWorkbook(
      [{ 5: 'ITA107', 10: 'AI21301', 12: '', 13: 1 }],
      [{ 2: 'AI21301', 3: 'ITA107', 4: 'giangvien12', 5: 'S1', 8: 1 }],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.lecturerName).toBeNull();
  });

  it('bỏ giá trị khớp mẫu giangvienNN dù nó lọt vào cột BL1+BL2', async () => {
    const workbook = buildWorkbook(
      [{ 5: 'ITA107', 10: 'AI21301', 12: 'giangvien07', 13: 1 }],
      [],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.lecturerName).toBeNull();
  });

  it('dòng chỉ có ở "Lịch tool" vẫn tạo lớp, lecturerName null', async () => {
    const workbook = buildWorkbook(
      [],
      [
        {
          2: 'WD20301',
          3: 'WEB2064',
          4: 'giangvien01',
          5: 'S2',
          6: '357',
          8: 2,
          11: 'PM',
        },
      ],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].payload).toMatchObject({
      subjectCode: 'WEB2064',
      classCode: 'WD20301',
      block: 2,
      lecturerName: null,
    });
  });

  it('dòng chỉ có ở "BL1+BL2" vẫn tạo lớp, trường lịch lấy từ chính nó', async () => {
    const workbook = buildWorkbook(
      [
        {
          5: 'SOF1021',
          10: 'SD20301',
          12: 'Trần Thị B',
          13: 2,
          14: 'S3',
          16: '246',
          20: 25,
          26: 60,
        },
      ],
      [],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload).toMatchObject({
      subjectCode: 'SOF1021',
      classCode: 'SD20301',
      block: 2,
      slot: 'S3',
      weekdays: '246',
      capacity: 25,
      totalHours: 60,
      lecturerName: 'Trần Thị B',
    });
  });

  it('khoá merge gồm cả block — cùng môn cùng lớp khác block là hai dòng', async () => {
    const workbook = buildWorkbook(
      [
        { 5: 'ITA107', 10: 'AI21301', 12: 'GV Một', 13: 1 },
        { 5: 'ITA107', 10: 'AI21301', 12: 'GV Hai', 13: 2 },
      ],
      [],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.payload.lecturerName)).toEqual([
      'GV Một',
      'GV Hai',
    ]);
  });

  it('cột Block ở "BL1+BL2" thật ra tên là "Block triển khai" — vẫn merge đúng khoá', async () => {
    // Phát hiện ở Bước 10 (verify file thật): header cột 13 của BL1+BL2 là
    // "Block triển khai", không phải "Block" như fixture giả định. Nếu cột
    // này không được nhận diện, block luôn đọc ra null ở nhánh BL1+BL2 →
    // khoá merge (môn|lớp|block) không bao giờ khớp với "Lịch tool" (vốn có
    // block thật), khiến mỗi lớp bị tách thành 2 dòng thay vì merge thành 1.
    const workbook = buildWorkbook([], []);
    const bl = workbook.getWorksheet('BL1+BL2')!;
    bl.getRow(8).getCell(13).value = 'Block triển khai';
    setRow(bl, 9, {
      5: 'ITA107',
      10: 'AI21301',
      12: 'Nguyễn Văn Thật',
      13: 1,
    });
    const tool = workbook.getWorksheet('Lịch tool')!;
    setRow(tool, 2, {
      2: 'AI21301',
      3: 'ITA107',
      4: 'giangvien12',
      5: 'S1',
      8: 1,
    });
    const result = await parser.parse(workbook, ctx);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].payload).toMatchObject({
      subjectCode: 'ITA107',
      classCode: 'AI21301',
      block: 1,
      slot: 'S1',
      lecturerName: 'Nguyễn Văn Thật',
    });
  });

  it('ô "Thời gian bắt đầu" kiểu Text "dd/mm/yyyy" đọc đúng tháng, không lệch sang M/D/Y', async () => {
    const workbook = buildWorkbook(
      [{ 5: 'ITA107', 10: 'AI21301', 13: 1, 19: '11/05/2026' }],
      [],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.startDate).toBe('2026-05-11T00:00:00.000Z');
  });

  it('ô "Thời gian bắt đầu" chấp nhận "d/m/yyyy" một chữ số', async () => {
    const workbook = buildWorkbook(
      [{ 5: 'ITA107', 10: 'AI21301', 13: 1, 19: '1/5/2026' }],
      [],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.startDate).toBe('2026-05-01T00:00:00.000Z');
  });

  it('ô "Thời gian bắt đầu" ngày không hợp lệ (31/02) → null', async () => {
    const workbook = buildWorkbook(
      [{ 5: 'ITA107', 10: 'AI21301', 13: 1, 19: '31/02/2026' }],
      [],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.startDate).toBeNull();
  });

  it('ô "Thời gian bắt đầu" không phải định dạng ngày → null', async () => {
    const workbook = buildWorkbook(
      [{ 5: 'ITA107', 10: 'AI21301', 13: 1, 19: 'hôm nay' }],
      [],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.startDate).toBeNull();
  });

  it('ô "Thời gian bắt đầu" kiểu Date thật của Excel giữ nguyên đường đi hiện tại', async () => {
    const realDate = new Date(Date.UTC(2026, 4, 11));
    const workbook = buildWorkbook(
      [{ 5: 'ITA107', 10: 'AI21301', 13: 1, 19: realDate }],
      [],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.startDate).toBe(realDate.toISOString());
  });

  it('số thực ở "Số giờ" bị làm tròn thành số nguyên (cột Int? ở Prisma)', async () => {
    const workbook = buildWorkbook(
      [{ 5: 'ITA107', 10: 'AI21301', 13: 1, 20: 30, 26: 22.5 }],
      [],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.totalHours).toBe(23);
    expect(Number.isInteger(result.rows[0].payload.totalHours)).toBe(true);
  });

  it('hai dòng trùng khoá ở "Lịch tool" → cảnh báo số va chạm', async () => {
    const workbook = buildWorkbook(
      [],
      [
        { 2: 'AI21301', 3: 'ITA107', 5: 'S1', 8: 1 },
        { 2: 'AI21301', 3: 'ITA107', 5: 'S2', 8: 1 },
      ],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows).toHaveLength(1);
    expect(result.warnings.join(' ')).toContain('1 dòng trùng khoá');
    expect(result.warnings.join(' ')).toContain('Lịch tool');
  });

  it('BL1+BL2 không xoá tên giảng viên thật đã có bằng giá trị null tới sau', async () => {
    // Hai dòng BL1+BL2 cùng khoá (môn, lớp, block): dòng đầu có tên thật,
    // dòng sau không có tên (rỗng). Tên thật phải được giữ lại, không bị
    // ghi đè bởi null.
    const workbook = buildWorkbook(
      [
        { 5: 'ITA107', 10: 'AI21301', 12: 'Nguyễn Văn Thật', 13: 1 },
        { 5: 'ITA107', 10: 'AI21301', 12: '', 13: 1 },
      ],
      [],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].payload.lecturerName).toBe('Nguyễn Văn Thật');
  });

  it('dòng thiếu mã môn hoặc lớp bị đánh lỗi', async () => {
    const workbook = buildWorkbook([{ 5: '', 10: 'AI21301', 13: 1 }], []);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].error).toContain('Mã môn');
  });

  it('cảnh báo nêu số lớp chưa phân công giảng viên', async () => {
    const workbook = buildWorkbook(
      [
        { 5: 'A1', 10: 'AI21301', 12: 'GV Một', 13: 1 },
        { 5: 'A2', 10: 'AI21301', 12: '', 13: 1 },
        { 5: 'A3', 10: 'AI21301', 12: '', 13: 1 },
      ],
      [],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.warnings.join(' ')).toContain('2/3');
  });

  it('thiếu cả hai sheet → ném lỗi', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Khác');
    await expect(parser.parse(workbook, ctx)).rejects.toThrow('BL1+BL2');
  });
});
