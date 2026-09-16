import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface PostgresConnectionParams {
  host: string;
  port: number;
  username: string;
  password?: string;
  database: string;
}

export interface ResolvedPgBinaries {
  pgDump: string;
  pgRestore: string;
}

@Injectable()
export class PgRunnerService {
  private readonly logger = new Logger(PgRunnerService.name);
  private resolvedBinaries: ResolvedPgBinaries | null = null;

  constructor(private readonly config: ConfigService) {}

  /**
   * Phân tích chuỗi DATABASE_URL thành các tham số kết nối PostgreSQL
   */
  parseDatabaseUrl(databaseUrl: string): PostgresConnectionParams {
    try {
      const url = new URL(databaseUrl);
      const host = url.hostname || 'localhost';
      const port = url.port ? parseInt(url.port, 10) : 5432;
      const username = decodeURIComponent(url.username || 'postgres');
      const password = url.password
        ? decodeURIComponent(url.password)
        : undefined;
      const dbPath = url.pathname.replace(/^\//, '');

      if (!dbPath) {
        throw new Error('Database name is required');
      }

      return {
        host,
        port,
        username,
        password,
        database: dbPath,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`DATABASE_URL không hợp lệ: ${msg}`);
    }
  }

  /**
   * Lấy cấu hình kết nối từ ConfigService
   */
  getConnectionParams(): PostgresConnectionParams {
    const dbUrl = this.config.get<string>('DATABASE_URL');
    if (!dbUrl) {
      throw new InternalServerErrorException('DATABASE_URL chưa được cấu hình');
    }
    return this.parseDatabaseUrl(dbUrl);
  }

  /**
   * Dò tìm đường dẫn thực thi của pg_dump và pg_restore
   */
  resolveBinaries(): ResolvedPgBinaries {
    if (this.resolvedBinaries) {
      return this.resolvedBinaries;
    }

    const pgDumpEnv = this.config.get<string>('PG_DUMP_PATH');
    const pgRestoreEnv = this.config.get<string>('PG_RESTORE_PATH');

    let pgDump = pgDumpEnv && fs.existsSync(pgDumpEnv) ? pgDumpEnv : '';
    let pgRestore =
      pgRestoreEnv && fs.existsSync(pgRestoreEnv) ? pgRestoreEnv : '';

    if (!pgDump || !pgRestore) {
      // 1. Thử lệnh `which`
      try {
        if (!pgDump) {
          const found = execSync('which pg_dump 2>/dev/null', {
            encoding: 'utf8',
          }).trim();
          if (found && fs.existsSync(found)) pgDump = found;
        }
      } catch {
        // ignore
      }

      try {
        if (!pgRestore) {
          const found = execSync('which pg_restore 2>/dev/null', {
            encoding: 'utf8',
          }).trim();
          if (found && fs.existsSync(found)) pgRestore = found;
        }
      } catch {
        // ignore
      }
    }

    // 2. Thử các đường dẫn phổ biến trên macOS / Linux
    if (!pgDump || !pgRestore) {
      const candidateDirs = [
        '/opt/homebrew/opt/libpq/bin',
        '/usr/local/opt/libpq/bin',
        '/usr/local/bin',
        '/usr/bin',
      ];

      // Tìm trong Cellar Homebrew nếu có
      const cellarLibpq = '/opt/homebrew/Cellar/libpq';
      if (fs.existsSync(cellarLibpq)) {
        try {
          const versions = fs.readdirSync(cellarLibpq);
          for (const ver of versions.sort().reverse()) {
            candidateDirs.unshift(path.join(cellarLibpq, ver, 'bin'));
          }
        } catch {
          // ignore
        }
      }

      for (const dir of candidateDirs) {
        const dumpPath = path.join(dir, 'pg_dump');
        const restorePath = path.join(dir, 'pg_restore');

        if (!pgDump && fs.existsSync(dumpPath)) {
          pgDump = dumpPath;
        }
        if (!pgRestore && fs.existsSync(restorePath)) {
          pgRestore = restorePath;
        }
        if (pgDump && pgRestore) break;
      }
    }

    if (!pgDump || !pgRestore) {
      throw new InternalServerErrorException(
        'Không tìm thấy công cụ pg_dump hoặc pg_restore trên máy chủ. ' +
          'Vui lòng cài đặt postgresql-client hoặc chỉ định PG_DUMP_PATH / PG_RESTORE_PATH.',
      );
    }

    this.logger.log(
      `Sử dụng PostgreSQL binaries: pg_dump=${pgDump}, pg_restore=${pgRestore}`,
    );
    this.resolvedBinaries = { pgDump, pgRestore };
    return this.resolvedBinaries;
  }

  /**
   * Tạo bản sao lưu database vào tệp chỉ định (định dạng Custom Archive .dump)
   */
  async dumpToFile(targetPath: string): Promise<void> {
    const { pgDump } = this.resolveBinaries();
    const conn = this.getConnectionParams();

    const args = [
      '-h',
      conn.host,
      '-p',
      conn.port.toString(),
      '-U',
      conn.username,
      '-d',
      conn.database,
      '-Fc', // PostgreSQL Custom format (compressed zlib)
      '-b', // Include large objects
      '-f',
      targetPath,
    ];

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PGPASSWORD: conn.password || '',
    };

    return new Promise((resolve, reject) => {
      execFile(pgDump, args, { env }, (error, _stdout, stderr) => {
        if (error) {
          this.logger.error(`Lỗi thực thi pg_dump: ${stderr || error.message}`);
          return reject(
            new InternalServerErrorException(
              `Quá trình tạo bản sao lưu thất bại: ${stderr || error.message}`,
            ),
          );
        }
        resolve();
      });
    });
  }

  /**
   * Kiểm tra tính toàn vẹn của tệp dump bằng pg_restore --list
   */
  async validateDumpFile(filePath: string): Promise<boolean> {
    if (!fs.existsSync(filePath)) {
      throw new BadRequestException('Tệp sao lưu không tồn tại trên hệ thống');
    }

    const { pgRestore } = this.resolveBinaries();

    return new Promise((resolve, reject) => {
      execFile(pgRestore, ['--list', filePath], (error, stdout, stderr) => {
        if (error) {
          this.logger.error(
            `Tệp dump không hợp lệ: ${stderr || error.message}`,
          );
          return reject(
            new BadRequestException(
              `Tệp sao lưu không đúng định dạng hoặc đã bị hỏng: ${stderr || error.message}`,
            ),
          );
        }
        // Có danh sách mục TOC thì file hợp lệ
        resolve(stdout.length > 0);
      });
    });
  }

  /**
   * Phục hồi database từ tệp dump chỉ định
   */
  async restoreFromFile(sourcePath: string): Promise<void> {
    await this.validateDumpFile(sourcePath);
    const { pgRestore } = this.resolveBinaries();
    const conn = this.getConnectionParams();

    const args = [
      '-h',
      conn.host,
      '-p',
      conn.port.toString(),
      '-U',
      conn.username,
      '-d',
      conn.database,
      '--clean', // Drop database objects before recreating them
      '--if-exists', // Use IF EXISTS when dropping objects
      '--no-owner', // Do not output commands to set ownership of objects
      '--no-privileges', // Prevent restoration of access privileges (grant/revoke)
      sourcePath,
    ];

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PGPASSWORD: conn.password || '',
    };

    return new Promise((resolve, reject) => {
      execFile(pgRestore, args, { env }, (error, _stdout, stderr) => {
        // Trong PostgreSQL: pg_restore trả về mã 1 khi có cảnh báo không nghiêm trọng
        // (chẳng hạn drop table không tồn tại). Chỉ coi là lỗi khi có mã > 1.
        if (error && typeof error.code === 'number' && error.code > 1) {
          this.logger.error(
            `Lỗi nghiêm trọng khi chạy pg_restore: ${stderr || error.message}`,
          );
          return reject(
            new InternalServerErrorException(
              `Quá trình phục hồi thất bại: ${stderr || error.message}`,
            ),
          );
        }
        if (stderr) {
          this.logger.warn(`Thông điệp từ pg_restore: ${stderr}`);
        }
        resolve();
      });
    });
  }
}
