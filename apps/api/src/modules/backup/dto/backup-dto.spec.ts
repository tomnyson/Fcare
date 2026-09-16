import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBackupDto } from './create-backup.dto';
import { RestoreBackupDto } from './restore-backup.dto';
import { UpdateScheduleConfigDto } from './update-schedule-config.dto';

describe('Backup DTOs Validation', () => {
  describe('CreateBackupDto', () => {
    it('should validate valid comment', async () => {
      const dto = plainToInstance(CreateBackupDto, { comment: 'Valid note' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should validate empty comment as valid (optional)', async () => {
      const dto = plainToInstance(CreateBackupDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject comment longer than 255 chars', async () => {
      const dto = plainToInstance(CreateBackupDto, {
        comment: 'a'.repeat(256),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.maxLength).toBeDefined();
    });
  });

  describe('RestoreBackupDto', () => {
    it('should accept "XAC NHAN"', async () => {
      const dto = plainToInstance(RestoreBackupDto, {
        confirmation: 'XAC NHAN',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept "RESTORE"', async () => {
      const dto = plainToInstance(RestoreBackupDto, {
        confirmation: 'RESTORE',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid confirmation string', async () => {
      const dto = plainToInstance(RestoreBackupDto, { confirmation: 'wrong' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.isIn).toBeDefined();
    });

    it('should reject empty confirmation', async () => {
      const dto = plainToInstance(RestoreBackupDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('UpdateScheduleConfigDto', () => {
    it('should validate valid schedule config', async () => {
      const dto = plainToInstance(UpdateScheduleConfigDto, {
        enabled: true,
        cronExpression: '0 2 * * *',
        retentionCount: 7,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject non-boolean enabled', async () => {
      const dto = plainToInstance(UpdateScheduleConfigDto, {
        enabled: 'not-bool',
        cronExpression: '0 2 * * *',
        retentionCount: 7,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject retentionCount < 1', async () => {
      const dto = plainToInstance(UpdateScheduleConfigDto, {
        enabled: true,
        cronExpression: '0 2 * * *',
        retentionCount: 0,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.min).toBeDefined();
    });

    it('should reject retentionCount > 100', async () => {
      const dto = plainToInstance(UpdateScheduleConfigDto, {
        enabled: true,
        cronExpression: '0 2 * * *',
        retentionCount: 101,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.max).toBeDefined();
    });
  });
});
