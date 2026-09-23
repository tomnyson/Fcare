'use client';

import {
  BAND_CLASSIFICATIONS,
  CRITERION_LABELS,
  CRITERION_POINTS,
  scoreBand,
} from '@fcare/shared-types';
import { formatDateTime } from '../../lib/labels';
import type { Evaluation } from '../../lib/types';
import { DataTable, Td } from '../ui/data-table';
import { EvaluationGuidanceCell } from './evaluation-guidance';
import { usePagedList } from '../../lib/use-paged-list';

/** Bảng các bản nhận xét của sinh viên — mỗi lớp học phần một dòng. */
export function EvaluationList({
  items,
  isLoading,
}: {
  items: Evaluation[];
  isLoading: boolean;
}) {
  const paged = usePagedList(items, { pageSize: 10 });

  return (
    <DataTable
      headers={[
        'Học kỳ',
        'Lớp học phần',
        'Học lực',
        'Thái độ',
        'Buổi vắng',
        'Tiêu chí đã tích',
        'Gợi ý & độ khẩn đề xuất',
        'Nhận xét',
        'Người nhận xét',
        'Thời điểm',
      ]}
      isLoading={isLoading}
      skeletonRows={5}
      isEmpty={!isLoading && items.length === 0}
      emptyMessage="Chưa có nhận xét nào."
      pagination={{
        page: paged.page,
        totalPages: paged.totalPages,
        total: paged.total,
        limit: paged.pageSize,
        onPageChange: paged.setPage,
        onLimitChange: paged.setPageSize,
        isLoading,
      }}
    >
      {paged.pageItems.map((evaluation) => {
        const criteria = evaluation.criteria.map((mark) => mark.criterion);
        return (
          <tr key={evaluation.id}>
            <Td className="font-semibold">{evaluation.term}</Td>
            <Td className="whitespace-normal">
              {evaluation.classSection?.code ?? '—'}
              {evaluation.classSection?.subject ? (
                <span className="block text-xs text-muted">
                  {evaluation.classSection.subject.name}
                </span>
              ) : null}
            </Td>
            <Td>
              {BAND_CLASSIFICATIONS[scoreBand(evaluation.academicScore)]}{' '}
              <span className="text-xs text-muted">({evaluation.academicScore})</span>
            </Td>
            <Td>
              {BAND_CLASSIFICATIONS[scoreBand(evaluation.attitudeScore)]}{' '}
              <span className="text-xs text-muted">({evaluation.attitudeScore})</span>
            </Td>
            <Td>{evaluation.absentSessions ?? '—'}</Td>
            <Td className="max-w-72 whitespace-normal">
              {criteria.length === 0 ? (
                '—'
              ) : (
                <ul className="space-y-0.5 text-xs">
                  {criteria.map((criterion) => (
                    <li key={criterion}>
                      {CRITERION_LABELS[criterion]}{' '}
                      <span className="text-muted">+{CRITERION_POINTS[criterion]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Td>
            <Td>
              <EvaluationGuidanceCell
                scores={{
                  academicScore: evaluation.academicScore,
                  attitudeScore: evaluation.attitudeScore,
                  criteria,
                }}
              />
            </Td>
            <Td className="max-w-72 whitespace-normal">{evaluation.note ?? '—'}</Td>
            <Td>{evaluation.lecturer?.fullName ?? '—'}</Td>
            <Td className="text-muted">{formatDateTime(evaluation.createdAt)}</Td>
          </tr>
        );
      })}
    </DataTable>
  );
}
