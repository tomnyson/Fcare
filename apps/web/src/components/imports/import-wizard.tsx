'use client';

import { Button, SurfaceCard } from '@fcare/ui-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ImportKindPicker } from './import-kind-picker';
import { ImportPreview } from './import-preview';
import {
  currentKind,
  EMPTY_RUN,
  ImportRunStatus,
  isRunFinished,
  remainingKinds,
  type ImportRun,
} from './import-run-status';
import { FormError, FormSuccess, Input, Label } from '../ui/form';
import { ApiError, apiFetch, apiUpload } from '../../lib/api';
import {
  importKindLabel,
  orderImportKinds,
  slugOfKind,
  toggleImportKind,
  type ImportKindSlug,
} from '../../lib/import-kinds';
import type {
  ImportBatchDetail,
  ImportCommitResult,
  ImportDiscardResult,
} from '../../lib/types';

const TERM_PATTERN = /^[A-Z]{2}\d{2}$/;
const STEP_LABELS = ['Chọn loại', 'Tải file', 'Xem trước', 'Xác nhận'];

/** Query key đã bị các thao tác import commit chạm tới, liệt kê tường minh
 * (thay cho invalidateQueries() không tham số làm mất cache toàn app):
 * - imports: lịch sử import vừa đổi trạng thái
 * - subjects: CATALOG tạo/cập nhật môn học
 * - admin-staff / admin-staff-lecturers: LECTURER tạo tài khoản giảng viên
 * - class-sections: SCHEDULE và SECTION_LIST tạo/cập nhật lớp học phần
 * - students / enrollments: GRADEBOOK, ROSTER, GRADE_ATTENDANCE tạo/cập nhật
 *   sinh viên, ghi danh, điểm và chuyên cần */
const COMMIT_AFFECTED_QUERY_KEYS: string[][] = [
  ['imports'],
  ['subjects'],
  ['admin-staff'],
  ['admin-staff-lecturers'],
  ['class-sections'],
  ['students'],
  ['enrollments'],
];

/** Tham số commit truyền tường minh qua mutate() — không đọc `batch` từ closure. */
interface CommitInput {
  id: string;
  slug: ImportKindSlug;
}

function describeRemaining(run: ImportRun): string {
  const remaining = remainingKinds(run);
  return remaining.length > 0
    ? ` Chưa chạy: ${remaining.map(importKindLabel).join(', ')}.`
    : '';
}

interface ImportWizardProps {
  /** Batch PENDING được chọn từ lịch sử (import-history.tsx) để nạp lại vào
   * wizard ở bước xem trước — null khi không có lượt nào đang được nạp lại. */
  resumeBatchId: string | null;
  onResumeHandled: () => void;
}

/**
 * Trình hướng dẫn 4 bước. Tick nhiều loại cùng file phân công → một lần chọn
 * file, hệ thống tạo lần lượt từng lô theo thứ tự bắt buộc: xem trước → xác
 * nhận → tự upload lại cùng file cho loại kế tiếp. Huỷ lô hoặc lỗi ở bất kỳ
 * loại nào thì DỪNG chuỗi (loại đã ghi không hoàn tác — mỗi lô commit riêng).
 */
export function ImportWizard({ resumeBatchId, onResumeHandled }: ImportWizardProps) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<ImportKindSlug[]>([]);
  const [term, setTerm] = useState('SU26');
  // Giữ File đã bắt đầu chạy (ngoài <input>) để upload lại cho loại kế tiếp.
  const sourceFileRef = useRef<File | null>(null);
  const [run, setRun] = useState<ImportRun>(EMPTY_RUN);
  const [batch, setBatch] = useState<ImportBatchDetail | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  // Callback của mutation đọc `run` qua ref để không dính closure cũ khi
  // commit của loại này phải quyết định upload loại kế tiếp.
  const runRef = useRef(run);
  runRef.current = run;

  /** Về bước chọn: xoá lô/kết quả/thông báo. KHÔNG đụng file đã chọn trong
   * <input> — người dùng thường chọn file rồi mới tick thêm loại. */
  function clearRunState() {
    setBatch(null);
    setRun(EMPTY_RUN);
    setError('');
    setDone('');
    sourceFileRef.current = null;
  }

  /** Chuỗi chạy xong (mọi loại đã ghi): bỏ tick và xoá file đã chọn để bấm lại
   * "Đọc file" không vô tình ghi lại y nguyên chuỗi vừa hoàn tất. Kết quả và
   * thông báo vẫn giữ nguyên trên màn hình. */
  function finishRun() {
    setSelected([]);
    sourceFileRef.current = null;
    if (fileRef.current) {
      fileRef.current.value = '';
    }
  }

  /** Chuỗi dừng tại loại đang xử lý: giữ kết quả đã ghi, không chạy tiếp. */
  function stopRun(message: string) {
    const current = runRef.current;
    const stopped: ImportRun = { ...current, stoppedAt: currentKind(current) };
    setRun(stopped);
    setBatch(null);
    setError(message + describeRemaining(current));
  }

  const upload = useMutation({
    mutationFn: ({ slug, source }: { slug: ImportKindSlug; source: File }) =>
      apiUpload<ImportBatchDetail>(`/imports/${slug}/upload`, source, { term }),
    onSuccess: (result) => {
      setBatch(result);
      setError('');
    },
    onError: (err, variables) => {
      const detail = err instanceof ApiError ? err.message : 'Không đọc được file.';
      const isChain = runRef.current.order.length > 1;
      stopRun(
        isChain
          ? `Đã dừng chuỗi import — không đọc được file cho "${importKindLabel(variables.slug)}": ${detail}`
          : detail,
      );
    },
  });

  const commit = useMutation({
    mutationFn: ({ id }: CommitInput) =>
      apiFetch<ImportCommitResult>(`/imports/${id}/commit`, { method: 'POST' }),
    onSuccess: (result, { slug }) => {
      const previous = runRef.current;
      const next: ImportRun = {
        ...previous,
        results: [...previous.results, { slug, result }],
        position: previous.position + 1,
      };
      setRun(next);
      setBatch(null);
      for (const queryKey of COMMIT_AFFECTED_QUERY_KEYS) {
        void queryClient.invalidateQueries({ queryKey });
      }

      const following = currentKind(next);
      const source = sourceFileRef.current;
      if (following && source) {
        upload.mutate({ slug: following, source });
        return;
      }
      finishRun();
      if (next.order.length > 1) {
        setDone(`Đã ghi xong ${next.results.length}/${next.order.length} loại dữ liệu.`);
      }
    },
    onError: (err) => {
      const detail = err instanceof ApiError ? err.message : 'Ghi dữ liệu thất bại.';
      const isChain = runRef.current.order.length > 1;
      stopRun(isChain ? `Đã dừng chuỗi import — ghi thất bại: ${detail}` : detail);
    },
  });

  const discard = useMutation({
    mutationFn: (id: string) => apiFetch<ImportDiscardResult>(`/imports/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      const current = runRef.current;
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      if (fileRef.current) {
        fileRef.current.value = '';
      }
      const discardedKind = currentKind(current);
      if (discardedKind && remainingKinds(current).length > 0) {
        stopRun(`Đã dừng chuỗi import sau khi huỷ lô "${importKindLabel(discardedKind)}".`);
        return;
      }
      clearRunState();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Huỷ lô thất bại.'),
  });

  // Lô PENDING bị bỏ rơi (refresh trang mất state) vẫn còn trong DB — hàng
  // lịch sử gọi onResume(batchId), nạp lại bản xem trước qua GET preview để
  // người dùng commit hoặc huỷ, thay vì không có đường quay lại. Nối lại luôn
  // là một lô đơn: không có file để chạy tiếp loại khác.
  const resume = useMutation({
    mutationFn: (batchId: string) =>
      apiFetch<ImportBatchDetail>(`/imports/${batchId}/preview`),
    onSuccess: (result) => {
      setBatch(result);
      sourceFileRef.current = null;
      setRun({ order: [slugOfKind(result.kind)], position: 0, results: [], stoppedAt: null });
      setError('');
      setDone('');
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Không tải được lượt import.'),
    onSettled: () => onResumeHandled(),
  });

  const resumeMutate = resume.mutate;
  useEffect(() => {
    if (resumeBatchId) {
      resumeMutate(resumeBatchId);
    }
  }, [resumeBatchId, resumeMutate]);

  function startRun() {
    const source = fileRef.current?.files?.[0];
    if (!source) {
      setError('Chưa chọn file.');
      return;
    }
    const order = orderImportKinds(selected);
    sourceFileRef.current = source;
    setRun({ order, position: 0, results: [], stoppedAt: null });
    setError('');
    setDone('');
    upload.mutate({ slug: order[0], source });
  }

  const termValid = TERM_PATTERN.test(term);
  const committed = isRunFinished(run);
  const currentStep = batch ? 2 : committed ? 3 : selected.length > 0 ? 1 : 0;
  const busy = upload.isPending || commit.isPending || discard.isPending;

  return (
    <SurfaceCard className="border-t-4 border-t-fpt-blue">
      <ol className="mb-6 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
        {STEP_LABELS.map((label, index) => (
          <li
            key={label}
            aria-current={index === currentStep ? 'step' : undefined}
            className={`rounded-full px-3 py-1.5 ${
              index < currentStep
                ? 'bg-success text-white'
                : index === currentStep
                  ? 'bg-fpt-orange text-white'
                  : 'bg-surface text-muted'
            }`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      <div className="mb-4 space-y-2">
        <FormError>{error}</FormError>
        <ImportRunStatus run={run} isUploading={upload.isPending} />
        <FormSuccess>{done}</FormSuccess>
      </div>

      {batch ? (
        <ImportPreview
          batch={batch}
          isCommitting={commit.isPending}
          isDiscarding={discard.isPending}
          onCommit={() => commit.mutate({ id: batch.id, slug: slugOfKind(batch.kind) })}
          onDiscard={() => discard.mutate(batch.id)}
        />
      ) : (
        <div className="space-y-5">
          <ImportKindPicker
            selected={selected}
            disabled={busy}
            onToggle={(slug) => {
              setSelected((previous) => toggleImportKind(previous, slug));
              clearRunState();
            }}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="import-term">2. Học kỳ</Label>
              <Input
                id="import-term"
                value={term}
                onChange={(event) => setTerm(event.target.value.toUpperCase())}
                placeholder="SU26"
                aria-invalid={!termValid}
              />
              {!termValid ? (
                <p className="mt-1 text-sm text-danger">
                  Học kỳ gồm 2 chữ cái và 2 chữ số, ví dụ SU26.
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="import-file">Chọn file .xlsx</Label>
              <input
                ref={fileRef}
                id="import-file"
                type="file"
                accept=".xlsx"
                className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-fpt-orange-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-fpt-orange"
              />
            </div>
          </div>

          <p className="text-sm text-muted">
            Ô chứa CCCD/SĐT/email/địa chỉ sẽ bị <strong>bỏ qua</strong>, không ghi vào hệ thống.
            Bản xem trước liệt kê rõ đã bỏ những ô nào.
          </p>

          <Button
            type="button"
            disabled={selected.length === 0 || !termValid || busy}
            onClick={startRun}
          >
            {upload.isPending ? 'Đang đọc file…' : '3. Đọc file và xem trước'}
          </Button>
        </div>
      )}
    </SurfaceCard>
  );
}
