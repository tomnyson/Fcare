export interface ParsedStudentRow {
  raw: string;
  studentCode: string;
  fullName: string;
  isValid: boolean;
  error?: string;
}

const HEADER_KEYWORDS = ['mssv', 'mã sv', 'mã sinh viên', 'họ tên', 'họ và tên', 'stt'];

export function parseStudentInputText(text: string): ParsedStudentRow[] {
  if (!text || !text.trim()) {
    return [];
  }

  const lines = text.split(/\r?\n/);
  const rows: ParsedStudentRow[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    // Kiểm tra dòng tiêu đề để bỏ qua
    const lowerLine = line.toLowerCase();
    if (HEADER_KEYWORDS.some((kw) => lowerLine.startsWith(kw) && (lowerLine.includes('họ') || lowerLine.includes('tên')))) {
      continue;
    }

    let code = '';
    let name = '';

    // Phân tách ưu tiên theo tab, sau đó dấu phẩy, sau đó " - ", sau đó khoảng trắng
    if (line.includes('\t')) {
      const parts = line.split('\t').map((p) => p.trim()).filter(Boolean);
      code = parts[0] || '';
      name = parts.slice(1).join(' ');
    } else if (line.includes(',')) {
      const parts = line.split(',').map((p) => p.trim()).filter(Boolean);
      code = parts[0] || '';
      name = parts.slice(1).join(', ');
    } else if (line.includes(' - ')) {
      const parts = line.split(' - ').map((p) => p.trim()).filter(Boolean);
      code = parts[0] || '';
      name = parts.slice(1).join(' - ');
    } else {
      const match = line.match(/^([A-Za-z0-9_]+)\s+(.+)$/);
      if (match) {
        code = match[1];
        name = match[2];
      } else {
        code = line;
        name = '';
      }
    }

    code = code.trim().toUpperCase();
    name = name.trim();

    if (!code) {
      continue;
    }

    let isValid = true;
    let error: string | undefined;

    if (!name) {
      isValid = false;
      error = 'Thiếu họ tên sinh viên';
    } else if (!/^[A-Z0-9_]{3,20}$/.test(code)) {
      isValid = false;
      error = 'Mã sinh viên không hợp lệ (3-20 ký tự chữ và số)';
    }

    rows.push({
      raw: line,
      studentCode: code,
      fullName: name,
      isValid,
      error,
    });
  }

  return rows;
}
