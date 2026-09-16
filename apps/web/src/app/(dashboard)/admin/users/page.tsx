'use client';

import { ROLE_KEYS, type RoleKey } from '@fcare/shared-types';
import { Badge, Button } from '@fcare/ui-kit';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState, type FormEvent } from 'react';
import { DataTable, Td } from '../../../../components/ui/data-table';
import { FormError, FormSuccess, Input, Label, Select } from '../../../../components/ui/form';
import { Modal } from '../../../../components/ui/modal';
import { PageHeader } from '../../../../components/ui/page-header';
import { apiDownload, apiFetch, ApiError } from '../../../../lib/api';
import { useMe } from '../../../../lib/hooks';
import { ROLE_LABELS } from '../../../../lib/labels';
import type { Department, StaffMember } from '../../../../lib/types';

interface CreateStaffResult {
  staff: StaffMember;
  tempPassword: string;
}

interface ParsedBulkEmailResult {
  mappings: Array<{ staffCode: string; email: string }>;
  invalidCount: number;
}

/** Hỗ trợ phân tích cú pháp dán từ CSV/Excel/Google Sheets (hỗ trợ dấu phẩy, chấm phẩy, tab, hai chấm, khoảng trắng) */
function parseBulkEmailText(text: string): ParsedBulkEmailResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  const mappings: Array<{ staffCode: string; email: string }> = [];
  let invalidCount = 0;

  for (const line of lines) {
    const delimiter: string | null = line.includes('\t')
      ? '\t'
      : line.includes(';')
        ? ';'
        : line.includes(',')
          ? ','
          : null;
    let parts: string[] = [];
    if (delimiter) {
      parts = line.split(delimiter).map((s) => s.replace(/^["']+|["']+$/g, '').trim());
    } else {
      // Hỗ trợ phân cách bằng dấu hai chấm hoặc khoảng trắng
      parts = line.split(/[:\s]+/).map((s) => s.replace(/^["']+|["']+$/g, '').trim());
    }

    if (parts.length < 2) {
      invalidCount++;
      continue;
    }
    const [staffCode, rawEmail] = parts;
    const email = rawEmail.toLowerCase().replace(/\s+/g, '');
    // Bỏ qua dòng tiêu đề hoặc không phải định dạng email
    if (!email.includes('@') || !email.includes('.')) {
      invalidCount++;
      continue;
    }
    if (!staffCode) {
      invalidCount++;
      continue;
    }
    mappings.push({ staffCode, email });
  }

  return { mappings, invalidCount };
}

// Vai trò bị giới hạn theo bộ môn: thiếu bộ môn thì tài khoản không thấy sinh
// viên nào (apps/api/src/common/utils/dept-scope.ts). API cũng chặn tương tự.
const DEPT_SCOPED_ROLES: readonly RoleKey[] = ['LECTURER', 'HEAD_OF_DEPT'];

function AdminUsersPageContent() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // URL là nguồn sự thật của bộ lọc: gửi link "chưa có bộ môn" cho đồng nghiệp
  // là gửi đúng hàng chờ cần dọn.
  const submittedSearch = params.get('search') ?? '';
  const departmentFilter = params.get('departmentId') ?? '';
  const missingDepartment = params.get('missingDepartment') === 'true';

  const [search, setSearch] = useState(submittedSearch);
  const [creating, setCreating] = useState(false);
  const [importEmailOpen, setImportEmailOpen] = useState(false);
  const [newRoles, setNewRoles] = useState<readonly RoleKey[]>([]);
  const [assigning, setAssigning] = useState<StaffMember | null>(null);
  const [editingRoles, setEditingRoles] = useState<StaffMember | null>(null);
  const [roleDraft, setRoleDraft] = useState<readonly RoleKey[]>([]);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [bulkDepartmentId, setBulkDepartmentId] = useState('');
  const [bulkEmailText, setBulkEmailText] = useState('');
  const [bulkEmailFile, setBulkEmailFile] = useState<File | null>(null);
  const [overrideExistingEmail, setOverrideExistingEmail] = useState(true);
  const [error, setError] = useState('');
  const [viewingStaff, setViewingStaff] = useState<StaffMember | null>(null);
  const [staffEmailDraft, setStaffEmailDraft] = useState('');
  const [emailSaveSuccess, setEmailSaveSuccess] = useState(false);
  const [tempPasswordInfo, setTempPasswordInfo] = useState<{
    staffCode: string;
    tempPassword: string;
  } | null>(null);

  function openStaffDetail(member: StaffMember) {
    setError('');
    setEmailSaveSuccess(false);
    setStaffEmailDraft(member.email ?? '');
    setViewingStaff(member);
  }

  // Back/forward đổi `search` trên URL mà không đi qua ô input.
  useEffect(() => {
    setSearch(submittedSearch);
  }, [submittedSearch]);

  /** Ghi bộ lọc vào URL và bỏ lựa chọn cũ (danh sách hiển thị đã khác). */
  function setFilters(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    setSelected([]);
  }

  // "Chưa có bộ môn" và "lọc theo bộ môn" loại trừ nhau — API cho
  // missingDepartment thắng, web cũng không gửi departmentId để query key
  // phản ánh đúng dữ liệu thật sự được lọc.
  const listQuery = new URLSearchParams();
  if (submittedSearch.trim()) listQuery.set('search', submittedSearch.trim());
  if (missingDepartment) listQuery.set('missingDepartment', 'true');
  else if (departmentFilter) listQuery.set('departmentId', departmentFilter);
  const listQueryString = listQuery.toString();

  const {
    data: staff,
    isLoading,
    isError: staffIsError,
    error: staffError,
  } = useQuery({
    queryKey: ['admin-staff', listQueryString],
    queryFn: () =>
      apiFetch<StaffMember[]>(listQueryString ? `/admin/staff?${listQueryString}` : '/admin/staff'),
    placeholderData: keepPreviousData,
  });
  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiFetch<Department[]>('/departments'),
  });
  const departmentOptions = departments ?? [];

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch<CreateStaffResult>('/admin/staff', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async (result) => {
      setCreating(false);
      setNewRoles([]);
      setError('');
      setTempPasswordInfo({
        staffCode: result.staff.staffCode,
        tempPassword: result.tempPassword,
      });
      await queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra.'),
  });

  const resetMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ staffCode: string; tempPassword: string }>(`/admin/staff/${id}/reset-password`, {
        method: 'POST',
      }),
    onSuccess: (result) => setTempPasswordInfo(result),
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Không thể cấp lại mật khẩu.'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch(`/admin/staff/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-staff'] }),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, departmentId }: { id: string; departmentId: string }) =>
      apiFetch(`/admin/staff/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ departmentId }),
      }),
    onSuccess: async () => {
      setAssigning(null);
      setError('');
      await queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Không gán được bộ môn.'),
  });

  const rolesMutation = useMutation({
    mutationFn: ({ id, roles }: { id: string; roles: readonly RoleKey[] }) =>
      apiFetch(`/admin/staff/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ roles: [...roles] }),
      }),
    onSuccess: async () => {
      setEditingRoles(null);
      setError('');
      await queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
      // Vai trò của chính mình đổi → menu/quyền trên web phải đọc lại ngay.
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Không đổi được vai trò.'),
  });

  const updateStaffEmailMutation = useMutation({
    mutationFn: async ({ id, email }: { id: string; email: string }) => {
      const updated = await apiFetch<StaffMember>(`/admin/staff/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ email: email.trim() || null }),
      });
      return updated;
    },
    onSuccess: async (updated) => {
      setError('');
      setEmailSaveSuccess(true);
      await queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
      setViewingStaff(updated);
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Cập nhật email thất bại.'),
  });

  const bulkEmailFileMutation = useMutation({
    mutationFn: () => {
      if (!bulkEmailFile) throw new Error('Chọn file XLSX hoặc CSV.');
      const body = new FormData();
      body.append('file', bulkEmailFile);
      body.append('overrideExisting', String(overrideExistingEmail));
      return apiFetch<{
        updated: number;
        newlyAssigned?: number;
        overridden?: number;
        skipped?: number;
      }>('/admin/staff/bulk-email-file', {
        method: 'POST',
        body,
      });
    },
    onSuccess: async () => {
      setBulkEmailFile(null);
      setError('');
      await queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
      await queryClient.refetchQueries({ queryKey: ['admin-staff'] });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Import file email thất bại.'),
  });

  async function downloadExcelTemplate() {
    try {
      await apiDownload('/admin/staff/email-template.xlsx', 'mau_mapping_email_nhan_vien.xlsx');
    } catch {
      downloadEmailTemplate();
    }
  }

  function downloadEmailTemplate() {
    const csvContent = 'manv,email\r\nvandtb2,VanDTB2@fe.edu.vn\r\nhieunt249,hieunt249@fe.edu.vn\r\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mau_mapping_email_nhan_vien.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportExcelEmailList() {
    try {
      await apiDownload('/admin/staff/export-emails.xlsx', 'fcare_danh_sach_email_nhan_vien.xlsx');
    } catch {
      exportCurrentEmailList();
    }
  }

  function exportCurrentEmailList() {
    const list = staff ?? [];
    const lines = ['manv,email'];
    for (const member of list) {
      lines.push(`${member.staffCode},${member.email ?? ''}`);
    }
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fcare_danh_sach_email_nhan_vien.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  const parsedEmailPreview = useMemo(
    () => parseBulkEmailText(bulkEmailText),
    [bulkEmailText],
  );

  const bulkEmailMutation = useMutation({
    mutationFn: () => {
      const { mappings } = parseBulkEmailText(bulkEmailText);
      if (mappings.length === 0) {
        throw new Error('Chưa có dòng dữ liệu nào hợp lệ (cần định dạng: mã nhân viên, email).');
      }
      return apiFetch<{
        updated: number;
        newlyAssigned?: number;
        overridden?: number;
        skipped?: number;
      }>('/admin/staff/bulk-email', {
        method: 'POST',
        body: JSON.stringify({ mappings, overrideExisting: overrideExistingEmail }),
      });
    },
    onSuccess: async () => {
      setError('');
      await queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
      await queryClient.refetchQueries({ queryKey: ['admin-staff'] });
    },
    onError: (err) =>
      setError(
        err instanceof ApiError
          ? err.message
          : (err as Error).message || 'Gán email hàng loạt thất bại.',
      ),
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async () => {
      const staffIds = [...selected];
      const result = await apiFetch<{ updated: number }>('/admin/staff/bulk-department', {
        method: 'PATCH',
        body: JSON.stringify({ staffIds, departmentId: bulkDepartmentId }),
      });
      return { updated: result.updated, requested: staffIds.length };
    },
    onSuccess: async () => {
      setSelected([]);
      setBulkDepartmentId('');
      setError('');
      await queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Gán bộ môn hàng loạt thất bại.'),
  });

  const rows = staff ?? [];
  const showSelectColumn = missingDepartment;
  const allSelected = rows.length > 0 && selected.length === rows.length;
  const needsDepartment = newRoles.some((role) => DEPT_SCOPED_ROLES.includes(role));

  function toggleOne(id: string, checked: boolean) {
    setSelected((current) =>
      checked ? [...current, id] : current.filter((value) => value !== id),
    );
  }

  /** Vai trò của người đang được sửa, dùng để bật/tắt cảnh báo bộ môn. */
  const editRolesNeedDepartment = roleDraft.some((role) => DEPT_SCOPED_ROLES.includes(role));
  const editingSelf = editingRoles !== null && editingRoles.id === me?.user.id;

  function openRoleEditor(member: StaffMember) {
    setError('');
    setRoleDraft(member.roles.map(({ role }) => role.key));
    setEditingRoles(member);
  }

  function toggleDraftRole(role: RoleKey, checked: boolean) {
    setRoleDraft((current) =>
      checked ? [...current, role] : current.filter((value) => value !== role),
    );
  }

  function onRolesSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingRoles) return;
    if (roleDraft.length === 0) {
      setError('Chọn ít nhất một vai trò.');
      return;
    }
    // Chặn sớm ở web để admin thấy đúng việc cần làm trước (gán bộ môn),
    // API vẫn chặn lần nữa — cùng quy tắc, hai lớp.
    if (editRolesNeedDepartment && !editingRoles.departmentId) {
      setError(
        `${editingRoles.staffCode} chưa có bộ môn — gán bộ môn trước khi cấp vai trò Giảng viên/Trưởng bộ môn.`,
      );
      return;
    }
    rolesMutation.mutate({ id: editingRoles.id, roles: roleDraft });
  }

  function toggleRole(role: RoleKey, checked: boolean) {
    setNewRoles((current) =>
      checked ? [...current, role] : current.filter((value) => value !== role),
    );
  }

  function onCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (newRoles.length === 0) {
      setError('Chọn ít nhất một vai trò.');
      return;
    }
    const departmentId = form.get('departmentId') as string;
    if (needsDepartment && !departmentId) {
      setError('Giảng viên và Trưởng bộ môn bắt buộc thuộc một bộ môn.');
      return;
    }
    createMutation.mutate({
      staffCode: form.get('staffCode'),
      fullName: form.get('fullName'),
      email: form.get('email') || undefined,
      roles: [...newRoles],
      ...(departmentId ? { departmentId } : {}),
    });
  }

  function onAssignSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assigning) return;
    const departmentId = new FormData(event.currentTarget).get('departmentId') as string;
    if (!departmentId) {
      setError('Chọn bộ môn cần gán.');
      return;
    }
    assignMutation.mutate({ id: assigning.id, departmentId });
  }

  return (
    <>
      <PageHeader
        title="Quản trị người dùng"
        description="Quản lý email công vụ của giảng viên/nhân viên; email sinh viên không được lưu."
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setError('');
                setImportEmailOpen(true);
              }}
            >
              Import / Gán email
            </Button>
            <Button
              type="button"
              onClick={() => {
                setNewRoles([]);
                setCreating(true);
              }}
            >
              + Thêm nhân viên
            </Button>
          </div>
        }
      />

      <section
        aria-label="Bộ lọc nhân viên"
        className="mb-4 rounded-md border border-border bg-surface"
      >
        <form
          className="flex flex-wrap items-end gap-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters({ search: search.trim() || null });
          }}
        >
          <div className="min-w-56 flex-1">
            <Label htmlFor="staff-search">Tìm kiếm</Label>
            <Input
              id="staff-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Mã NV hoặc họ tên"
            />
          </div>

          <div className="min-w-56">
            <Label htmlFor="staff-department">Bộ môn</Label>
            <Select
              id="staff-department"
              value={departmentFilter}
              disabled={missingDepartment}
              onChange={(event) => setFilters({ departmentId: event.target.value || null })}
            >
              <option value="">Mọi bộ môn</option>
              {departmentOptions.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </div>

          <label className="flex h-10 items-center gap-2 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              checked={missingDepartment}
              onChange={(event) =>
                setFilters({ missingDepartment: event.target.checked ? 'true' : null })
              }
              className="size-4 accent-fpt-orange"
            />
            Chưa có bộ môn
          </label>

          <Button type="submit" variant="secondary" className="h-10">
            Tìm kiếm
          </Button>
        </form>
      </section>

      <div className="mb-4 space-y-3">
        <FormError>{error}</FormError>
        {staffIsError ? (
          <FormError>
            {staffError instanceof ApiError
              ? staffError.message
              : 'Không tải được danh sách nhân viên.'}
          </FormError>
        ) : null}
        {tempPasswordInfo ? (
          <FormSuccess>
            Mật khẩu tạm của <strong>{tempPasswordInfo.staffCode}</strong>:{' '}
            <code className="rounded bg-white px-2 py-0.5 font-mono text-ink">
              {tempPasswordInfo.tempPassword}
            </code>{' '}
            — chỉ hiển thị một lần, hãy chuyển ngay cho người dùng.
          </FormSuccess>
        ) : null}
      </div>

      {showSelectColumn ? (
        <section
          aria-label="Gán bộ môn hàng loạt"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-border bg-fpt-orange-50/40 px-4 py-3"
        >
          <p className="text-sm text-muted">
            Đã chọn <strong className="text-ink">{selected.length}</strong> nhân viên.
          </p>
          <Select
            aria-label="Bộ môn cần gán"
            value={bulkDepartmentId}
            onChange={(event) => setBulkDepartmentId(event.target.value)}
            className="max-w-64"
          >
            <option value="">Chọn bộ môn…</option>
            {departmentOptions.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            disabled={selected.length === 0 || !bulkDepartmentId || bulkAssignMutation.isPending}
            onClick={() => bulkAssignMutation.mutate()}
          >
            {bulkAssignMutation.isPending ? 'Đang gán…' : 'Gán bộ môn cho người đã chọn'}
          </Button>
          {bulkAssignMutation.isSuccess ? (
            <FormSuccess>
              Đã gán bộ môn cho {bulkAssignMutation.data.updated}/
              {bulkAssignMutation.data.requested} nhân viên đã chọn.
            </FormSuccess>
          ) : null}
        </section>
      ) : null}

      <DataTable
        headers={[
          ...(showSelectColumn ? ['Chọn'] : []),
          'Mã NV',
          'Họ tên',
          'Email',
          'Bộ môn',
          'Loại GV',
          'Vai trò',
          'Trạng thái',
          'Thao tác',
        ]}
        isLoading={isLoading}
        skeletonRows={6}
        isEmpty={!isLoading && !staffIsError && rows.length === 0}
        emptyMessage={
          missingDepartment
            ? 'Mọi nhân viên đều đã có bộ môn.'
            : 'Không có nhân viên nào khớp bộ lọc.'
        }
      >
        {rows.map((member) => (
          <tr key={member.id} className="transition-colors hover:bg-fpt-orange-50/40">
            {showSelectColumn ? (
              <Td>
                <input
                  type="checkbox"
                  aria-label={`Chọn ${member.staffCode}`}
                  checked={selected.includes(member.id)}
                  onChange={(event) => toggleOne(member.id, event.target.checked)}
                  className="size-4 accent-fpt-orange"
                />
              </Td>
            ) : null}
            <Td className="font-semibold text-ink">
              <button
                type="button"
                className="cursor-pointer text-left font-semibold text-fpt-blue hover:underline"
                onClick={() => openStaffDetail(member)}
                title="Bấm xem chi tiết nhân viên"
              >
                {member.staffCode}
              </button>
            </Td>
            <Td>
              <button
                type="button"
                className="cursor-pointer text-left text-ink hover:text-fpt-blue hover:underline"
                onClick={() => openStaffDetail(member)}
                title="Bấm xem chi tiết nhân viên"
              >
                {member.fullName}
              </button>
            </Td>
            <Td>
              {member.email ? (
                <button
                  type="button"
                  className="cursor-pointer font-mono text-xs text-ink hover:text-fpt-blue hover:underline"
                  onClick={() => openStaffDetail(member)}
                  title="Bấm để xem/sửa email"
                >
                  {member.email}
                </button>
              ) : (
                <button
                  type="button"
                  className="cursor-pointer text-xs font-semibold text-amber-600 hover:underline"
                  onClick={() => openStaffDetail(member)}
                  title="Chưa có email — Bấm để gán"
                >
                  + Gán email
                </button>
              )}
            </Td>
            <Td>{member.department?.name ?? <Badge tone="warning">Chưa có bộ môn</Badge>}</Td>
            <Td>
              {member.lecturerType === 'FULL'
                ? 'Cơ hữu'
                : member.lecturerType === 'PART'
                  ? 'Thỉnh giảng'
                  : '—'}
            </Td>
            <Td>
              <div className="flex flex-wrap gap-1">
                {member.roles.map(({ role }) => (
                  <Badge key={role.key} tone="info">
                    {ROLE_LABELS[role.key as RoleKey] ?? role.name}
                  </Badge>
                ))}
              </div>
            </Td>
            <Td>
              {member.isActive ? (
                <Badge tone="success">Hoạt động</Badge>
              ) : (
                <Badge tone="danger">Đã khóa</Badge>
              )}
              {member.mustChangePassword ? <Badge tone="warning">MK tạm</Badge> : null}
            </Td>
            <Td>
              <div className="flex flex-wrap gap-2.5 text-xs font-semibold">
                <button
                  type="button"
                  className="text-fpt-blue hover:underline"
                  onClick={() => openStaffDetail(member)}
                >
                  Chi tiết
                </button>
                <button
                  type="button"
                  className="text-fpt-blue hover:underline"
                  onClick={() => {
                    setError('');
                    setAssigning(member);
                  }}
                >
                  {member.department ? 'Đổi bộ môn' : 'Gán bộ môn'}
                </button>
                <button
                  type="button"
                  className="text-fpt-blue hover:underline"
                  onClick={() => openRoleEditor(member)}
                >
                  Đổi vai trò
                </button>
                <button
                  type="button"
                  className="text-fpt-blue hover:underline"
                  onClick={() => resetMutation.mutate(member.id)}
                >
                  Cấp lại mật khẩu
                </button>
                <button
                  type="button"
                  className={
                    member.isActive ? 'text-danger hover:underline' : 'text-success hover:underline'
                  }
                  onClick={() =>
                    toggleActiveMutation.mutate({ id: member.id, isActive: !member.isActive })
                  }
                >
                  {member.isActive ? 'Khóa' : 'Mở khóa'}
                </button>
              </div>
            </Td>
          </tr>
        ))}
      </DataTable>

      {showSelectColumn && rows.length > 0 ? (
        <p className="mt-3">
          <button
            type="button"
            className="text-xs font-semibold text-fpt-blue hover:underline"
            onClick={() => setSelected(allSelected ? [] : rows.map((member) => member.id))}
          >
            {allSelected ? 'Bỏ chọn tất cả' : `Chọn tất cả ${rows.length} người trong danh sách`}
          </button>
        </p>
      ) : null}

      <Modal
        title={assigning?.department ? 'Đổi bộ môn' : 'Gán bộ môn'}
        open={assigning !== null}
        onClose={() => setAssigning(null)}
      >
        <form onSubmit={onAssignSubmit} className="space-y-4">
          <p className="text-sm text-muted">
            <strong className="text-ink">{assigning?.staffCode}</strong> — {assigning?.fullName}
            {assigning?.department ? ` (đang thuộc ${assigning.department.name})` : ''}
          </p>
          <div>
            <Label htmlFor="assign-department">Bộ môn</Label>
            <Select
              id="assign-department"
              name="departmentId"
              defaultValue={assigning?.departmentId ?? ''}
              required
            >
              <option value="">Chọn bộ môn…</option>
              {departmentOptions.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </div>
          <p className="rounded-md bg-fpt-orange-50 p-3 text-xs text-muted">
            Bộ môn quyết định phạm vi sinh viên mà giảng viên và trưởng bộ môn nhìn thấy. Đổi bộ môn
            là đổi luôn danh sách sinh viên của họ — thao tác này được ghi vào nhật ký.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setAssigning(null)}>
              Hủy
            </Button>
            <Button type="submit" disabled={assignMutation.isPending}>
              {assignMutation.isPending ? 'Đang lưu…' : 'Lưu bộ môn'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal title="Đổi vai trò" open={editingRoles !== null} onClose={() => setEditingRoles(null)}>
        <form onSubmit={onRolesSubmit} className="space-y-4">
          <FormError>{error}</FormError>
          <p className="text-sm text-muted">
            <strong className="text-ink">{editingRoles?.staffCode}</strong> —{' '}
            {editingRoles?.fullName}
            {editingRoles?.department ? ` (${editingRoles.department.name})` : ' (chưa có bộ môn)'}
          </p>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">Vai trò</legend>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_KEYS.map((role) => {
                // Gỡ vai trò ADMIN của chính mình là tự nhốt mình ngoài cửa —
                // hệ thống không có email để tự mở lại. API cũng chặn.
                const locked = editingSelf && role === 'ADMIN';
                return (
                  <label
                    key={role}
                    className={`flex items-center gap-2 text-sm ${
                      locked ? 'text-muted' : 'text-ink'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={roleDraft.includes(role)}
                      disabled={locked}
                      onChange={(event) => toggleDraftRole(role, event.target.checked)}
                      className="h-4 w-4 accent-[var(--color-fpt-orange)]"
                    />
                    {ROLE_LABELS[role]}
                    {locked ? ' (không thể tự gỡ)' : ''}
                  </label>
                );
              })}
            </div>
          </fieldset>
          {editRolesNeedDepartment && !editingRoles?.departmentId ? (
            <FormError>
              Giảng viên và Trưởng bộ môn bắt buộc thuộc một bộ môn — gán bộ môn trước, nếu không
              tài khoản sẽ không thấy sinh viên nào.
            </FormError>
          ) : null}
          <p className="rounded-md bg-fpt-orange-50 p-3 text-xs text-muted">
            Vai trò quyết định quyền xem sinh viên, nhập/xuất Excel và nhận cảnh báo leo thang. Danh
            sách vai trò mới thay thế hoàn toàn danh sách cũ; thao tác được ghi vào nhật ký.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setEditingRoles(null)}>
              Hủy
            </Button>
            <Button type="submit" disabled={rolesMutation.isPending}>
              {rolesMutation.isPending ? 'Đang lưu…' : 'Lưu vai trò'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal title="Thêm nhân viên" open={creating} onClose={() => setCreating(false)}>
        <form onSubmit={onCreateSubmit} className="space-y-4">
          <FormError>{error}</FormError>
          <div>
            <Label htmlFor="staffCode">Mã nhân viên</Label>
            <Input id="staffCode" name="staffCode" placeholder="vd: gv.nguyen" required />
          </div>
          <div>
            <Label htmlFor="fullName">Họ tên</Label>
            <Input id="fullName" name="fullName" required />
          </div>
          <div>
            <Label htmlFor="email">Email công vụ</Label>
            <Input id="email" name="email" type="email" placeholder="gv.nguyen@fpt.edu.vn" />
          </div>
          <div>
            <Label htmlFor="departmentId">
              {needsDepartment ? 'Bộ môn (bắt buộc với GV/TBM)' : 'Bộ môn'}
            </Label>
            <Select
              id="departmentId"
              name="departmentId"
              defaultValue=""
              required={needsDepartment}
            >
              {/* Bỏ lựa chọn "không bộ môn" khi đã tick GV/TBM: tài khoản thiếu
                  bộ môn sẽ không thấy sinh viên nào. */}
              {needsDepartment ? (
                <option value="">Chọn bộ môn…</option>
              ) : (
                <option value="">Không thuộc bộ môn</option>
              )}
              {departmentOptions.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">Vai trò</legend>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_KEYS.map((role) => (
                <label key={role} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    name={`role-${role}`}
                    checked={newRoles.includes(role)}
                    onChange={(event) => toggleRole(role, event.target.checked)}
                    className="h-4 w-4 accent-[var(--color-fpt-orange)]"
                  />
                  {ROLE_LABELS[role]}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="rounded-md bg-fpt-orange-50 p-3 text-xs text-muted">
            Hệ thống sẽ sinh mật khẩu tạm và hiển thị một lần sau khi tạo. Người dùng bắt buộc đổi
            mật khẩu ở lần đăng nhập đầu tiên.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setCreating(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Đang tạo…' : 'Tạo tài khoản'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        title="Import / Gán email hàng loạt"
        open={importEmailOpen}
        onClose={() => setImportEmailOpen(false)}
        size="lg"
      >
        <div className="space-y-4">
          <FormError>{error}</FormError>

          <div className="flex items-center gap-2.5 rounded-md border border-amber-200/80 bg-amber-50/70 p-3 text-xs text-amber-900">
            <input
              type="checkbox"
              id="override-existing-email"
              checked={overrideExistingEmail}
              onChange={(e) => setOverrideExistingEmail(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-[var(--color-fpt-orange)]"
            />
            <label htmlFor="override-existing-email" className="cursor-pointer font-medium select-none">
              Cho phép ghi đè (override) nếu nhân viên đã có email trước đó
            </label>
          </div>

          <div className="rounded-md border border-border bg-surface p-3">
            <Label htmlFor="bulk-staff-email">
              Dán danh sách mã nhân viên và email (CSV, Tab hoặc chấm phẩy)
            </Label>
            <p className="mt-1 text-xs text-muted">
              Định dạng: <code>mã_NV,email</code> (Ví dụ: <code>vandtb2,VanDTB2@fe.edu.vn</code>). Tự động bỏ qua dòng tiêu đề.
            </p>
            <textarea
              id="bulk-staff-email"
              value={bulkEmailText}
              onChange={(event) => setBulkEmailText(event.target.value)}
              placeholder={'vandtb2,VanDTB2@fe.edu.vn\nhieunt249,hieunt249@fe.edu.vn'}
              rows={6}
              className="mt-2 min-h-28 w-full rounded-md border border-border bg-white p-3 font-mono text-sm"
            />
            {bulkEmailText.trim() ? (
              <p className="mt-1.5 text-xs text-muted">
                Đã nhận diện <strong className="text-ink">{parsedEmailPreview.mappings.length}</strong> giảng viên hợp lệ
                {parsedEmailPreview.invalidCount > 0 ? (
                  <span className="text-amber-600"> (bỏ qua {parsedEmailPreview.invalidCount} dòng tiêu đề / không hợp lệ)</span>
                ) : null}
                .
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  disabled={parsedEmailPreview.mappings.length === 0 || bulkEmailMutation.isPending}
                  onClick={() => bulkEmailMutation.mutate()}
                >
                  {bulkEmailMutation.isPending
                    ? 'Đang thực hiện…'
                    : overrideExistingEmail
                      ? `Ghi đè / Cập nhật ${parsedEmailPreview.mappings.length > 0 ? `${parsedEmailPreview.mappings.length} ` : ''}email`
                      : `Gán mới ${parsedEmailPreview.mappings.length > 0 ? `${parsedEmailPreview.mappings.length} ` : ''}email`}
                </Button>
                {bulkEmailText.trim() ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setBulkEmailText('')}
                    title="Xóa dữ liệu đã nhập"
                  >
                    Xóa văn bản
                  </Button>
                ) : null}
              </div>
              {bulkEmailMutation.isSuccess ? (
                <FormSuccess>
                  Đã cập nhật email cho {bulkEmailMutation.data?.updated ?? 0} nhân viên
                  {bulkEmailMutation.data?.overridden ? ` (ghi đè ${bulkEmailMutation.data.overridden} email cũ)` : ''}
                  {bulkEmailMutation.data?.newlyAssigned ? ` (thêm mới ${bulkEmailMutation.data.newlyAssigned})` : ''}
                  {bulkEmailMutation.data?.skipped ? ` (bỏ qua ${bulkEmailMutation.data.skipped} người đã có email)` : ''}.
                </FormSuccess>
              ) : null}
            </div>
          </div>

          <div className="rounded-md border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="bulk-email-file">Hoặc tải file Excel (.xlsx) / CSV mapping email</Label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={downloadExcelTemplate}
                  className="cursor-pointer rounded bg-fpt-orange-50 px-2 py-0.5 text-xs font-semibold text-fpt-blue hover:underline"
                >
                  Tải file mẫu Excel (.xlsx)
                </button>
                <span className="text-xs text-muted">•</span>
                <button
                  type="button"
                  onClick={exportExcelEmailList}
                  className="cursor-pointer rounded bg-fpt-orange-50 px-2 py-0.5 text-xs font-semibold text-fpt-blue hover:underline"
                >
                  Xuất file Excel (.xlsx)
                </button>
                <span className="text-xs text-muted">•</span>
                <button
                  type="button"
                  onClick={downloadEmailTemplate}
                  className="cursor-pointer text-xs text-muted hover:underline"
                  title="Tải dạng text CSV"
                >
                  Bản CSV
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted">
              Cấu trúc cột trong file: <code>manv</code> và <code>email</code>. Hệ thống tự động nhận diện cả file .xlsx và .csv.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Input
                id="bulk-email-file"
                type="file"
                accept=".xlsx,.csv"
                aria-label="File XLSX hoặc CSV mapping mã nhân viên và email"
                onChange={(event) => setBulkEmailFile(event.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={!bulkEmailFile || bulkEmailFileMutation.isPending}
                onClick={() => bulkEmailFileMutation.mutate()}
              >
                {bulkEmailFileMutation.isPending
                  ? 'Đang import…'
                  : overrideExistingEmail
                    ? 'Import & Ghi đè file XLSX/CSV'
                    : 'Import file XLSX/CSV (không ghi đè)'}
              </Button>
              {bulkEmailFileMutation.isSuccess ? (
                <FormSuccess>
                  Đã cập nhật email cho {bulkEmailFileMutation.data?.updated ?? 0} nhân viên
                  {bulkEmailFileMutation.data?.overridden ? ` (ghi đè ${bulkEmailFileMutation.data.overridden} email cũ)` : ''}
                  {bulkEmailFileMutation.data?.newlyAssigned ? ` (thêm mới ${bulkEmailFileMutation.data.newlyAssigned})` : ''}
                  {bulkEmailFileMutation.data?.skipped ? ` (bỏ qua ${bulkEmailFileMutation.data.skipped} người đã có email)` : ''}.
                </FormSuccess>
              ) : null}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setImportEmailOpen(false)}>
              Đóng
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        title={`Chi tiết nhân viên — ${viewingStaff?.staffCode ?? ''}`}
        open={viewingStaff !== null}
        onClose={() => setViewingStaff(null)}
        size="lg"
      >
        {viewingStaff ? (
          <div className="space-y-5">
            <FormError>{error}</FormError>
            {emailSaveSuccess ? (
              <FormSuccess>Đã lưu email công vụ thành công.</FormSuccess>
            ) : null}

            {/* Thẻ thông tin tổng quan */}
            <div className="rounded-md border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-ink">{viewingStaff.fullName}</h3>
                  <p className="font-mono text-xs text-muted">
                    Mã nhân viên: <strong className="text-ink">{viewingStaff.staffCode}</strong>
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {viewingStaff.isActive ? (
                    <Badge tone="success">Hoạt động</Badge>
                  ) : (
                    <Badge tone="danger">Đã khóa</Badge>
                  )}
                  {viewingStaff.mustChangePassword ? <Badge tone="warning">Mật khẩu tạm</Badge> : null}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <span className="block text-xs text-muted">Bộ môn:</span>
                  <strong className="text-ink">
                    {viewingStaff.department ? (
                      `${viewingStaff.department.name} (${viewingStaff.department.code})`
                    ) : (
                      <Badge tone="warning">Chưa có bộ môn</Badge>
                    )}
                  </strong>
                </div>
                <div>
                  <span className="block text-xs text-muted">Loại giảng viên:</span>
                  <strong className="text-ink">
                    {viewingStaff.lecturerType === 'FULL'
                      ? 'Cơ hữu'
                      : viewingStaff.lecturerType === 'PART'
                        ? 'Thỉnh giảng'
                        : '—'}
                  </strong>
                </div>
                <div>
                  <span className="block text-xs text-muted">Ngày tạo tài khoản:</span>
                  <span className="text-ink">
                    {new Date(viewingStaff.createdAt).toLocaleDateString('vi-VN')}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-muted">Vai trò:</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {viewingStaff.roles.map(({ role }) => (
                      <Badge key={role.key} tone="info">
                        {ROLE_LABELS[role.key as RoleKey] ?? role.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Khối quản lý Email công vụ */}
            <div className="rounded-md border border-border bg-white p-4">
              <Label htmlFor="staff-detail-email" className="font-semibold text-ink">
                Email công vụ (Google Login)
              </Label>
              <p className="mt-1 text-xs text-muted">
                Email thuộc miền <code>@fpt.edu.vn</code> hoặc <code>@fe.edu.vn</code>. Giảng viên / nhân viên dùng email này để đăng nhập Google một chạm vào FCare.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  id="staff-detail-email"
                  type="email"
                  value={staffEmailDraft}
                  onChange={(event) => {
                    setStaffEmailDraft(event.target.value);
                    setEmailSaveSuccess(false);
                  }}
                  placeholder="VanDTB2@fe.edu.vn"
                  className="flex-1 font-mono text-sm"
                />
                <Button
                  type="button"
                  disabled={
                    staffEmailDraft.trim() === (viewingStaff.email ?? '') ||
                    updateStaffEmailMutation.isPending
                  }
                  onClick={() =>
                    updateStaffEmailMutation.mutate({
                      id: viewingStaff.id,
                      email: staffEmailDraft,
                    })
                  }
                >
                  {updateStaffEmailMutation.isPending ? 'Đang lưu…' : 'Lưu email'}
                </Button>
              </div>
            </div>

            {/* Khối phím tắt quản trị */}
            <div className="rounded-md border border-border/80 bg-fpt-orange-50/50 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Thao tác quản trị nhanh
              </h4>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setAssigning(viewingStaff);
                    setViewingStaff(null);
                  }}
                >
                  {viewingStaff.department ? 'Đổi bộ môn' : 'Gán bộ môn'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    openRoleEditor(viewingStaff);
                    setViewingStaff(null);
                  }}
                >
                  Đổi vai trò
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => resetMutation.mutate(viewingStaff.id)}
                >
                  Cấp lại mật khẩu
                </Button>
                <Button
                  type="button"
                  variant={viewingStaff.isActive ? 'danger' : 'secondary'}
                  onClick={() => {
                    toggleActiveMutation.mutate({
                      id: viewingStaff.id,
                      isActive: !viewingStaff.isActive,
                    });
                    setViewingStaff((current) =>
                      current ? { ...current, isActive: !current.isActive } : null,
                    );
                  }}
                >
                  {viewingStaff.isActive ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                </Button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="ghost" type="button" onClick={() => setViewingStaff(null)}>
                Đóng
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Đang tải danh sách người dùng…</p>}>
      <AdminUsersPageContent />
    </Suspense>
  );
}
