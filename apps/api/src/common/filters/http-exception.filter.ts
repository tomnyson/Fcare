import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { toVietnameseError } from './error-messages';

interface ErrorEnvelope {
  success: false;
  data: null;
  error: string;
  code?: string;
  statusCode: number;
}

/** Chuẩn hóa mọi lỗi về envelope { success: false, data: null, error, code }. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const detail =
        typeof body === 'object' && body !== null
          ? (body as { message?: string | string[]; code?: string })
          : {};
      const messages = Array.isArray(detail.message)
        ? detail.message
        : [
            typeof detail.message === 'string'
              ? detail.message
              : exception.message,
          ];
      const translated = messages.map(toVietnameseError);
      if (translated.some((message, index) => message !== messages[index])) {
        // Giữ câu gốc của framework trong log để gỡ lỗi; người dùng chỉ thấy tiếng Việt.
        this.logger.debug(`${status} ${messages.join('; ')}`);
      }

      const envelope: ErrorEnvelope = {
        success: false,
        data: null,
        error: translated.join('; '),
        statusCode: status,
        ...(typeof detail.code === 'string' ? { code: detail.code } : {}),
      };
      response.status(status).json(envelope);
      return;
    }

    // Lỗi không xác định: không lộ chi tiết nội bộ ra ngoài (pino đã log đầy đủ).
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      data: null,
      error: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    } satisfies ErrorEnvelope);
  }
}
