/** Khoá tra alias: cắt khoảng trắng + hạ chữ thường. */
export function aliasKey(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Phần gốc phải còn đủ dài để nhận dạng — "A1" → "a" là vô nghĩa. */
const MIN_BASE_LENGTH = 2;

/**
 * Bỏ hậu tố số của mã trong file để lấy phần gốc: "LTWE04" → "ltwe",
 * "LOGI01" → "logi", "6340302_01" → "6340302". Nhà trường đánh số theo khoá
 * tuyển sinh, phần gốc mới là ngành.
 *
 * Trả `null` khi không có hậu tố số ("UI_DP", "CE") hoặc bỏ xong còn quá ngắn —
 * những mã đó phải nổi lên ở bản xem trước để admin gán tay.
 */
export function baseAliasKey(raw: string): string | null {
  const match = /^(.*?)[_-]?\d+$/.exec(aliasKey(raw));
  const base = match?.[1] ?? '';
  return base.length >= MIN_BASE_LENGTH ? base : null;
}

/**
 * Tra map theo khoá chính xác trước; không có mới thử phần gốc.
 *
 * CHỈ dùng cho NGÀNH. Bộ môn cố ý tra khớp tuyệt đối: `departmentId` quyết định
 * ai nhìn thấy sinh viên (RULE 2), đoán sai là lộ dữ liệu sang bộ môn khác —
 * thà bỏ qua dòng và bắt admin gán tay.
 */
export function matchAlias<T>(
  map: ReadonlyMap<string, T>,
  raw: string,
): T | undefined {
  const exact = map.get(aliasKey(raw));
  if (exact !== undefined) {
    return exact;
  }
  const base = baseAliasKey(raw);
  return base === null ? undefined : map.get(base);
}

/** Bản Set của `matchAlias` — dùng để tính danh sách mã chưa ánh xạ. */
export function isAliasKnown(
  keys: ReadonlySet<string>,
  raw: string,
  allowBaseMatch: boolean,
): boolean {
  if (keys.has(aliasKey(raw))) {
    return true;
  }
  if (!allowBaseMatch) {
    return false;
  }
  const base = baseAliasKey(raw);
  return base !== null && keys.has(base);
}
