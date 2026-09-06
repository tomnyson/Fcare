import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';

/**
 * E2E của FCare chạy trên dữ liệu thật trong Postgres dev: các test import ghi
 * dữ liệu mà những test sau (sửa điểm, gán giảng viên) đọc lại. Vì vậy
 * `fullyParallel: false` + `workers: 1` là bắt buộc, không phải tuỳ chọn hiệu năng.
 *
 * Đặt `E2E_BASE_URL` khi đã có sẵn web + api đang chạy (khuyến nghị: đã build
 * lại bản mới nhất) — Playwright sẽ không tự khởi động server nữa.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Upload file Excel thật (7 sheet, ~1000 dòng) + commit vào Postgres mất vài
  // giây; mặc định 30s quá chặt cho bước ghi bảng điểm.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  // Web gọi thẳng API ở :3001, nên chỉ khởi động Next là chưa đủ — phải có cả hai.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'pnpm --filter @fcare/api dev',
          url: `${API_URL}/api/health`,
          reuseExistingServer: true,
          timeout: 180_000,
          stdout: 'ignore',
          stderr: 'pipe',
        },
        {
          command: 'pnpm dev',
          url: BASE_URL,
          reuseExistingServer: true,
          timeout: 180_000,
          stdout: 'ignore',
          stderr: 'pipe',
        },
      ],
});
