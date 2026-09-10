'use client';

import { Button } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { FormError, Input, Label, Select } from '../ui/form';
import { Modal } from '../ui/modal';
import { ApiError, apiFetch } from '../../lib/api';
import {
  MAPPING_TARGETS,
  NEW_TARGET_VALUE,
  shouldCreateAlias,
  type MappingTargetConfig,
  type MappingTargetKind,
} from '../../lib/mapping-targets';

interface MappingTarget {
  id: string;
  code: string;
  name: string;
}

type SubmitInput =
  | { mode: 'existing'; targetId: string }
  | { mode: 'new'; code: string; name: string; departmentId: string };

interface QuickMappingModalProps {
  code: string;
  kind: MappingTargetKind;
  onClose: () => void;
  onMapped: () => void;
}

/**
 * Gán nhanh một mã chưa ánh xạ ngay tại bản xem trước, không phải rời trang.
 * Committer đọc lại bảng ánh xạ trong transaction commit nên mã vừa gán có hiệu
 * lực ngay ở lần bấm "Xác nhận ghi" kế tiếp — KHÔNG cần tải lại file.
 *
 * Chọn được danh mục có sẵn hoặc tạo mới ngay tại đây: nhiều mã trong file
 * (ví dụ "CHNA") chưa có ngành đối ứng nào trong DB, bắt admin sang màn hình
 * khác tạo rồi quay lại là thừa một vòng.
 *
 * Component này chỉ tồn tại khi đang gán một mã cụ thể: cha render nó với `key`
 * theo mã, nên state form tự sạch giữa hai lần mở.
 */
export function QuickMappingModal({
  code,
  kind,
  onClose,
  onMapped,
}: QuickMappingModalProps) {
  const queryClient = useQueryClient();
  const config = MAPPING_TARGETS[kind];
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const targets = useQuery({
    queryKey: [config.targetQueryKey],
    queryFn: () => apiFetch<MappingTarget[]>(config.targetPath),
  });
  // Chỉ ngành mới cần chọn bộ môn chủ quản khi tạo mới.
  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiFetch<MappingTarget[]>('/departments'),
    enabled: config.createNeedsDepartment && creating,
  });

  const save = useMutation({
    mutationFn: (input: SubmitInput) => submit(config, code, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [config.aliasQueryKey] });
      queryClient.invalidateQueries({ queryKey: [config.targetQueryKey] });
      onMapped();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Không lưu được ánh xạ.'),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    if (!creating) {
      save.mutate({
        mode: 'existing',
        targetId: String(form.get(config.targetField) ?? ''),
      });
      return;
    }
    save.mutate({
      mode: 'new',
      code: String(form.get('newCode') ?? '').trim(),
      name: String(form.get('newName') ?? '').trim(),
      departmentId: String(form.get('newDepartmentId') ?? ''),
    });
  }

  return (
    <Modal title={`Gán nhanh ${config.codeLabel} "${code}"`} open onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-muted">
          Ánh xạ có hiệu lực ngay khi bấm <strong>Xác nhận ghi</strong>, không cần tải lại
          file.
        </p>
        <div>
          <Label htmlFor={config.targetField}>{config.targetLabel}</Label>
          <Select
            id={config.targetField}
            name={config.targetField}
            required={!creating}
            defaultValue=""
            onChange={(event) => setCreating(event.target.value === NEW_TARGET_VALUE)}
          >
            <option value="">
              {targets.isLoading
                ? 'Đang tải…'
                : `Chọn ${config.targetLabel.toLowerCase()}…`}
            </option>
            {(targets.data ?? []).map((target) => (
              <option key={target.id} value={target.id}>
                {target.code} — {target.name}
              </option>
            ))}
            <option value={NEW_TARGET_VALUE}>{config.newOptionLabel}</option>
          </Select>
        </div>
        {creating ? (
          <NewTargetFields
            config={config}
            defaultCode={code}
            departments={departments.data ?? []}
          />
        ) : null}
        <FormError>
          {error ||
            (targets.isError ? 'Không tải được danh mục đích. Thử lại sau.' : '')}
        </FormError>
        <div className="flex gap-3">
          <Button type="submit" disabled={save.isPending || targets.isLoading}>
            {save.isPending ? 'Đang lưu…' : creating ? 'Tạo và gán' : 'Gán'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Hủy
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Mã danh mục mặc định lấy luôn mã trong file — sửa được nếu trường muốn mã khác. */
function NewTargetFields({
  config,
  defaultCode,
  departments,
}: {
  config: MappingTargetConfig;
  defaultCode: string;
  departments: readonly MappingTarget[];
}) {
  return (
    <div className="space-y-4 rounded-md border border-border p-4">
      <div>
        <Label htmlFor="newCode">Mã mới</Label>
        <Input id="newCode" name="newCode" defaultValue={defaultCode} required maxLength={20} />
      </div>
      <div>
        <Label htmlFor="newName">Tên đầy đủ</Label>
        <Input id="newName" name="newName" required maxLength={200} />
      </div>
      {config.createNeedsDepartment ? (
        <div>
          <Label htmlFor="newDepartmentId">Bộ môn chủ quản</Label>
          <Select id="newDepartmentId" name="newDepartmentId" required defaultValue="">
            <option value="">Chọn bộ môn…</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.code} — {department.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Tạo danh mục (nếu cần) rồi ghi ánh xạ. Hai lời gọi tuần tự, KHÔNG chung
 * transaction: danh mục tạo được mà ánh xạ lỗi thì danh mục vẫn còn — admin
 * chọn lại nó ở lần mở sau chứ không mất dữ liệu.
 */
async function submit(
  config: MappingTargetConfig,
  aliasCode: string,
  input: SubmitInput,
): Promise<void> {
  let targetId = input.mode === 'existing' ? input.targetId : '';
  if (input.mode === 'new') {
    const created = await apiFetch<MappingTarget>(config.targetPath, {
      method: 'POST',
      body: JSON.stringify({
        code: input.code,
        name: input.name,
        ...(config.createNeedsDepartment
          ? { departmentId: input.departmentId }
          : {}),
      }),
    });
    if (!shouldCreateAlias(created.code, aliasCode)) {
      return;
    }
    targetId = created.id;
  }
  await apiFetch(config.aliasPath, {
    method: 'POST',
    body: JSON.stringify({ alias: aliasCode, [config.targetField]: targetId }),
  });
}
