import { sectionContextLabel, type SectionContext } from '../../lib/care-context';

/**
 * Dòng bối cảnh của một lượt chăm sóc: học kỳ · lớp · môn. Đặt ngay dưới tên
 * người ghi để người đọc biết trao đổi thuộc môn nào, kỳ nào trước khi đọc nội dung.
 */
export function CareContextTag({
  section,
  fallbackCode,
}: {
  section: SectionContext | null | undefined;
  /** Nhật ký cũ chưa có lớp nhưng gắn cảnh báo → dùng mã lớp của cảnh báo. */
  fallbackCode?: string | null;
}) {
  if (!section) {
    return (
      <p className="mt-2 text-xs italic text-muted">
        {fallbackCode
          ? `Lớp ${fallbackCode} (theo cảnh báo) — chưa ghi học kỳ, môn học`
          : 'Chưa gắn lớp học phần — nhật ký ghi trước khi có thông tin học kỳ, môn học'}
      </p>
    );
  }
  return (
    <p
      className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
      aria-label={`Bối cảnh: ${sectionContextLabel(section)}`}
    >
      <span className="rounded-full bg-fpt-orange-50 px-2 py-0.5 font-semibold text-fpt-orange-600 ring-1 ring-fpt-orange/30 ring-inset">
        Học kỳ {section.term}
      </span>
      <span className="rounded-full bg-surface-raised px-2 py-0.5 font-mono font-medium text-ink ring-1 ring-border ring-inset">
        {section.code}
      </span>
      {section.subject ? (
        <span className="font-medium text-ink">
          {section.subject.name}
          <span className="ml-1 font-normal text-muted">({section.subject.code})</span>
        </span>
      ) : null}
    </p>
  );
}
