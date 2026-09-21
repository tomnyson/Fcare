import { Badge } from '@fcare/ui-kit';
import Link from 'next/link';
import { departmentAlertsHref, departmentStudentsHref } from '../../lib/department-links';
import { ALERT_LEVEL_TONES, STUDENT_STATUS_LABELS } from '../../lib/labels';
import type { DepartmentStatistics } from '../../lib/types';

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-blue';

/**
 * Thẻ một bộ môn ở Tổng quan. Tên, badge cảnh báo và từng chip trạng thái đều
 * là link sang danh sách đã lọc sẵn — người xem đi thẳng từ con số tới đúng
 * những sinh viên/cảnh báo tạo nên nó.
 */
export function DepartmentCard({ department }: { department: DepartmentStatistics }) {
  return (
    <article className="rounded-[var(--radius-card)] border border-border bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-fpt-blue-900">
            <Link
              href={departmentStudentsHref(department.id)}
              className={`rounded-sm underline decoration-transparent decoration-2 underline-offset-4 transition-colors hover:text-fpt-orange-600 hover:decoration-fpt-orange ${FOCUS_RING}`}
            >
              {department.name}
            </Link>
          </h3>
          <p className="text-xs text-muted">
            {department.code} · {department.totalStudents} SV
            {department.totalStaff !== null ? ` · ${department.totalStaff} GV/NV` : ''}
          </p>
        </div>
        {department.openAlerts > 0 ? (
          <Link
            href={departmentAlertsHref(department.id)}
            aria-label={`Xem ${department.openAlerts} cảnh báo chưa giải quyết của ${department.name}`}
            className={`shrink-0 rounded-full transition-transform hover:-translate-y-0.5 active:translate-y-0 ${FOCUS_RING}`}
          >
            <Badge
              tone={ALERT_LEVEL_TONES[4]}
              className="transition-shadow hover:shadow-[var(--shadow-card)] hover:ring-2 hover:ring-danger/30"
            >
              {department.openAlerts} cảnh báo
            </Badge>
          </Link>
        ) : (
          <Badge tone="success">Ổn định</Badge>
        )}
      </div>
      <ul className="mt-4 flex flex-wrap gap-2 text-xs">
        {department.studentsByStatus.map((group) => (
          <li key={group.status}>
            <Link
              href={departmentStudentsHref(department.id, group.status)}
              className={`inline-block rounded-full bg-surface px-3 py-1 text-muted transition-colors hover:bg-fpt-blue/10 hover:text-fpt-blue-700 active:bg-fpt-blue/15 ${FOCUS_RING}`}
            >
              {STUDENT_STATUS_LABELS[group.status]}: <strong>{group.count}</strong>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
