'use client';

import { RECALLED_MESSAGE_TEXT } from '@fcare/shared-types';
import { Button } from '@fcare/ui-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { groupMessagesByDay } from '../../lib/discussion';
import { useDiscussion } from '../../lib/hooks';
import { formatDateTime } from '../../lib/labels';
import type { DiscussionMessage } from '../../lib/types';
import { FormError, Textarea } from '../ui/form';

/**
 * Khoảng cách tới đáy khung (px) vẫn được coi là "đang bám đáy". Đủ rộng để một
 * dòng tin cao bất thường hay sai số làm tròn không làm mất trạng thái bám đáy.
 */
const NEAR_BOTTOM_PX = 80;

/**
 * Luồng trao đổi nội bộ về một sinh viên: giảng viên ↔ giảng viên ↔ CTSV ↔ đào tạo.
 * Đây KHÔNG phải nhật ký chăm sóc (tab bên cạnh) — nội dung ở đây là trao đổi
 * giữa cán bộ với nhau, không phải biên bản làm việc với sinh viên.
 */
export function DiscussionTab({
  studentId,
  currentStaffId,
}: {
  studentId: string;
  currentStaffId: string;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const thread = useDiscussion(studentId);
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  // `true` khi người dùng đang ở đáy khung — tức đang theo dõi tin mới. Cập nhật
  // trong onScroll nên nó giữ trạng thái TRƯỚC lúc khung cao thêm vì tin mới.
  const stickToBottomRef = useRef(true);

  // Chỉ lấy id của tin cuối cùng làm mốc "có gì mới không".
  // KHÔNG dùng cả mảng messages làm dependency: mỗi lần refetch React Query trả về
  // tham chiếu mảng mới nên effect sẽ chạy lại vô ích (và tự kích hoạt chính nó).
  const lastMessageId = thread.data?.messages.at(-1)?.id;

  // Đang mở tab là đã đọc: đánh dấu lúc mở, và mỗi khi có tin mới đẩy về qua SSE,
  // để badge trên nhãn tab không bật lên ngay trên tab người dùng đang xem.
  useEffect(() => {
    void apiFetch(`/discussions/${studentId}/read`, { method: 'POST' })
      .then(() => queryClient.invalidateQueries({ queryKey: ['discussions'] }))
      .catch((err: unknown) => {
        // Không chặn UI: badge sẽ tự đúng ở lần mở sau. Nhưng phải để lại dấu vết
        // trong console, nếu không lỗi mark-read sẽ im lặng hoàn toàn.
        console.warn(`[discussion] không đánh dấu đã đọc được cho sinh viên ${studentId}`, err);
      });
  }, [studentId, lastMessageId, queryClient]);

  // API trả 30 tin mới nhất sắp tăng dần (tin mới nhất nằm dưới cùng) nên khung
  // phải cuộn xuống đáy khi tải xong và khi có tin mới. Đặt scrollTop trực tiếp
  // trên khung cuộn — scrollIntoView() sẽ cuộn cả trang và làm nhảy viewport.
  useEffect(() => {
    const box = scrollBoxRef.current;
    // Chỉ tự cuộn khi người dùng đang bám đáy. Nếu họ đang cuộn lên đọc tin cũ mà
    // có tin mới đẩy về qua SSE, kéo tuột xuống đáy sẽ làm mất chỗ đang đọc.
    if (box && stickToBottomRef.current) {
      box.scrollTop = box.scrollHeight;
    }
  }, [lastMessageId]);

  const send = useMutation({
    mutationFn: (body: string) =>
      apiFetch<DiscussionMessage>(`/discussions/${studentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    onSuccess: async () => {
      setDraft('');
      setError('');
      // Tin của chính mình thì luôn phải nhìn thấy, kể cả khi đang cuộn lên trên.
      stickToBottomRef.current = true;
      await queryClient.invalidateQueries({ queryKey: ['discussions', studentId] });
    },
    // Giữ nguyên nội dung đã gõ khi bị chặn PII — người dùng chỉ cần sửa, không phải gõ lại.
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Không gửi được tin nhắn.'),
  });

  const recall = useMutation({
    mutationFn: (id: string) =>
      apiFetch<DiscussionMessage>(`/discussions/messages/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['discussions', studentId] });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Không thu hồi được tin nhắn.'),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) {
      return;
    }
    send.mutate(body);
  }

  if (thread.isError) {
    return (
      <FormError>
        {thread.error instanceof ApiError
          ? thread.error.message
          : 'Không tải được luồng trao đổi.'}
      </FormError>
    );
  }

  const groups = groupMessagesByDay(thread.data?.messages ?? []);

  return (
    <section aria-label="Luồng trao đổi nội bộ">
      <div
        ref={scrollBoxRef}
        onScroll={(event) => {
          const box = event.currentTarget;
          stickToBottomRef.current =
            box.scrollHeight - box.scrollTop - box.clientHeight <= NEAR_BOTTOM_PX;
        }}
        className="mb-4 max-h-[28rem] space-y-6 overflow-y-auto rounded-[var(--radius-card)] border border-border bg-surface p-5"
      >
        {thread.isLoading ? (
          <p className="text-center text-sm text-muted">Đang tải trao đổi…</p>
        ) : null}

        {!thread.isLoading && groups.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            Chưa có trao đổi nào về sinh viên này. Nêu một quan sát cụ thể để đồng nghiệp
            cùng theo dõi.
          </p>
        ) : null}

        {groups.map((group) => (
          <div key={group.day} className="space-y-3">
            <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted">
              {group.label}
            </p>
            {group.messages.map((message) => {
              const mine = message.author?.id === currentStaffId;
              return (
                <article
                  key={message.id}
                  className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                >
                  <p className="mb-1 text-xs text-muted">
                    <span className="font-semibold text-ink">
                      {message.author?.fullName ?? 'Tài khoản đã gỡ'}
                    </span>
                    {message.author ? ` · ${message.author.staffCode}` : ''}
                    {' · '}
                    {formatDateTime(message.createdAt)}
                  </p>
                  <div
                    className={`max-w-[85%] rounded-[var(--radius-card)] px-4 py-2.5 text-sm ${
                      message.deletedAt
                        ? 'border border-dashed border-border bg-surface text-muted italic'
                        : mine
                          ? 'bg-fpt-blue text-white'
                          : 'border border-border bg-surface-raised text-ink'
                    }`}
                  >
                    {message.deletedAt ? RECALLED_MESSAGE_TEXT : message.body}
                  </div>
                  {mine && !message.deletedAt ? (
                    <button
                      type="button"
                      onClick={() => recall.mutate(message.id)}
                      // Chỉ khoá nút của đúng tin đang thu hồi, không khoá cả luồng.
                      disabled={recall.isPending && recall.variables === message.id}
                      className="mt-1 text-xs text-muted underline-offset-2 transition-colors duration-[var(--duration-fast)] hover:text-danger hover:underline"
                    >
                      Thu hồi
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <FormError>{error}</FormError>
        <Textarea
          aria-label="Nội dung trao đổi"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={2000}
          placeholder="Trao đổi với đồng nghiệp về tình trạng học tập của sinh viên…"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            Không ghi số điện thoại, email, CCCD/CMND hay địa chỉ — hệ thống sẽ từ chối.
          </p>
          <Button type="submit" disabled={send.isPending || draft.trim().length === 0}>
            {send.isPending ? 'Đang gửi…' : 'Gửi'}
          </Button>
        </div>
      </form>
    </section>
  );
}
