import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AlertRecipientsList,
  memberSummary,
  splitRecipientGroups,
  type RecipientGroup,
} from './alert-recipients-preview';

const groups: RecipientGroup[] = [
  {
    key: 'TEACHING_LECTURERS',
    minLevel: 1,
    members: [
      { id: 'a', fullName: 'Nguyễn Văn An' },
      { id: 'b', fullName: 'Trần Thị Bình' },
    ],
  },
  { key: 'STUDENT_AFFAIRS', minLevel: 3, members: [{ id: 'c', fullName: 'Lê Văn Chi' }] },
  { key: 'HEAD_OF_DEPT', minLevel: 3, members: [{ id: 'd', fullName: 'Phạm Dũng' }] },
  { key: 'TRAINING_OFFICE', minLevel: 4, members: [{ id: 'e', fullName: 'Võ Hoa' }] },
];

describe('splitRecipientGroups — theo ma trận flow.png', () => {
  it.each([
    [1, ['TEACHING_LECTURERS'], ['STUDENT_AFFAIRS', 'HEAD_OF_DEPT', 'TRAINING_OFFICE']],
    [2, ['TEACHING_LECTURERS'], ['STUDENT_AFFAIRS', 'HEAD_OF_DEPT', 'TRAINING_OFFICE']],
    [3, ['TEACHING_LECTURERS', 'STUDENT_AFFAIRS', 'HEAD_OF_DEPT'], ['TRAINING_OFFICE']],
    [4, ['TEACHING_LECTURERS', 'STUDENT_AFFAIRS', 'HEAD_OF_DEPT', 'TRAINING_OFFICE'], []],
  ])('mức %i', (level, included, later) => {
    const split = splitRecipientGroups(groups, level);
    expect(split.included.map((g) => g.key)).toEqual(included);
    expect(split.later.map((g) => g.key)).toEqual(later);
  });
});

describe('memberSummary', () => {
  it('liệt kê tối đa 3 tên, còn lại gộp "và N người khác"', () => {
    const members = ['A', 'B', 'C', 'D', 'E'].map((n) => ({ id: n, fullName: n }));
    expect(memberSummary(members)).toBe('A, B, C và 2 người khác');
    expect(memberSummary(members.slice(0, 2))).toBe('A, B');
  });

  it('nhóm rỗng thì nói rõ không có ai', () => {
    expect(memberSummary([])).toBe('Chưa có tài khoản nào đang hoạt động');
  });
});

describe('AlertRecipientsList', () => {
  it('mức 3: nêu GV, CTSV, TBM kèm tên; Đào tạo ghi "từ Mức 4"', () => {
    const html = renderToStaticMarkup(h(AlertRecipientsList, { groups, level: 3 }));
    expect(html).toContain('Mức 3 sẽ gửi thông báo tới');
    expect(html).toContain('Giảng viên đang dạy sinh viên');
    expect(html).toContain('Nguyễn Văn An, Trần Thị Bình');
    expect(html).toContain('Phòng Công tác sinh viên');
    expect(html).toContain('Trưởng bộ môn');
    expect(html).toContain('Phạm Dũng');
    const later = html.slice(html.indexOf('Chưa nhận ở mức này'));
    expect(later).toContain('Phòng Đào tạo');
    expect(later).toContain('từ Mức 4');
    expect(later).not.toContain('Võ Hoa');
  });

  it('mức 4: không còn nhóm nào "chưa nhận"', () => {
    const html = renderToStaticMarkup(h(AlertRecipientsList, { groups, level: 4 }));
    expect(html).not.toContain('Chưa nhận ở mức này');
    expect(html).toContain('Võ Hoa');
  });
});
