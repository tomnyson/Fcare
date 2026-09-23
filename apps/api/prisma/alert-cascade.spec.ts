import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Xoá cảnh báo (ADMIN) — thông báo đã phát cho cảnh báo phải chết theo.
 *
 * `notifications.alertId` trước đây là SET NULL: xoá cảnh báo để lại dòng thông
 * báo mang tiêu đề "Cảnh báo … — <tên SV> (<mã SV>)" và lý do cảnh báo, mất con
 * trỏ về nguồn — không còn cách nào dọn. Đổi sang CASCADE để `alert.delete`
 * kéo theo thông báo trong cùng transaction DB.
 *
 * `care_logs.alertId` và `student_term_analysis_versions.alertId` GIỮ SET NULL:
 * nhật ký chăm sóc được service xoá tường minh trong transaction (chỉ những
 * nhật ký gắn cảnh báo), còn bản phân tích AI là lịch sử của sinh viên, chỉ
 * mất liên kết chứ không mất bản ghi.
 */

const PRISMA_DIR = __dirname;
const schema = readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');

function modelBody(name: string): string {
  const match = new RegExp(`\\nmodel ${name} \\{([\\s\\S]*?)\\n\\}`).exec(
    schema,
  );
  if (!match) {
    throw new Error(`Không tìm thấy model ${name} trong schema.prisma`);
  }
  return match[1];
}

function relationLine(model: string, field: string): string {
  const line = modelBody(model)
    .split('\n')
    .find((row) => row.includes(`fields: [${field}]`));
  if (!line) {
    throw new Error(
      `Không tìm thấy quan hệ theo ${field} trong model ${model}`,
    );
  }
  return line;
}

function latestForeignKeyStatement(constraint: string): string {
  const migrationsDir = join(PRISMA_DIR, 'migrations');
  const statements = readdirSync(migrationsDir)
    .filter((entry) => /^\d/.test(entry))
    .sort()
    .flatMap((entry) => {
      const sql = readFileSync(
        join(migrationsDir, entry, 'migration.sql'),
        'utf8',
      );
      return sql
        .split(';')
        .filter(
          (statement) =>
            statement.includes(constraint) && statement.includes('FOREIGN KEY'),
        );
    });
  if (statements.length === 0) {
    throw new Error(`Không migration nào tạo khoá ngoại ${constraint}`);
  }
  return statements[statements.length - 1];
}

describe('Xoá cảnh báo — thông báo chết theo cảnh báo, nhật ký/phân tích chỉ mất liên kết', () => {
  it('schema: notifications.alertId phải Cascade, KHÔNG SetNull', () => {
    const line = relationLine('Notification', 'alertId');
    expect(line).toContain('onDelete: Cascade');
    expect(line).not.toContain('SetNull');
  });

  it('migration: khoá ngoại notifications_alertId_fkey kết thúc ở ON DELETE CASCADE', () => {
    const statement = latestForeignKeyStatement('notifications_alertId_fkey');
    expect(statement).toContain('ON DELETE CASCADE');
    expect(statement).not.toContain('ON DELETE SET NULL');
  });

  it('care_logs.alertId giữ SetNull — service xoá tường minh trong transaction', () => {
    expect(relationLine('CareLog', 'alertId')).toContain('onDelete: SetNull');
    expect(latestForeignKeyStatement('care_logs_alertId_fkey')).toContain(
      'ON DELETE SET NULL',
    );
  });

  it('student_term_analysis_versions.alertId giữ SetNull — lịch sử phân tích không mất', () => {
    expect(relationLine('StudentTermAnalysisVersion', 'alertId')).toContain(
      'onDelete: SetNull',
    );
    expect(
      latestForeignKeyStatement('student_term_analysis_versions_alertId_fkey'),
    ).toContain('ON DELETE SET NULL');
  });
});
