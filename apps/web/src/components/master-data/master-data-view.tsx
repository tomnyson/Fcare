'use client';

import { Button } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { DataTable, Td } from '../ui/data-table';
import { FormError, Input, Label, Select } from '../ui/form';
import { Modal } from '../ui/modal';
import { PageHeader } from '../ui/page-header';
import { useCatalogPaging } from './catalog-paging';
import { ClassSectionsTable, SubjectsTable } from './catalog-tables';
import { apiFetch, ApiError } from '../../lib/api';
import { useMe } from '../../lib/hooks';
import { MASTER_DATA_TABS, type MasterDataTabKey } from '../../lib/master-data-tabs';
import type {
  ClassSection,
  Department,
  Major,
  StaffMember,
  Subject,
  Term,
  TermSeason,
} from '../../lib/types';
import { formatDateForInput, generateTermPreset, seasonBadgeInfo } from './term-preset-helpers';
import { DepartmentActiveToggle } from './department-active-toggle';

type Entity = Department | Major | Subject | ClassSection | Term;

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
  terms: 'Chỉ xóa được khi học kỳ chưa có lớp học phần nào liên kết.',
};

function entityLabel(tab: MasterDataTabKey, entity: Entity): string {
  if (tab === 'terms') {
    const term = entity as Term;
    return `${term.code} — ${term.name}`;
  }
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

  // Trang quản lý cần cả bộ môn đã tắt để bật lại; dropdown chỉ dùng bộ môn đang mở.
  const departments = useQuery({
    queryKey: ['departments', 'all'],
    queryFn: () => apiFetch<Department[]>('/departments?includeInactive=true'),
  });
  const activeDepartments = (departments.data ?? []).filter((department) => department.isActive);
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
  const terms = useQuery({
    queryKey: ['terms'],
    queryFn: () => apiFetch<Term[]>('/terms'),
    enabled: tab === 'terms' || tab === 'class-sections',
  });
  const currentTerm = useQuery({
    queryKey: ['terms', 'current'],
    queryFn: () => apiFetch<Term | null>('/terms/current'),
    enabled: tab === 'terms' || tab === 'class-sections',
  });
  const isAdmin = me?.user.roles.includes('ADMIN') ?? false;
  const lecturers = useQuery({
    queryKey: ['admin-staff-lecturers'],
    queryFn: () => apiFetch<StaffMember[]>('/admin/staff?role=LECTURER'),
    enabled: formOpen && tab === 'class-sections' && isAdmin,
  });

  const canManage = me?.user.roles.some((role) => MANAGER_ROLES.includes(role)) ?? false;

  const [termSeason, setTermSeason] = useState<TermSeason>('SPRING');
  const [termYear, setTermYear] = useState<number>(() => new Date().getFullYear());
  const [termCode, setTermCode] = useState('');
  const [termName, setTermName] = useState('');

  // Môn học/lớp học phần có vài trăm dòng — tìm nhanh + lật trang phía web.
  const subjectPaging = useCatalogPaging(
    subjects.data ?? [],
    (subject, needle) =>
      subject.code.toLowerCase().includes(needle) || subject.name.toLowerCase().includes(needle),
    tab,
  );
  const sectionPaging = useCatalogPaging(
    classSections.data ?? [],
    (section, needle) =>
      section.code.toLowerCase().includes(needle) ||
      (section.subject?.name ?? '').toLowerCase().includes(needle) ||
      (section.lecturer?.fullName ?? '').toLowerCase().includes(needle) ||
      section.term.toLowerCase().includes(needle),
    tab,
  );
  const [termStart, setTermStart] = useState('');
  const [termEnd, setTermEnd] = useState('');
  const [termOverride, setTermOverride] = useState(false);

  function applyPreset(season: TermSeason, year: number) {
    const p = generateTermPreset(year, season);
    setTermSeason(season);
    setTermYear(year);
    setTermCode(p.code);
    setTermName(p.name);
    setTermStart(p.startDate);
    setTermEnd(p.endDate);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setFormError('');
    setTermCode('');
    setTermName('');
    setTermStart('');
    setTermEnd('');
    setTermOverride(false);
  }

  const setCurrentMutation = useMutation({
    mutationFn: ({ id, isCurrent }: { id: string; isCurrent: boolean }) =>
      apiFetch(`/terms/${id}/set-current`, {
        method: 'POST',
        body: JSON.stringify({ isCurrent }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['terms'] });
      await queryClient.invalidateQueries({ queryKey: ['terms', 'current'] });
    },
    onError: (err) =>
      setFormError(err instanceof ApiError ? err.message : 'Không thể cập nhật kỳ hiện tại.'),
  });

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
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`${config.path}/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setDeleting(null);
      setDeleteError('');
      await queryClient.invalidateQueries({ queryKey: [tab] });
      await queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (err) => setDeleteError(err instanceof ApiError ? err.message : 'Không thể xóa.'),
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
      terms:
        tab === 'terms'
          ? {
              code: termCode || form.get('code'),
              name: termName || form.get('name'),
              season: termSeason,
              year: Number(termYear),
              startDate: new Date(
                `${termStart || form.get('startDate')}T00:00:00.000Z`,
              ).toISOString(),
              endDate: new Date(`${termEnd || form.get('endDate')}T23:59:59.999Z`).toISOString(),
              isCurrentOverride: termOverride,
            }
          : undefined,
    };
    saveMutation.mutate(payloads[tab] ?? {});
  }

  function rowActions(entity: Entity) {
    if (!canManage) {
      return null;
    }
    const isTerm = tab === 'terms';
    const term = isTerm ? (entity as Term) : null;
    const isCurrentlyActive = term && (term.isCurrentOverride || currentTerm.data?.id === term.id);

    return (
      <Td className="w-px whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-1.5">
          {isTerm && term && !isCurrentlyActive ? (
            <button
              type="button"
              disabled={setCurrentMutation.isPending}
              onClick={() => setCurrentMutation.mutate({ id: term.id, isCurrent: true })}
              className="rounded-md border border-success/40 bg-success/10 px-2 py-1 text-xs font-semibold text-success transition-colors hover:bg-success/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success"
              title="Đặt làm kỳ hiện tại"
            >
              Đặt kỳ này
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setFormError('');
              setEditing(entity);
              if (tab === 'terms') {
                const t = entity as Term;
                setTermCode(t.code);
                setTermName(t.name);
                setTermSeason(t.season);
                setTermYear(t.year);
                setTermStart(formatDateForInput(t.startDate));
                setTermEnd(formatDateForInput(t.endDate));
                setTermOverride(t.isCurrentOverride);
              }
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
  const editingClassSection = tab === 'class-sections' ? (editing as ClassSection | null) : null;

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
                if (tab === 'terms') {
                  applyPreset('SPRING', new Date().getFullYear());
                }
              }}
            >
              + Thêm {config.singular}
            </Button>
          ) : undefined
        }
      />

      <nav
        aria-label="Danh mục đào tạo"
        className="mb-5 flex flex-wrap gap-1 border-b border-border"
      >
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
            headers={[
              'Mã',
              'Tên bộ môn',
              'Sinh viên',
              'GV/NV',
              'Ngành',
              'Cơ sở mở',
              ...actionHeader,
            ]}
            isLoading={departments.isLoading}
            skeletonRows={5}
            isEmpty={
              !departments.isLoading &&
              !departments.isError &&
              (departments.data?.length ?? 0) === 0
            }
            emptyMessage="Chưa có bộ môn nào — bấm “+ Thêm bộ môn” để tạo danh mục đầu tiên."
          >
            {(departments.data ?? []).map((department) => (
              <tr
                key={department.id}
                className={`transition-colors hover:bg-fpt-orange-50/40 ${
                  department.isActive ? '' : 'text-muted [&_td]:opacity-70'
                }`}
              >
                <Td className="font-semibold">{department.code}</Td>
                <Td>{department.name}</Td>
                <Td className="tabular-nums">{department._count?.students ?? 0}</Td>
                <Td className="tabular-nums">{department._count?.staff ?? 0}</Td>
                <Td className="tabular-nums">{department._count?.majors ?? 0}</Td>
                <Td>
                  <DepartmentActiveToggle department={department} disabled={!canManage} />
                </Td>
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
        <SubjectsTable
          query={subjects}
          paging={subjectPaging}
          actionHeader={actionHeader}
          rowActions={rowActions}
          errorBanner={errorBanner}
        />
      ) : null}

      {tab === 'class-sections' ? (
        <ClassSectionsTable
          query={classSections}
          paging={sectionPaging}
          actionHeader={actionHeader}
          rowActions={rowActions}
          errorBanner={errorBanner}
        />
      ) : null}

      {tab === 'terms' ? (
        <>
          {errorBanner(terms)}
          <DataTable
            headers={[
              'Mã kỳ',
              'Tên học kỳ',
              'Mùa & Năm',
              'Thời gian',
              'Trạng thái',
              ...actionHeader,
            ]}
            isLoading={terms.isLoading}
            skeletonRows={6}
            isEmpty={!terms.isLoading && !terms.isError && (terms.data?.length ?? 0) === 0}
            emptyMessage="Chưa có học kỳ nào — bấm “+ Thêm học kỳ” để tạo danh mục đầu tiên."
          >
            {(terms.data ?? []).map((term) => {
              const badge = seasonBadgeInfo(term.season);
              const isCurrent = currentTerm.data?.id === term.id;
              const startStr = new Date(term.startDate).toLocaleDateString('vi-VN');
              const endStr = new Date(term.endDate).toLocaleDateString('vi-VN');

              return (
                <tr key={term.id} className="transition-colors hover:bg-fpt-orange-50/40">
                  <Td className="font-semibold text-ink">{term.code}</Td>
                  <Td>{term.name}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-1 text-xs">
                      <span>{badge.icon}</span>
                      <span>
                        {badge.label} • {term.year}
                      </span>
                    </span>
                  </Td>
                  <Td className="text-xs text-muted tabular-nums">
                    {startStr} – {endStr}
                  </Td>
                  <Td>
                    {isCurrent ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
                        <span>●</span>
                        Kỳ hiện tại{term.isCurrentOverride ? ' (Chỉ định)' : ''}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </Td>
                  {rowActions(term)}
                </tr>
              );
            })}
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

          {tab !== 'class-sections' && tab !== 'terms' ? (
            <div>
              <Label htmlFor="code">Mã</Label>
              <Input id="code" name="code" required defaultValue={editing?.code ?? ''} />
            </div>
          ) : null}

          {tab !== 'class-sections' && tab !== 'terms' ? (
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
                defaultValue={editing && 'departmentId' in editing ? editing.departmentId : ''}
              >
                <option value="" disabled>
                  Chọn bộ môn…
                </option>
                {activeDepartments.map((department) => (
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
                <Select
                  id="term"
                  name="term"
                  required
                  defaultValue={editingClassSection?.term ?? currentTerm.data?.code ?? ''}
                >
                  <option value="" disabled>
                    Chọn học kỳ…
                  </option>
                  {(terms.data ?? []).map((t) => (
                    <option key={t.id} value={t.code}>
                      {t.code} — {t.name}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          ) : null}

          {tab === 'terms' ? (
            <>
              {!editing ? (
                <div className="rounded-lg border border-border bg-fpt-orange-50/50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink">Gợi ý nhanh theo mùa</span>
                    <select
                      value={termYear}
                      onChange={(e) => {
                        const y = Number(e.target.value);
                        setTermYear(y);
                        applyPreset(termSeason, y);
                      }}
                      className="rounded border border-border bg-white px-2 py-0.5 text-xs font-medium text-ink"
                    >
                      {[2024, 2025, 2026, 2027, 2028].map((y) => (
                        <option key={y} value={y}>
                          Năm {y}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['SPRING', 'SUMMER', 'FALL'] as const).map((s) => {
                      const badge = seasonBadgeInfo(s);
                      const isSelected = termSeason === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => applyPreset(s, termYear)}
                          className={`flex items-center justify-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-all ${
                            isSelected
                              ? 'border-fpt-orange bg-white text-fpt-orange shadow-sm'
                              : 'border-border bg-white/70 text-muted hover:border-border hover:bg-white hover:text-ink'
                          }`}
                        >
                          <span>{badge.icon}</span>
                          <span>{badge.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="code">Mã kỳ (viết hoa, không dấu cách)</Label>
                  <Input
                    id="code"
                    name="code"
                    required
                    value={termCode}
                    onChange={(e) => setTermCode(e.target.value.toUpperCase())}
                    placeholder="vd: SP25"
                  />
                </div>
                <div>
                  <Label htmlFor="name">Tên kỳ học</Label>
                  <Input
                    id="name"
                    name="name"
                    required
                    value={termName}
                    onChange={(e) => setTermName(e.target.value)}
                    placeholder="vd: Spring 2025"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="startDate">Ngày bắt đầu kỳ</Label>
                  <Input
                    id="startDate"
                    name="startDate"
                    type="date"
                    required
                    value={termStart}
                    onChange={(e) => setTermStart(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="endDate">Ngày kết thúc kỳ</Label>
                  <Input
                    id="endDate"
                    name="endDate"
                    type="date"
                    required
                    value={termEnd}
                    onChange={(e) => setTermEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isCurrentOverride"
                  name="isCurrentOverride"
                  checked={termOverride}
                  onChange={(e) => setTermOverride(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-fpt-orange focus:ring-fpt-orange"
                />
                <Label
                  htmlFor="isCurrentOverride"
                  className="!mb-0 cursor-pointer text-xs font-medium text-ink"
                >
                  Đặt làm kỳ hiện tại (bật cờ ưu tiên hiển thị)
                </Label>
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
