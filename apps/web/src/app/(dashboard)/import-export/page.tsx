'use client';

import { Button, SurfaceCard } from '@fcare/ui-kit';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { FormError, Label, Select } from '../../../components/ui/form';
import { PageHeader } from '../../../components/ui/page-header';
import { ImportHistory } from '../../../components/imports/import-history';
import { ImportWizard } from '../../../components/imports/import-wizard';
import { apiDownload, apiUpload, ApiError, apiFetch } from '../../../lib/api';
import type { ClassSection, ImportResult } from '../../../lib/types';

function ImportResultView({ result }: { result: ImportResult | null }) {
  if (!result) {
    return null;
  }
  return (
    <div className="mt-4 rounded-md border border-border bg-surface p-4 text-sm">
      <p className="font-semibold text-success">
        Hoàn tất:{' '}
        {[
          result.created !== undefined ? `${result.created} tạo mới` : null,
          result.updated !== undefined ? `${result.updated} cập nhật` : null,
          result.upserted !== undefined ? `${result.upserted} bản ghi` : null,
        ]
          .filter(Boolean)
          .join(', ')}
        {result.errors.length > 0 ? ` · ${result.errors.length} dòng lỗi` : ''}
      </p>
      {result.warnings && result.warnings.length > 0 ? (
        <ul className="mt-2 space-y-1 text-warning">
          {result.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {result.errors.length > 0 ? (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-danger">
          {result.errors.map((rowError) => (
            <li key={`${rowError.row}-${rowError.message}`}>
              Dòng {rowError.row}: {rowError.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function ImportExportPage() {
  const studentsFileRef = useRef<HTMLInputElement>(null);
  const gradesFileRef = useRef<HTMLInputElement>(null);
  const [studentsResult, setStudentsResult] = useState<ImportResult | null>(null);
  const [gradesResult, setGradesResult] = useState<ImportResult | null>(null);
  const [exportSectionId, setExportSectionId] = useState('');
  const [error, setError] = useState('');
  // Lô PENDING chọn từ lịch sử để nạp lại vào wizard — xem import-wizard.tsx.
  const [resumeBatchId, setResumeBatchId] = useState<string | null>(null);

  const { data: classSections } = useQuery({
    queryKey: ['class-sections'],
    queryFn: () => apiFetch<ClassSection[]>('/class-sections'),
  });

  const importStudents = useMutation({
    mutationFn: (file: File) => apiUpload<ImportResult>('/excel/students/import', file),
    onSuccess: (result) => {
      setStudentsResult(result);
      setError('');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Import thất bại.'),
  });

  const importGrades = useMutation({
    mutationFn: (file: File) => apiUpload<ImportResult>('/excel/grades/import', file),
    onSuccess: (result) => {
      setGradesResult(result);
      setError('');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Import thất bại.'),
  });

  async function onExport(path: string, fallback: string) {
    setError('');
    try {
      await apiDownload(path, fallback);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Export thất bại.');
    }
  }

  return (
    <>
      <PageHeader
        title="Import / Export dữ liệu"
        description="Nhập dữ liệu từ file Excel của trường theo 4 bước có xem trước. Chỉ Trưởng bộ môn, Cán bộ Đào tạo và CTSV được sử dụng. Mọi thao tác đều ghi audit log."
      />

      <ImportWizard
        resumeBatchId={resumeBatchId}
        onResumeHandled={() => setResumeBatchId(null)}
      />

      <section aria-labelledby="legacy-heading" className="mt-10">
        <h2
          id="legacy-heading"
          className="mb-3 font-[family-name:var(--font-display)] text-lg font-bold text-fpt-blue-900"
        >
          Import/Export mẫu chuẩn FCare
        </h2>

        <div className="mb-4">
          <FormError>{error}</FormError>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <SurfaceCard className="border-t-4 border-t-fpt-blue">
            <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-fpt-blue-900">
              Danh sách sinh viên
            </h3>
            <p className="mt-1 text-sm text-muted">
              Cột hợp lệ: MSSV · Họ tên · Ngày sinh · Giới tính · Mã ngành · Khóa · Lớp · Trạng
              thái. Ô chứa CCCD/SĐT/email/địa chỉ sẽ bị <strong>bỏ qua</strong>, phần còn lại vẫn
              nhập bình thường.
            </p>

            <div className="mt-5 space-y-3">
              <div>
                <Label htmlFor="students-file">Chọn file .xlsx</Label>
                <input
                  ref={studentsFileRef}
                  id="students-file"
                  type="file"
                  accept=".xlsx"
                  className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-fpt-orange-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-fpt-orange"
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  disabled={importStudents.isPending}
                  onClick={() => {
                    const file = studentsFileRef.current?.files?.[0];
                    if (file) {
                      importStudents.mutate(file);
                    }
                  }}
                >
                  {importStudents.isPending ? 'Đang import…' : '⇧ Import sinh viên'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onExport('/excel/students/export', 'fcare-sinh-vien.xlsx')}
                >
                  ⇩ Export sinh viên
                </Button>
              </div>
              <ImportResultView result={studentsResult} />
            </div>
          </SurfaceCard>

          <SurfaceCard className="border-t-4 border-t-fpt-orange">
            <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-fpt-blue-900">
              Bảng điểm lớp học phần
            </h3>
            <p className="mt-1 text-sm text-muted">
              Cột hợp lệ: Mã lớp học phần · MSSV · Chuyên cần (%) · Điểm giữa kỳ · Điểm cuối kỳ ·
              Điểm tổng kết · Cấm thi · Kết quả.
            </p>

            <div className="mt-5 space-y-3">
              <div>
                <Label htmlFor="grades-file">Chọn file .xlsx</Label>
                <input
                  ref={gradesFileRef}
                  id="grades-file"
                  type="file"
                  accept=".xlsx"
                  className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-fpt-orange-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-fpt-orange"
                />
              </div>
              <Button
                type="button"
                disabled={importGrades.isPending}
                onClick={() => {
                  const file = gradesFileRef.current?.files?.[0];
                  if (file) {
                    importGrades.mutate(file);
                  }
                }}
              >
                {importGrades.isPending ? 'Đang import…' : '⇧ Import bảng điểm'}
              </Button>

              <div className="border-t border-border pt-3">
                <Label htmlFor="export-section">Export điểm theo lớp học phần</Label>
                <div className="flex flex-wrap gap-3">
                  <Select
                    id="export-section"
                    value={exportSectionId}
                    onChange={(event) => setExportSectionId(event.target.value)}
                    className="max-w-64"
                  >
                    <option value="">Chọn lớp học phần…</option>
                    {(classSections ?? []).map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.code}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!exportSectionId}
                    onClick={() =>
                      onExport(
                        `/excel/grades/export?classSectionId=${exportSectionId}`,
                        'fcare-diem.xlsx',
                      )
                    }
                  >
                    ⇩ Export điểm
                  </Button>
                </div>
              </div>
              <ImportResultView result={gradesResult} />
            </div>
          </SurfaceCard>
        </div>
      </section>

      <ImportHistory onResume={setResumeBatchId} />
    </>
  );
}
