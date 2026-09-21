import OneSignal from 'react-onesignal';
import { derivePushState, type PushState } from './push-state';

const APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ?? '';

let initPromise: Promise<boolean> | null = null;

export function isPushConfigured(): boolean {
  return APP_ID.length > 0;
}

/** Khởi tạo SDK đúng một lần mỗi tab; thiếu cấu hình hoặc lỗi → false, không ném. */
export function initPush(): Promise<boolean> {
  if (!isPushConfigured() || typeof window === 'undefined') {
    return Promise.resolve(false);
  }
  initPromise ??= OneSignal.init({ appId: APP_ID, allowLocalhostAsSecureOrigin: true }).then(
    () => true,
    // Nhớ luôn thất bại: SDK không cho init lại trong cùng tab ("already initialized").
    (error: unknown) => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[push] OneSignal init thất bại — tắt push trình duyệt:', error);
      }
      return false;
    },
  );
  return initPromise;
}

/** Gắn thiết bị với cán bộ — định danh duy nhất gửi sang OneSignal là staff.id. */
export async function identifyPush(staffId: string): Promise<void> {
  if (!(await initPush())) return;
  await OneSignal.login(staffId).catch(() => undefined);
}

/** Gỡ định danh khi đăng xuất để máy dùng chung không nhận cảnh báo của người trước. */
export async function resetPush(): Promise<void> {
  if (!initPromise || !(await initPromise)) return;
  await OneSignal.logout().catch(() => undefined);
}

export async function readPushState(): Promise<PushState> {
  if (!(await initPush())) return 'unsupported';
  return derivePushState({
    supported: OneSignal.Notifications.isPushSupported(),
    permission: OneSignal.Notifications.permissionNative,
    optedIn: Boolean(OneSignal.User.PushSubscription.optedIn),
  });
}

/** Gọi từ thao tác bấm của người dùng — optIn tự hiện hộp xin quyền nếu chưa có. */
export async function enablePush(): Promise<void> {
  if (!(await initPush())) return;
  await OneSignal.User.PushSubscription.optIn();
}

export async function disablePush(): Promise<void> {
  if (!(await initPush())) return;
  await OneSignal.User.PushSubscription.optOut();
}

export function onPushChange(listener: () => void): () => void {
  let active = true;
  const handler = () => {
    if (active) listener();
  };
  void initPush().then((ready) => {
    if (!ready || !active) return;
    OneSignal.Notifications.addEventListener('permissionChange', handler);
    OneSignal.User.PushSubscription.addEventListener('change', handler);
  });
  return () => {
    active = false;
    if (!initPromise) return;
    OneSignal.Notifications.removeEventListener('permissionChange', handler);
    OneSignal.User.PushSubscription.removeEventListener('change', handler);
  };
}
