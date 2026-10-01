import { currentTermBlock, type TermBlock, type TermBlockWindow } from '@fcare/shared-types';

export function formatWeekdays(weekdays: string | null | undefined): string {
  if (!weekdays) return 'Chưa xếp thứ';
  if (/^[2-7]+$/.test(weekdays)) {
    const days = weekdays.split('').map((d) => `Thứ ${d === '7' ? '7' : d}`);
    return days.join(', ');
  }
  return weekdays;
}

export function formatSlot(
  slot: string | null | undefined,
  trainingTime: string | null | undefined,
): string {
  if (!slot && !trainingTime) return 'Chưa xếp ca';
  const parts: string[] = [];
  if (slot) parts.push(`Ca ${slot}`);
  if (trainingTime) parts.push(`(${trainingTime})`);
  return parts.join(' ');
}

/**
 * Block hiện tại của kỳ ĐANG XEM — chỉ có nghĩa khi đó là kỳ hiện tại; xem kỳ
 * khác → null. Cảnh báo điểm danh tự động chỉ phát cho lớp của block này.
 */
export function viewedTermBlock(
  term: (TermBlockWindow & { code: string }) | undefined,
  currentTermCode: string | undefined,
  now: Date = new Date(),
): TermBlock | null {
  if (!term || term.code !== currentTermCode) return null;
  return currentTermBlock(term, now);
}

export function blockOptionLabel(block: TermBlock, currentBlock: TermBlock | null): string {
  return block === currentBlock ? `Block ${block} — Block hiện tại` : `Block ${block}`;
}
