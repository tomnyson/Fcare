import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Chặn tái phát: câu lỗi viết trong code phải là tiếng Việt vì nó hiện thẳng
 * lên giao diện. Câu không có chữ có dấu nào bị coi là tiếng Anh.
 */

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

const EXCEPTION_MESSAGE = /new \w+Exception\(\s*(['"`])((?:(?!\1).)*)\1/g;
const DTO_MESSAGE = /\bmessage:\s*(['"`])((?:(?!\1).)*)\1/g;
const hasVietnamese = (text: string) => /[À-ỹ]/.test(text);

function englishMessages(): string[] {
  return sourceFiles(SRC).flatMap((file) => {
    const code = readFileSync(file, 'utf8');
    const patterns = file.includes('/dto/')
      ? [EXCEPTION_MESSAGE, DTO_MESSAGE]
      : [EXCEPTION_MESSAGE];
    return patterns.flatMap((pattern) =>
      [...code.matchAll(pattern)]
        .map((match) => match[2])
        .filter(
          (message) => /[a-z]{3}/i.test(message) && !hasVietnamese(message),
        )
        .map((message) => `${relative(SRC, file)}: "${message}"`),
    );
  });
}

describe('câu lỗi trả cho người dùng', () => {
  it('không có câu lỗi tiếng Anh viết cứng trong API', () => {
    expect(englishMessages()).toEqual([]);
  });
});
