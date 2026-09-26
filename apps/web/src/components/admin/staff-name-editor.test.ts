import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StaffNameEditor, staffNameChange } from './staff-name-editor';

describe('staffNameChange — chỉ gửi khi họ tên thật sự đổi', () => {
  it('trả họ tên đã bỏ khoảng trắng thừa khi khác tên hiện tại', () => {
    expect(staffNameChange('  Nguyễn Thanh Bình ', 'Nguyen Thanh Binh')).toBe('Nguyễn Thanh Bình');
  });

  it('giống tên hiện tại (sau khi trim) thì không có gì để lưu', () => {
    expect(staffNameChange(' Nguyễn Thanh Bình ', 'Nguyễn Thanh Bình')).toBeNull();
  });

  it('để trống thì không cho lưu', () => {
    expect(staffNameChange('   ', 'Nguyễn Thanh Bình')).toBeNull();
  });
});

describe('StaffNameEditor', () => {
  function render() {
    return renderToStaticMarkup(
      h(QueryClientProvider, {
        client: new QueryClient(),
        children: h(StaffNameEditor, {
          member: { id: 'st', fullName: 'Nguyễn Thanh Bình' },
          onSaved: () => undefined,
        }),
      }),
    );
  }

  it('ô họ tên điền sẵn tên hiện tại, có nhãn và giới hạn 200 ký tự như API', () => {
    const html = render();
    expect(html).toContain('for="staff-detail-name"');
    expect(html).toMatch(/id="staff-detail-name"[^>]*value="Nguyễn Thanh Bình"/);
    expect(html).toMatch(/id="staff-detail-name"[^>]*maxLength="200"/);
  });

  it('chưa sửa gì thì nút "Lưu họ tên" bị khoá', () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Lưu họ tên<\/button>/);
  });
});
