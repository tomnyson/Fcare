import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user';
import { EvaluationNoteDraftService } from './evaluation-note-draft.service';

const lecturer: AuthUser = {
  id: 'lec-1',
  staffCode: 'GV01',
  fullName: 'Giảng viên',
  roles: ['LECTURER'],
  departmentId: 'dept-1',
  consented: true,
  mustChangePassword: false,
};

const dto = {
  classSectionId: 'cs-1',
  term: 'FA26',
  academicScore: 4,
  attitudeScore: 5,
  absentSessions: 2,
  criteria: ['H_NO_QUIZ_CMS' as const],
};

function setup({
  enabled = 'true',
  studentCount = 1,
  sectionCount = 1,
  aiText = 'Sinh viên chưa làm Quiz trên CMS, cần nhắc nhở hoàn thành bài tập đúng hạn.',
} = {}) {
  const prisma = {
    student: { count: jest.fn().mockResolvedValue(studentCount) },
    classSection: { count: jest.fn().mockResolvedValue(sectionCount) },
  };
  const config = {
    get: jest.fn((key: string, fallback?: string) =>
      key === 'AI_ANALYSIS_ENABLED' ? enabled : fallback,
    ),
  };
  const drafter = {
    draft: jest.fn<Promise<string>, [string]>().mockResolvedValue(aiText),
  };
  const service = new EvaluationNoteDraftService(
    prisma as never,
    config as never,
    drafter as never,
  );
  return { service, prisma, drafter };
}

describe('EvaluationNoteDraftService', () => {
  it('trả nhận xét AI, prompt chỉ có dữ liệu học vụ — không có mã sinh viên', async () => {
    const { service, drafter } = setup();
    const result = await service.draft(lecturer, 'student-uuid', dto);

    expect(result.note).toContain('Quiz');
    expect(result.cooldownSeconds).toBe(30);
    const [[prompt]] = drafter.draft.mock.calls as [[string]];
    expect(prompt).not.toContain('student-uuid');
    expect(prompt).toContain('4/10');
  });

  it('AI chưa bật thì 404 AI_ANALYSIS_DISABLED, không gọi AI', async () => {
    const { service, drafter } = setup({ enabled: 'false' });
    await expect(service.draft(lecturer, 's', dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(drafter.draft).not.toHaveBeenCalled();
  });

  it('sinh viên ngoài phạm vi thì 404, không gọi AI', async () => {
    const { service, drafter } = setup({ studentCount: 0 });
    await expect(service.draft(lecturer, 's', dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(drafter.draft).not.toHaveBeenCalled();
  });

  it('lớp học phần không phải lớp mình dạy (hoặc SV không học lớp đó) thì 403', async () => {
    const { service, drafter } = setup({ sectionCount: 0 });
    await expect(service.draft(lecturer, 's', dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(drafter.draft).not.toHaveBeenCalled();
  });

  it('bấm lại trong 30 giây thì 429 AI_NOTE_COOLDOWN, không tốn thêm lượt gọi AI', async () => {
    const { service, drafter } = setup();
    await service.draft(lecturer, 's', dto);

    const error = await service
      .draft(lecturer, 's', dto)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expect((error as HttpException).getResponse()).toMatchObject({
      code: 'AI_NOTE_COOLDOWN',
    });
    expect(drafter.draft).toHaveBeenCalledTimes(1);
  });

  it('AI trả nội dung có PII thì từ chối, không đưa về trình duyệt', async () => {
    const { service } = setup({
      aiText: 'Liên hệ sinh viên qua số 0912345678 để trao đổi thêm.',
    });
    const error = await service
      .draft(lecturer, 's', dto)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as HttpException).getResponse()).toMatchObject({
      code: 'AI_NOTE_PII',
    });
  });

  it('cắt nhận xét về tối đa 2000 ký tự cho khớp giới hạn ô nhận xét', async () => {
    const { service } = setup({ aiText: 'a'.repeat(2500) });
    const result = await service.draft(lecturer, 's', dto);
    expect(result.note.length).toBe(2000);
  });
});
