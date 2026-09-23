'use client';

import { useRef, type KeyboardEvent } from 'react';

export interface PinCodeInputProps {
  /** Tiền tố id cho từng ô: `${id}-0`, `${id}-1`, ... để Label trỏ vào ô đầu. */
  id: string;
  /** Chuỗi chữ số đã nhập (độ dài ≤ length). */
  value: string;
  length: number;
  onChange: (value: string) => void;
  /** Gọi khi vừa điền đủ `length` chữ số. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}

/** Điền một ký tự vào ô `index`; chỉ giữ chữ số cuối cùng của giá trị nhập. */
export function applyPinDigit(
  value: string,
  index: number,
  raw: string,
  length: number,
): { value: string; nextIndex: number } {
  const digit = raw.replace(/\D/g, '').slice(-1);
  if (!digit || index >= length) return { value, nextIndex: index };
  const digits = value.padEnd(index, '').split('');
  digits[index] = digit;
  const next = digits.join('').slice(0, length);
  return { value: next, nextIndex: Math.min(index + 1, length - 1) };
}

/** Backspace: xoá ô hiện tại nếu có chữ số, ngược lại lùi và xoá ô trước. */
export function erasePinDigit(value: string, index: number): { value: string; nextIndex: number } {
  if (index < value.length) {
    return { value: value.slice(0, index), nextIndex: index };
  }
  if (index > 0) {
    return { value: value.slice(0, index - 1), nextIndex: index - 1 };
  }
  return { value, nextIndex: 0 };
}

export function PinCodeInput({
  id,
  value,
  length,
  onChange,
  onComplete,
  disabled = false,
  invalid = false,
  autoFocus = false,
}: PinCodeInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function focusAt(index: number) {
    refs.current[index]?.focus();
  }

  function handleInput(index: number, raw: string) {
    const result = applyPinDigit(value, index, raw, length);
    if (result.value === value) return;
    onChange(result.value);
    focusAt(result.nextIndex);
    if (result.value.length === length) onComplete?.(result.value);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const result = erasePinDigit(value, index);
      onChange(result.value);
      focusAt(result.nextIndex);
    } else if (event.key === 'ArrowLeft' && index > 0) {
      focusAt(index - 1);
    } else if (event.key === 'ArrowRight' && index < length - 1) {
      focusAt(index + 1);
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    focusAt(Math.min(pasted.length, length - 1));
    if (pasted.length === length) onComplete?.(pasted);
  }

  const boxTone = invalid
    ? 'border-danger bg-danger/5 text-danger'
    : 'border-border bg-surface text-ink focus:border-fpt-orange focus:bg-surface-raised';

  return (
    <div className="flex justify-center gap-2" role="group" aria-label="Mã PIN hệ thống">
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          id={`${id}-${i}`}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={value[i] ?? ''}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          aria-label={`Chữ số thứ ${i + 1}`}
          aria-invalid={invalid ? 'true' : undefined}
          className={`h-12 w-10 rounded-lg border-2 text-center text-xl font-bold tabular-nums transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${boxTone} ${
            !invalid && value[i] ? 'border-fpt-orange bg-fpt-orange/5' : ''
          }`}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
