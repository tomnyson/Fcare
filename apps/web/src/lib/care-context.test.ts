import { describe, expect, it } from 'vitest';
import {
  careSectionGroups,
  defaultCareSectionId,
  sectionContextLabel,
  termSectionGroup,
} from './care-context';
import type { Enrollment } from './types';

const section = (id: string, term: string, lecturerId: string | null, name = `Môn ${id}`) => ({
  id,
  code: id.toUpperCase(),
  term,
  subjectId: `sub-${id}`,
  lecturerId,
  subject: { id: `sub-${id}`, code: `SUB${id}`, name },
});

const enrollment = (s: ReturnType<typeof section>) =>
  ({ id: `en-${s.id}`, classSection: s }) as unknown as Enrollment;

describe('sectionContextLabel — bối cảnh học kỳ + lớp + môn', () => {
  it('ghép học kỳ, mã lớp và tên môn', () => {
    expect(
      sectionContextLabel({ code: 'SA21301', term: 'FA26', subject: { code: 'SE1', name: 'Ứng dụng phần mềm' } }),
    ).toBe('FA26 · SA21301 · Ứng dụng phần mềm');
  });

  it('thiếu môn thì bỏ phần môn', () => {
    expect(sectionContextLabel({ code: 'SA21301', term: 'FA26' })).toBe('FA26 · SA21301');
  });
});

describe('careSectionGroups — lớp học phần sinh viên đang học, nhóm theo học kỳ', () => {
  it('học kỳ mới nhất lên đầu (FA > SU > SP, năm lớn hơn trước)', () => {
    const groups = careSectionGroups([
      enrollment(section('a', 'SP26', null)),
      enrollment(section('b', 'FA25', null)),
      enrollment(section('c', 'FA26', null)),
      enrollment(section('d', 'SU26', null)),
      enrollment(section('e', 'FA26', null)),
    ]);
    expect(groups.map((group) => group.term)).toEqual(['FA26', 'SU26', 'SP26', 'FA25']);
    expect(groups[0]?.sections.map((s) => s.id)).toEqual(['c', 'e']);
  });

  it('bỏ qua dòng không có lớp học phần', () => {
    expect(careSectionGroups([{ id: 'x' } as Enrollment])).toEqual([]);
  });
});

describe('defaultCareSectionId — chọn sẵn lớp phù hợp', () => {
  const groups = careSectionGroups([
    enrollment(section('a', 'FA26', 'gv-khac')),
    enrollment(section('b', 'FA26', 'me')),
    enrollment(section('c', 'SU26', 'me')),
  ]);

  it('ưu tiên lớp mình dạy trong học kỳ đang xem', () => {
    expect(defaultCareSectionId(groups, { term: 'FA26', userId: 'me' })).toBe('b');
  });

  it('không dạy lớp nào trong kỳ đang xem → lớp mình dạy gần nhất', () => {
    expect(defaultCareSectionId(groups, { term: 'SP26', userId: 'me' })).toBe('b');
  });

  it('không dạy lớp nào (vd CTSV) → lớp đầu của học kỳ đang xem, rồi của học kỳ mới nhất', () => {
    expect(defaultCareSectionId(groups, { term: 'SU26', userId: 'ctsv' })).toBe('c');
    expect(defaultCareSectionId(groups, { term: '', userId: 'ctsv' })).toBe('a');
  });

  it('sinh viên chưa học lớp nào → rỗng', () => {
    expect(defaultCareSectionId([], { term: 'FA26', userId: 'me' })).toBe('');
  });
});

describe('termSectionGroup — lớp học phần hiện trên thẻ hồ sơ', () => {
  const groups = careSectionGroups([
    enrollment(section('a', 'SU26', 'gv-1')),
    enrollment(section('b', 'FA26', 'gv-2')),
  ]);

  it('lấy đúng kỳ đang xem', () => {
    expect(termSectionGroup(groups, 'SU26')?.sections.map((s) => s.id)).toEqual(['a']);
  });

  it('kỳ đang xem không có lớp (hoặc chưa chọn kỳ) → kỳ mới nhất', () => {
    expect(termSectionGroup(groups, '')?.term).toBe('FA26');
    expect(termSectionGroup(groups, 'SP25')?.term).toBe('FA26');
  });

  it('chưa học lớp nào → null', () => {
    expect(termSectionGroup([], 'FA26')).toBeNull();
  });
});
