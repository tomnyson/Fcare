/** Mỗi học kỳ chia 2 block; lớp học phần mang `block` 1 | 2, null = học cả kỳ. */
export type TermBlock = 1 | 2;

export interface TermBlockWindow {
  startDate: Date | string;
  endDate: Date | string;
  /** ADMIN chốt tay block hiện tại (1 | 2); null/undefined = tự tính theo ngày. */
  currentBlockOverride?: number | null;
}

/**
 * Block đang học của kỳ: ưu tiên giá trị ADMIN ghi đè, không thì nửa đầu kỳ
 * (trước điểm giữa startDate–endDate) là block 1, còn lại block 2. Cảnh báo
 * điểm danh tự động chỉ phát cho lớp thuộc block này (hoặc lớp học cả kỳ).
 */
export function currentTermBlock(
  term: TermBlockWindow,
  now: Date = new Date(),
): TermBlock {
  if (term.currentBlockOverride === 1 || term.currentBlockOverride === 2) {
    return term.currentBlockOverride;
  }
  const start = new Date(term.startDate).getTime();
  const end = new Date(term.endDate).getTime();
  const midpoint = start + (end - start) / 2;
  return now.getTime() < midpoint ? 1 : 2;
}
