import type { ReactElement, SVGProps } from 'react';

/**
 * Bộ icon nét cho sidebar. Dự án không có thư viện icon nào (lucide,
 * heroicons…) và cũng không đáng thêm một dependency chỉ để vẽ 12 hình — nên
 * vẽ thẳng bằng SVG inline: cùng một độ dày nét, cùng khung 24, tô theo
 * `currentColor` để trạng thái active/hover chỉ cần đổi màu chữ.
 */

const STROKE = 1.75;

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export type NavIcon = (props: SVGProps<SVGSVGElement>) => ReactElement;

/** Tổng quan — bốn ô lưới. */
export const IconOverview: NavIcon = (props) => (
  <Icon {...props}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </Icon>
);

/** Sinh viên — hai người. */
export const IconStudents: NavIcon = (props) => (
  <Icon {...props}>
    <path d="M15.5 20v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.4A3.4 3.4 0 0 0 3 18.4V20" />
    <circle cx="9.25" cy="8" r="3.25" />
    <path d="M21 20v-1.6a3.4 3.4 0 0 0-2.6-3.3M16.4 5a3.25 3.25 0 0 1 0 6" />
  </Icon>
);

/** Cảnh báo — tam giác cảnh báo. */
export const IconAlerts: NavIcon = (props) => (
  <Icon {...props}>
    <path d="M10.7 3.9 2.6 17.5A1.5 1.5 0 0 0 3.9 19.8h16.2a1.5 1.5 0 0 0 1.3-2.3L13.3 3.9a1.5 1.5 0 0 0-2.6 0Z" />
    <path d="M12 9v4" />
    <path d="M12 16.5h.01" />
  </Icon>
);

/** Thống kê — biểu đồ tròn. */
export const IconStatistics: NavIcon = (props) => (
  <Icon {...props}>
    <path d="M21 15.4A9 9 0 1 1 8.6 3" />
    <path d="M21.5 11.5A9.5 9.5 0 0 0 12.5 2.5V12l9 -.5Z" />
  </Icon>
);

/** Chương trình đào tạo — mũ tốt nghiệp. */
export const IconProgram: NavIcon = (props) => (
  <Icon {...props}>
    <path d="M2.5 8.5 12 4l9.5 4.5L12 13 2.5 8.5Z" />
    <path d="M6.5 10.7v4.6c0 1.6 2.5 2.9 5.5 2.9s5.5-1.3 5.5-2.9v-4.6" />
    <path d="M21.5 8.5v5.2" />
  </Icon>
);

/** Bộ môn — quyển sách mở. */
export const IconDepartments: NavIcon = (props) => (
  <Icon {...props}>
    <path d="M12 6.6C10.6 5.3 8.6 4.6 6 4.6c-1 0-1.9.1-2.6.3v13c.7-.2 1.6-.3 2.6-.3 2.6 0 4.6.7 6 2" />
    <path d="M12 6.6c1.4-1.3 3.4-2 6-2 1 0 1.9.1 2.6.3v13c-.7-.2-1.6-.3-2.6-.3-2.6 0-4.6.7-6 2" />
    <path d="M12 6.6v13" />
  </Icon>
);

/** Ngành học — tia sáng. */
export const IconMajors: NavIcon = (props) => (
  <Icon {...props}>
    <path d="M12 3.2 13.9 9l5.9 1.9-5.9 1.9L12 18.7l-1.9-5.9L4.2 11l5.9-1.9L12 3.2Z" />
    <path d="M18.6 3v3M20.1 4.5h-3" />
  </Icon>
);

/** Môn học — biểu đồ cột. */
export const IconSubjects: NavIcon = (props) => (
  <Icon {...props}>
    <path d="M4 20V10" />
    <path d="M9.3 20V4" />
    <path d="M14.7 20v-6.5" />
    <path d="M20 20V8" />
  </Icon>
);

/** Lớp học phần — danh sách. */
export const IconSections: NavIcon = (props) => (
  <Icon {...props}>
    <path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12" />
    <path d="M3.6 6.5h.01M3.6 12h.01M3.6 17.5h.01" />
  </Icon>
);

/** Học kỳ — cuốn lịch. */
export const IconTerms: NavIcon = (props) => (
  <Icon {...props}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Icon>
);

/** Import / Export — hai mũi tên ngược chiều. */
export const IconTransfer: NavIcon = (props) => (
  <Icon {...props}>
    <path d="M7.5 3.5v17M7.5 3.5 4 7M7.5 3.5 11 7" />
    <path d="M16.5 20.5v-17M16.5 20.5 13 17M16.5 20.5 20 17" />
  </Icon>
);

/** Người dùng / cấu hình hệ thống — bánh răng. */
export const IconSettings: NavIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.4 14.4a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a1.9 1.9 0 1 1-3.8 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a1.9 1.9 0 1 1 0-3.8h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5v-.3a1.9 1.9 0 1 1 3.8 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.3a1.9 1.9 0 1 1 0 3.8h-.2a1.6 1.6 0 0 0-1.5 1Z" />
  </Icon>
);

/** Cấu hình email — phong bì. */
export const IconMail: NavIcon = (props) => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2.2" />
    <path d="m3.8 7 7.3 5.4a1.5 1.5 0 0 0 1.8 0L20.2 7" />
  </Icon>
);

/** Cơ sở dữ liệu / Sao lưu & phục hồi — các tầng đĩa dữ liệu. */
export const IconDatabase: NavIcon = (props) => (
  <Icon {...props}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
    <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
  </Icon>
);

/** Mũi tên gập/mở nhóm. */
export const IconChevron: NavIcon = (props) => (
  <Icon {...props}>
    <path d="M6 9.5 12 15l6-5.5" />
  </Icon>
);

/** Đăng xuất. */
export const IconLogout: NavIcon = (props) => (
  <Icon {...props}>
    <path d="M14.5 4.5h3.4A2.1 2.1 0 0 1 20 6.6v10.8a2.1 2.1 0 0 1-2.1 2.1h-3.4" />
    <path d="M9.5 15.5 5 12l4.5-3.5" />
    <path d="M5 12h10" />
  </Icon>
);

/** Mở menu điều hướng (điện thoại). */
export const IconMenu: NavIcon = (props) => (
  <Icon {...props}>
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h10" />
  </Icon>
);

/** Đóng menu điều hướng. */
export const IconClose: NavIcon = (props) => (
  <Icon {...props}>
    <path d="m6 6 12 12" />
    <path d="M18 6 6 18" />
  </Icon>
);
