'use client';

import { Button } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { DataTable, Td } from '../ui/data-table';
import { FormError, Input, Label, Select } from '../ui/form';
import { Modal } from '../ui/modal';
import { PageHeader } from '../ui/page-header';
import { usePagedList } from '../../lib/use-paged-list';
import { ApiError, apiFetch } from '../../lib/api';
import { useMe } from '../../lib/hooks';
import { canManageMasterData, MASTER_DATA_TABS } from '../../lib/master-data-tabs';
import type {
  ClassMajorRule,
  Department,
  DepartmentAlias,
  Major,
  MajorAlias,
} from '../../lib/types';

export type MappingTabKey =
  | 'department-aliases'
  | 'major-aliases'
  | 'class-major-rules';

/** Hàng gộp: chỉ phần trường ứng với tab đang mở mới có giá trị. */
type MappingRow = Partial<DepartmentAlias> &
  Partial<MajorAlias> &
  Partial<ClassMajorRule> & { id: string };

interface MappingConfig {
  /** Trường khoá tra cứu trong file Excel. */
  keyField: 'alias' | 'classPrefix';
  keyLabel: string;
  /** Ràng buộc nhập cho khoá — chỉ quy tắc lớp mới giới hạn 2 chữ cái. */
  keyPattern?: string;
  keyMaxLength?: number;
  keyUppercase?: boolean;
  targetField: 'departmentId' | 'majorId';
  targetLabel: string;
  /** Danh mục đích để đổ vào <select>. */
  targetKind: 'department' | 'major';
  description: string;
  /** Hậu quả thật khi xoá — khác nhau giữa bộ môn và ngành. */
  deleteWarning: string;
}

/**
 * Ba tab ánh xạ chỉ khác nhau ở cặp (khoá, đích) nên dùng chung một view.
 * Hậu quả khi THIẾU ánh xạ thì KHÁC nhau và phải nói đúng: thiếu ánh xạ bộ môn
 * → dòng bị bỏ qua; thiếu ánh xạ ngành → sinh viên vẫn được tạo nhưng để trống
 * ngành (xem `RosterCommitter`).
 */
const MAPPING_CONFIGS: Record<MappingTabKey, MappingConfig> = {
  'department-aliases': {
    keyField: 'alias',
    keyLabel: 'Nhãn trong file Excel',
    targetField: 'departmentId',
    targetLabel: 'Bộ môn đích',
    targetKind: 'department',
    description:
      'Nhãn bộ môn trong file Excel của trường không trùng mã bộ môn trong hệ thống. Mỗi nhãn chưa ánh xạ khiến dòng dữ liệu tương ứng bị bỏ qua khi import.',
    deleteWarning:
      'Xóa ánh xạ này? Các lần import sau sẽ bỏ qua dòng dùng nhãn tương ứng, trừ khi nhãn trùng đúng mã bộ môn trong hệ thống.',
  },
  'major-aliases': {
    keyField: 'alias',
    keyLabel: 'Mã ngành trong file Excel',
    targetField: 'majorId',
    targetLabel: 'Ngành đích',
    targetKind: 'major',
    description:
      'Cột "Mã ngành" của file DSSV lớp môn dùng mã riêng của phòng đào tạo (LTWE02, DIMA01…), không trùng mã ngành trong hệ thống. Thiếu ánh xạ thì sinh viên VẪN được tạo, chỉ để trống ngành.',
    deleteWarning:
      'Xóa ánh xạ này? Các lần import sau sẽ tạo sinh viên với ngành để trống, trừ khi mã trùng đúng mã ngành trong hệ thống.',
  },
  'class-major-rules': {
    keyField: 'classPrefix',
    keyLabel: 'Tiền tố lớp (2 chữ cái)',
    keyPattern: '[A-Za-z]{2}',
    keyMaxLength: 2,
    keyUppercase: true,
    targetField: 'majorId',
    targetLabel: 'Ngành đích',
    targetKind: 'major',
    description:
      'Hai chữ cái đầu của mã lớp hành chính xác định ngành học. Thiếu quy tắc thì sinh viên rơi vào hàng chờ gán ngành thủ công.',
    deleteWarning:
      'Xóa quy tắc này? Sinh viên có mã lớp bắt đầu bằng tiền tố này sẽ rơi vào hàng chờ gán ngành thủ công.',
  },
};

export function MappingView({ tab }: { tab: MappingTabKey }) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const config = MASTER_DATA_TABS.find((item) => item.key === tab)!;
  const mapping = MAPPING_CONFIGS[tab];
  const wantsDepartment = mapping.targetKind === 'department';
  const canManage = canManageMasterData(me?.user.roles ?? []);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MappingRow | null>(null);
  const [deleting, setDeleting] = useState<MappingRow | null>(null);
  const [formError, setFormError] = useState('');

  const items = useQuery({
    queryKey: [tab],
    queryFn: () => apiFetch<MappingRow[]>(config.path),
  });
  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiFetch<Department[]>('/departments'),
    enabled: wantsDepartment,
  });
  const majors = useQuery({
    queryKey: ['majors'],
    queryFn: () => apiFetch<Major[]>('/majors'),
    enabled: !wantsDepartment,
  });
  const targets = wantsDepartment ? departments.data : majors.data;
  const paged = usePagedList(items.data ?? [], { pageSize: 10, resetKey: tab });

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
      queryClient.invalidateQueries({ queryKey: [tab] });
      closeForm();
    },
    onError: (err) =>
      setFormError(err instanceof ApiError ? err.message : 'Lưu thất bại.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`${config.path}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [tab] });
      setDeleting(null);
      setFormError('');
    },
    onError: (err) =>
      setFormError(err instanceof ApiError ? err.message : 'Xóa thất bại.'),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const key = String(form.get(mapping.keyField) ?? '').trim();
    save.mutate({
      [mapping.keyField]: mapping.keyUppercase ? key.toUpperCase() : key,
      [mapping.targetField]: String(form.get(mapping.targetField) ?? ''),
    });
  }

  return (
    <>
      <PageHeader
        title={config.label}
        description={mapping.description}
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
        fitViewport
        headers={[
          mapping.keyLabel,
          mapping.targetLabel,
          ...(canManage ? ['Thao tác'] : []),
        ]}
        isLoading={items.isLoading}
        skeletonRows={paged.pageSize}
        isEmpty={!items.isLoading && !items.isError && (items.data?.length ?? 0) === 0}
        emptyMessage="Chưa có ánh xạ nào."
        pagination={{
          page: paged.page,
          totalPages: paged.totalPages,
          total: paged.total,
          limit: paged.pageSize,
          isLoading: items.isLoading,
          onPageChange: paged.setPage,
          onLimitChange: paged.setPageSize,
          label: 'Phân trang ánh xạ',
        }}
      >
        {paged.pageItems.map((row) => {
          const target = wantsDepartment ? row.department : row.major;
          return (
            <tr key={row.id} className="transition-colors hover:bg-fpt-orange-50/40">
              <Td className="font-semibold text-ink">{row[mapping.keyField]}</Td>
              <Td>{`${target?.code ?? '—'} — ${target?.name ?? ''}`}</Td>
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
          );
        })}
      </DataTable>

      <Modal
        title={`${editing ? 'Sửa' : 'Thêm'} ${config.singular}`}
        open={creating || editing !== null}
        onClose={closeForm}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor={mapping.keyField}>{mapping.keyLabel}</Label>
            <Input
              id={mapping.keyField}
              name={mapping.keyField}
              defaultValue={editing?.[mapping.keyField] ?? ''}
              pattern={mapping.keyPattern}
              maxLength={mapping.keyMaxLength}
              required
            />
          </div>
          <div>
            <Label htmlFor={mapping.targetField}>{mapping.targetLabel}</Label>
            <Select
              id={mapping.targetField}
              name={mapping.targetField}
              defaultValue={editing?.[mapping.targetField] ?? ''}
              required
            >
              <option value="">Chọn {mapping.targetLabel.toLowerCase()}…</option>
              {(targets ?? []).map((target) => (
                <option key={target.id} value={target.id}>
                  {target.code} — {target.name}
                </option>
              ))}
            </Select>
          </div>
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
        <p className="text-sm text-ink">{mapping.deleteWarning}</p>
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
