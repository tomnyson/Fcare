'use client';

import { PIN_LENGTH, validatePinFormat } from '@fcare/shared-types';
import { Button } from '@fcare/ui-kit';
import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch, ApiError } from '../../lib/api';
import { FormError, FormSuccess, Label } from '../ui/form';
import { Modal } from '../ui/modal';
import { ForgotPin } from './forgot-pin';
import { PinCodeInput } from '../ui/pin-code-input';

interface ChangePinModalProps {
  open: boolean;
  onClose: () => void;
}

/** Đổi PIN cá nhân — server bắt nhập PIN hiện tại (sai cũng tính vào lượt khoá). */
export function ChangePinModal({ open, onClose }: ChangePinModalProps) {
  const [currentPin, setCurrentPin] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Sidebar/menu trượt có transform → `fixed` bên trong bị lệch; đưa ra body.
  useEffect(() => {
    setMounted(true);
  }, []);

  const formatError = pin.length === PIN_LENGTH ? validatePinFormat(pin) : null;
  const sameAsCurrent = pin.length === PIN_LENGTH && pin === currentPin;
  const mismatch = confirm.length === PIN_LENGTH && confirm !== pin;
  const canSubmit =
    currentPin.length === PIN_LENGTH &&
    pin.length === PIN_LENGTH &&
    confirm === pin &&
    !formatError &&
    !sameAsCurrent &&
    !submitting;

  function close() {
    setCurrentPin('');
    setPin('');
    setConfirm('');
    setError('');
    setDone(false);
    onClose();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      await apiFetch('/auth/pin', {
        method: 'POST',
        body: JSON.stringify({ pin, currentPin }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể kết nối máy chủ.');
      setCurrentPin('');
    } finally {
      setSubmitting(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <Modal title="Đổi mã PIN" open={open} onClose={close}>
      {done ? (
        <div className="space-y-4">
          <FormSuccess>Đã đổi mã PIN. Lần mở khoá sau hãy dùng mã mới.</FormSuccess>
          <div className="flex justify-end">
            <Button type="button" onClick={close}>
              Xong
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          <PinField
            id="current-pin"
            label="Mã PIN hiện tại"
            value={currentPin}
            onChange={setCurrentPin}
            disabled={submitting}
            autoFocus
          />
          <ForgotPin disabled={submitting} />
          <PinField
            id="next-pin"
            label="Mã PIN mới"
            value={pin}
            onChange={setPin}
            invalid={Boolean(formatError) || sameAsCurrent}
            disabled={submitting}
          />
          {formatError ? <FormError>{formatError}</FormError> : null}
          {sameAsCurrent ? <FormError>Mã PIN mới phải khác mã hiện tại.</FormError> : null}
          <PinField
            id="next-pin-confirm"
            label="Nhập lại mã PIN mới"
            value={confirm}
            onChange={setConfirm}
            invalid={mismatch}
            disabled={submitting}
          />
          {mismatch ? <FormError>Hai lần nhập không khớp.</FormError> : null}
          <FormError>{error}</FormError>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={close} disabled={submitting}>
              Huỷ
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? 'Đang lưu…' : 'Đổi PIN'}
            </Button>
          </div>
        </form>
      )}
    </Modal>,
    document.body,
  );
}

interface PinFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

function PinField({ id, label, value, onChange, invalid, disabled, autoFocus }: PinFieldProps) {
  return (
    <div>
      <Label htmlFor={`${id}-0`}>{label}</Label>
      <div className="mt-2">
        <PinCodeInput
          id={id}
          label={label}
          value={value}
          length={PIN_LENGTH}
          onChange={onChange}
          invalid={invalid}
          disabled={disabled}
          autoFocus={autoFocus}
        />
      </div>
    </div>
  );
}
