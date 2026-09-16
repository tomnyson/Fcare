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
