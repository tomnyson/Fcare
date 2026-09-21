import { describe, expect, it } from 'vitest';
import { DEFAULT_FEEDBACK_FORM_URL, resolveFeedbackUrl } from './feedback';

describe('resolveFeedbackUrl', () => {
  it('mặc định trỏ tới Google Form góp ý', () => {
    expect(DEFAULT_FEEDBACK_FORM_URL).toBe('https://forms.gle/JSb9D8g9yF51T2HKA');
    expect(resolveFeedbackUrl(undefined)).toBe(DEFAULT_FEEDBACK_FORM_URL);
    expect(resolveFeedbackUrl('   ')).toBe(DEFAULT_FEEDBACK_FORM_URL);
  });

  it('env ghi đè được bằng link https hợp lệ', () => {
    expect(resolveFeedbackUrl(' https://forms.gle/khac ')).toBe('https://forms.gle/khac');
  });

  it('bỏ qua giá trị không phải https để không mở link lạ', () => {
    expect(resolveFeedbackUrl('javascript:alert(1)')).toBe(DEFAULT_FEEDBACK_FORM_URL);
    expect(resolveFeedbackUrl('http://forms.gle/khac')).toBe(DEFAULT_FEEDBACK_FORM_URL);
    expect(resolveFeedbackUrl('khong-phai-url')).toBe(DEFAULT_FEEDBACK_FORM_URL);
  });
});
