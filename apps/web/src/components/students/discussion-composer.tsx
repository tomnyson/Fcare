'use client';

import { MENTION_ALL } from '@fcare/shared-types';
import { useQuery } from '@tanstack/react-query';
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { apiFetch } from '../../lib/api';
import {
  activeMentionQuery,
  filterMentionables,
  insertMention,
  toggleListPrefix,
  wrapSelection,
  type Mentionable,
  type TextEdit,
} from '../../lib/discussion-composer';

const MAX_SUGGESTIONS = 8;
const ALL_OPTION: Mentionable = {
  id: MENTION_ALL,
  staffCode: MENTION_ALL,
  fullName: 'Mọi người liên quan (GV đang dạy, người đã trao đổi, TBM)',
};

interface DiscussionComposerProps {
  studentId: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  maxLength: number;
  placeholder: string;
}

/**
 * Ô soạn tin: thanh định dạng, phím tắt Ctrl+B / Ctrl+I / Ctrl+Enter và gợi ý
 * nhắc tên khi gõ `@` (combobox ARIA). Danh sách gợi ý lấy từ API đã lọc theo
 * phạm vi — không có email/điện thoại, chỉ mã + tên.
 */
export function DiscussionComposer({
  studentId,
  value,
  onChange,
  disabled,
  maxLength,
  placeholder,
}: DiscussionComposerProps) {
  const listId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  const mentionables = useQuery({
    queryKey: ['discussion-mentionables', studentId],
    queryFn: () => apiFetch<Mentionable[]>(`/discussions/${studentId}/mentionables`),
    staleTime: 5 * 60_000,
  });

  const mention = activeMentionQuery(value, caret);
  const suggestions = mention
    ? filterMentionables([ALL_OPTION, ...(mentionables.data ?? [])], mention.query).slice(
        0,
        MAX_SUGGESTIONS,
      )
    : [];
  const open = mention !== null && mention.start !== dismissedAt && suggestions.length > 0;
  const safeIndex = Math.min(activeIndex, Math.max(suggestions.length - 1, 0));
  const optionId = (index: number) => `${listId}-option-${index}`;

  // Đặt lại vùng chọn SAU khi React ghi giá trị mới vào textarea.
  useLayoutEffect(() => {
    const box = textareaRef.current;
    const next = pendingSelection.current;
    if (!box || !next) return;
    pendingSelection.current = null;
    box.focus();
    box.setSelectionRange(next[0], next[1]);
    setCaret(next[1]);
  }, [value]);

  function apply(edit: TextEdit) {
    if (edit.value.length > maxLength) return;
    pendingSelection.current = [edit.selectionStart, edit.selectionEnd];
    onChange(edit.value);
  }

  function selection(): [number, number] {
    const box = textareaRef.current;
    return box ? [box.selectionStart, box.selectionEnd] : [value.length, value.length];
  }

  function wrap(marker: string) {
    const [start, end] = selection();
    apply(wrapSelection(value, start, end, marker));
  }

  function list(ordered: boolean) {
    const [start, end] = selection();
    apply(toggleListPrefix(value, start, end, ordered));
  }

  function choose(person: Mentionable) {
    if (!mention) return;
    const next = insertMention(value, mention.start, caret, person.staffCode);
    apply({ value: next.value, selectionStart: next.caret, selectionEnd: next.caret });
    setActiveIndex(0);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (open && handleMenuKey(event)) return;
    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === 'b' || key === 'i') {
      event.preventDefault();
      wrap(key === 'b' ? '**' : '_');
    } else if (key === 'enter') {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  /** Trả true nếu phím đã được menu gợi ý xử lý. */
  function handleMenuKey(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    const count = suggestions.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((safeIndex + step + count) % count);
      return true;
    }
    if ((event.key === 'Enter' && !event.ctrlKey && !event.metaKey) || event.key === 'Tab') {
      const person = suggestions[safeIndex];
      if (!person) return false;
      event.preventDefault();
      choose(person);
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setDismissedAt(mention?.start ?? null);
      return true;
    }
    return false;
  }

  function syncCaret() {
    const box = textareaRef.current;
    if (box) setCaret(box.selectionEnd);
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface-raised focus-within:border-fpt-blue/60">
      <div
        role="toolbar"
        aria-label="Định dạng tin nhắn"
        className="flex items-center gap-1 border-b border-border px-2 py-1.5"
      >
        <ToolButton label="In đậm" shortcut="Control+B" onPress={() => wrap('**')}>
          <span className="font-bold">B</span>
        </ToolButton>
        <ToolButton label="In nghiêng" shortcut="Control+I" onPress={() => wrap('_')}>
          <span className="font-serif italic">I</span>
        </ToolButton>
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
        <ToolButton label="Danh sách gạch đầu dòng" onPress={() => list(false)}>
          <span aria-hidden="true">•≡</span>
        </ToolButton>
        <ToolButton label="Danh sách đánh số" onPress={() => list(true)}>
          <span aria-hidden="true" className="text-xs">1.≡</span>
        </ToolButton>
        <p className="ml-auto hidden text-xs text-muted sm:block">
          Gõ <kbd className="font-semibold text-ink">@</kbd> để nhắc tên ·{' '}
          <kbd className="font-semibold text-ink">Ctrl+Enter</kbd> để gửi
        </p>
      </div>

      <div className="relative">
        <textarea
          ref={textareaRef}
          role="combobox"
          aria-label="Nội dung trao đổi"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open ? optionId(safeIndex) : undefined}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setCaret(event.target.selectionEnd);
            setActiveIndex(0);
          }}
          onSelect={syncCaret}
          onKeyDown={onKeyDown}
          onBlur={() => setDismissedAt(mention?.start ?? null)}
          onFocus={() => setDismissedAt(null)}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          className="block min-h-24 w-full resize-y bg-transparent px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/70 focus:outline-none disabled:opacity-60"
        />

        <ul
          id={listId}
          role="listbox"
          aria-label="Gợi ý người được nhắc"
          hidden={!open}
          className="absolute inset-x-2 bottom-full z-20 mb-1 max-h-64 overflow-y-auto rounded-[var(--radius-card)] border border-border bg-surface-raised py-1 shadow-lg"
        >
          {suggestions.map((person, index) => (
            <li
              key={person.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === safeIndex}
              // mousedown thay cho click: giữ focus ở textarea, không kích onBlur đóng menu.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(person);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex cursor-pointer items-baseline gap-2 px-3 py-2 text-sm ${
                index === safeIndex ? 'bg-fpt-blue/10 text-ink' : 'text-ink'
              }`}
            >
              <span className="font-semibold text-fpt-blue">@{person.staffCode}</span>
              <span className="truncate text-muted">{person.fullName}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

interface ToolButtonProps {
  label: string;
  shortcut?: string;
  onPress: () => void;
  children: ReactNode;
}

function ToolButton({ label, shortcut, onPress, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={shortcut ? `${label} (${shortcut.replace('Control', 'Ctrl')})` : label}
      aria-keyshortcuts={shortcut}
      // Không lấy focus khỏi textarea để vùng chọn còn nguyên khi bấm.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
      className="grid h-8 min-w-8 place-items-center rounded-md px-2 text-sm text-ink transition-colors duration-[var(--duration-fast)] hover:bg-fpt-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fpt-orange/60 active:bg-fpt-blue/20"
    >
      {children}
    </button>
  );
}
