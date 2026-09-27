'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';

export type RecipientGroupKey =
  | 'TEACHING_LECTURERS'
  | 'STUDENT_AFFAIRS'
  | 'HEAD_OF_DEPT'
  | 'TRAINING_OFFICE';

export interface RecipientGroup {
  key: RecipientGroupKey;
  /** Cảnh báo từ mức này trở lên thì nhóm nhận thông báo. */
  minLevel: number;
  members: { id: string; fullName: string }[];
}

const GROUP_LABELS: Record<RecipientGroupKey, string> = {
  TEACHING_LECTURERS: 'Giảng viên đang dạy sinh viên',
  STUDENT_AFFAIRS: 'Phòng Công tác sinh viên',
  HEAD_OF_DEPT: 'Trưởng bộ môn của sinh viên',
  TRAINING_OFFICE: 'Phòng Đào tạo',
};

const NAMES_SHOWN = 3;

export function splitRecipientGroups(groups: readonly RecipientGroup[], level: number) {
  return {
    included: groups.filter((group) => group.minLevel <= level),
    later: groups.filter((group) => group.minLevel > level),
  };
}

export function memberSummary(members: RecipientGroup['members']): string {
  if (members.length === 0) return 'Chưa có tài khoản nào đang hoạt động';
  const names = members.slice(0, NAMES_SHOWN).map((member) => member.fullName).join(', ');
  const rest = members.length - NAMES_SHOWN;
  return rest > 0 ? `${names} và ${rest} người khác` : names;
}

/** Danh sách "mức N gửi cho ai" — thuần hiển thị, dữ liệu từ API xem trước. */
export function AlertRecipientsList({
  groups,
  level,
}: {
  groups: readonly RecipientGroup[];
  level: number;
}) {
  const { included, later } = splitRecipientGroups(groups, level);
  return (
    <div className="rounded-md border border-fpt-orange/25 bg-white/70 px-3 py-2.5">
      <p className="text-xs font-semibold text-fpt-blue-900">Mức {level} sẽ gửi thông báo tới</p>
      <ul className="mt-1.5 space-y-1.5">
        {included.map((group) => (
          <li key={group.key} className="flex gap-2 text-xs">
            <span aria-hidden="true" className="mt-0.5 text-fpt-orange">
              ●
            </span>
            <span className="min-w-0">
              <span className="font-semibold text-ink">
                {GROUP_LABELS[group.key]}
                <span className="ml-1 font-normal text-muted tabular-nums">
                  ({group.members.length})
                </span>
              </span>
              <span
                className={`block break-words ${group.members.length === 0 ? 'text-muted italic' : 'text-ink'}`}
              >
                {memberSummary(group.members)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {later.length > 0 ? (
        <p className="mt-2 border-t border-border pt-1.5 text-xs text-muted">
          Chưa nhận ở mức này:{' '}
          {later
            .map((group) => `${GROUP_LABELS[group.key]} (từ Mức ${group.minLevel})`)
            .join(' · ')}
        </p>
      ) : null}
      <p className="mt-1.5 text-xs text-muted">
        Bạn không tự nhận thông báo của mình. Nếu điểm DRS học kỳ cao hơn, hệ thống gửi theo mức đã
        nâng; sinh viên đang có cảnh báo mở cùng mức trở lên thì chỉ gộp lý do, không gửi lại.
      </p>
    </div>
  );
}

/** Tải nhóm nhận một lần cho sinh viên; đổi mức chỉ lọc lại phía web. */
export function AlertRecipientsPreview({ studentId, level }: { studentId: string; level: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['alert-recipients-preview', studentId],
    queryFn: () =>
      apiFetch<{ groups: RecipientGroup[] }>(
        `/alerts/recipients-preview?studentId=${encodeURIComponent(studentId)}`,
      ),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div aria-busy="true" className="space-y-1.5 rounded-md border border-border px-3 py-2.5">
        <span className="block h-3 w-40 animate-pulse rounded bg-border motion-reduce:animate-none" />
        <span className="block h-3 w-full animate-pulse rounded bg-border motion-reduce:animate-none" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p role="alert" className="text-xs text-danger">
        Chưa tải được danh sách người nhận — cảnh báo vẫn gửi đúng theo ma trận khi lưu.
      </p>
    );
  }
  return <AlertRecipientsList groups={data.groups} level={level} />;
}
