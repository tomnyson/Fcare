'use client';

import { Button } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { DataTable, Td } from '../ui/data-table';
import { FormError, Input, Label, Select } from '../ui/form';
import { Modal } from '../ui/modal';
import { PageHeader } from '../ui/page-header';
import { ApiError, apiFetch } from '../../lib/api';
import { useMe } from '../../lib/hooks';
import { MASTER_DATA_TABS } from '../../lib/master-data-tabs';
import type {
  ClassMajorRule,
  Department,
  DepartmentAlias,
  Major,
} from '../../lib/types';

export type MappingTabKey = 'department-aliases' | 'class-major-rules';

// Chỉ ADMIN và TRAINING_OFFICER có quyền `update MasterData` (xem
// apps/api/src/casl/ability.factory.ts) — các vai trò khác chỉ đọc được.
const MANAGER_ROLES = ['ADMIN', 'TRAINING_OFFICER'];

/** Hàng gộp: chỉ một nửa số trường có giá trị, tuỳ tab đang mở. */
type MappingRow = Partial<DepartmentAlias> & Partial<ClassMajorRule> & { id: string };

const DESCRIPTIONS: Record<MappingTabKey, string> = {
  'department-aliases':
    'Nhãn bộ môn trong file Excel của trường không trùng mã bộ môn trong hệ thống. Mỗi nhãn chưa ánh xạ khiến dòng dữ liệu tương ứng bị bỏ qua khi import.',
  'class-major-rules':
    'Hai chữ cái đầu của mã lớp hành chính xác định ngành học. Thiếu quy tắc thì sinh viên rơi vào hàng chờ gán ngành thủ công.',
};

export function MappingView({ tab }: { tab: MappingTabKey }) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const config = MASTER_DATA_TABS.find((item) => item.key === tab)!;
  const isAlias = tab === 'department-aliases';
  const canManage = me?.user.roles.some((role) => MANAGER_ROLES.includes(role)) ?? false;

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MappingRow | null>(null);
  const [deleting, setDeleting] = useState<MappingRow | null>(null);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const items = useQuery({
    queryKey: [tab],
    queryFn: () => apiFetch<MappingRow[]>(config.path),
  });
  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiFetch<Department[]>('/departments'),
    enabled: isAlias,
  });
  const majors = useQuery({
    queryKey: ['majors'],
    queryFn: () => apiFetch<Major[]>('/majors'),
    enabled: !isAlias,
  });

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setFormError('');
  }

  const save = useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiFetch(editing ? `${config.path}/${editing.id}` : config.path, {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success('Lưu thành công!');
      queryClient.invalidateQueries({ queryKey: [tab] });
      closeForm();
    },
    onError: (err) =>
      setFormError(err instanceof ApiError ? err.message : 'Lưu thất bại.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`${config.path}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Xóa thành công!');
      queryClient.invalidateQueries({ queryKey: [tab] });
      setDeleting(null);
      setFormError('');
    },
    onError: (err) =>
      setFormError(err instanceof ApiError ? err.message : 'Xóa thất bại.'),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const errors: Record<string, string> = {};

    if (isAlias) {
      const alias = String(form.get('alias') ?? '').trim();
      const departmentId = String(form.get('departmentId') ?? '');

      if (!alias) errors.alias = 'Nhãn bộ môn không được để trống';
      else if (alias.length > 100) errors.alias = 'Nhãn bộ môn tối đa 100 ký tự';

      if (!departmentId) errors.departmentId = 'Vui lòng chọn bộ môn đích';

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }

      save.mutate({ alias, departmentId });
    } else {
      const classPrefix = String(form.get('classPrefix') ?? '').trim().toUpperCase();
      const majorId = String(form.get('majorId') ?? '');

      if (!classPrefix) errors.classPrefix = 'Tiền tố lớp không được để trống';
      else if (!/^[A-Z]{2}$/.test(classPrefix)) errors.classPrefix = 'Tiền tố lớp phải gồm đúng 2 chữ cái';

      if (!majorId) errors.majorId = 'Vui lòng chọn ngành đích';

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }

      save.mutate({ classPrefix, majorId });
    }
  }

  return (
    <>
      <PageHeader
        title={config.label}
        description={DESCRIPTIONS[tab]}
        actions={
          canManage ? (
            <Button type="button" onClick={() => setCreating(true)}>
              + Thêm {config.singular}
            </Button>
          ) : undefined
        }
      />

      <nav aria-label="Danh mục đào tạo" className="mb-4 flex flex-wrap gap-2">
        {MASTER_DATA_TABS.map((item) => (
          <Link
            key={item.key}
            href={`/master-data/${item.key}`}
            aria-current={item.key === tab ? 'page' : undefined}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              item.key === tab
                ? 'bg-fpt-blue-900 text-white'
                : 'bg-white text-ink hover:bg-fpt-orange-50'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {items.isError ? (
        <div className="mb-4">
          <FormError>
            {items.error instanceof ApiError
              ? items.error.message
              : 'Không tải được danh sách ánh xạ.'}
          </FormError>
        </div>
      ) : null}

      <DataTable
        headers={
          isAlias
            ? ['Nhãn trong file Excel', 'Bộ môn đích', ...(canManage ? ['Thao tác'] : [])]
            : ['Tiền tố lớp', 'Ngành đích', ...(canManage ? ['Thao tác'] : [])]
        }
        isLoading={items.isLoading}
        skeletonRows={6}
        isEmpty={!items.isLoading && !items.isError && (items.data?.length ?? 0) === 0}
        emptyMessage="Chưa có ánh xạ nào."
      >
        {(items.data ?? []).map((row) => (
          <tr key={row.id} className="transition-colors hover:bg-fpt-orange-50/40">
            <Td className="font-semibold text-ink">
              {isAlias ? row.alias : row.classPrefix}
            </Td>
            <Td>
              {isAlias
                ? `${row.department?.code ?? '—'} — ${row.department?.name ?? ''}`
                : `${row.major?.code ?? '—'} — ${row.major?.name ?? ''}`}
            </Td>
            {canManage ? (
              <Td>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => setEditing(row)}>
                    Sửa
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setDeleting(row)}>
                    Xóa
                  </Button>
                </div>
              </Td>
            ) : null}
          </tr>
        ))}
      </DataTable>

      <Modal
        title={`${editing ? 'Sửa' : 'Thêm'} ${config.singular}`}
        open={creating || editing !== null}
        onClose={closeForm}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          {isAlias ? (
            <>
              <div>
                <Label htmlFor="alias">Nhãn trong file Excel</Label>
                <Input id="alias" name="alias" defaultValue={editing?.alias ?? ''} required />
                {fieldErrors.alias && <p className="mt-1 text-sm text-danger">{fieldErrors.alias}</p>}
              </div>
              <div>
                <Label htmlFor="departmentId">Bộ môn đích</Label>
                <Select
                  id="departmentId"
                  name="departmentId"
                  defaultValue={editing?.departmentId ?? ''}
                  required
                >
                  <option value="">Chọn bộ môn…</option>
                  {(departments.data ?? []).map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.code} — {department.name}
                    </option>
                  ))}
                </Select>
                {fieldErrors.departmentId && <p className="mt-1 text-sm text-danger">{fieldErrors.departmentId}</p>}
              </div>
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="classPrefix">Tiền tố lớp (2 chữ cái)</Label>
                <Input
                  id="classPrefix"
                  name="classPrefix"
                  defaultValue={editing?.classPrefix ?? ''}
                  pattern="[A-Za-z]{2}"
                  maxLength={2}
                  required
                />
                {fieldErrors.classPrefix && <p className="mt-1 text-sm text-danger">{fieldErrors.classPrefix}</p>}
              </div>
              <div>
                <Label htmlFor="majorId">Ngành đích</Label>
                <Select id="majorId" name="majorId" defaultValue={editing?.majorId ?? ''} required>
                  <option value="">Chọn ngành…</option>
                  {(majors.data ?? []).map((major) => (
                    <option key={major.id} value={major.id}>
                      {major.code} — {major.name}
                    </option>
                  ))}
                </Select>
                {fieldErrors.majorId && <p className="mt-1 text-sm text-danger">{fieldErrors.majorId}</p>}
              </div>
            </>
          )}
          <FormError>{formError}</FormError>
          <div className="flex gap-3">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
            <Button type="button" variant="secondary" onClick={closeForm}>
              Hủy
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        title={`Xóa ${config.singular}`}
        open={deleting !== null}
        onClose={() => setDeleting(null)}
      >
        <p className="text-sm text-ink">
          Xóa ánh xạ này? Các lần import sau sẽ bỏ qua dòng dùng nhãn tương ứng.
        </p>
        <FormError>{formError}</FormError>
        <div className="mt-4 flex gap-3">
          <Button
            type="button"
            disabled={remove.isPending}
            onClick={() => remove.mutate(deleting!.id)}
          >
            {remove.isPending ? 'Đang xóa…' : 'Xóa'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setDeleting(null)}>
            Hủy
          </Button>
        </div>
      </Modal>
    </>
  );
}
