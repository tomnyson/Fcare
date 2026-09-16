'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiDownload, apiFetch } from '../../lib/api';
import {
  attendanceCareState,
  buildCareQuery,
  type AttendanceCareState,
  type CareCounts,
  type CareLecturer,
  type CareReport,
  type CareSection,
  type CareStatus,
  type CareStudentAttendanceAlert,
} from '../../lib/care-statistics';
import { Badge } from '@fcare/ui-kit';
import { ALERT_LEVEL_TONES } from '../../lib/labels';
import { DataTable, Td } from '../ui/data-table';
import { FilterBar, FilterField, FilterGrid } from '../ui/filter-bar';
import { FormError, Select } from '../ui/form';

const COUNT_HEADERS = [
  'Số SV',
  'Đã chăm sóc',
  'Chưa chăm sóc',
  'Tỷ lệ',
  'Nhận xét',
  'Nhật ký',
  'Trao đổi',
  'CB điểm danh',
  'GV lớp đã CS',
  'GV khác CS',
  'CB chờ GV lớp',
];
const ATTENDANCE_STATE_LABELS: Record<
  AttendanceCareState,
  { label: string; tone: 'success' | 'info' | 'warning'; title: string }
> = {
  owner: {
    label: 'GV lớp đã CS',
    tone: 'success',
    title: 'Giảng viên đứng lớp đã ghi nhật ký cho cảnh báo điểm danh này.',
  },
  others: {
    label: 'GV khác CS',
    tone: 'info',
    title: 'Có giảng viên khác đã chăm sóc; giảng viên đứng lớp vẫn còn được nhắc.',
  },
  pending: {
    label: 'Chờ GV lớp',
    tone: 'warning',
    title: 'Chưa ai ghi nhật ký cho cảnh báo điểm danh này.',
  },
};
const HEADERS = ['Giảng viên', 'Bộ môn', 'Số lớp', ...COUNT_HEADERS];
const toggleClass =
  'text-left font-semibold text-fpt-orange-600 hover:underline focus-visible:outline-2';
const formatDate = (value: string) =>
  new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

function Counts({ row }: { row: CareCounts }) {
  return (
    <>
      <Td>{row.studentCount}</Td>
      <Td>{row.caredCount}</Td>
      <Td>{row.uncaredCount}</Td>
      <Td>{row.careRate === null ? '—' : `${row.careRate}%`}</Td>
      <Td>{row.evaluationCount}</Td>
      <Td>{row.careLogCount}</Td>
      <Td>{row.discussionCount ?? 0}</Td>
      <Td>{row.attendanceAlerts?.total ?? 0}</Td>
      <Td>{row.attendanceAlerts?.caredByOwner ?? 0}</Td>
      <Td>{row.attendanceAlerts?.caredByOthers ?? 0}</Td>
      <Td>{row.attendanceAlerts?.pending ?? 0}</Td>
    </>
  );
}

/** Ô "CB điểm danh" của từng sinh viên: ai đã chăm sóc cảnh báo điểm danh. */
function AttendanceCell({ alert }: { alert: CareStudentAttendanceAlert | null | undefined }) {
  if (!alert) return <span className="text-muted">—</span>;
  const state = ATTENDANCE_STATE_LABELS[attendanceCareState(alert)];
  const absent = alert.absentSessions === null ? '' : ` · vắng ${alert.absentSessions} buổi`;
  return (
    <span title={`${state.title}${absent}`} className="inline-flex items-center gap-1.5">
      <Badge tone={state.tone}>{state.label}</Badge>
      <span className="text-xs text-muted tabular-nums">Mức {alert.level}</span>
    </span>
  );
}

function SectionRow({ section }: { section: CareSection }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr>
        <Td>
          <button
            type="button"
            aria-expanded={open}
            className={toggleClass}
            onClick={() => setOpen(!open)}
          >
            {open ? '▾' : '▸'} {section.code}
          </button>
        </Td>
        <Td>{section.subjectName}</Td>
        <Counts row={section} />
      </tr>
      {open && (
        <tr>
          <td colSpan={HEADERS.length} className="bg-surface p-4">
            <DataTable
              headers={[
                'Mã SV',
                'Họ tên',
                'Lớp',
                'Chăm sóc',
                'Nhận xét',
                'Nhật ký',
                'Trao đổi',
                'Gần nhất',
                'Cảnh báo',
                'CB điểm danh',
              ]}
              isEmpty={section.students.length === 0}
            >
              {section.students.map((student) => (
                <tr key={student.id}>
                  <Td>{student.studentCode}</Td>
                  <Td>{student.fullName}</Td>
                  <Td>{student.classCode || '—'}</Td>
                  <Td>
                    {student.cared ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-success">
                        ✓ Đã chăm sóc
                      </span>
                    ) : (
                      <span className="text-muted">Chưa chăm sóc</span>
                    )}
                  </Td>
                  <Td>{student.evaluationCount}</Td>
                  <Td>{student.careLogCount}</Td>
                  <Td>{student.discussionCount ?? 0}</Td>
                  <Td>{student.lastCareAt ? formatDate(student.lastCareAt) : '—'}</Td>
                  <Td>
                    {student.alertLevel ? (
                      <Badge
                        tone={ALERT_LEVEL_TONES[student.alertLevel] ?? 'danger'}
                        pulse={student.alertLevel >= 3}
                      >
                        Mức {student.alertLevel}
                      </Badge>
                    ) : (
                      <span className="text-muted">Không có</span>
                    )}
                  </Td>
                  <Td>
                    <AttendanceCell alert={student.attendanceAlert} />
                  </Td>
                </tr>
              ))}
            </DataTable>
          </td>
        </tr>
      )}
    </>
  );
}

function LecturerRow({ lecturer }: { lecturer: CareLecturer }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr>
        <Td>
          <button
            type="button"
            aria-expanded={open}
            className={toggleClass}
            onClick={() => setOpen(!open)}
          >
            {open ? '▾' : '▸'} {lecturer.fullName}
            <span className="block text-xs font-normal text-muted">{lecturer.staffCode}</span>
          </button>
        </Td>
        <Td>{lecturer.department?.name ?? '—'}</Td>
        <Td>{lecturer.sectionCount}</Td>
        <Counts row={lecturer} />
      </tr>
      {open && (
        <tr>
          <td colSpan={HEADERS.length} className="bg-surface p-4">
            <DataTable
              headers={['Lớp học phần', 'Môn học', ...COUNT_HEADERS]}
              isEmpty={lecturer.sections.length === 0}
            >
              {lecturer.sections.map((section) => (
                <SectionRow key={section.id} section={section} />
              ))}
            </DataTable>
          </td>
        </tr>
      )}
    </>
  );
}

export function CareTable({ term }: { term: string }) {
  const [lecturerId, setLecturerId] = useState('');
  const [status, setStatus] = useState<CareStatus>('all');
  const [exporting, setExporting] = useState(false);
  const [exportingDetail, setExportingDetail] = useState(false);
  const [exportError, setExportError] = useState('');
  const query = buildCareQuery(term, lecturerId, status);
  // The unfiltered result supplies a stable teacher selector even when a filter has no matches.
  const all = useQuery({
    queryKey: ['care-statistics', term, '', 'all'],
    queryFn: () => apiFetch<CareReport>(`/statistics/care${buildCareQuery(term)}`),
    enabled: !!term,
  });
  const filtered = useQuery({
    queryKey: ['care-statistics', term, lecturerId, status],
    queryFn: () => apiFetch<CareReport>(`/statistics/care${query}`),
    enabled: !!term && (!!lecturerId || status !== 'all'),
  });
  const report = lecturerId || status !== 'all' ? filtered : all;

  async function exportReport() {
    setExporting(true);
    setExportError('');
    try {
      await apiDownload(`/statistics/care/export.xlsx${query}`, `cham-soc-${term}.xlsx`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Không thể xuất báo cáo.');
    } finally {
      setExporting(false);
    }
  }

  async function exportDetailedReport() {
    setExportingDetail(true);
    setExportError('');
    try {
      const detailQuery = buildCareQuery(term, lecturerId, status, 'detailed');
      await apiDownload(`/statistics/care/export.xlsx${detailQuery}`, `cham-soc-chi-tiet-${term}.xlsx`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Không thể xuất báo cáo chi tiết.');
    } finally {
      setExportingDetail(false);
    }
  }

  if (!term)
    return (
      <p role="status" className="rounded-md border border-border bg-white p-5 text-sm text-muted">
        Chọn một học kỳ cụ thể để xem mức độ chăm sóc sinh viên.
      </p>
    );

  return (
    <div className="space-y-4">
      <FilterBar label="Bộ lọc chăm sóc sinh viên" onSubmit={(event) => event.preventDefault()}>
        <FilterGrid>
          <FilterField label="Giảng viên" htmlFor="care-lecturer">
            <Select
              id="care-lecturer"
              value={lecturerId}
              onChange={(event) => setLecturerId(event.target.value)}
            >
              <option value="">Tất cả giảng viên</option>
              {all.data?.lecturers.map((lecturer) => (
                <option key={lecturer.id} value={lecturer.id}>
                  {lecturer.fullName} ({lecturer.staffCode})
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Trạng thái chăm sóc" htmlFor="care-status">
            <Select
              id="care-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as CareStatus)}
            >
              <option value="all">Tất cả</option>
              <option value="cared">Đã chăm sóc</option>
              <option value="uncared">Chưa chăm sóc</option>
            </Select>
          </FilterField>
        </FilterGrid>
      </FilterBar>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {report.data
            ? `Học kỳ ${report.data.term.code} · Cập nhật ${formatDate(report.data.generatedAt)}`
            : 'Thống kê chăm sóc theo học kỳ'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={exporting || exportingDetail || !report.data || report.isFetching || report.isError}
            onClick={exportReport}
            className="rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {exporting ? 'Đang xuất…' : 'Xuất Excel tổng hợp'}
          </button>
          <button
            type="button"
            disabled={exporting || exportingDetail || !report.data || report.isFetching || report.isError}
            onClick={exportDetailedReport}
            className="rounded-md bg-fpt-orange px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-fpt-orange-600 disabled:opacity-50"
          >
            {exportingDetail ? 'Đang xuất chi tiết…' : 'Xuất chi tiết nội dung chăm sóc'}
          </button>
        </div>
      </div>
      <p className="text-sm text-muted">
        Đã chăm sóc khi sinh viên có nhận xét tại lớp trong kỳ, nhật ký chăm sóc hoặc trao đổi nội bộ trong thời gian học kỳ. Tổng giảng viên đếm mỗi sinh viên một lần; cộng các lớp có thể lớn hơn tổng này. Cảnh báo là mức cao nhất trong kỳ, kể cả đã giải quyết. Số liệu bên dưới và Excel áp dụng cùng bộ lọc.
      </p>
      {exportError && <FormError>{exportError}</FormError>}
      {all.isError && report !== all && <FormError>Không tải được danh sách giảng viên.</FormError>}
      {report.isError ? (
        <FormError>
          {report.error instanceof Error
            ? report.error.message
            : 'Không tải được thống kê chăm sóc.'}
        </FormError>
      ) : (
        <DataTable
          headers={HEADERS}
          isLoading={report.isLoading}
          isRefreshing={report.isFetching}
          isEmpty={!report.data?.lecturers.length}
          emptyMessage="Không có giảng viên hoặc sinh viên phù hợp với bộ lọc trong kỳ này."
        >
          {report.data?.lecturers.map((lecturer) => (
            <LecturerRow key={lecturer.id} lecturer={lecturer} />
          ))}
        </DataTable>
      )}
    </div>
  );
}
