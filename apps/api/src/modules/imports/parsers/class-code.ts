/** Lớp hành chính: hai chữ cái ngành + hai chữ số khoá + ba chữ số, vd "SD20301". */
const ADMIN_CLASS_PATTERN = /^([A-Z]{2})(\d{2})\d{3}$/;

export type ClassKind = 'ADMIN' | 'SECTION';

export interface ParsedClassCode {
  kind: ClassKind;
  raw: string;
  /** Hai chữ số khoá — chỉ có ở lớp hành chính. */
  cohort: string | null;
  /** Hai chữ cái đầu, tra `ClassMajorRule` — chỉ có ở lớp hành chính. */
  majorPrefix: string | null;
}

/**
 * Cột `Lớp` của gradebook trộn hai loại mã (spec §2.1 đặc điểm 2):
 * lớp hành chính ("SD20301") và lớp học phần ("WEB2064.02", "WEB2072").
 */
export function parseClassCode(raw: string): ParsedClassCode | null {
  const value = raw.trim().toUpperCase();
  if (value === '') {
    return null;
  }

  const match = ADMIN_CLASS_PATTERN.exec(value);
  if (match) {
    return {
      kind: 'ADMIN',
      raw: value,
      cohort: match[2],
      majorPrefix: match[1],
    };
  }

  return { kind: 'SECTION', raw: value, cohort: null, majorPrefix: null };
}

/**
 * Mã lớp học phần trong DB. Với lớp hành chính phải ghép thêm mã môn vì một lớp
 * hành chính học nhiều môn; với lớp học phần thì bản thân mã đã gắn với môn rồi.
 */
export function buildSectionCode(
  subjectCode: string,
  parsed: ParsedClassCode,
  term: string,
): string {
  return parsed.kind === 'ADMIN'
    ? `${subjectCode}-${parsed.raw}-${term}`
    : `${parsed.raw}-${term}`;
}
