'use client';

import { Button } from '@fcare/ui-kit';
import { useEffect, useState, type FormEvent } from 'react';
import { FormError, Input, Label, Select } from '../../../../../components/ui/form';
import { Modal } from '../../../../../components/ui/modal';
import type { BackupScheduleConfig } from '../../../../../lib/types';

interface ScheduleModalProps {
  config?: BackupScheduleConfig;
  open: boolean;
  onClose: () => void;
  onSaveConfig: (config: BackupScheduleConfig) => Promise<void>;
}

const PRESETS = [
  { label: 'Hàng ngày lúc 02:00 sáng (Khuyến nghị)', cron: '0 2 * * *' },
  { label: 'Mỗi 12 giờ (00:00 và 12:00)', cron: '0 */12 * * *' },
  { label: 'Hàng tuần vào Chủ nhật lúc 02:00', cron: '0 2 * * 0' },
  { label: 'Tùy chỉnh biểu thức Cron...', cron: 'custom' },
];

export function ScheduleModal({
  config,
  open,
  onClose,
  onSaveConfig,
}: ScheduleModalProps) {
  const [enabled, setEnabled] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState('0 2 * * *');
  const [cronExpression, setCronExpression] = useState('0 2 * * *');
  const [retentionCount, setRetentionCount] = useState(7);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setCronExpression(config.cronExpression);
      setRetentionCount(config.retentionCount);

      const match = PRESETS.find((p) => p.cron === config.cronExpression);
      setSelectedPreset(match ? match.cron : 'custom');
    }
  }, [config, open]);

  const handlePresetChange = (val: string) => {
    setSelectedPreset(val);
    if (val !== 'custom') {
      setCronExpression(val);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!cronExpression.trim()) {
      setError('Biểu thức cron không được để trống');
      return;
    }
    if (retentionCount < 1 || retentionCount > 100) {
      setError('Số lượng lưu trữ phải từ 1 đến 100 bản');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSaveConfig({
        enabled,
        cronExpression: cronExpression.trim(),
        retentionCount: Number(retentionCount),
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể lưu cấu hình lịch';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title="Cấu hình Lịch sao lưu Định kỳ & Lưu trữ" open={open} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Bật / Tắt */}
        <div className="flex items-center justify-between rounded-[var(--radius-card)] border border-border bg-gray-50/50 p-3.5">
          <div>
            <p className="text-sm font-semibold text-fpt-blue-900">
              Tự động sao lưu định kỳ ngầm
            </p>
            <p className="text-xs text-muted">
              Hệ thống sẽ dùng hàng đợi BullMQ để sao lưu tự động theo lịch
            </p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={isSubmitting}
              className="peer sr-only"
            />
            <div className="h-6 w-11 rounded-full bg-gray-200 peer-checked:bg-fpt-orange peer-focus:outline-none after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white" />
          </label>
        </div>

        {/* Lựa chọn tần suất */}
        <div>
          <Label htmlFor="preset-select">Tần suất sao lưu</Label>
          <Select
            id="preset-select"
            value={selectedPreset}
            onChange={(e) => handlePresetChange(e.target.value)}
            disabled={!enabled || isSubmitting}
          >
            {PRESETS.map((p) => (
              <option key={p.cron} value={p.cron}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>

        {/* Biểu thức Cron */}
        <div>
          <Label htmlFor="cron-expression">Biểu thức Cron</Label>
          <Input
            id="cron-expression"
            value={cronExpression}
            onChange={(e) => setCronExpression(e.target.value)}
            disabled={!enabled || isSubmitting}
            className="font-mono text-xs"
            placeholder="* * * * *"
          />
          <p className="mt-1 text-[11px] text-muted">
            Quy chuẩn 5 trường: <code>phút giờ ngày tháng thứ</code> (Ví dụ: <code>0 2 * * *</code> là 02:00 hàng ngày).
          </p>
        </div>

        {/* Chính sách giới hạn số bản lưu trữ (Retention) */}
        <div>
          <Label htmlFor="retention-count">
            Số lượng bản sao lưu định kỳ tối đa (Retention limit)
          </Label>
          <Input
            id="retention-count"
            type="number"
            min={1}
            max={100}
            value={retentionCount}
            onChange={(e) => setRetentionCount(parseInt(e.target.value, 10) || 1)}
            disabled={!enabled || isSubmitting}
          />
          <p className="mt-1 text-[11px] text-muted">
            Khi vượt quá số lượng này, hệ thống sẽ tự động dọn dẹp các bản sao lưu tự động cũ nhất (các bản sao lưu thủ công hoặc snapshot an toàn sẽ <strong>không bao giờ</strong> bị tự xóa).
          </p>
        </div>

        {error && <FormError>{error}</FormError>}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isSubmitting}>
            Hủy bỏ
          </Button>
          <Button variant="primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Đang lưu...' : 'Lưu cấu hình'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
