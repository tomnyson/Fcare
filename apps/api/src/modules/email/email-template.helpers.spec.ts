import {
  renderAlertEmail,
  renderCareLogEmail,
  renderDiscussionEmail,
} from './email-template.helpers';

describe('email-template.helpers', () => {
  const baseStudent = {
    fullName: 'Nguyễn Văn An',
    studentCode: 'SE170001',
    classCode: 'SE1801',
  };

  describe('renderAlertEmail', () => {
    it('renders Level 2 alert with orange badge and correct CTA link', () => {
      const result = renderAlertEmail({
        student: baseStudent,
        level: 2,
        reason: 'Nghỉ học 3 buổi liên tiếp',
        raisedByName: 'ThS. Trần Văn Minh',
        actionUrl: 'http://localhost:3000/alerts',
      });

      expect(result.subject).toContain('[FCare - Cảnh báo Trung bình]');
      expect(result.subject).toContain('SE170001');
      expect(result.html).toContain('Nguyễn Văn An');
      expect(result.html).toContain('SE170001');
      expect(result.html).toContain('Nghỉ học 3 buổi liên tiếp');
      expect(result.html).toContain('ThS. Trần Văn Minh');
      expect(result.html).toContain('http://localhost:3000/alerts');
      // PII Check
      expect(result.html).not.toMatch(/CCCD|Số CCCD|Số điện thoại/);
    });

    it('renders Level 4 alert with critical red badge', () => {
      const result = renderAlertEmail({
        student: baseStudent,
        level: 4,
        reason: 'Nguy cơ thôi học cao',
        raisedByName: 'Cán bộ CTSV',
        actionUrl: 'http://localhost:3000/alerts',
      });

      expect(result.subject).toContain('[FCare - Cảnh báo Khẩn cấp]');
      expect(result.html).toContain('#DC2626'); // Red color
    });
  });

  describe('renderCareLogEmail', () => {
    it('renders CareLog email with contact details and next plan', () => {
      const result = renderCareLogEmail({
        student: baseStudent,
        channel: 'IN_PERSON',
        content: 'Đã gặp mặt động viên tinh thần',
        outcome: 'Sinh viên hứa đi học đầy đủ',
        nextAction: 'Hẹn gặp lại vào tuần sau',
        staffName: 'Cô Bùi Ngọc Lan',
        actionUrl: 'http://localhost:3000/students/student-1',
      });

      expect(result.subject).toContain('[FCare - Nhật ký chăm sóc]');
      expect(result.subject).toContain('Nguyễn Văn An');
      expect(result.html).toContain('Gặp trực tiếp');
      expect(result.html).toContain('Đã gặp mặt động viên tinh thần');
      expect(result.html).toContain('Sinh viên hứa đi học đầy đủ');
      expect(result.html).toContain('Hẹn gặp lại vào tuần sau');
      expect(result.html).toContain('Cô Bùi Ngọc Lan');
      expect(result.html).toContain('http://localhost:3000/students/student-1');
    });
  });

  describe('renderDiscussionEmail', () => {
    it('renders Discussion email with author name and message preview', () => {
      const result = renderDiscussionEmail({
        student: baseStudent,
        authorName: 'Thầy Đỗ Việt Dũng',
        messagePreview: 'Em An đã nộp bài tập bù chưa các thầy cô?',
        actionUrl: 'http://localhost:3000/students/student-1?tab=discussion',
      });

      expect(result.subject).toContain('[FCare - Trao đổi mới]');
      expect(result.subject).toContain('SE170001');
      expect(result.html).toContain('Thầy Đỗ Việt Dũng');
      expect(result.html).toContain(
        'Em An đã nộp bài tập bù chưa các thầy cô?',
      );
      expect(result.html).toContain(
        'http://localhost:3000/students/student-1?tab=discussion',
      );
    });
  });
});
