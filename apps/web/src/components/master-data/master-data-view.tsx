'use client';

import { Button } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { DataTable, Td } from '../ui/data-table';
import { FormError, Input, Label, Select } from '../ui/form';
import { Modal } from '../ui/modal';
import { PageHeader } from '../ui/page-header';
import { apiFetch, ApiError } from '../../lib/api';
import { useMe } from '../../lib/hooks';
import {
  MASTER_DATA_TABS,
  type MasterDataTabKey,
} from '../../lib/master-data-tabs';
import type {
  ClassSection,
  Department,
  Major,
  StaffMember,
  Subject,
} from '../../lib/types';

type Entity = Department | Major | Subject | ClassSection;

const MANAGER_ROLES = ['ADMIN', 'TRAINING_OFFICER'];

/**
 * Gợi ý điều kiện xóa theo từng danh mục — hiển thị trong modal xác nhận.
 * Partial vì ba tab ánh xạ (`department-aliases`, `major-aliases`,
 * `class-major-rules`) được MASTER_DATA_TABS khai báo nhưng render qua
 * MappingView, không qua đây.
 */
const DELETE_HINTS: Partial<Record<MasterDataTabKey, string>> = {
  departments:
    'Chỉ xóa được khi bộ môn không còn sinh viên, nhân sự, ngành hay môn học trực thuộc.',
  majors: 'Chỉ xóa được khi ngành không còn sinh viên theo học.',
  subjects: 'Chỉ xóa được khi môn học không còn lớp học phần.',
  'class-sections': 'Chỉ xóa được khi lớp chưa có sinh viên ghi danh.',
};

function entityLabel(tab: MasterDataTabKey, entity: Entity): string {
  const name = 'name' in entity ? entity.name : (entity as ClassSection).term;
  return `${entity.code} — ${name}`;
}

export function MasterDataView({ tab }: { tab: MasterDataTabKey }) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Entity | null>(null);
  const [deleting, setDeleting] = useState<Entity | null>(null);
  const [formError, setFormError] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const config = MASTER_DATA_TABS.find((item) => item.key === tab)!;
  const formOpen = creating || editing !== null;

  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiFetch<Department[]>('/departments'),
  });
  const majors = useQuery({
    queryKey: ['majors'],
    queryFn: () => apiFetch<Major[]>('/majors'),
    enabled: tab === 'majors',
  });
  const subjects = useQuery({
    queryKey: ['subjects'],
    queryFn: () => apiFetch<Subject[]>('/subjects'),
    enabled: tab === 'subjects' || tab === 'class-sections',
  });
  const classSections = useQuery({
    queryKey: ['class-sections'],
    queryFn: () => apiFetch<ClassSection[]>('/class-sections'),
    enabled: tab === 'class-sections',
  });
  const isAdmin = me?.user.roles.includes('ADMIN') ?? false;
  const lecturers = useQuery({
    queryKey: ['admin-staff-lecturers'],
    queryFn: () => apiFetch<StaffMember[]>('/admin/staff?role=LECTURER'),
    enabled: formOpen && tab === 'class-sections' && isAdmin,
  });

  const canManage = me?.user.roles.some((role) => MANAGER_ROLES.includes(role)) ?? false;

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setFormError('');
  }

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing
        ? apiFetch(`${config.path}/${editing.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : apiFetch(config.path, { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: async () => {
      closeForm();
      await queryClient.invalidateQueries({ queryKey: [tab] });
      await queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (err) =>
      setFormError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`${config.path}/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setDeleting(null);
      setDeleteError('');
      await queryClient.invalidateQueries({ queryKey: [tab] });
      await queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (err) =>
      setDeleteError(err instanceof ApiError ? err.message : 'Không thể xóa.'),
  });

  function onFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payloads: Partial<Record<MasterDataTabKey, Record<string, unknown>>> = {
      departments: { code: form.get('code'), name: form.get('name') },
      majors: {
        code: form.get('code'),
        name: form.get('name'),
        departmentId: form.get('departmentId'),
      },
      subjects: {
        code: form.get('code'),
        name: form.get('name'),
        credits: Number(form.get('credits')),
        departmentId: form.get('departmentId'),
      },
      'class-sections': {
        code: form.get('code'),
        subjectId: form.get('subjectId'),
        lecturerId: form.get('lecturerId'),
        term: form.get('term'),
      },
    };
    saveMutation.mutate(payloads[tab] ?? {});
  }

  function rowActions(entity: Entity) {
    if (!canManage) {
      return null;
    }
    return (
      <Td className="w-px whitespace-nowrap text-right">
        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            onClick={() => {
              setFormError('');
              setEditing(entity);
            }}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-fpt-blue transition-colors duration-[var(--duration-fast)] hover:border-fpt-blue hover:bg-fpt-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange"
          >
            Sửa
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleteError('');
              setDeleting(entity);
            }}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-danger transition-colors duration-[var(--duration-fast)] hover:border-danger hover:bg-danger/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
          >
            Xóa
          </button>
        </div>
      </Td>
    );
  }

  /** Banner lỗi query — tuyệt đối không lẫn với trạng thái "rỗng thật". */
  function errorBanner(query: { isError: boolean; error: unknown }) {
    if (!query.isError) {
      return null;
    }
    return (
      <div className="mb-4">
        <FormError>
          {query.error instanceof ApiError ? query.error.message : 'Không tải được dữ liệu.'}
        </FormError>
      </div>
    );
  }

  const actionHeader = canManage ? ['Thao tác'] : [];
  const editingClassSection =
    tab === 'class-sections' ? (editing as ClassSection | null) : null;

  return (
    <>
      <PageHeader
        title="Đào tạo"
        description="Quản lý danh mục bộ môn, ngành học, môn học và lớp học phần."
        actions={
          canManage ? (
            <Button
              type="button"
              onClick={() => {
                setFormError('');
                setCreating(true);
              }}
            >
              + Thêm {config.singular}
            </Button>
          ) : undefined
        }
      />

      <nav aria-label="Danh mục đào tạo" className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {MASTER_DATA_TABS.map((item) => (
          <Link
            key={item.key}
            href={`/master-data/${item.key}`}
            aria-current={tab === item.key ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === item.key
                ? 'border-fpt-orange text-fpt-orange'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {tab === 'departments' ? (
        <>
          {errorBanner(departments)}
          <DataTable
          headers={['Mã', 'Tên bộ môn', 'Sinh viên', 'GV/NV', 'Ngành', ...actionHeader]}
          isLoading={departments.isLoading}
          skeletonRows={5}
          isEmpty={!departments.isLoading && !departments.isError && (departments.data?.length ?? 0) === 0}
          emptyMessage="Chưa có bộ môn nào — bấm “+ Thêm bộ môn” để tạo danh mục đầu tiên."
        >
          {(departments.data ?? []).map((department) => (
            <tr key={department.id} className="transition-colors hover:bg-fpt-orange-50/40">
              <Td className="font-semibold">{department.code}</Td>
              <Td>{department.name}</Td>
              <Td className="tabular-nums">{department._count?.students ?? 0}</Td>
              <Td className="tabular-nums">{department._count?.staff ?? 0}</Td>
              <Td className="tabular-nums">{department._count?.majors ?? 0}</Td>
              {rowActions(department)}
            </tr>
          ))}
          </DataTable>
        </>
      ) : null}

      {tab === 'majors' ? (
        <>
          {errorBanner(majors)}
          <DataTable
          headers={['Mã', 'Tên ngành', 'Bộ môn', 'Sinh viên', ...actionHeader]}
          isLoading={majors.isLoading}
          skeletonRows={5}
          isEmpty={!majors.isLoading && !majors.isError && (majors.data?.length ?? 0) === 0}
          emptyMessage="Chưa có ngành học nào — bấm “+ Thêm ngành học” để tạo danh mục đầu tiên."
        >
          {(majors.data ?? []).map((major) => (
            <tr key={major.id} className="transition-colors hover:bg-fpt-orange-50/40">
              <Td className="font-semibold">{major.code}</Td>
              <Td>{major.name}</Td>
              <Td>{major.department?.name ?? '—'}</Td>
              <Td className="tabular-nums">{major._count?.students ?? 0}</Td>
              {rowActions(major)}
            </tr>
          ))}
          </DataTable>
        </>
      ) : null}

      {tab === 'subjects' ? (
        <>
          {errorBanner(subjects)}
          <DataTable
          headers={['Mã môn', 'Tên môn học', 'Tín chỉ', 'Bộ môn', 'Lớp học phần', ...actionHeader]}
          isLoading={subjects.isLoading}
          skeletonRows={5}
          isEmpty={!subjects.isLoading && !subjects.isError && (subjects.data?.length ?? 0) === 0}
          emptyMessage="Chưa có môn học nào — bấm “+ Thêm môn học” để tạo danh mục đầu tiên."
        >
          {(subjects.data ?? []).map((subject) => (
            <tr key={subject.id} className="transition-colors hover:bg-fpt-orange-50/40">
              <Td className="font-semibold">{subject.code}</Td>
              <Td>{subject.name}</Td>
              <Td className="tabular-nums">{subject.credits}</Td>
              <Td>{subject.department?.name ?? '—'}</Td>
              <Td className="tabular-nums">{subject._count?.classSections ?? 0}</Td>
              {rowActions(subject)}
            </tr>
          ))}
          </DataTable>
        </>
      ) : null}

      {tab === 'class-sections' ? (
        <>
          {errorBanner(classSections)}
          <DataTable
          headers={['Mã lớp', 'Môn', 'Giảng viên', 'Học kỳ', 'Sĩ số', 'Bảng điểm', ...actionHeader]}
          isLoading={classSections.isLoading}
          skeletonRows={6}
          isEmpty={
            !classSections.isLoading &&
            !classSections.isError &&
            (classSections.data?.length ?? 0) === 0
          }
          emptyMessage="Chưa có lớp học phần nào — bấm “+ Thêm lớp học phần” để tạo."
        >
          {(classSections.data ?? []).map((section) => (
            <tr key={section.id} className="transition-colors hover:bg-fpt-orange-50/40">
              <Td className="font-semibold">{section.code}</Td>
              <Td>{section.subject?.name ?? '—'}</Td>
              <Td>{section.lecturer?.fullName ?? '—'}</Td>
              <Td>{section.term}</Td>
              <Td className="tabular-nums">{section._count?.enrollments ?? 0}</Td>
              <Td>
                <Link
                  href={`/class-sections/${section.id}/grades`}
                  className="rounded-md px-3 py-2 text-sm font-semibold text-fpt-blue hover:underline"
                >
                  Bảng điểm
                </Link>
              </Td>
              {rowActions(section)}
            </tr>
          ))}
          </DataTable>
        </>
      ) : null}

      <Modal
        title={editing ? `Sửa ${config.singular}` : `Thêm ${config.singular}`}
        open={formOpen}
        onClose={closeForm}
      >
        <form key={editing?.id ?? 'create'} onSubmit={onFormSubmit} className="space-y-4">
          <FormError>{formError}</FormError>

          <div>
            <Label htmlFor="code">Mã</Label>
            <Input id="code" name="code" required defaultValue={editing?.code ?? ''} />
          </div>

          {tab !== 'class-sections' ? (
            <div>
              <Label htmlFor="name">Tên</Label>
              <Input
                id="name"
                name="name"
                required
                defaultValue={editing && 'name' in editing ? editing.name : ''}
              />
            </div>
          ) : null}

          {tab === 'subjects' ? (
            <div>
              <Label htmlFor="credits">Số tín chỉ</Label>
              <Input
                id="credits"
                name="credits"
                type="number"
                min={1}
                max={10}
                required
                defaultValue={editing && 'credits' in editing ? editing.credits : ''}
              />
            </div>
          ) : null}

          {tab === 'majors' || tab === 'subjects' ? (
            <div>
              <Label htmlFor="departmentId">Bộ môn</Label>
              <Select
                id="departmentId"
                name="departmentId"
                required
                defaultValue={
                  editing && 'departmentId' in editing ? editing.departmentId : ''
                }
              >
                <option value="" disabled>
                  Chọn bộ môn…
                </option>
                {(departments.data ?? []).map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          {tab === 'class-sections' ? (
            <>
              <div>
                <Label htmlFor="subjectId">Môn học</Label>
                <Select
                  id="subjectId"
                  name="subjectId"
                  required
                  defaultValue={editingClassSection?.subjectId ?? ''}
                >
                  <option value="" disabled>
                    Chọn môn học…
                  </option>
                  {(subjects.data ?? []).map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.code} — {subject.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="lecturerId">Giảng viên</Label>
                <Select
                  id="lecturerId"
                  name="lecturerId"
                  required
                  defaultValue={editingClassSection?.lecturerId ?? ''}
                >
                  <option value="" disabled>
                    Chọn giảng viên…
                  </option>
                  {(lecturers.data ?? []).map((lecturer) => (
                    <option key={lecturer.id} value={lecturer.id}>
                      {lecturer.staffCode} — {lecturer.fullName}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-muted">
                  Danh sách giảng viên chỉ tải được với quyền quản trị.
                </p>
              </div>
              <div>
                <Label htmlFor="term">Học kỳ</Label>
                <Input
                  id="term"
                  name="term"
                  placeholder="vd: SU25"
                  required
                  defaultValue={editingClassSection?.term ?? ''}
                />
              </div>
            </>
          ) : null}

          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={closeForm}>
              Hủy
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Đang lưu…' : editing ? 'Cập nhật' : 'Lưu'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        title={`Xóa ${config.singular}`}
        open={deleting !== null}
        onClose={() => setDeleting(null)}
      >
        {deleting ? (
          <div className="space-y-4">
            <FormError>{deleteError}</FormError>
            <p className="text-sm text-ink">
              Bạn chắc chắn muốn xóa <strong>{entityLabel(tab, deleting)}</strong>?
            </p>
            <p className="rounded-md bg-fpt-orange-50 px-3 py-2 text-xs text-muted">
              {DELETE_HINTS[tab] ?? ''} Hành động này không thể hoàn tác.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" type="button" onClick={() => setDeleting(null)}>
                Hủy
              </Button>
              <Button
                variant="danger"
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleting.id)}
              >
                {deleteMutation.isPending ? 'Đang xóa…' : 'Xóa vĩnh viễn'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
