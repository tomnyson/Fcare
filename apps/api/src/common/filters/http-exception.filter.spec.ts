import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

interface Body {
  error: string;
  code?: string;
}

function run(exception: unknown): { status: number; body: Body } {
  const json = jest.fn<void, [Body]>();
  const status = jest.fn<{ json: typeof json }, [number]>(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return {
    status: status.mock.calls[0][0],
    body: json.mock.calls[0][0],
  };
}

describe('HttpExceptionFilter — lỗi trả cho người dùng bằng tiếng Việt', () => {
  it('dịch câu mặc định của guard phân quyền', () => {
    const { status, body } = run(new ForbiddenException('Forbidden resource'));
    expect(status).toBe(403);
    expect(body.error).toBe('Bạn không có quyền thực hiện thao tác này.');
  });

  it('dịch lỗi mặc định khi ném exception không kèm câu', () => {
    expect(run(new UnauthorizedException()).body.error).toBe(
      'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.',
    );
  });

  it('dịch từng câu trong mảng lỗi', () => {
    const { body } = run(
      new BadRequestException([
        'Validation failed (uuid is expected)',
        'Tên đã tồn tại.',
      ]),
    );
    expect(body.error).toBe(
      'Mã định danh trên đường dẫn không hợp lệ.; Tên đã tồn tại.',
    );
  });

  it('giữ nguyên câu tiếng Việt và mã lỗi nghiệp vụ', () => {
    const { body } = run(
      new ForbiddenException({
        message: 'Cần xác nhận cam kết.',
        code: 'CONSENT_REQUIRED',
      }),
    );
    expect(body).toMatchObject({
      error: 'Cần xác nhận cam kết.',
      code: 'CONSENT_REQUIRED',
    });
  });

  it('không đổi câu đã viết sẵn trong service', () => {
    expect(
      run(new NotFoundException('Không tìm thấy sinh viên.')).body.error,
    ).toBe('Không tìm thấy sinh viên.');
  });

  it('lỗi không xác định: câu chung, không lộ chi tiết', () => {
    const { status, body } = run(new Error('db password wrong'));
    expect(status).toBe(500);
    expect(body.error).toBe('Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.');
  });
});
