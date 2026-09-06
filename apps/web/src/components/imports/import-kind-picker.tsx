'use client';

import { IMPORT_KINDS, type ImportKindSlug } from '../../lib/import-kinds';

interface ImportKindPickerProps {
  selected: readonly ImportKindSlug[];
  onToggle: (slug: ImportKindSlug) => void;
  disabled?: boolean;
}

/**
 * Bước 1 của trình hướng dẫn: tick một hoặc nhiều loại dữ liệu. Ba loại đọc từ
 * cùng file phân công có thể tick chung và chạy chuỗi; Bảng điểm là file khác
 * nên loại trừ với nhóm trên (luật ở `toggleImportKind`, không nằm ở đây).
 */
export function ImportKindPicker({ selected, onToggle, disabled = false }: ImportKindPickerProps) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-1 text-sm font-semibold text-ink">1. Chọn loại dữ liệu</legend>
      <p className="mb-3 text-xs text-muted">
        Có thể tick nhiều loại cùng file phân công — hệ thống chạy lần lượt theo thứ tự bắt buộc
        (môn học → giảng viên → lịch lớp), mỗi loại đều có bước xem trước. Bảng điểm là file riêng
        nên chọn riêng.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {IMPORT_KINDS.map((kind) => {
          const checked = selected.includes(kind.slug);
          return (
            <label
              key={kind.slug}
              className={`cursor-pointer rounded-md border p-4 transition-colors focus-within:ring-2 focus-within:ring-fpt-orange ${
                checked ? 'border-fpt-orange bg-fpt-orange-50/50' : 'border-border hover:border-fpt-blue'
              }`}
            >
              <input
                type="checkbox"
                name="import-kind"
                value={kind.slug}
                checked={checked}
                onChange={() => onToggle(kind.slug)}
                className="sr-only"
              />
              <span className="flex items-start justify-between gap-3">
                <span className="block font-semibold text-ink">{kind.label}</span>
                <span
                  aria-hidden="true"
                  className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold ${
                    checked
                      ? 'border-fpt-orange bg-fpt-orange text-white'
                      : 'border-border bg-white text-transparent'
                  }`}
                >
                  ✓
                </span>
              </span>
              <span className="mt-1 block text-sm text-muted">{kind.hint}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
