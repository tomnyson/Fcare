'use client';

import { Button } from '@fcare/ui-kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import type { ClassSection, EnrollmentResult, SectionGradeRow, SectionGradesResponse } from '../../lib/types';
import { usePagedList } from '../../lib/use-paged-list';
import { DataTable, Td } from '../ui/data-table';
import { FormError } from '../ui/form';
import { Modal } from '../ui/modal';
import { AddStudentsModal } from './add-students-modal';
import { ConfirmRemoveStudentModal } from './confirm-remove-student-modal';
import { EditSectionStudentModal } from './edit-section-student-modal';

interface SectionStudentsRosterModalProps {
  open: boolean;
  section: ClassSection | null;
  onClose: () => void;
}

export function filterSectionStudents(
  rows: SectionGradeRow[],
  searchQuery: string,
): SectionGradeRow[] {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter(
    (r) =>
      r.studentCode.toLowerCase().includes(query) ||
      r.fullName.toLowerCase().includes(query),
  );
}

function renderResultBadge(result: EnrollmentResult) {
  switch (result) {
    case 'PASS':
      return (
        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
          Đạt
        </span>
      );
    case 'FAIL':
      return (
        <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">
          Không đạt
        </span>
      );
    case 'IN_PROGRESS':
    default:
      return (
        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
          Đang học
        </span>
      );
  }
}

export function SectionStudentsRosterModal({
  open,
  section,
  onClose,
}: SectionStudentsRosterModalProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<SectionGradeRow | null>(null);
  const [removingStudent, setRemovingStudent] = useState<SectionGradeRow | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['section-grades', section?.id],
    queryFn: () => apiFetch<SectionGradesResponse>(`/class-sections/${section?.id}/grades`),
    enabled: open && !!section?.id,
  });

  const rawRows = useMemo(() => data?.rows ?? [], [data?.rows]);

  const filteredRows = useMemo(
    () => filterSectionStudents(rawRows, searchQuery),
    [rawRows, searchQuery],
  );

  const paged = usePagedList(filteredRows, { pageSize: 10 });

  if (!open || !section) {
    return null;
  }

  const handleMutationSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['section-grades', section.id] });
    queryClient.invalidateQueries({ queryKey: ['class-sections'] });
  };

  const subjectName = section.subject ? `${section.subject.code} - ${section.subject.name}` : '';

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`Danh sách sinh viên lớp ${section.code}`}
        size="xl"
        scrollBody
      >
        <div className="space-y-4">
          {/* Section Summary Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-slate-50 p-3 text-xs sm:text-sm">
            <div>
              <span className="text-muted">Môn học: </span>
              <span className="font-semibold text-ink">{subjectName || '—'}</span>
            </div>
            <div>
              <span className="text-muted">Học kỳ: </span>
              <span className="font-semibold text-ink">{section.term}</span>
            </div>
            <div>
              <span className="text-muted">Sĩ số hiện tại: </span>
              <span className="font-bold text-fpt-orange">{rawRows.length}</span>
            </div>
          </div>

          {/* Action Bar: Search + Add */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:max-w-xs">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm MSSV, họ tên…"
                className="w-full rounded-md border border-border bg-white px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:border-fpt-orange focus:outline-none focus:ring-1 focus:ring-fpt-orange"
              />
            </div>
            <Button
              type="button"
              onClick={() => setAddModalOpen(true)}
              className="w-full sm:w-auto"
            >
              + Thêm sinh viên
            </Button>
          </div>

          {isError && (
            <FormError>
              {error instanceof Error ? error.message : 'Không tải được danh sách sinh viên.'}
            </FormError>
          )}

          {/* Table */}
          <DataTable
            headers={['STT', 'MSSV', 'Họ và tên', 'Điểm TK', 'Kết quả', 'Thao tác']}
            isLoading={isLoading}
            skeletonRows={paged.pageSize}
            isEmpty={!isLoading && !isError && filteredRows.length === 0}
            emptyMessage={
              searchQuery.trim()
                ? 'Không tìm thấy sinh viên nào phù hợp với từ khóa.'
                : 'Lớp học phần này chưa có sinh viên ghi danh.'
            }
            pagination={{
              page: paged.page,
              totalPages: paged.totalPages,
              total: paged.total,
              limit: paged.pageSize,
              isLoading,
              onPageChange: paged.setPage,
              onLimitChange: paged.setPageSize,
              label: 'Phân trang sinh viên lớp học phần',
            }}
          >
            {paged.pageItems.map((row, index) => (
              <tr key={row.enrollmentId} className="hover:bg-slate-50/80">
                <Td className="text-muted tabular-nums">
                  {(paged.page - 1) * paged.pageSize + index + 1}
                </Td>
                <Td className="font-mono font-semibold text-ink">{row.studentCode}</Td>
                <Td className="font-medium text-ink">{row.fullName}</Td>
                <Td className="tabular-nums">
                  {row.totalScore !== null ? (
                    <span className="font-semibold text-ink">{row.totalScore}</span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </Td>
                <Td>{renderResultBadge(row.result)}</Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditingStudent(row)}
                      className="rounded-md border border-fpt-blue/40 bg-fpt-blue/10 px-2.5 py-1 text-xs font-semibold text-fpt-blue transition-colors hover:bg-fpt-blue/20"
                      title="Chỉnh sửa thông tin / điểm sinh viên"
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemovingStudent(row)}
                      className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                      title="Xóa sinh viên khỏi lớp học phần"
                    >
                      Xóa
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </DataTable>

          <div className="flex justify-end pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Đóng
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Students Modal */}
      <AddStudentsModal
        open={addModalOpen}
        section={section}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => {
          handleMutationSuccess();
        }}
      />

      {/* Edit Student Modal */}
      <EditSectionStudentModal
        open={!!editingStudent}
        sectionId={section.id}
        student={editingStudent}
        onClose={() => setEditingStudent(null)}
        onSuccess={() => {
          handleMutationSuccess();
        }}
      />

      {/* Confirm Remove Student Modal */}
      <ConfirmRemoveStudentModal
        open={!!removingStudent}
        sectionId={section.id}
        sectionCode={section.code}
        student={removingStudent}
        onClose={() => setRemovingStudent(null)}
        onSuccess={() => {
          handleMutationSuccess();
        }}
      />
    </>
  );
}
