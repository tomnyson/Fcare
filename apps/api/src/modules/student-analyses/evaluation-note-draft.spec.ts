import {
  buildNoteDraftPrompt,
  NOTE_DRAFT_COOLDOWN_MS,
  NoteDraftCooldown,
} from './evaluation-note-draft';

describe('buildNoteDraftPrompt', () => {
  const prompt = buildNoteDraftPrompt({
    term: 'FA26',
    academicScore: 4,
    attitudeScore: 6,
    absentSessions: 3,
    criteria: ['H_NO_QUIZ_CMS', 'P_PART_TIME_JOB'],
  });

  it('chỉ đưa dữ liệu học vụ: kỳ, điểm, số buổi vắng, nhãn tiêu chí', () => {
    expect(prompt).toContain('FA26');
    expect(prompt).toContain('4/10');
    expect(prompt).toContain('6/10');
    expect(prompt).toContain('3 buổi');
    expect(prompt).toContain('Không làm Quiz trên CMS / học Udemy');
    expect(prompt).toContain('Đi làm thêm ảnh hưởng việc học');
    // mã tiêu chí nội bộ không lộ ra prompt
    expect(prompt).not.toContain('H_NO_QUIZ_CMS');
  });

  it('không có tiêu chí / chưa có số buổi vắng thì nói rõ, không bịa', () => {
    const bare = buildNoteDraftPrompt({
      term: 'FA26',
      academicScore: 8,
      attitudeScore: 8,
    });
    expect(bare).toContain('Không ghi nhận tiêu chí');
    expect(bare).toContain('Chưa có số buổi vắng');
  });
});

describe('NoteDraftCooldown', () => {
  it('lần đầu cho qua, lần hai trong 30 giây báo số giây còn phải đợi', () => {
    const cooldown = new NoteDraftCooldown();
    expect(cooldown.take('u1', 1_000)).toBe(0);
    expect(cooldown.take('u1', 1_000 + 10_000)).toBe(20);
  });

  it('hết 30 giây thì cho tạo lại', () => {
    const cooldown = new NoteDraftCooldown();
    cooldown.take('u1', 0);
    expect(cooldown.take('u1', NOTE_DRAFT_COOLDOWN_MS)).toBe(0);
  });

  it('bị chặn thì không làm mới mốc — đợi đủ 30 giây từ lần tạo thật', () => {
    const cooldown = new NoteDraftCooldown();
    cooldown.take('u1', 0);
    cooldown.take('u1', 29_000);
    expect(cooldown.take('u1', 30_000)).toBe(0);
  });

  it('mỗi người dùng một bộ đếm riêng', () => {
    const cooldown = new NoteDraftCooldown();
    cooldown.take('u1', 0);
    expect(cooldown.take('u2', 1)).toBe(0);
  });
});
