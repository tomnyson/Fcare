import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * HIGH-A — xoá sinh viên không được để lại thông báo MỒ CÔI mang nội dung.
 *
 * Chuỗi khoá ngoại: `discussion_messages.studentId → students` là CASCADE, nên
 * xoá sinh viên là xoá sạch tin trao đổi. Nếu `notifications.discussionMessageId`
 * là SET NULL thì dòng thông báo còn nguyên 120 ký tự cán bộ gõ, mất luôn con
 * trỏ về tin — và bộ tẩy duy nhất (`DiscussionsService.remove`) khoá theo đúng
 * cột vừa bị NULL nên không bao giờ với tới được nữa. Vĩnh viễn.
 *
 * Ràng buộc này sống ở SCHEMA + MIGRATION chứ không ở mã TypeScript, nên đây là
 * chỗ duy nhất canh được nó: cả hai đều phải nói cùng một điều, vì sửa schema mà
 * quên migration thì DB thật không đổi gì.
 */

const PRISMA_DIR = __dirname;
const schema = readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');

/** Thân của một `model` trong schema.prisma. */
function modelBody(name: string): string {
  const match = new RegExp(`\\nmodel ${name} \\{([\\s\\S]*?)\\n\\}`).exec(
    schema,
  );
  if (!match) {
    throw new Error(`Không tìm thấy model ${name} trong schema.prisma`);
  }
  return match[1];
}

/** Dòng khai báo quan hệ mang đúng `fields: [<field>]`. */
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

/** Câu lệnh tạo khoá ngoại MỚI NHẤT theo thứ tự migration được áp dụng. */
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

describe('HIGH-A — thông báo trao đổi phải chết theo tin, tin chết theo sinh viên', () => {
  it('tiền đề: xoá sinh viên là xoá tin trao đổi (studentId CASCADE)', () => {
    expect(relationLine('DiscussionMessage', 'studentId')).toContain(
      'onDelete: Cascade',
    );
  });

  it('schema: notifications.discussionMessageId phải Cascade, KHÔNG SetNull', () => {
    const line = relationLine('Notification', 'discussionMessageId');
    expect(line).toContain('onDelete: Cascade');
    expect(line).not.toContain('SetNull');
  });

  it('migration: khoá ngoại thực tế trên DB kết thúc ở ON DELETE CASCADE', () => {
    const statement = latestForeignKeyStatement(
      'notifications_discussionMessageId_fkey',
    );
    expect(statement).toContain('ON DELETE CASCADE');
    expect(statement).not.toContain('ON DELETE SET NULL');
  });
});
