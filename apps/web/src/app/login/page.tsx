import { cookies } from 'next/headers';
import { recaptcha } from '../../lib/recaptcha';
import { LoginView } from './login-view';

const SESSION_COOKIE = 'fcare_refresh';

/**
 * Đọc cookie phía server để người chưa đăng nhập thấy form ngay, không nháy "đang kiểm tra".
 * Bật/tắt reCAPTCHA chỉ theo site key lúc build — không đọc header Host, vì sau
 * nginx Next chỉ thấy 127.0.0.1 và sẽ tắt nhầm ở production.
 */
export default async function LoginPage() {
  const hasSession = (await cookies()).has(SESSION_COOKIE);
  return <LoginView checkSession={hasSession} recaptchaEnabled={recaptcha.enabled} />;
}
