'use client';

import { Button, SurfaceCard } from '@fcare/ui-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ImportPreview } from './import-preview';
import { FormError, FormSuccess, Input, Label } from '../ui/form';
import { ApiError, apiFetch, apiUpload } from '../../lib/api';
import { IMPORT_KINDS, type ImportKindSlug } from '../../lib/import-kinds';
import type { ImportBatchDetail, ImportCommitResult, ImportDiscardResult } from '../../lib/types';

const TERM_PATTERN = /^[A-Z]{2}\d{2}$/;
const STEP_LABELS = ['Chọn loại', 'Tải file', 'Xem trước', 'Xác nhận'];

export function ImportWizard() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [slug, setSlug] = useState<ImportKindSlug | null>(null);
  const [term, setTerm] = useState('SU26');
  const [batch, setBatch] = useState<ImportBatchDetail | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  function resetFile() {
    setBatch(null);
    setError('');
    setDone('');
    if (fileRef.current) {
      fileRef.current.value = '';
    }
  }

  const upload = useMutation({
    mutationFn: (file: File) =>
      apiUpload<ImportBatchDetail>(`/imports/${slug}/upload`, file, { term }),
    onSuccess: (result) => {
      setBatch(result);
      setError('');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Không đọc được file.'),
  });

  const commit = useMutation({
    mutationFn: () =>
      apiFetch<ImportCommitResult>(`/imports/${batch!.id}/commit`, { method: 'POST' }),
    onSuccess: (result) => {
      setDone(
        `Đã ghi: ${result.created} tạo mới, ${result.updated} cập nhật, ${result.skipped} bỏ qua.`,
      );
      setBatch(null);
      queryClient.invalidateQueries();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Ghi dữ liệu thất bại.'),
  });

  const discard = useMutation({
    mutationFn: () => apiFetch<ImportDiscardResult>(`/imports/${batch!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      resetFile();
      queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Huỷ lô thất bại.'),
  });

  const termValid = TERM_PATTERN.test(term);
  const currentStep = batch ? 2 : slug ? 1 : 0;

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
        <FormSuccess>{done}</FormSuccess>
      </div>

      {batch ? (
        <ImportPreview
          batch={batch}
          isCommitting={commit.isPending}
          onCommit={() => commit.mutate()}
          onDiscard={() => discard.mutate()}
        />
      ) : (
        <div className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">1. Chọn loại dữ liệu</legend>
            <div className="grid gap-3 md:grid-cols-2">
              {IMPORT_KINDS.map((kind) => (
                <label
                  key={kind.slug}
                  className={`cursor-pointer rounded-md border p-4 transition-colors focus-within:ring-2 focus-within:ring-fpt-orange ${
                    slug === kind.slug
                      ? 'border-fpt-orange bg-fpt-orange-50/50'
                      : 'border-border hover:border-fpt-blue'
                  }`}
                >
                  <input
                    type="radio"
                    name="import-kind"
                    value={kind.slug}
                    checked={slug === kind.slug}
                    onChange={() => {
                      setSlug(kind.slug);
                      resetFile();
                    }}
                    className="sr-only"
                  />
                  <span className="block font-semibold text-ink">{kind.label}</span>
                  <span className="mt-1 block text-sm text-muted">{kind.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>

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
            File chứa cột hoặc giá trị CCCD/SĐT/email/địa chỉ sẽ bị <strong>từ chối toàn bộ</strong>
            . Hãy xoá các cột đó trước khi tải lên.
          </p>

          <Button
            type="button"
            disabled={!slug || !termValid || upload.isPending}
            onClick={() => {
              const file = fileRef.current?.files?.[0];
              if (!file) {
                setError('Chưa chọn file.');
                return;
              }
              upload.mutate(file);
            }}
          >
            {upload.isPending ? 'Đang đọc file…' : '3. Đọc file và xem trước'}
          </Button>
        </div>
      )}
    </SurfaceCard>
  );
}
