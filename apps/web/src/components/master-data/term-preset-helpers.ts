import type { TermSeason } from '../../lib/types';

export interface TermPreset {
  code: string;
  name: string;
  season: TermSeason;
  year: number;
  startDate: string;
  endDate: string;
}

export function generateTermPreset(year: number, season: TermSeason): TermPreset {
  const yy = String(year).slice(-2);
  let prefix = 'SP';
  let namePrefix = 'Spring';
  let startDate = `${year}-01-01`;
  let endDate = `${year}-04-30`;

  if (season === 'SUMMER') {
    prefix = 'SU';
    namePrefix = 'Summer';
    startDate = `${year}-05-01`;
    endDate = `${year}-08-31`;
  } else if (season === 'FALL') {
    prefix = 'FA';
    namePrefix = 'Fall';
    startDate = `${year}-09-01`;
    endDate = `${year}-12-31`;
  }

  return {
    code: `${prefix}${yy}`,
    name: `${namePrefix} ${year}`,
    season,
    year,
    startDate,
    endDate,
  };
}

export function formatDateForInput(date: string | Date | undefined): string {
  if (!date) return '';
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function seasonLabel(season: TermSeason): string {
  switch (season) {
    case 'SPRING':
      return 'Xuân';
    case 'SUMMER':
      return 'Hè';
    case 'FALL':
      return 'Thu';
  }
}

export function seasonBadgeInfo(season: TermSeason): { icon: string; label: string } {
  switch (season) {
    case 'SPRING':
      return { icon: '🌸', label: 'Xuân' };
    case 'SUMMER':
      return { icon: '☀️', label: 'Hè' };
    case 'FALL':
      return { icon: '🍂', label: 'Thu' };
  }
}
