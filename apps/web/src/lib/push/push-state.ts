export type PushState = 'unsupported' | 'default' | 'denied' | 'subscribed' | 'unsubscribed';

export function derivePushState(input: {
  supported: boolean;
  permission: NotificationPermission;
  optedIn: boolean;
}): PushState {
  if (!input.supported) return 'unsupported';
  if (input.permission === 'denied') return 'denied';
  if (input.permission === 'default') return 'default';
  return input.optedIn ? 'subscribed' : 'unsubscribed';
}

export const PUSH_STATE_COPY: Record<
  PushState,
  { label: string; hint: string | null; action: 'enable' | 'disable' | null }
> = {
  unsupported: { label: 'Trình duyệt không hỗ trợ thông báo', hint: null, action: null },
  default: {
    label: 'Bật thông báo trình duyệt',
    hint: 'Nhận cảnh báo Cao/Khẩn cấp cả khi đã đóng tab.',
    action: 'enable',
  },
  subscribed: {
    label: 'Thông báo trình duyệt: đang bật',
    hint: 'Cảnh báo Cao/Khẩn cấp sẽ hiện cả khi đã đóng tab.',
    action: 'disable',
  },
  unsubscribed: {
    label: 'Thông báo trình duyệt: đang tắt',
    hint: 'Bật lại để nhận cảnh báo Cao/Khẩn cấp khi đã đóng tab.',
    action: 'enable',
  },
  denied: {
    label: 'Trình duyệt đang chặn thông báo',
    hint: 'Mở cài đặt trang (biểu tượng ổ khoá cạnh địa chỉ) → cho phép Thông báo, rồi tải lại trang.',
    action: null,
  },
};
