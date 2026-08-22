'use client';

import { ROLE_KEYS, type RoleKey } from '@fcare/shared-types';
import { Badge, Button } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { DataTable, Td } from '../../../../components/ui/data-table';
import { FormError, FormSuccess, Input, Label, Select } from '../../../../components/ui/form';
import { Modal } from '../../../../components/ui/modal';
import { PageHeader } from '../../../../components/ui/page-header';
import { apiFetch, ApiError } from '../../../../lib/api';
import { ROLE_LABELS } from '../../../../lib/labels';
import type { Department, StaffMember } from '../../../../lib/types';

interface CreateStaffResult {
  staff: StaffMember;
  tempPassword: string;
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [tempPasswordInfo, setTempPasswordInfo] = useState<{
    staffCode: string;
    tempPassword: string;
  } | null>(null);

  const { data: staff, isLoading } = useQuery({
    queryKey: ['admin-staff'],
    queryFn: () => apiFetch<StaffMember[]>('/admin/staff'),
  });
  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiFetch<Department[]>('/departments'),
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch<CreateStaffResult>('/admin/staff', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async (result) => {
      setCreating(false);
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

  function onCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const roles = ROLE_KEYS.filter((role) => form.get(`role-${role}`) === 'on');
    if (roles.length === 0) {
      setError('Chọn ít nhất một vai trò.');
      return;
    }
    const departmentId = form.get('departmentId') as string;
    createMutation.mutate({
      staffCode: form.get('staffCode'),
      fullName: form.get('fullName'),
      roles,
      ...(departmentId ? { departmentId } : {}),
    });
  }

  return (
    <>
      <PageHeader
        title="Quản trị người dùng"
        description="Hệ thống không lưu email — mật khẩu cấp lại được hiển thị một lần duy nhất, chuyển tận tay người dùng."
        actions={
          <Button type="button" onClick={() => setCreating(true)}>
            + Thêm nhân viên
          </Button>
        }
      />

      <div className="mb-4 space-y-3">
        <FormError>{error}</FormError>
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

      <DataTable
        headers={['Mã NV', 'Họ tên', 'Bộ môn', 'Vai trò', 'Trạng thái', 'Thao tác']}
        isEmpty={!isLoading && (staff?.length ?? 0) === 0}
      >
        {(staff ?? []).map((member) => (
          <tr key={member.id} className="transition-colors hover:bg-fpt-orange-50/40">
            <Td className="font-semibold text-ink">{member.staffCode}</Td>
            <Td>{member.fullName}</Td>
            <Td>{member.department?.name ?? '—'}</Td>
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
            <Label htmlFor="departmentId">Bộ môn (bắt buộc với GV/TBM)</Label>
            <Select id="departmentId" name="departmentId" defaultValue="">
              <option value="">Không thuộc bộ môn</option>
              {(departments ?? []).map((department) => (
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
