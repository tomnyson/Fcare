interface ProcessLike {
  on(event: 'uncaughtException', listener: (error: Error) => void): unknown;
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown;
}

export interface CrashHandlerOptions {
  proc: ProcessLike;
  /**
   * Logger context `Process` — hook pino gom vào giám sát với nguồn PROCESS.
   * Truyền `Error` (không phải chuỗi + stack) vì nestjs-pino chỉ tách stack
   * ở mức `error`; với `fatal` phải là đối tượng lỗi thì stack mới vào `err`.
   */
  logger: { fatal(error: Error): void };
  /** Ghi nốt lỗi đang nằm trong bộ đệm xuống DB trước khi tắt. */
  flush: () => Promise<void>;
  exit: (code: number) => void;
  flushTimeoutMs?: number;
}

const DEFAULT_FLUSH_TIMEOUT_MS = 2000;

function toCrashError(kind: string, reason: unknown): Error {
  const original = reason instanceof Error ? reason : null;
  const error = new Error(`${kind}: ${original?.message ?? String(reason)}`);
  if (original?.stack) error.stack = original.stack;
  return error;
}

/**
 * Lỗi không bắt được → log fatal, flush có giới hạn thời gian, thoát mã 1 để
 * Docker/PM2 khởi động lại. Trạng thái tiến trình lúc này không còn tin được
 * nên KHÔNG cố chạy tiếp.
 */
export function installCrashHandlers(options: CrashHandlerOptions): void {
  const { proc, logger, flush, exit } = options;
  const timeoutMs = options.flushTimeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS;
  let crashing = false;

  const crash = (kind: string, reason: unknown) => {
    logger.fatal(toCrashError(kind, reason));
    if (crashing) return;
    crashing = true;
    const timeout = new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs);
    });
    void Promise.race([flush().catch(() => undefined), timeout]).then(() =>
      exit(1),
    );
  };

  proc.on('uncaughtException', (error) => crash('uncaughtException', error));
  proc.on('unhandledRejection', (reason) =>
    crash('unhandledRejection', reason),
  );
}
