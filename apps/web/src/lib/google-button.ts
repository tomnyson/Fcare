/** Cỡ thiết kế của nút "Tiếp tục với Google" — Google chỉ nhận 200–400px. */
const GOOGLE_BUTTON_DESIGN_WIDTH = 360;
const GOOGLE_BUTTON_MIN_WIDTH = 200;
/**
 * Nhãn "Tiếp tục sử dụng dịch vụ bằng Google" (continue_with, hl=vi) không
 * xuống dòng và Google ép `min-width: min-content` ≈ 296px — hẹp hơn thì nút
 * nở quá khung, kéo cả form (và ô reCAPTCHA) tràn ngang. Dưới ngưỡng này dùng
 * nhãn ngắn "Đăng nhập bằng Google".
 */
const LONG_LABEL_MIN_WIDTH = 300;

export interface GoogleButtonOptions {
  width: number;
  text: 'continue_with' | 'signin_with';
}

/** Tham số `renderButton` theo bề rộng thật của khung. */
export function googleButtonOptions(availableWidth: number): GoogleButtonOptions {
  const width = Math.max(
    GOOGLE_BUTTON_MIN_WIDTH,
    Math.min(GOOGLE_BUTTON_DESIGN_WIDTH, availableWidth),
  );
  return { width, text: width >= LONG_LABEL_MIN_WIDTH ? 'continue_with' : 'signin_with' };
}
