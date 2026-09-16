import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  PgRunnerService,
  type PostgresConnectionParams,
} from './pg-runner.service';

describe('PgRunnerService', () => {
  let service: PgRunnerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PgRunnerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'DATABASE_URL') {
                return 'postgresql://fcare_user:secret_pass@db.example.com:5433/fcare_prod?schema=public';
              }
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PgRunnerService>(PgRunnerService);
  });

  describe('parseDatabaseUrl', () => {
    it('should correctly parse standard postgresql URL with credentials and port', () => {
      const parsed: PostgresConnectionParams = service.parseDatabaseUrl(
        'postgresql://admin_user:p%40ssword@127.0.0.1:5432/my_database?schema=public',
      );

      expect(parsed.host).toBe('127.0.0.1');
      expect(parsed.port).toBe(5432);
      expect(parsed.username).toBe('admin_user');
      expect(parsed.password).toBe('p@ssword');
      expect(parsed.database).toBe('my_database');
    });

    it('should default port to 5432 if omitted in URL', () => {
      const parsed = service.parseDatabaseUrl(
        'postgresql://fcare:secret@localhost/fcare_db',
      );
      expect(parsed.host).toBe('localhost');
      expect(parsed.port).toBe(5432);
      expect(parsed.database).toBe('fcare_db');
    });

    it('should throw BadRequestException if database name is missing', () => {
      expect(() =>
        service.parseDatabaseUrl('postgresql://localhost:5432/'),
      ).toThrow();
    });
  });

  describe('getConnectionParams', () => {
    it('should retrieve parsed params from ConfigService DATABASE_URL', () => {
      const params = service.getConnectionParams();
      expect(params.host).toBe('db.example.com');
      expect(params.port).toBe(5433);
      expect(params.username).toBe('fcare_user');
      expect(params.password).toBe('secret_pass');
      expect(params.database).toBe('fcare_prod');
    });
  });
});
