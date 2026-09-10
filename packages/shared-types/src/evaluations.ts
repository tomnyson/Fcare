/**
 * Nội dung đánh giá sinh viên theo tài liệu nghiệp vụ
 * "PHẦN II — II.1 ĐÁNH GIÁ SINH VIÊN".
 *
 * Mô tả từng dải điểm và các "Giải pháp gợi ý (*)" ở đây là NỘI DUNG NGHIỆP VỤ
 * chép từ tài liệu — sửa chữ ở đây nghĩa là sửa quy định, đừng tự biên tập.
 *
 * RULE 1: không có bất kỳ trường PII nào của sinh viên trong file này.
 */

export const SCORE_BANDS = ['10-9', '8-7', '6-5', '4-3', '2-1'] as const;

export type ScoreBand = (typeof SCORE_BANDS)[number];

/** Điểm thấp nhất của từng dải, xếp giảm dần đúng thứ tự `SCORE_BANDS`. */
const BAND_FLOORS: readonly { band: ScoreBand; floor: number }[] = [
  { band: '10-9', floor: 9 },
  { band: '8-7', floor: 7 },
  { band: '6-5', floor: 5 },
  { band: '4-3', floor: 3 },
  { band: '2-1', floor: 1 },
];

/**
 * Gom điểm 1-10 về dải của tài liệu. Điểm ngoài biên bị kẹp về dải gần nhất
 * (đầu vào đã được DTO chặn 1..10, kẹp ở đây chỉ để hàm luôn tổng và không bao
 * giờ trả `undefined` cho UI).
 */
export function scoreBand(score: number): ScoreBand {
  const rounded = Math.round(score);
  const matched = BAND_FLOORS.find((entry) => rounded >= entry.floor);
  return matched?.band ?? '2-1';
}

/**
 * Xếp loại học lực của từng dải điểm — ghi chú cuối tài liệu nghiệp vụ yêu cầu
 * radio hiện XẾP LOẠI, không phải con số trần: giảng viên chọn "Yếu" nhanh và
 * chắc tay hơn chọn "4-3". Dải vẫn là khoá dữ liệu, xếp loại chỉ là nhãn hiển
 * thị nên điểm gửi lên API và công thức DRS không đổi.
 */
export const BAND_CLASSIFICATIONS: Record<ScoreBand, string> = {
  '10-9': 'Xuất sắc / Giỏi',
  '8-7': 'Khá',
  '6-5': 'Trung bình',
  '4-3': 'Yếu',
  '2-1': 'Kém',
};

/** Dải điểm viết theo chiều tăng dần như trong tài liệu ("9–10", "7–8"…). */
export const BAND_RANGE_LABELS: Record<ScoreBand, string> = {
  '10-9': '9–10',
  '8-7': '7–8',
  '6-5': '5–6',
  '4-3': '3–4',
  '2-1': '1–2',
};

/** Đánh giá về khả năng học tập — mô tả từng dải. */
export const ACADEMIC_BAND_DESCRIPTIONS: Record<ScoreBand, string> = {
  '10-9': 'SV có khả năng tiếp thu bài học, khả năng tự học, sáng tạo.',
  '8-7': 'SV có khả năng học tập tốt.',
  '6-5': 'SV học trung bình, trung bình khá.',
  '4-3': 'SV học yếu, học đối phó.',
  '2-1': 'Sinh viên học kém.',
};

/** Đánh giá về thái độ học tập — mô tả từng dải. */
export const ATTITUDE_BAND_DESCRIPTIONS: Record<ScoreBand, string> = {
  '10-9':
    'SV đi học đầy đủ; có thái độ học rất tốt, giúp đỡ các bạn khác cùng học; hoàn thành các LAB, ASM, Quiz trước deadline.',
  '8-7':
    'SV đi học tương đối đầy đủ; có thái độ học tập tốt; hoàn thành các LAB, ASM, Quiz đúng deadline.',
  '6-5':
    'SV đi học không đầy đủ; có thái độ học chưa tốt; hoàn thành các LAB, ASM, Quiz nhưng trễ deadline.',
  '4-3':
    'SV có đi học nhưng vắng rất nhiều; có thái độ học không tốt; không hoàn thành một số LAB, ASM, Quiz.',
  '2-1':
    'SV không đi học hoặc đi học chỉ lên điểm danh; không có mong muốn học; không làm LAB, ASM, Quiz.',
};

/** "Giải pháp gợi ý (*)" theo dải điểm — việc của giảng viên. */
export const ACADEMIC_BAND_SUGGESTIONS: Record<ScoreBand, string> = {
  '10-9': 'GV đưa ra kiến thức mới, định hướng mới hoặc thử thách khó hơn cho sinh viên.',
  '8-7': 'GV động viên hoặc ghép nhóm học tốt.',
  '6-5': 'GV cần kiểm tra, nhắc nhở thường xuyên.',
  '4-3': 'GV cần gặp riêng để hỏi thăm lý do; phụ đạo thêm hoặc giao 1 SV khác kèm riêng.',
  '2-1': 'GV cần gặp riêng tìm nguyên nhân và báo lại với nhà Trường.',
};

export const ISSUE_GROUP_VALUES = [1, 2, 3, 4] as const;

export type IssueGroup = (typeof ISSUE_GROUP_VALUES)[number];

export interface IssueGroupOption {
  value: IssueGroup;
  /** Nhãn ngắn dùng cho badge/bảng. */
  shortLabel: string;
  /** Nội dung nhóm, chép từ tài liệu. */
  label: string;
}

/** "Đánh giá về vấn đề khác của sinh viên" — 4 nhóm theo tài liệu. */
export const ISSUE_GROUPS: readonly IssueGroupOption[] = [
  {
    value: 1,
    shortLabel: 'Nhóm 1 — Chưa phù hợp chuyên ngành',
    label: 'Nhóm số 1: SV không phù hợp với chuyên ngành đã chọn.',
  },
  {
    value: 2,
    shortLabel: 'Nhóm 2 — Đi làm thêm',
    label: 'Nhóm số 2: SV đi làm thêm nên không có thời gian học tập.',
  },
  {
    value: 3,
    shortLabel: 'Nhóm 3 — Ưu tiên hoạt động khác',
    label:
      'Nhóm số 3: SV dành thời gian cho các hoạt động khác (chơi Game; gặp bạn bè, đi du lịch, mua sắm…) nên dành thời gian cho việc học ít hơn.',
  },
  {
    value: 4,
    shortLabel: 'Nhóm 4 — Tâm lí, gia đình',
    label:
      'Nhóm số 4: SV gặp phải các vấn đề về tâm lí, gia đình, cuộc sống, chán học muốn nghỉ học.',
  },
];

export interface IssueGroupSuggestion {
  /** Việc của giảng viên. */
  lecturer: readonly string[];
  /** Việc của cán bộ phòng CTSV. */
  studentAffairs: readonly string[];
}

/** "Giải pháp gợi ý (*)" theo nhóm vấn đề, tách theo người thực hiện. */
export const ISSUE_GROUP_SUGGESTIONS: Record<IssueGroup, IssueGroupSuggestion> = {
  1: {
    lecturer: ['Tư vấn chuyển ngành học cùng CTSV.'],
    studentAffairs: ['Tư vấn chuyển ngành học cùng giảng viên.'],
  },
  2: {
    lecturer: [
      'Linh hoạt deadline (trong giới hạn cho phép).',
      'Cung cấp tài liệu học ngắn gọn, trọng tâm.',
    ],
    studentAffairs: ['Hỗ trợ học bổng, vay vốn sinh viên hoặc tư vấn quản lý thời gian.'],
  },
  3: {
    lecturer: ['Động viên và kiểm tra thường xuyên.'],
    studentAffairs: ['Tổ chức các Workshop về quản lý thời gian; gọi điện tư vấn.'],
  },
  4: {
    lecturer: ['Giới thiệu chuyên gia tâm lý cho SV.'],
    studentAffairs: ['Gọi điện tư vấn và kết nối với thông tin gia đình.'],
  },
};
