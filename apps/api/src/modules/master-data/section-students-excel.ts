import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export async function generateStudentsExcelTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Danh sách sinh viên');

  worksheet.columns = [
    { header: 'MSSV', key: 'studentCode', width: 16 },
    { header: 'Họ và tên', key: 'fullName', width: 32 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FF002855' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF0F4F8' },
  };
  headerRow.height = 24;

  worksheet.addRow({
    studentCode: 'PK04346',
    fullName: 'Hoàng Lê Minh Sang',
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function parseStudentsExcelBuffer(
  buffer: Buffer,
): Promise<Array<{ studentCode: string; fullName: string }>> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException('File không đúng định dạng Excel (.xlsx).');
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new BadRequestException('File Excel không có sheet dữ liệu.');
  }

  let mssvColIndex = -1;
  let nameColIndex = -1;
  let startRow = 2;

  // Dò tìm vị trí cột MSSV và Họ tên qua 10 dòng đầu
  for (let r = 1; r <= Math.min(10, worksheet.rowCount); r++) {
    const row = worksheet.getRow(r);
    row.eachCell((cell, colNumber) => {
      const text = cell.text.trim().toLowerCase();
      if (
        mssvColIndex === -1 &&
        (text === 'mssv' ||
          text.includes('mã sv') ||
          text.includes('mã sinh viên') ||
          text === 'student code' ||
          text === 'studentcode')
      ) {
        mssvColIndex = colNumber;
      }
      if (
        nameColIndex === -1 &&
        (text.includes('họ tên') ||
          text.includes('họ và tên') ||
          text.includes('ho ten') ||
          text.includes('ho va ten') ||
          text.includes('tên sinh viên') ||
          text === 'full name' ||
          text === 'fullname')
      ) {
        nameColIndex = colNumber;
      }
    });

    if (mssvColIndex !== -1 && nameColIndex !== -1) {
      startRow = r + 1;
      break;
    }
  }

  // Fallback mặc định cột 1 là MSSV, cột 2 là Họ tên nếu không nhận diện được header
  if (mssvColIndex === -1 || nameColIndex === -1) {
    mssvColIndex = 1;
    nameColIndex = 2;
    startRow = 2;
  }

  const results: Array<{ studentCode: string; fullName: string }> = [];
  const seenCodes = new Set<string>();

  for (let r = startRow; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const rawCode = row.getCell(mssvColIndex).text?.trim();
    const rawName = row.getCell(nameColIndex).text?.trim();

    if (!rawCode || !rawName) {
      continue;
    }

    const code = rawCode.toUpperCase();
    if (code === 'MSSV' || code === 'MÃ SV' || code === 'MÃ SINH VIÊN') {
      continue;
    }

    if (!seenCodes.has(code)) {
      seenCodes.add(code);
      results.push({ studentCode: code, fullName: rawName });
    }
  }

  return results;
}
