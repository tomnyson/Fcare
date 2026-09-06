import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../../lib/types';
import {
  buildNavSections,
  groupHasActive,
  isGroupOpen,
  isNavActive,
  type NavGroup,
  type NavNode,
} from './nav-tree';

function user(roles: AuthUser['roles']): AuthUser {
  return {
    id: 'u1',
    staffCode: 'GV001',
    fullName: 'Nguyễn Văn A',
    roles,
    departmentId: null,
    consented: true,
    mustChangePassword: false,
  };
}

function hrefs(nodes: readonly NavNode[]): string[] {
  return nodes.flatMap((node) =>
    node.kind === 'group'
      ? [...(node.href ? [node.href] : []), ...hrefs(node.children)]
      : [node.href],
  );
}

function findGroup(nodes: readonly NavNode[], id: string): NavGroup {
  for (const node of nodes) {
    if (node.kind !== 'group') continue;
    if (node.id === id) return node;
    const nested = node.children.find((child) => child.kind === 'group' && child.id === id);
    if (nested) return nested as NavGroup;
  }
  throw new Error(`Không tìm thấy nhóm ${id}`);
}

describe('nav-tree — dựng cây theo vai trò', () => {
  it('giảng viên chỉ thấy khu vực Chính', () => {
    const sections = buildNavSections(user(['LECTURER']));
    expect(sections.map((section) => section.id)).toEqual(['main']);
    expect(hrefs(sections[0].items)).not.toContain('/master-data/departments');
  });

  it('quản trị viên thấy đủ ba khu vực và đủ 6 danh mục Đào tạo', () => {
    const sections = buildNavSections(user(['ADMIN']));
    expect(sections.map((section) => section.id)).toEqual(['main', 'training', 'system']);
    const trainingHrefs = hrefs(sections[1].items).filter((href) => href.startsWith('/master-data/'));
    // Lớp học phần vừa là liên kết vừa là nhóm nên xuất hiện đúng một lần.
    expect(new Set(trainingHrefs).size).toBe(6);
  });

  it('cán bộ CTSV không thấy mục Import / Export nên không có khu vực Hệ thống', () => {
    const sections = buildNavSections(user(['SA_OFFICER']));
    expect(sections.map((section) => section.id)).not.toContain('system');
  });

  it('trưởng bộ môn thấy Import / Export nhưng không thấy Người dùng', () => {
    const sections = buildNavSections(user(['HEAD_OF_DEPT']));
    const system = sections.find((section) => section.id === 'system');
    expect(hrefs(system?.items ?? [])).toEqual(['/import-export']);
  });

  it('chỉ mục Cảnh báo mang chỉ số cảnh báo đang mở', () => {
    const main = buildNavSections(user(['LECTURER']))[0].items;
    const badged = main.filter((node) => node.kind === 'leaf' && node.badge === 'openAlerts');
    expect(badged).toHaveLength(1);
    expect(badged[0].kind === 'leaf' && badged[0].href).toBe('/alerts');
  });
});

describe('nav-tree — trạng thái mở/đóng', () => {
  const sections = buildNavSections(user(['ADMIN']));
  const program = findGroup(sections[1].items, 'program');
  const classSections = findGroup(sections[1].items, 'class-sections');

  it('isNavActive khớp chính nó và các trang con, không khớp tiền tố cụt', () => {
    expect(isNavActive('/students', '/students')).toBe(true);
    expect(isNavActive('/students/abc', '/students')).toBe(true);
    expect(isNavActive('/students-archive', '/students')).toBe(false);
  });

  it('nhóm nhận biết route đang mở nằm ở cấp con sâu', () => {
    expect(groupHasActive(program, '/master-data/class-major-rules')).toBe(true);
    expect(groupHasActive(classSections, '/master-data/majors')).toBe(false);
    expect(groupHasActive(classSections, '/master-data/class-sections')).toBe(true);
  });

  it('mặc định mở, người dùng gập lại thì đóng', () => {
    expect(isGroupOpen(program, '/dashboard', new Set())).toBe(true);
    expect(isGroupOpen(program, '/dashboard', new Set(['program']))).toBe(false);
  });

  it('nhóm đã gập vẫn bung ra khi điều hướng vào trang bên trong', () => {
    expect(isGroupOpen(program, '/master-data/majors', new Set(['program']))).toBe(true);
    expect(isGroupOpen(classSections, '/master-data/department-aliases', new Set(['class-sections']))).toBe(
      true,
    );
  });
});
