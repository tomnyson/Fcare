import { cookies } from 'next/headers';
import { LoginView } from './login-view';

const SESSION_COOKIE = 'fcare_refresh';

/** Đọc cookie phía server để người chưa đăng nhập thấy form ngay, không nháy "đang kiểm tra". */
export default async function LoginPage() {
  const hasSession = (await cookies()).has(SESSION_COOKIE);
  return <LoginView checkSession={hasSession} />;
}
