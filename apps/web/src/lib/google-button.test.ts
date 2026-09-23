import { describe, expect, it } from 'vitest';
import { googleButtonOptions } from './google-button';

describe('googleButtonOptions — nút Google vừa khung, không kéo form tràn màn hình', () => {
  it('khung rộng → cỡ thiết kế 360, nhãn "Tiếp tục với Google"', () => {
    expect(googleButtonOptions(384)).toEqual({ width: 360, text: 'continue_with' });
  });
  it('khung hẹp (mobile 320 trừ lề) → theo khung; nhãn ngắn vì nhãn dài tiếng Việt cần ~296px', () => {
    expect(googleButtonOptions(272)).toEqual({ width: 272, text: 'signin_with' });
  });
  it('không xuống dưới mức Google chấp nhận (200)', () => {
    expect(googleButtonOptions(0).width).toBe(200);
  });
});
