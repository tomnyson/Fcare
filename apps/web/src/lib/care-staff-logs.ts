/** Trang nhật ký chăm sóc của một người trong kỳ — mở từ bảng "Chăm sóc theo bộ môn". */
export function careStaffLogsHref(staffId: string, term: string): string {
  const path = `/statistics/care-staff/${encodeURIComponent(staffId)}`;
  return term ? `${path}?${new URLSearchParams({ term }).toString()}` : path;
}

export function buildCareStaffLogsQuery(term: string, page: number, limit: number): string {
  const query = new URLSearchParams();
  if (term) query.set('term', term);
  query.set('page', String(page));
  query.set('limit', String(limit));
  return `?${query.toString()}`;
}
