'use client';

import { ROLE_KEYS, type RoleKey } from '@fcare/shared-types';
import { Badge, Button } from '@fcare/ui-kit';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { DataTable, Td } from '../../../../components/ui/data-table';
import { FormError, FormSuccess, Input, Label, Select } from '../../../../components/ui/form';
import { Modal } from '../../../../components/ui/modal';
import { PageHeader } from '../../../../components/ui/page-header';
import { apiFetch, ApiError } from '../../../../lib/api';
import { useMe } from '../../../../lib/hooks';
import { ROLE_LABELS } from '../../../../lib/labels';
import type { Department, StaffMember } from '../../../../lib/types';

interface CreateStaffResult {
  staff: StaffMember;
  tempPassword: string;
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
  const [newRoles, setNewRoles] = useState<readonly RoleKey[]>([]);
  const [assigning, setAssigning] = useState<StaffMember | null>(null);
  const [editingRoles, setEditingRoles] = useState<StaffMember | null>(null);
  const [roleDraft, setRoleDraft] = useState<readonly RoleKey[]>([]);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [bulkDepartmentId, setBulkDepartmentId] = useState('');
  const [error, setError] = useState('');
  const [tempPasswordInfo, setTempPasswordInfo] = useState<{
    staffCode: string;
    tempPassword: string;
  } | null>(null);

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
      apiFetch<StaffMember[]>(
        listQueryString ? `/admin/staff?${listQueryString}` : '/admin/staff',
      ),
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
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Không gán được bộ môn.'),
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
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Không đổi được vai trò.'),
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
  const editRolesNeedDepartment = roleDraft.some((role) =>
    DEPT_SCOPED_ROLES.includes(role),
  );
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
        description="Hệ thống không lưu email — mật khẩu cấp lại được hiển thị một lần duy nhất, chuyển tận tay người dùng."
        actions={
          <Button
            type="button"
            onClick={() => {
              setNewRoles([]);
              setCreating(true);
            }}
          >
            + Thêm nhân viên
          </Button>
        }
      />

      <section aria-label="Bộ lọc nhân viên" className="mb-4 rounded-md border border-border bg-surface">
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
            <Td className="font-semibold text-ink">{member.staffCode}</Td>
            <Td>{member.fullName}</Td>
            <Td>
              {member.department?.name ?? (
                <Badge tone="warning">Chưa có bộ môn</Badge>
              )}
            </Td>
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
              <div className="flex gap-3 text-xs font-semibold">
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
                  className={member.isActive ? 'text-danger hover:underline' : 'text-success hover:underline'}
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
            Bộ môn quyết định phạm vi sinh viên mà giảng viên và trưởng bộ môn nhìn thấy. Đổi bộ
            môn là đổi luôn danh sách sinh viên của họ — thao tác này được ghi vào nhật ký.
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

      <Modal
        title="Đổi vai trò"
        open={editingRoles !== null}
        onClose={() => setEditingRoles(null)}
      >
        <form onSubmit={onRolesSubmit} className="space-y-4">
          <FormError>{error}</FormError>
          <p className="text-sm text-muted">
            <strong className="text-ink">{editingRoles?.staffCode}</strong> —{' '}
            {editingRoles?.fullName}
            {editingRoles?.department
              ? ` (${editingRoles.department.name})`
              : ' (chưa có bộ môn)'}
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
              Giảng viên và Trưởng bộ môn bắt buộc thuộc một bộ môn — gán bộ môn trước, nếu
              không tài khoản sẽ không thấy sinh viên nào.
            </FormError>
          ) : null}
          <p className="rounded-md bg-fpt-orange-50 p-3 text-xs text-muted">
            Vai trò quyết định quyền xem sinh viên, nhập/xuất Excel và nhận cảnh báo leo thang.
            Danh sách vai trò mới thay thế hoàn toàn danh sách cũ; thao tác được ghi vào nhật ký.
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
            Hệ thống sẽ sinh mật khẩu tạm và hiển thị một lần sau khi tạo. Người dùng bắt buộc
            đổi mật khẩu ở lần đăng nhập đầu tiên.
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
