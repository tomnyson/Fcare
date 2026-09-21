import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  FilterBar,
  FilterField,
  FilterGrid,
  FilterSearchInput,
  FilterSearchRow,
} from './filter-bar';

const noop = () => undefined;

function grid() {
  const field = h(FilterField, {
    label: 'Trạng thái',
    htmlFor: 'f-status',
    children: h('select', { id: 'f-status' }),
  });
  return h(FilterGrid, { children: field });
}

function render(withSearchRow: boolean, activeCount?: number) {
  const searchRow = h(FilterSearchRow, {
    key: 's',
    children: h(FilterSearchInput, { 'aria-label': 'Tìm' }),
  });
  const gridWrapper = h('div', { key: 'g' }, grid());
  const children = withSearchRow ? [searchRow, gridWrapper] : [gridWrapper];
  return renderToStaticMarkup(
    h(FilterBar, { label: 'Bộ lọc', onSubmit: noop, activeCount, children }),
  );
}

/** Lấy thẻ mở của phần tử đầu tiên chứa chuỗi `marker`. */
function openingTag(html: string, marker: string): string {
  const at = html.indexOf(marker);
  return html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1);
}

describe('FilterBar — thu gọn bộ lọc trên điện thoại', () => {
  it('mặc định lưới ô lọc ẩn dưới sm nhưng vẫn hiện từ sm trở lên', () => {
    const html = render(true);
    const gridTag = openingTag(html, 'data-filter-grid="true"');
    expect(gridTag).toContain('max-sm:hidden');
    expect(gridTag).toContain('sm:grid-cols-2');
  });

  it('nút bật/tắt bộ lọc nằm trong hàng tìm kiếm, chỉ hiện dưới sm, trỏ đúng lưới', () => {
    const html = render(true);
    const toggle = openingTag(html, 'data-filter-toggle="true"');
    expect(toggle).toContain('aria-expanded="false"');
    expect(toggle).toContain('sm:hidden');
    const controls = /aria-controls="([^"]+)"/.exec(toggle)?.[1];
    expect(controls).toBeTruthy();
    expect(openingTag(html, 'data-filter-grid="true"')).toContain(`id="${controls}"`);
    // Nút nằm trước lưới → nằm trong hàng tìm kiếm, không phải dải riêng.
    expect(html.indexOf('data-filter-toggle="true"')).toBeLessThan(
      html.indexOf('data-filter-grid="true"'),
    );
    // Dải nút riêng của lưới tự ẩn bằng CSS khi form có hàng tìm kiếm.
    expect(openingTag(html, 'data-filter-grid-toggle="true"')).toContain(
      'group-has-[[data-filter-search-row]]/filter:hidden',
    );
    expect(openingTag(html, '<form')).toContain('group/filter');
  });

  it('trang không có ô tìm kiếm vẫn có nút bật/tắt (đặt ngay trên lưới)', () => {
    const html = render(false);
    expect(html).not.toContain('data-filter-search-row="true"');
    expect(html.match(/data-filter-toggle="true"/g)).toHaveLength(1);
    expect(openingTag(html, 'data-filter-toggle="true"')).toContain('sm:hidden');
  });

  it('hiện số bộ lọc đang bật trên nút để biết đang lọc dù lưới đang ẩn', () => {
    expect(render(true, 3)).toContain('3 bộ lọc đang bật');
    expect(render(true, 0)).not.toContain('bộ lọc đang bật');
  });
});
