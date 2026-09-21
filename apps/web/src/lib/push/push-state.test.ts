import { describe, expect, it } from 'vitest';
import { PUSH_STATE_COPY, derivePushState } from './push-state';

describe('derivePushState', () => {
  it('trình duyệt không hỗ trợ → unsupported bất kể quyền', () => {
    expect(derivePushState({ supported: false, permission: 'granted', optedIn: true })).toBe(
      'unsupported',
    );
  });

  it('bị chặn → denied', () => {
    expect(derivePushState({ supported: true, permission: 'denied', optedIn: false })).toBe(
      'denied',
    );
  });

  it('chưa hỏi → default', () => {
    expect(derivePushState({ supported: true, permission: 'default', optedIn: false })).toBe(
      'default',
    );
  });

  it('đã cho phép + đang nhận → subscribed', () => {
    expect(derivePushState({ supported: true, permission: 'granted', optedIn: true })).toBe(
      'subscribed',
    );
  });

  it('đã cho phép nhưng tự tắt → unsubscribed', () => {
    expect(derivePushState({ supported: true, permission: 'granted', optedIn: false })).toBe(
      'unsubscribed',
    );
  });
});

describe('PUSH_STATE_COPY', () => {
  it('mỗi trạng thái có hành động đúng', () => {
    expect(PUSH_STATE_COPY.default.action).toBe('enable');
    expect(PUSH_STATE_COPY.unsubscribed.action).toBe('enable');
    expect(PUSH_STATE_COPY.subscribed.action).toBe('disable');
    expect(PUSH_STATE_COPY.denied.action).toBeNull();
    expect(PUSH_STATE_COPY.denied.hint).toMatch(/cài đặt/i);
  });
});
