import { describe, expect, it } from 'vitest';
import {
  countUnread,
  formatUnreadBadge,
  groupMessagesByDay,
  latestDiscussionMessageId,
} from './discussion';
import type { DiscussionMessage } from './types';

function message(
  id: string,
  createdAt: string,
  authorId = 'gv-2',
  deletedAt: string | null = null,
): DiscussionMessage {
  return {
    id,
    // API che nội dung tin đã thu hồi (`maskRecalled` trả null) — fixture phải
    // nói đúng sự thật đó, nếu không test sẽ khẳng định một hình dạng dữ liệu
    // mà server không bao giờ trả.
    body: deletedAt === null ? `noi dung ${id}` : null,
    deletedAt,
    createdAt,
    author: { id: authorId, staffCode: 'GV2', fullName: 'Giảng viên 2' },
  };
}

describe('groupMessagesByDay', () => {
  it('gom các tin cùng ngày vào một nhóm, giữ thứ tự tăng dần', () => {
    const groups = groupMessagesByDay([
      message('a', '2026-09-01T01:00:00.000Z'),
      message('b', '2026-09-01T09:00:00.000Z'),
      message('c', '2026-09-02T02:00:00.000Z'),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].messages.map((m) => m.id)).toEqual(['a', 'b']);
    expect(groups[1].messages.map((m) => m.id)).toEqual(['c']);
    expect(groups[0].label).toBeTruthy();
  });

  it('danh sách rỗng trả mảng rỗng', () => {
    expect(groupMessagesByDay([])).toEqual([]);
  });
});

describe('countUnread', () => {
  const messages = [
    message('a', '2026-09-01T01:00:00.000Z', 'gv-2'),
    message('b', '2026-09-01T03:00:00.000Z', 'gv-1'), // của chính mình
    message('c', '2026-09-01T05:00:00.000Z', 'gv-2'),
    message('d', '2026-09-01T06:00:00.000Z', 'gv-2', '2026-09-01T07:00:00.000Z'), // đã thu hồi
  ];

  it('chỉ đếm tin của người khác, chưa thu hồi, sau mốc đã đọc', () => {
    expect(countUnread(messages, '2026-09-01T02:00:00.000Z', 'gv-1')).toBe(1);
  });

  it('chưa từng đọc thì đếm mọi tin của người khác chưa thu hồi', () => {
    expect(countUnread(messages, null, 'gv-1')).toBe(2);
  });

  it('đã đọc tới sau tin cuối thì bằng 0', () => {
    expect(countUnread(messages, '2026-09-02T00:00:00.000Z', 'gv-1')).toBe(0);
  });
});

describe('formatUnreadBadge', () => {
  it('không có tin chưa đọc → không vẽ badge', () => {
    expect(formatUnreadBadge(0)).toBeNull();
    expect(formatUnreadBadge(-1)).toBeNull();
  });

  it('số nhỏ hiển thị nguyên số', () => {
    expect(formatUnreadBadge(1)).toBe('1');
    expect(formatUnreadBadge(99)).toBe('99');
  });

  it('quá 99 thì rút gọn để không phá bố cục badge', () => {
    expect(formatUnreadBadge(100)).toBe('99+');
    expect(formatUnreadBadge(4210)).toBe('99+');
  });
});

describe('latestDiscussionMessageId', () => {
  const notification = (id: string, discussionMessageId: string | null) => ({
    id,
    discussionMessageId,
  });

  it('trả tin trao đổi mới nhất (danh sách đã sắp giảm dần theo thời gian)', () => {
    expect(
      latestDiscussionMessageId([
        notification('n3', null),
        notification('n2', 'msg-9'),
        notification('n1', 'msg-1'),
      ]),
    ).toBe('msg-9');
  });

  it('không có thông báo trao đổi nào → null', () => {
    expect(latestDiscussionMessageId([notification('n1', null)])).toBeNull();
    expect(latestDiscussionMessageId([])).toBeNull();
    expect(latestDiscussionMessageId(undefined)).toBeNull();
  });
});
