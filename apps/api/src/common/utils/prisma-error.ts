import { Prisma } from '@prisma/client';

/** Kiểm tra lỗi Prisma theo mã (P2002 = trùng unique, P2003 = vi phạm khóa ngoại, P2025 = không tìm thấy). */
export function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}
