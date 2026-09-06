import { buildExcelFixtures } from './fixtures/files';

/**
 * Sinh sẵn các file .xlsx phái sinh trước khi bất kỳ worker nào chạy, để 3
 * project trình duyệt dùng chung một bản và không ghi đè lên nhau.
 */
export default async function globalSetup(): Promise<void> {
  await buildExcelFixtures();
}
