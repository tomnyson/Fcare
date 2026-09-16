import * as nodemailer from 'nodemailer';
import type { EffectiveMailConfig } from './mail-settings.types';

export type MailTransport = Pick<nodemailer.Transporter, 'verify' | 'sendMail'>;
export type MailTransportFactory = (
  config: EffectiveMailConfig,
) => MailTransport;

/** Điểm duy nhất tạo transporter — test thay bằng jest.fn() qua `transportFactory`. */
export const createMailTransport: MailTransportFactory = (config) =>
  nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth ?? undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
