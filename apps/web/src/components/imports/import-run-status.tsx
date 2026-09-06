'use client';

import { importKindLabel, type ImportKindSlug } from '../../lib/import-kinds';
import type { ImportCommitResult } from '../../lib/types';

export interface ImportKindResult {
  slug: ImportKindSlug;
  result: ImportCommitResult;
}

/**
 * Một lượt chạy của trình hướng dẫn: danh sách loại theo thứ tự bắt buộc, vị
 * trí đang xử lý, kết quả các loại đã ghi. Bất biến — mọi bước tạo object mới.
 */
export interface ImportRun {
  order: ImportKindSlug[];
  position: number;
  results: ImportKindResult[];
  /** Loại mà chuỗi dừng lại (huỷ lô / lỗi) — các loại sau nó không chạy. */
  stoppedAt: ImportKindSlug | null;
}

export const EMPTY_RUN: ImportRun = { order: [], position: 0, results: [], stoppedAt: null };

export function currentKind(run: ImportRun): ImportKindSlug | null {
  return run.order[run.position] ?? null;
}

export function remainingKinds(run: ImportRun): ImportKindSlug[] {
  return run.order.slice(run.position + 1);
}

export function isRunFinished(run: ImportRun): boolean {
  return run.order.length > 0 && run.position >= run.order.length;
}

export function formatCommitResult(result: ImportCommitResult): string {
  return `Đã ghi: ${result.created} tạo mới, ${result.updated} cập nhật, ${result.skipped} bỏ qua.`;
}

interface ImportRunStatusProps {
  run: ImportRun;
  isUploading: boolean;
}

/** Dòng tiến độ (chỉ khi chạy nhiều loại) + danh sách kết quả từng loại đã ghi. */
export function ImportRunStatus({ run, isUploading }: ImportRunStatusProps) {
  const current = currentKind(run);
  const showProgress = run.order.length > 1 && current !== null && run.stoppedAt === null;
  const remaining = remainingKinds(run);

  if (!showProgress && run.results.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {showProgress ? (
        <p className="rounded-md bg-fpt-blue/10 px-3.5 py-2.5 text-sm font-medium text-fpt-blue-900">
          Đang xử lý {run.position + 1}/{run.order.length}: {importKindLabel(current)}
          {isUploading ? ' — đang đọc file…' : ''}
          {remaining.length > 0 ? ` · Còn lại: ${remaining.map(importKindLabel).join(', ')}` : ''}
        </p>
      ) : null}

      {run.results.length > 0 ? (
        <ul
          aria-label="Kết quả import"
          className="space-y-1 rounded-md bg-success/10 px-3.5 py-2.5 text-sm text-success"
        >
          {run.results.map(({ slug, result }) => (
            <li key={slug} className="flex flex-wrap gap-x-2">
              <span className="font-semibold">{importKindLabel(slug)}</span>
              <span>{formatCommitResult(result)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
