import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MailSettingsView } from '../../lib/mail-settings';
import { MailStatusCard } from './mail-status-card';

const view: MailSettingsView = {
  host: 'localhost',
  port: 1025,
  secure: false,
  username: null,
  hasPassword: false,
  fromName: 'FCare',
  fromEmail: 'fcare-noreply@fpt.edu.vn',
  enabled: true,
  source: 'ENV',
  encryptionReady: true,
  externalDisabled: false,
  lastTestedAt: null,
  lastTestOk: null,
  updatedAt: null,
  updatedBy: null,
};

const render = (v: MailSettingsView) => renderToStaticMarkup(h(MailStatusCard, { view: v }));

describe('MailStatusCard — biến chặn gửi ra ngoài', () => {
  it('bình thường: không hiện thông báo chặn', () => {
    expect(render(view)).not.toContain('data-external-disabled');
  });

  it('NOTIFICATIONS_EXTERNAL_DISABLED bật: báo rõ email + push đang bị chặn, không ghi "Đang gửi mail"', () => {
    const html = render({ ...view, externalDisabled: true });
    expect(html).toContain('data-external-disabled');
    expect(html).toContain('role="alert"');
    expect(html).toContain('NOTIFICATIONS_EXTERNAL_DISABLED');
    expect(html).toMatch(/email và thông báo đẩy/i);
    expect(html).not.toContain('Đang gửi mail');
  });
});
