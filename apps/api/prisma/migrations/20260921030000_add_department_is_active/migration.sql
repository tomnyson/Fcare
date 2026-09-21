-- Bật/tắt bộ môn theo cơ sở; mặc định bật để dữ liệu cũ không đổi hành vi.
ALTER TABLE "departments" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
