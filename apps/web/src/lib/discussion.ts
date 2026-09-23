import type { DiscussionMessage } from './types';

interface DiscussionDayGroup {
  /** Khóa ngày dạng YYYY-MM-DD, dùng làm React key. */
  day: string;
  /** Nhãn hiển thị trên vạch ngăn ngày. */
  label: string;
  messages: DiscussionMessage[];
}

const DAY_LABEL = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function dayKey(iso: string): string {
  const date = new Date(iso);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Gom tin theo ngày (giờ địa phương) để chèn vạch ngăn ngày trong hội thoại.
 * Giữ nguyên thứ tự đầu vào — API đã trả tăng dần theo thời gian.
 */
export function groupMessagesByDay(messages: DiscussionMessage[]): DiscussionDayGroup[] {
  return messages.reduce<DiscussionDayGroup[]>((groups, message) => {
    const day = dayKey(message.createdAt);
    const last = groups[groups.length - 1];
    if (last?.day === day) {
      return [...groups.slice(0, -1), { ...last, messages: [...last.messages, message] }];
    }
    return [
      ...groups,
      { day, label: DAY_LABEL.format(new Date(message.createdAt)), messages: [message] },
    ];
  }, []);
}

/**
 * Số tin chưa đọc trong luồng: của người khác, chưa thu hồi, tạo sau mốc đã đọc.
 * `lastReadAt` null = chưa từng mở luồng.
 */
export function countUnread(
  messages: DiscussionMessage[],
  lastReadAt: string | null,
  currentStaffId: string,
): number {
  const readAt = lastReadAt ? new Date(lastReadAt).getTime() : 0;
  return messages.filter(
    (message) =>
      message.deletedAt === null &&
      message.author?.id !== currentStaffId &&
      new Date(message.createdAt).getTime() > readAt,
  ).length;
}

/** Quá ngưỡng này thì badge rút gọn để không phá bố cục nút trên thanh trên cùng. */
const BADGE_MAX = 99;

/** Nhãn badge chưa đọc; `null` = không vẽ badge (không có gì chưa đọc). */
export function formatUnreadBadge(count: number): string | null {
  if (count <= 0) {
    return null;
  }
  return count > BADGE_MAX ? `${BADGE_MAX}+` : `${count}`;
}

/**
 * Id tin trao đổi mới nhất trong danh sách thông báo (API trả giảm dần theo
 * thời gian). Nhánh polling dùng nó làm mốc "có tin trao đổi mới không" —
 * cùng tín hiệu `discussionMessageId` mà nhánh SSE đọc từ payload.
 */
export function latestDiscussionMessageId(
  notifications: readonly { discussionMessageId?: string | null }[] | undefined,
): string | null {
  return (
    notifications?.find((notification) => notification.discussionMessageId)?.discussionMessageId ??
    null
  );
}
