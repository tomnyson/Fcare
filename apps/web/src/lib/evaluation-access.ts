import type { AuthUser, ClassSection } from './types';

const EVALUATOR_ROLES = ['LECTURER', 'HEAD_OF_DEPT', 'ADMIN'];
const ALL_SECTION_ROLES = ['HEAD_OF_DEPT', 'ADMIN'];

/** TBM/ADMIN nhận xét được mọi lớp của sinh viên; giảng viên thì không. */
export function seesAllSections(user: AuthUser): boolean {
  return user.roles.some((role) => ALL_SECTION_ROLES.includes(role));
}

/** Giảng viên chỉ nhận xét lớp mình đứng lớp — khớp ràng buộc phía API. */
export function canEvaluateSection(
  user: AuthUser,
  section: Pick<ClassSection, 'lecturerId'>,
): boolean {
  if (!user.roles.some((role) => EVALUATOR_ROLES.includes(role))) return false;
  return seesAllSections(user) || section.lecturerId === user.id;
}
