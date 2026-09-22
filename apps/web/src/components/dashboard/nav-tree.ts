import {
  canViewTrainingArea,
  MASTER_DATA_TABS,
  type MasterDataTabKey,
} from '../../lib/master-data-tabs';
import { canSeeExcelMenu } from '../../lib/nav-access';
import { statisticsTabHref, visibleStatisticsTabs } from '../../lib/statistics-view';
import type { AuthUser } from '../../lib/types';
import {
  IconActivity,
  IconAlerts,
  IconDatabase,
  IconDepartments,
  IconHistory,
  IconMail,
  IconMajors,
  IconOverview,
  IconProgram,
  IconSections,
  IconSettings,
  IconStatistics,
  IconStudents,
  IconSubjects,
  IconTerms,
  IconTransfer,
  type NavIcon,
} from './nav-icons';

/**
 * Cây điều hướng của sidebar tách khỏi phần render để kiểm thử được bằng
 * vitest thuần (dự án chưa có jsdom). Cấp 3 (`Ánh xạ bộ môn`,
 * `Quy tắc lớp → ngành`) cố tình không có icon: chúng hiển thị bằng dấu chấm,
 * đúng như bản thiết kế.
 */

export interface NavLeaf {
  kind: 'leaf';
  href: string;
  label: string;
  icon?: NavIcon;
  /** Khoá của chỉ số hiển thị bên phải (hiện chỉ có cảnh báo đang mở). */
  badge?: 'openAlerts';
}

export interface NavGroup {
  kind: 'group';
  id: string;
  label: string;
  icon: NavIcon;
  /** Nhóm vừa là liên kết vừa gập được — bấm nhãn để đi, bấm mũi tên để gập. */
  href?: string;
  children: NavNode[];
}

export type NavNode = NavLeaf | NavGroup;

export interface NavSection {
  id: string;
  label: string;
  items: NavNode[];
}

const TRAINING_ICONS: Record<MasterDataTabKey, NavIcon | undefined> = {
  departments: IconDepartments,
  majors: IconMajors,
  subjects: IconSubjects,
  'class-sections': IconSections,
  terms: IconTerms,
  'department-aliases': undefined,
  'major-aliases': undefined,
  'class-major-rules': undefined,
};

function tab(key: MasterDataTabKey): NavLeaf {
  const found = MASTER_DATA_TABS.find((item) => item.key === key);
  if (!found) {
    throw new Error(`Thiếu mục danh mục Đào tạo: ${key}`);
  }
  return {
    kind: 'leaf',
    href: `/master-data/${found.key}`,
    label: found.label,
    icon: TRAINING_ICONS[key],
  };
}

/** Nhóm Đào tạo: 4 danh mục chính, ba danh mục ánh xạ nằm dưới Lớp học phần. */
function trainingSection(): NavSection {
  return {
    id: 'training',
    label: 'Đào tạo',
    items: [
      {
        kind: 'group',
        id: 'program',
        label: 'Chương trình',
        icon: IconProgram,
        children: [
          tab('departments'),
          tab('majors'),
          tab('subjects'),
          tab('terms'),
          {
            kind: 'group',
            id: 'class-sections',
            label: 'Lớp học phần',
            icon: IconSections,
            href: '/master-data/class-sections',
            children: [tab('department-aliases'), tab('major-aliases'), tab('class-major-rules')],
          },
        ],
      },
    ],
  };
}

export function buildNavSections(user: AuthUser): NavSection[] {
  const sections: NavSection[] = [
    {
      id: 'main',
      label: 'Chính',
      items: [
        { kind: 'leaf', href: '/dashboard', label: 'Tổng quan', icon: IconOverview },
        { kind: 'leaf', href: '/students', label: 'Sinh viên', icon: IconStudents },
        { kind: 'leaf', href: '/class-sections', label: 'Lớp học', icon: IconSections },
        { kind: 'leaf', href: '/alerts', label: 'Cảnh báo', icon: IconAlerts, badge: 'openAlerts' },
        {
          kind: 'group',
          id: 'statistics',
          label: 'Thống kê',
          icon: IconStatistics,
          href: '/statistics',
          children: visibleStatisticsTabs(user.roles).map((item): NavLeaf => ({
            kind: 'leaf',
            href: statisticsTabHref(item.key, ''),
            label: item.label,
          })),
        },
      ],
    },
  ];

  if (canViewTrainingArea(user.roles)) {
    sections.push(trainingSection());
  }

  const system: NavNode[] = [];
  if (canSeeExcelMenu(user.roles)) {
    system.push({
      kind: 'leaf',
      href: '/import-export',
      label: 'Import / Export',
      icon: IconTransfer,
    });
  }
  if (user.roles.includes('ADMIN')) {
    system.push({ kind: 'leaf', href: '/admin/users', label: 'Người dùng', icon: IconSettings });
    system.push({ kind: 'leaf', href: '/admin/mail', label: 'Cấu hình email', icon: IconMail });
    system.push({
      kind: 'leaf',
      href: '/admin/backups',
      label: 'Sao lưu & Phục hồi',
      icon: IconDatabase,
    });
    system.push({
      kind: 'leaf',
      href: '/admin/monitoring',
      label: 'Giám sát lỗi',
      icon: IconActivity,
    });
    system.push({
      kind: 'leaf',
      href: '/admin/audit-logs',
      label: 'Nhật ký hành động',
      icon: IconHistory,
    });
  }
  if (system.length > 0) {
    sections.push({ id: 'system', label: 'Hệ thống', items: system });
  }

  return sections;
}

export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Nhóm có chứa route đang mở hay không — xét cả các cấp con lồng nhau. */
export function groupHasActive(group: NavGroup, pathname: string): boolean {
  if (group.href && isNavActive(pathname, group.href)) {
    return true;
  }
  return group.children.some((child) =>
    child.kind === 'group' ? groupHasActive(child, pathname) : isNavActive(pathname, child.href),
  );
}

/**
 * Mặc định mọi nhóm đều mở: người dùng thấy ngay toàn bộ cây, và chỉ những
 * nhóm họ chủ động gập lại mới đóng. Nhóm đang chứa trang hiện tại luôn mở —
 * gập rồi điều hướng vào trong thì nó bung ra lại chứ không giấu mất vị trí.
 */
export function isGroupOpen(
  group: NavGroup,
  pathname: string,
  collapsed: ReadonlySet<string>,
): boolean {
  return groupHasActive(group, pathname) || !collapsed.has(group.id);
}
