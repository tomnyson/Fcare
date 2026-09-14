import { describe, expect, it } from 'vitest';
import {
  formatDateForInput,
  generateTermPreset,
  seasonBadgeInfo,
  seasonLabel,
} from './term-preset-helpers';

describe('term-preset-helpers', () => {
  describe('generateTermPreset', () => {
    it('sinh đúng dữ liệu cho kỳ Spring 2025', () => {
      const preset = generateTermPreset(2025, 'SPRING');
      expect(preset).toEqual({
        code: 'SP25',
        name: 'Spring 2025',
        season: 'SPRING',
        year: 2025,
        startDate: '2025-01-01',
        endDate: '2025-04-30',
      });
    });

    it('sinh đúng dữ liệu cho kỳ Summer 2025', () => {
      const preset = generateTermPreset(2025, 'SUMMER');
      expect(preset).toEqual({
        code: 'SU25',
        name: 'Summer 2025',
        season: 'SUMMER',
        year: 2025,
        startDate: '2025-05-01',
        endDate: '2025-08-31',
      });
    });

    it('sinh đúng dữ liệu cho kỳ Fall 2026', () => {
      const preset = generateTermPreset(2026, 'FALL');
      expect(preset).toEqual({
        code: 'FA26',
        name: 'Fall 2026',
        season: 'FALL',
        year: 2026,
        startDate: '2026-09-01',
        endDate: '2026-12-31',
      });
    });
  });

  describe('formatDateForInput', () => {
    it('chuyển ISO date string thành YYYY-MM-DD', () => {
      expect(formatDateForInput('2025-05-01T00:00:00.000Z')).toBe('2025-05-01');
    });

    it('giữ nguyên chuỗi đã là YYYY-MM-DD', () => {
      expect(formatDateForInput('2025-05-01')).toBe('2025-05-01');
    });

    it('trả về chuỗi rỗng nếu giá trị undefined hoặc rỗng', () => {
      expect(formatDateForInput(undefined)).toBe('');
      expect(formatDateForInput('')).toBe('');
    });
  });

  describe('seasonLabel & seasonBadgeInfo', () => {
    it('trả về nhãn tiếng Việt tương ứng', () => {
      expect(seasonLabel('SPRING')).toBe('Xuân');
      expect(seasonLabel('SUMMER')).toBe('Hè');
      expect(seasonLabel('FALL')).toBe('Thu');
    });

    it('trả về icon và màu badge', () => {
      expect(seasonBadgeInfo('SPRING').icon).toBe('🌸');
      expect(seasonBadgeInfo('SUMMER').icon).toBe('☀️');
      expect(seasonBadgeInfo('FALL').icon).toBe('🍂');
    });
  });
});
