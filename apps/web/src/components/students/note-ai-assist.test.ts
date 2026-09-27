import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  cooldownRemaining,
  NoteAiAssist,
  noteAiButtonLabel,
  retryAfterSeconds,
  type NoteDraftRequest,
} from './note-ai-assist';

const request: NoteDraftRequest = {
  classSectionId: 'cs1',
  term: 'FA26',
  academicScore: 4,
  attitudeScore: 6,
  absentSessions: 2,
  criteria: [],
};

function render(req: NoteDraftRequest | null) {
  return renderToStaticMarkup(
    h(QueryClientProvider, {
      client: new QueryClient(),
      children: h(NoteAiAssist, {
        studentId: 'st1',
        request: req,
        currentNote: '',
        onDraft: () => undefined,
      }),
    }),
  );
}

describe('NoteAiAssist — nút viết nhận xét với AI', () => {
  it('ban đầu có nút "Viết nhận xét với AI" bấm được', () => {
    const html = render(request);
    const at = html.indexOf('Viết nhận xét với AI');
    expect(at).toBeGreaterThan(-1);
    const tag = html.slice(html.lastIndexOf('<button', at), html.indexOf('>', html.lastIndexOf('<button', at)));
    expect(tag).not.toMatch(/\sdisabled=""/);
  });

  it('chưa chọn lớp học phần thì khoá nút và nói lý do', () => {
    const html = render(null);
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).toContain('Chọn lớp học phần');
  });
});

describe('noteAiButtonLabel', () => {
  it('chưa tạo lần nào → mời viết với AI', () => {
    expect(noteAiButtonLabel({ drafted: false, pending: false, remaining: 0 })).toBe(
      'Viết nhận xét với AI',
    );
  });

  it('đã tạo, còn trong 30 giây → hiện số giây phải đợi', () => {
    expect(noteAiButtonLabel({ drafted: true, pending: false, remaining: 12 })).toBe(
      'Tạo lại nhận xét (đợi 12s)',
    );
  });

  it('hết giờ chờ → cho tạo lại', () => {
    expect(noteAiButtonLabel({ drafted: true, pending: false, remaining: 0 })).toBe(
      'Tạo lại nhận xét',
    );
  });

  it('đang gọi AI → báo đang viết', () => {
    expect(noteAiButtonLabel({ drafted: false, pending: true, remaining: 0 })).toBe(
      'AI đang viết…',
    );
  });
});

describe('cooldownRemaining / retryAfterSeconds', () => {
  it('tính số giây còn lại, làm tròn lên, không âm', () => {
    expect(cooldownRemaining(null, 1_000)).toBe(0);
    expect(cooldownRemaining(31_000, 1_000)).toBe(30);
    expect(cooldownRemaining(1_500, 1_000)).toBe(1);
    expect(cooldownRemaining(1_000, 5_000)).toBe(0);
  });

  it('đọc số giây từ thông báo 429 của API, thiếu thì mặc định 30', () => {
    expect(retryAfterSeconds('Vui lòng đợi 17 giây trước khi tạo lại nhận xét.')).toBe(17);
    expect(retryAfterSeconds('Quá nhiều yêu cầu')).toBe(30);
  });
});
