import type { SystemErrorSource } from '@prisma/client';
import type { CapturedError } from './monitoring.types';
import { sanitizeLogMessage, sanitizeStack } from './sanitize-log-text';

/**
 * Bắt log mức error/fatal ngay trong pino (`hooks.logMethod`) — một điểm duy
 * nhất phủ cả `Logger.error` của Nest, log 5xx của pino-http và log của queue.
 *
 * Hook chạy trước khi Nest khởi tạo DI nên KHÔNG thể inject service; thay vào
 * đó đẩy vào `errorSink` (singleton cấp module), `ErrorCollectorService` định
 * kỳ rút ra và ghi DB. Bộ đệm có trần để một cơn bão lỗi không ăn hết RAM.
 */
export const MAX_BUFFERED_ERRORS = 1000;
const PINO_ERROR = 50;
const PINO_FATAL = 60;

export class ErrorSink {
  private buffer: CapturedError[] = [];
  private dropped = 0;

  push(event: CapturedError): void {
    if (this.buffer.length >= MAX_BUFFERED_ERRORS) {
      this.dropped += 1;
      return;
    }
    this.buffer.push(event);
  }

  drain(): { events: CapturedError[]; dropped: number } {
    const drained = { events: this.buffer, dropped: this.dropped };
    this.buffer = [];
    this.dropped = 0;
    return drained;
  }
}

export const errorSink = new ErrorSink();

interface HttpResLike {
  statusCode: number;
  req?: {
    method?: string;
    baseUrl?: string;
    originalUrl?: string;
    url?: string;
    route?: { path?: unknown };
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isHttpRes(value: unknown): value is HttpResLike {
  return isRecord(value) && typeof value.statusCode === 'number';
}

/** Đường dẫn thật → dạng mẫu: bỏ query, id (số/uuid/hex) → `:id`. */
function templatePath(path: string): string {
  return (
    path
      .split('?')[0]
      .split('/')
      .map((segment) =>
        /^(?:\d+|[0-9a-f-]{16,})$/i.test(segment) ? ':id' : segment,
      )
      .join('/') || '/'
  );
}

function httpRoute(res: HttpResLike): string | null {
  const req = res.req;
  if (!req) return null;
  const method = req.method ?? 'UNKNOWN';
  const routePath = typeof req.route?.path === 'string' ? req.route.path : null;
  const path =
    routePath !== null
      ? `${req.baseUrl ?? ''}${routePath}`
      : templatePath(req.originalUrl ?? req.url ?? '');
  return `${method} ${path.replace(/\/$/, '') || '/'}`;
}

function sourceOf(context: string | null, isHttp: boolean): SystemErrorSource {
  if (isHttp) return 'HTTP';
  if (context?.startsWith('Queue:')) return 'QUEUE';
  if (context === 'Process') return 'PROCESS';
  return 'APP';
}

/** Rút một lỗi đã che PII từ tham số gọi pino; không phải lỗi → null. */
export function extractCapturedError(
  args: readonly unknown[],
  level: number,
  at: Date,
): CapturedError | null {
  if (level < PINO_ERROR) return null;
  const obj = isRecord(args[0]) ? args[0] : null;
  const text = args.find((arg): arg is string => typeof arg === 'string');
  const err = obj?.err instanceof Error ? obj.err : null;
  const res = obj && isHttpRes(obj.res) ? obj.res : null;
  const context = typeof obj?.context === 'string' ? obj.context : null;

  // pino-http chỉ có câu chung chung "request errored" — lỗi gốc đáng giá hơn.
  const rawMessage = (res ? err?.message : text) ?? err?.message ?? text ?? '';
  return {
    level: level >= PINO_FATAL ? 'FATAL' : 'ERROR',
    source: sourceOf(context, res !== null),
    context,
    route: res ? httpRoute(res) : null,
    statusCode: res ? res.statusCode : null,
    message: sanitizeLogMessage(rawMessage),
    stack: sanitizeStack(err?.stack),
    at,
  };
}

type LogMethod = (...args: unknown[]) => void;

/** Hook `logMethod` cho pino. Bắt lỗi KHÔNG bao giờ được làm hỏng việc ghi log. */
export function createErrorCaptureHook(sink: ErrorSink) {
  return function logMethod(
    this: unknown,
    inputArgs: unknown[],
    method: LogMethod,
    level: number,
  ): void {
    if (level >= PINO_ERROR) {
      try {
        const event = extractCapturedError(inputArgs, level, new Date());
        if (event) sink.push(event);
      } catch {
        // Nuốt có chủ đích: ghi log lỗi ở đây sẽ gọi lại chính hook này.
      }
    }
    method.apply(this, inputArgs);
  };
}

export const errorCaptureHook = createErrorCaptureHook(errorSink);
