import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PinCodeInput, applyPinDigit, erasePinDigit } from './pin-code-input';

describe('PinCodeInput helpers', () => {
  it('applyPinDigit chỉ giữ chữ số cuối cùng và điền vào đúng ô', () => {
    expect(applyPinDigit('12', 2, 'a7', 6)).toEqual({ value: '127', nextIndex: 3 });
  });

  it('applyPinDigit bỏ qua ký tự không phải số', () => {
    expect(applyPinDigit('12', 2, 'x', 6)).toEqual({ value: '12', nextIndex: 2 });
  });

  it('applyPinDigit không vượt quá độ dài', () => {
    expect(applyPinDigit('12345', 5, '6', 6)).toEqual({ value: '123456', nextIndex: 5 });
  });

  it('erasePinDigit xoá ô hiện tại nếu có, ngược lại lùi về ô trước', () => {
    expect(erasePinDigit('123', 2)).toEqual({ value: '12', nextIndex: 2 });
    expect(erasePinDigit('12', 2)).toEqual({ value: '1', nextIndex: 1 });
    expect(erasePinDigit('', 0)).toEqual({ value: '', nextIndex: 0 });
  });
});

describe('PinCodeInput markup', () => {
  it('render đúng số ô, mỗi ô có nhãn và inputMode numeric', () => {
    const html = renderToStaticMarkup(
      h(PinCodeInput, { id: 'restore-pin', value: '65', length: 6, onChange: () => undefined }),
    );
    expect(html.match(/<input/g)).toHaveLength(6);
    expect(html).toMatch(/inputmode="numeric"/i);
    expect(html).toContain('aria-label="Chữ số thứ 1"');
    expect(html).toContain('id="restore-pin-0"');
    expect(html).toContain('value="6"');
    expect(html).toContain('value="5"');
  });

  it('gắn aria-invalid khi invalid', () => {
    const html = renderToStaticMarkup(
      h(PinCodeInput, { id: 'p', value: '', length: 4, onChange: () => undefined, invalid: true }),
    );
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(4);
  });
});
