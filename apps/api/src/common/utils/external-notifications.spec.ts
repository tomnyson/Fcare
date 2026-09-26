import type { ConfigService } from '@nestjs/config';
import { isExternalNotificationsDisabled } from './external-notifications';

function configWith(value: string | undefined) {
  return {
    get: jest.fn((key: string) =>
      key === 'NOTIFICATIONS_EXTERNAL_DISABLED' ? value : undefined,
    ),
  } as unknown as ConfigService;
}

describe('isExternalNotificationsDisabled — chặn email + push theo .env', () => {
  it.each(['true', 'TRUE', '1', ' yes ', 'on'])('"%s" → chặn', (value) => {
    expect(isExternalNotificationsDisabled(configWith(value))).toBe(true);
  });

  it.each([undefined, '', 'false', '0', 'no', 'off'])(
    '"%s" → vẫn gửi',
    (value) => {
      expect(isExternalNotificationsDisabled(configWith(value))).toBe(false);
    },
  );
});
