import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

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
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const envelope: ErrorEnvelope = {
        success: false,
        data: null,
        error: exception.message,
        statusCode: status,
      };

      if (typeof body === 'object' && body !== null) {
        const detail = body as { message?: string | string[]; code?: string };
        if (Array.isArray(detail.message)) {
          envelope.error = detail.message.join('; ');
        } else if (typeof detail.message === 'string') {
          envelope.error = detail.message;
        }
        if (typeof detail.code === 'string') {
          envelope.code = detail.code;
        }
      }

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
