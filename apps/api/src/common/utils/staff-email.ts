/** Miền email nhân viên được phép — dùng cho gán email GV và mail thử. */
export const ALLOWED_STAFF_EMAIL_DOMAINS = ['fpt.edu.vn', 'fe.edu.vn'] as const;

export function isAllowedStaffEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0) return false;
  const domain = normalized.slice(at + 1);
  return ALLOWED_STAFF_EMAIL_DOMAINS.some((allowed) => domain === allowed);
}
