import { cookies, headers } from 'next/headers';
import { isLocalhostDomain, recaptcha } from '../../lib/recaptcha';
import { LoginView } from './login-view';

const SESSION_COOKIE = 'fcare_refresh';

/** Đọc cookie phía server để người chưa đăng nhập thấy form ngay, không nháy "đang kiểm tra". */
export default async function LoginPage() {
  const hasSession = (await cookies()).has(SESSION_COOKIE);
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') || headerList.get('host') || '';
  const isLocal = isLocalhostDomain(host);
  const recaptchaEnabled = isLocal ? false : recaptcha.enabled;

  return <LoginView checkSession={hasSession} recaptchaEnabled={recaptchaEnabled} />;
}
