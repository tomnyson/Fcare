# Kế hoạch triển khai: Nhận xét sinh viên & điểm rủi ro DRS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép nhiều giảng viên nhận xét một sinh viên theo đúng bộ tiêu chí II.2, tự động tính điểm rủi ro DRS và cấp độ khẩn 1-4, để AI soạn nội dung thông báo, và gửi cho đúng người theo ma trận trong `flow.png` sau khi người thật xác nhận.

**Architecture:** Toàn bộ công thức điểm nằm trong một hàm thuần ở `packages/shared-types` (web và API dùng chung, test không cần DB). Dữ liệu nhận xét được chuẩn hóa: bảng `evaluations` khóa theo `(giảng viên, lớp học phần, sinh viên)` cộng một bảng con `evaluation_criteria` dùng enum. Nhánh AI và thông báo tái sử dụng nguyên pipeline `student-analyses` đã có, chỉ mở rộng bản chụp nguồn, schema output, và đổi hàm chọn người nhận sang `EscalationService` biết cấp độ.

**Tech Stack:** NestJS 11, Prisma 6 (PIN — không nâng 7), PostgreSQL, BullMQ, Jest (API), Next.js 15 + TanStack Query + Vitest (web), Playwright (E2E), Zod.

**Spec:** `docs/superpowers/specs/2026-09-07-nhan-xet-sinh-vien-drs-design.md`

## Global Constraints

- **RULE 1 — PII**: không thêm bất kỳ trường CCCD/CMND, số điện thoại, email, địa chỉ nào vào schema, DTO, UI, Excel. Nhận xét chữ của giảng viên phải đi qua `redactAnalysisText` + `containsForbiddenAnalysisPii` trước khi vào prompt AI.
- **RULE 2 — Scope**: mọi truy vấn chạm sinh viên đi qua `studentScope(user)`; truy vấn chạm lớp học phần đi qua `sectionScope(user)` (`apps/api/src/common/utils/dept-scope.ts`). Không so `departmentId` bằng tay.
- **RULE 3 — Excel**: không đụng tới, tính năng này không có import/export.
- **Response envelope** `{ success, data, error }` giữ nguyên cho mọi endpoint mới.
- **Prisma pin v6.** Migration đặt trong `apps/api/prisma/migrations/`.
- Điểm rủi ro **không được lưu thành cột** — luôn là hàm của dữ liệu nguồn.
- Cấp độ cuối cùng luôn tính ở server bằng `max(...)`; **không tin thẳng** số AI trả về.
- Trước khi báo hoàn thành: `pnpm typecheck && pnpm lint && pnpm build && pnpm test` phải xanh. Không `pnpm build` khi `next dev` :3000 đang chạy — kiểm tra bằng `lsof -i :3000` trước.
- Không commit khi user chưa yêu cầu — các bước "Commit" dưới đây chỉ chạy khi user đã bật đèn xanh cho commit.

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `packages/shared-types/src/risk-score.ts` (tạo) | Hằng số điểm từng tiêu chí + hàm thuần `computeRiskScore()`. Nguồn sự thật duy nhất của công thức. |
| `packages/shared-types/src/evaluations.ts` (sửa) | Bỏ `URGENCY_RULES`/`suggestUrgencyLevel`; thêm ánh xạ tiêu chí → nhóm vấn đề để giữ ô "Giải pháp gợi ý". |
| `apps/api/prisma/schema.prisma` (sửa) | Enum `EvaluationCriterion`, bảng `EvaluationCriterionMark`, cột `classSectionId`/`absentSessions`, bỏ `issueGroup`. |
| `apps/api/src/modules/evaluations/risk-score.spec.ts` (tạo) | Test hàm thuần (chạy bằng Jest của API vì `shared-types` chưa có runner). |
| `apps/api/src/modules/evaluations/evaluations.service.ts` (sửa) | Ghi nhận xét kèm tiêu chí, kiểm lớp học phần thuộc `sectionScope`, kiểm `term` khớp. |
| `apps/api/src/modules/evaluations/risk-score.service.ts` (tạo) | Đọc nhận xét của `(SV, kỳ)` → gọi hàm thuần → trả bản phân rã. |
| `apps/api/src/modules/alerts/escalation.service.ts` (sửa) | Ma trận người nhận theo `flow.png`. |
| `apps/api/src/modules/student-analyses/analysis-output.ts` (sửa) | Thêm `forcedEscalation` + `suggestedLevel`. |
| `apps/api/src/modules/student-analyses/student-analysis-source.service.ts` (sửa) | Snapshot thêm DRS, `CareLog`, nhận xét chữ. |
| `apps/api/src/modules/student-analyses/student-analyses.service.ts` (sửa) | `max()` cấp độ, `sendVersion(confirmedLevel)`, tạo `Alert`, dùng `EscalationService`. |
| `apps/web/src/components/students/evaluation-form.tsx` (tạo) | Form nhập nhận xét. Tách ra từ `evaluations-tab.tsx` đang 695 dòng. |
| `apps/web/src/components/students/evaluation-list.tsx` (tạo) | Danh sách nhận xét các giảng viên. |
| `apps/web/src/components/students/risk-score-panel.tsx` (tạo) | Bảng phân rã DRS — màn hình trả lời "vì sao cấp 3". |

---

### Task 1: Hàm thuần tính điểm rủi ro

Đây là task quan trọng nhất — mọi thứ sau đều dựa vào nó. Làm xong task này là công thức của Trường đã được mã hóa và chứng minh bằng test, chưa cần DB.

**Files:**
- Create: `packages/shared-types/src/risk-score.ts`
- Modify: `packages/shared-types/src/index.ts`
- Test: `apps/api/src/modules/evaluations/risk-score.spec.ts`

**Interfaces:**
- Consumes: `scoreBand()` từ `packages/shared-types/src/evaluations.ts` (đã có).
- Produces:
  - `type EvaluationCriterion` — union 10 chuỗi, trùng tên với enum Prisma ở Task 2.
  - `CRITERION_POINTS: Record<EvaluationCriterion, number>`
  - `interface EvaluationInput { academicScore: number; attitudeScore: number; absentSessions: number | null; criteria: EvaluationCriterion[] }`
  - `interface RiskScoreBreakdown` (xem code Step 3)
  - `computeRiskScore(inputs: EvaluationInput[]): RiskScoreBreakdown`

- [ ] **Step 1: Viết test thất bại**

Tạo `apps/api/src/modules/evaluations/risk-score.spec.ts`:

```ts
import { computeRiskScore, levelFromDrs } from '@fcare/shared-types';
import type { EvaluationInput } from '@fcare/shared-types';

/** Nhận xét "sạch": mọi thành phần bằng 0 — dùng làm nền cho từng ca kiểm. */
function clean(overrides: Partial<EvaluationInput> = {}): EvaluationInput {
  return {
    academicScore: 10,
    attitudeScore: 10,
    absentSessions: null,
    criteria: [],
    ...overrides,
  };
}

describe('computeRiskScore', () => {
  it('không có nhận xét nào thì mọi thành phần bằng 0 và cấp 1', () => {
    const result = computeRiskScore([]);
    expect(result.components).toEqual({ RL: 0, RA: 0, RC: 0, RH: 0, RP: 0 });
    expect(result.drs).toBe(0);
    expect(result.drsLevel).toBe(1);
    expect(result.evaluationCount).toBe(0);
  });

  it('quy dải điểm học lực và thái độ theo bảng II.2', () => {
    // 5 điểm -> dải 6-5 -> 2đ ; 3 điểm -> dải 4-3 -> 3đ
    const result = computeRiskScore([
      clean({ academicScore: 5, attitudeScore: 3 }),
    ]);
    expect(result.components.RL).toBe(2);
    expect(result.components.RA).toBe(3);
  });

  it('nhiều giảng viên thì lấy TRUNG VỊ chứ không phải trung bình (số lẻ)', () => {
    // [10, 1, 1] -> trung bình 4 (dải 4-3, 3đ) nhưng trung vị 1 (dải 2-1, 4đ)
    const result = computeRiskScore([
      clean({ academicScore: 10 }),
      clean({ academicScore: 1 }),
      clean({ academicScore: 1 }),
    ]);
    expect(result.medianAcademic).toBe(1);
    expect(result.components.RL).toBe(4);
  });

  it('trung vị số chẵn lấy trung bình hai phần tử giữa', () => {
    // [3, 5, 7, 9] -> trung vị (5+7)/2 = 6 -> dải 6-5 -> 2đ
    const result = computeRiskScore([
      clean({ academicScore: 3 }),
      clean({ academicScore: 5 }),
      clean({ academicScore: 7 }),
      clean({ academicScore: 9 }),
    ]);
    expect(result.medianAcademic).toBe(6);
    expect(result.components.RL).toBe(2);
  });

  it('R_P cộng điểm các tiêu chí KHÁC nhau của nhiều giảng viên', () => {
    const result = computeRiskScore([
      clean({ criteria: ['P_PART_TIME_JOB'] }), // +2
      clean({ criteria: ['P_PSYCHOLOGICAL'] }), // +3
    ]);
    expect(result.components.RP).toBe(5);
  });

  it('R_P chỉ tính MỘT lần khi nhiều giảng viên tích cùng một tiêu chí', () => {
    const result = computeRiskScore([
      clean({ criteria: ['P_PART_TIME_JOB'] }),
      clean({ criteria: ['P_PART_TIME_JOB'] }),
      clean({ criteria: ['P_PART_TIME_JOB'] }),
    ]);
    expect(result.components.RP).toBe(2);
  });

  it('R_H hợp nhất tiêu chí trùng, cộng tiêu chí khác nhau', () => {
    const result = computeRiskScore([
      clean({ criteria: ['H_NO_QUIZ_CMS', 'H_EXAM_BAN_RISK'] }), // 2 + 3
      clean({ criteria: ['H_NO_QUIZ_CMS', 'H_NO_RESPONSE'] }), //  trùng + 4
    ]);
    expect(result.components.RH).toBe(9);
  });

  it('R_C lấy số buổi vắng cao nhất khi các giảng viên vắng khác nhau', () => {
    const result = computeRiskScore([
      clean({ absentSessions: 0 }),
      clean({ absentSessions: 3 }),
    ]);
    expect(result.components.RC).toBe(3);
  });

  it('R_C = 9 khi TẤT CẢ giảng viên đều ghi vắng 2 buổi', () => {
    const result = computeRiskScore([
      clean({ absentSessions: 2 }),
      clean({ absentSessions: 2 }),
    ]);
    expect(result.components.RC).toBe(9);
  });

  it('R_C = 12 khi TẤT CẢ giảng viên đều ghi vắng từ 3 buổi', () => {
    const result = computeRiskScore([
      clean({ absentSessions: 3 }),
      clean({ absentSessions: 4 }),
    ]);
    expect(result.components.RC).toBe(12);
  });

  it('MỘT giảng viên đơn lẻ không kích hoạt luật "tất cả giảng viên"', () => {
    // Quy ước đã chốt trong spec mục 2: luật cần >= 2 bản nhận xét.
    expect(computeRiskScore([clean({ absentSessions: 2 })]).components.RC).toBe(2);
    expect(computeRiskScore([clean({ absentSessions: 3 })]).components.RC).toBe(3);
  });

  it('bản nhận xét bỏ trống số buổi vắng không được tính là "tất cả đều vắng"', () => {
    const result = computeRiskScore([
      clean({ absentSessions: 3 }),
      clean({ absentSessions: null }),
    ]);
    expect(result.components.RC).toBe(3);
  });

  it('ép cấp 3 từ dữ liệu khi tất cả giảng viên đều vắng từ 3 buổi', () => {
    const result = computeRiskScore([
      clean({ absentSessions: 3 }),
      clean({ absentSessions: 3 }),
    ]);
    expect(result.dataForcedLevel).toBe(3);
  });

  it.each([
    [0, 1],
    [4, 1],
    [5, 2],
    [8, 2],
    [9, 3],
    [12, 3],
    [13, 4],
    [30, 4],
  ])('DRS %i rơi vào cấp %i', (drs, level) => {
    expect(levelFromDrs(drs)).toBe(level);
  });

  it('cộng đủ 5 thành phần thành DRS và ra đúng cấp độ', () => {
    // R_L 3 + R_A 3 + R_C 3 + R_H 3 (cấm thi) + R_P 2 (làm thêm) = 14 -> cấp 4
    const result = computeRiskScore([
      clean({
        academicScore: 3,
        attitudeScore: 3,
        absentSessions: 3,
        criteria: ['H_EXAM_BAN_RISK', 'P_PART_TIME_JOB'],
      }),
    ]);
    expect(result.components).toEqual({ RL: 3, RA: 3, RC: 3, RH: 3, RP: 2 });
    expect(result.drs).toBe(14);
    expect(result.drsLevel).toBe(4);
  });
});

```

- [ ] **Step 2: Chạy test cho chắc là đỏ**

Run: `pnpm --filter @fcare/api test -- risk-score.spec.ts`
Expected: FAIL — `Cannot find module` hoặc `computeRiskScore is not a function`.

- [ ] **Step 3: Viết hàm thuần**

Tạo `packages/shared-types/src/risk-score.ts`:

```ts
/**
 * Công thức điểm rủi ro DRS theo tài liệu "PHẦN II — II.2 CƠ CHẾ ĐÁNH GIÁ ĐỘ
 * KHẨN TỰ ĐỘNG KẾT HỢP AI" (docs/tailieu/cochedokhan.md).
 *
 * Bảng điểm ở đây là QUY ĐỊNH của Trường — sửa số nghĩa là sửa quy định.
 * RULE 1: không có bất kỳ trường PII nào của sinh viên trong file này.
 */
import { scoreBand, type ScoreBand } from './evaluations';

export const EVALUATION_CRITERIA = [
  'P_NOT_FIT_MAJOR',
  'P_PART_TIME_JOB',
  'P_OTHER_ACTIVITIES',
  'P_FAMILY_HARDSHIP',
  'P_FINANCIAL_HARDSHIP',
  'P_PSYCHOLOGICAL',
  'P_DROPOUT_INTENT',
  'H_NO_QUIZ_CMS',
  'H_EXAM_BAN_RISK',
  'H_NO_RESPONSE',
] as const;

export type EvaluationCriterion = (typeof EVALUATION_CRITERIA)[number];

/** Điểm độ khẩn của từng tiêu chí — bảng II.2 mục 3 và mục 4. */
export const CRITERION_POINTS: Record<EvaluationCriterion, number> = {
  P_NOT_FIT_MAJOR: 2,
  P_PART_TIME_JOB: 2,
  P_OTHER_ACTIVITIES: 1,
  P_FAMILY_HARDSHIP: 2,
  P_FINANCIAL_HARDSHIP: 2,
  P_PSYCHOLOGICAL: 3,
  P_DROPOUT_INTENT: 9,
  H_NO_QUIZ_CMS: 2,
  H_EXAM_BAN_RISK: 3,
  H_NO_RESPONSE: 4,
};

export const CRITERION_LABELS: Record<EvaluationCriterion, string> = {
  P_NOT_FIT_MAJOR: 'Không phù hợp chuyên ngành',
  P_PART_TIME_JOB: 'Đi làm thêm ảnh hưởng việc học',
  P_OTHER_ACTIVITIES: 'Hoạt động cá nhân khác ảnh hưởng việc học',
  P_FAMILY_HARDSHIP: 'Khó khăn gia đình / cuộc sống',
  P_FINANCIAL_HARDSHIP: 'Khó khăn tài chính',
  P_PSYCHOLOGICAL: 'Vấn đề tâm lý / mất động lực',
  P_DROPOUT_INTENT: 'Có ý định nghỉ học',
  H_NO_QUIZ_CMS: 'Không làm Quiz trên CMS / học Udemy',
  H_EXAM_BAN_RISK: 'Nguy cơ cấm thi / không đủ điều kiện dự thi',
  H_NO_RESPONSE: 'Không phản hồi giảng viên hoặc CTSV',
};

/** Điểm độ khẩn theo dải điểm 1-10 — bảng II.2 mục 1 và mục 2. */
const BAND_POINTS: Record<ScoreBand, number> = {
  '10-9': 0,
  '8-7': 1,
  '6-5': 2,
  '4-3': 3,
  '2-1': 4,
};

export type UrgencyLevel = 1 | 2 | 3 | 4;

export interface EvaluationInput {
  academicScore: number;
  attitudeScore: number;
  /** Số buổi vắng giảng viên ghi nhận; null = giảng viên chưa nhận xét chuyên cần. */
  absentSessions: number | null;
  criteria: EvaluationCriterion[];
}

export interface RiskScoreBreakdown {
  components: { RL: number; RA: number; RC: number; RH: number; RP: number };
  drs: number;
  drsLevel: UrgencyLevel;
  /** Luật ép cấp độ suy được thuần từ dữ liệu; 1 nghĩa là không ép. */
  dataForcedLevel: 1 | 3;
  evaluationCount: number;
  medianAcademic: number;
  medianAttitude: number;
  triggeredCriteria: EvaluationCriterion[];
  reasons: string[];
}

/** Trung vị: lẻ lấy phần tử giữa, chẵn lấy trung bình hai phần tử giữa. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] as number;
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/** Thang điểm cuối — bảng "CÔNG THỨC ĐIỂM RỦI RO". */
export function levelFromDrs(drs: number): UrgencyLevel {
  if (drs >= 13) return 4;
  if (drs >= 9) return 3;
  if (drs >= 5) return 2;
  return 1;
}

function absentPoint(sessions: number): number {
  if (sessions < 2) return 0;
  if (sessions === 2) return 2;
  return 3;
}

/**
 * R_C. Luật "tất cả giảng viên đều vắng" chỉ áp dụng khi có từ 2 bản nhận xét
 * có ghi số buổi vắng trở lên (quy ước đã chốt — xem spec mục 2).
 * Thứ tự kiểm tra quan trọng: "đều >= 3" phải xét TRƯỚC "đều >= 2".
 */
function attendanceScore(sessions: number[]): number {
  if (sessions.length === 0) return 0;
  const worst = Math.max(...sessions.map(absentPoint));
  if (sessions.length < 2) return worst;
  if (sessions.every((count) => count >= 3)) return 12;
  if (sessions.every((count) => count >= 2)) return 9;
  return worst;
}

function sumCriteria(
  marked: Set<EvaluationCriterion>,
  prefix: 'P_' | 'H_',
): number {
  let total = 0;
  for (const criterion of marked) {
    if (criterion.startsWith(prefix)) total += CRITERION_POINTS[criterion];
  }
  return total;
}

export function computeRiskScore(
  inputs: EvaluationInput[],
): RiskScoreBreakdown {
  const medianAcademic = median(inputs.map((item) => item.academicScore));
  const medianAttitude = median(inputs.map((item) => item.attitudeScore));
  const sessions = inputs
    .map((item) => item.absentSessions)
    .filter((value): value is number => value !== null);
  const marked = new Set<EvaluationCriterion>(
    inputs.flatMap((item) => item.criteria),
  );

  const RL = inputs.length === 0 ? 0 : BAND_POINTS[scoreBand(medianAcademic)];
  const RA = inputs.length === 0 ? 0 : BAND_POINTS[scoreBand(medianAttitude)];
  const RC = attendanceScore(sessions);
  const RP = sumCriteria(marked, 'P_');
  const RH = sumCriteria(marked, 'H_');
  const drs = RL + RA + RC + RH + RP;

  const allAbsentThree =
    sessions.length >= 2 && sessions.every((count) => count >= 3);

  const reasons: string[] = [];
  if (inputs.length > 0) {
    reasons.push(
      `Học lực: trung vị ${medianAcademic} (dải ${scoreBand(medianAcademic)}) → ${RL} điểm.`,
      `Thái độ: trung vị ${medianAttitude} (dải ${scoreBand(medianAttitude)}) → ${RA} điểm.`,
    );
  }
  if (RC > 0) {
    reasons.push(
      allAbsentThree
        ? `Chuyên cần: tất cả ${sessions.length} giảng viên đều ghi vắng từ 3 buổi → ${RC} điểm.`
        : `Chuyên cần: ${RC} điểm.`,
    );
  }
  for (const criterion of marked) {
    reasons.push(
      `${CRITERION_LABELS[criterion]} → +${CRITERION_POINTS[criterion]} điểm.`,
    );
  }

  return {
    components: { RL, RA, RC, RH, RP },
    drs,
    drsLevel: levelFromDrs(drs),
    dataForcedLevel: allAbsentThree ? 3 : 1,
    evaluationCount: inputs.length,
    medianAcademic,
    medianAttitude,
    triggeredCriteria: [...marked],
    reasons,
  };
}
```

Thêm vào `packages/shared-types/src/index.ts`, ngay sau dòng `export * from './evaluations';`:

```ts
export * from './risk-score';
```

- [ ] **Step 4: Chạy test cho xanh**

Run: `pnpm --filter @fcare/api test -- risk-score.spec.ts`
Expected: PASS toàn bộ 14 ca.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @fcare/shared-types typecheck`
Expected: không lỗi.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/risk-score.ts packages/shared-types/src/index.ts apps/api/src/modules/evaluations/risk-score.spec.ts
git commit -m "feat: them cong thuc diem rui ro DRS theo tai lieu II.2"
```

---

### Task 2: Schema và migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_evaluation_criteria/migration.sql`
- Modify: `apps/api/prisma/seed-data.ts`, `apps/api/prisma/seed.ts`

**Interfaces:**
- Consumes: `EvaluationCriterion` (Task 1) — tên thành viên enum Prisma phải **trùng từng ký tự** với union chuỗi đó.
- Produces: model `Evaluation` có `classSectionId`, `absentSessions`, quan hệ `criteria`; model `EvaluationCriterionMark`.

- [ ] **Step 1: Đếm dữ liệu không backfill được TRƯỚC khi đụng schema**

Đây là bước bắt buộc, không được bỏ: nếu có nhận xét cũ không tìm được lớp học phần thì phải dừng lại hỏi user, không được tự xóa.

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres
psql "$DATABASE_URL" -c "
SELECT count(*) AS khong_khop
FROM evaluations e
WHERE NOT EXISTS (
  SELECT 1 FROM class_sections cs
  JOIN enrollments en ON en.\"classSectionId\" = cs.id AND en.\"studentId\" = e.\"studentId\"
  WHERE cs.\"lecturerId\" = e.\"lecturerId\" AND cs.term = e.term
);"
```

Expected: `khong_khop = 0`. Nếu > 0 → **DỪNG**, báo user con số và hỏi cách xử lý.

- [ ] **Step 2: Sửa schema**

Trong `apps/api/prisma/schema.prisma`, thay khối `model Evaluation` bằng:

```prisma
enum EvaluationCriterion {
  P_NOT_FIT_MAJOR
  P_PART_TIME_JOB
  P_OTHER_ACTIVITIES
  P_FAMILY_HARDSHIP
  P_FINANCIAL_HARDSHIP
  P_PSYCHOLOGICAL
  P_DROPOUT_INTENT
  H_NO_QUIZ_CMS
  H_EXAM_BAN_RISK
  H_NO_RESPONSE
}

// Nhận xét của MỘT giảng viên cho MỘT sinh viên ở MỘT lớp học phần.
model Evaluation {
  id             String   @id @default(uuid())
  studentId      String
  lecturerId     String
  classSectionId String
  term           String
  academicScore  Int // 1..10 → R_L
  attitudeScore  Int // 1..10 → R_A
  absentSessions Int? // số buổi vắng GV ghi nhận → R_C; null = chưa nhận xét chuyên cần
  note           String? // nhận xét chữ — đầu vào cho AI xét ép cấp độ
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  student      Student                   @relation(fields: [studentId], references: [id], onDelete: Cascade)
  lecturer     Staff                     @relation(fields: [lecturerId], references: [id])
  classSection ClassSection              @relation(fields: [classSectionId], references: [id])
  criteria     EvaluationCriterionMark[]

  @@unique([lecturerId, classSectionId, studentId])
  @@index([studentId, term])
  @@map("evaluations")
}

model EvaluationCriterionMark {
  id           String              @id @default(uuid())
  evaluationId String
  criterion    EvaluationCriterion

  evaluation Evaluation @relation(fields: [evaluationId], references: [id], onDelete: Cascade)

  @@unique([evaluationId, criterion])
  @@map("evaluation_criteria")
}
```

Thêm quan hệ ngược vào `model ClassSection` (ngay dưới dòng `enrollments Enrollment[]`):

```prisma
  evaluations Evaluation[]
```

- [ ] **Step 3: Sinh migration và viết tay phần backfill**

```bash
pnpm --filter @fcare/api exec prisma migrate dev --create-only --name add_evaluation_criteria
```

Mở file `migration.sql` vừa sinh. Prisma sẽ đặt `classSectionId` là `NOT NULL` ngay và `DROP COLUMN "issueGroup"` — phải sửa lại thành ba nhịp, chèn đúng thứ tự sau:

```sql
-- 1. Thêm cột ở dạng nullable trước
ALTER TABLE "evaluations" ADD COLUMN "classSectionId" TEXT;
ALTER TABLE "evaluations" ADD COLUMN "absentSessions" INTEGER;

-- 2. Backfill lớp học phần: lớp có code nhỏ nhất mà GV đó dạy SV đó trong kỳ đó
UPDATE "evaluations" e
SET "classSectionId" = sub.id
FROM (
  SELECT DISTINCT ON (cs."lecturerId", cs.term, en."studentId")
         cs.id, cs."lecturerId", cs.term, en."studentId"
  FROM "class_sections" cs
  JOIN "enrollments" en ON en."classSectionId" = cs.id
  ORDER BY cs."lecturerId", cs.term, en."studentId", cs.code ASC
) sub
WHERE sub."lecturerId" = e."lecturerId"
  AND sub.term = e.term
  AND sub."studentId" = e."studentId";

-- 3. Backfill tiêu chí từ nhóm vấn đề cũ
INSERT INTO "evaluation_criteria" ("id", "evaluationId", "criterion")
SELECT gen_random_uuid(), e.id,
  CASE e."issueGroup"
    WHEN 1 THEN 'P_NOT_FIT_MAJOR'::"EvaluationCriterion"
    WHEN 2 THEN 'P_PART_TIME_JOB'::"EvaluationCriterion"
    WHEN 3 THEN 'P_OTHER_ACTIVITIES'::"EvaluationCriterion"
    WHEN 4 THEN 'P_PSYCHOLOGICAL'::"EvaluationCriterion"
  END
FROM "evaluations" e
WHERE e."issueGroup" IS NOT NULL;

-- 4. Chốt ràng buộc rồi mới bỏ cột cũ
ALTER TABLE "evaluations" ALTER COLUMN "classSectionId" SET NOT NULL;
ALTER TABLE "evaluations" DROP COLUMN "issueGroup";
```

Lệnh `CREATE TABLE "evaluation_criteria"` và `CREATE TYPE "EvaluationCriterion"` do Prisma sinh phải đứng **trước** bước 3.

- [ ] **Step 4: Chạy migration và seed**

```bash
pnpm --filter @fcare/api db:migrate:dev
pnpm --filter @fcare/api db:seed
```

Expected: migration chạy sạch. Seed sẽ **lỗi** vì `seed-data.ts` còn dùng `issueGroup` — sửa các bản ghi đánh giá mẫu sang `classSectionId` (lấy từ lớp học phần đã seed) và `criteria: { create: [{ criterion: 'P_PART_TIME_JOB' }] }`.

- [ ] **Step 5: Chạy lại seed cho xanh**

Run: `pnpm --filter @fcare/api db:seed && pnpm --filter @fcare/api test -- seed.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma
git commit -m "feat: chuan hoa tieu chi nhan xet va gan nhan xet vao lop hoc phan"
```

---

### Task 3: Ghi nhận xét theo tiêu chí

**Files:**
- Modify: `apps/api/src/modules/evaluations/dto/evaluation.dto.ts`
- Modify: `apps/api/src/modules/evaluations/evaluations.service.ts`
- Test: `apps/api/src/modules/evaluations/evaluations.service.spec.ts` (tạo)

**Interfaces:**
- Consumes: `EVALUATION_CRITERIA`, `EvaluationCriterion` (Task 1); model Prisma (Task 2); `studentScope`, `sectionScope`, `isStudentInScope` từ `apps/api/src/common/utils/dept-scope.ts`.
- Produces: `EvaluationsService.create/update` nhận `classSectionId`, `absentSessions`, `criteria`; ném `BadRequestException` khi `term` lệch, `NotFoundException` khi lớp ngoài `sectionScope`.

- [ ] **Step 1: Viết test thất bại**

Tạo `apps/api/src/modules/evaluations/evaluations.service.spec.ts`:

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EvaluationsService } from './evaluations.service';
import type { AuthUser } from '../../common/types/auth-user';

const lecturer: AuthUser = {
  id: 'gv-1',
  roles: ['LECTURER'],
  departmentId: 'bm-1',
} as AuthUser;

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    student: { findFirst: jest.fn().mockResolvedValue({ id: 'sv-1' }) },
    classSection: {
      findFirst: jest.fn().mockResolvedValue({ id: 'lop-1', term: 'SU25' }),
    },
    evaluation: { create: jest.fn().mockResolvedValue({ id: 'nx-1' }) },
    ...overrides,
  } as never;
}

describe('EvaluationsService.create', () => {
  const dto = {
    studentId: 'sv-1',
    classSectionId: 'lop-1',
    term: 'SU25',
    academicScore: 5,
    attitudeScore: 5,
    absentSessions: 2,
    criteria: ['P_PART_TIME_JOB' as const],
  };

  it('từ chối khi lớp học phần không thuộc phạm vi giảng dạy', async () => {
    const prisma = makePrisma({
      classSection: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const service = new EvaluationsService(prisma);
    await expect(service.create(lecturer, dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('từ chối khi học kỳ trong body lệch với học kỳ của lớp', async () => {
    const prisma = makePrisma({
      classSection: {
        findFirst: jest.fn().mockResolvedValue({ id: 'lop-1', term: 'FA25' }),
      },
    });
    const service = new EvaluationsService(prisma);
    await expect(service.create(lecturer, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('ghi tiêu chí thành các dòng con trong cùng một lần tạo', async () => {
    const prisma = makePrisma();
    const service = new EvaluationsService(prisma);
    await service.create(lecturer, dto);
    const arg = (prisma as never as { evaluation: { create: jest.Mock } })
      .evaluation.create.mock.calls[0][0];
    expect(arg.data.criteria).toEqual({
      create: [{ criterion: 'P_PART_TIME_JOB' }],
    });
    expect(arg.data.lecturerId).toBe('gv-1');
  });
});
```

- [ ] **Step 2: Chạy test cho chắc là đỏ**

Run: `pnpm --filter @fcare/api test -- evaluations.service.spec.ts`
Expected: FAIL — service chưa nhận `classSectionId`.

- [ ] **Step 3: Sửa DTO**

Trong `apps/api/src/modules/evaluations/dto/evaluation.dto.ts`: bỏ khối `issueGroup`, thêm:

```ts
import { ArrayUnique, IsArray, IsIn, IsUUID } from 'class-validator';
import { EVALUATION_CRITERIA, type EvaluationCriterion } from '@fcare/shared-types';

  @ApiProperty({ description: 'ID lớp học phần giảng viên đang dạy' })
  @IsUUID()
  classSectionId!: string;

  @ApiPropertyOptional({ minimum: 0, description: 'Số buổi sinh viên đã vắng' })
  @IsOptional()
  @IsInt()
  @Min(0)
  absentSessions?: number;

  @ApiPropertyOptional({ enum: EVALUATION_CRITERIA, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(EVALUATION_CRITERIA, { each: true })
  criteria?: EvaluationCriterion[];
```

`UpdateEvaluationDto` đổi danh sách `PickType` thành `['academicScore', 'attitudeScore', 'absentSessions', 'criteria', 'note']`.

- [ ] **Step 4: Sửa service**

Trong `evaluations.service.ts`, thay thân `create` bằng:

```ts
  async create(user: AuthUser, dto: CreateEvaluationDto) {
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, ...studentScope(user) },
    });
    if (!student) {
      throw new NotFoundException(
        'Không tìm thấy sinh viên trong phạm vi quản lý của bạn.',
      );
    }

    // Giảng viên chỉ nhận xét được lớp học phần mình đứng lớp.
    const section = await this.prisma.classSection.findFirst({
      where: { id: dto.classSectionId, ...sectionScope(user) },
      select: { id: true, term: true },
    });
    if (!section) {
      throw new NotFoundException(
        'Không tìm thấy lớp học phần trong phạm vi giảng dạy của bạn.',
      );
    }
    if (section.term !== dto.term) {
      throw new BadRequestException(
        'Học kỳ không khớp với học kỳ của lớp học phần.',
      );
    }

    const { criteria, ...rest } = dto;
    return this.prisma.evaluation.create({
      data: {
        ...rest,
        lecturerId: user.id,
        criteria: { create: (criteria ?? []).map((criterion) => ({ criterion })) },
      },
      include: {
        criteria: { select: { criterion: true } },
        lecturer: { select: { id: true, staffCode: true, fullName: true } },
      },
    });
  }
```

`update` ghi đè toàn bộ tiêu chí trong một transaction:

```ts
    const { criteria, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      if (criteria) {
        await tx.evaluationCriterionMark.deleteMany({ where: { evaluationId: id } });
      }
      return tx.evaluation.update({
        where: { id },
        data: {
          ...rest,
          ...(criteria
            ? { criteria: { create: criteria.map((criterion) => ({ criterion })) } }
            : {}),
        },
        include: { criteria: { select: { criterion: true } } },
      });
    });
```

`list` thêm `criteria: { select: { criterion: true } }` vào `include`. Nhớ thêm `BadRequestException` và `sectionScope` vào danh sách import.

- [ ] **Step 5: Chạy test cho xanh**

Run: `pnpm --filter @fcare/api test -- evaluations.service.spec.ts`
Expected: PASS cả 3 ca.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/evaluations
git commit -m "feat: nhan xet ghi theo lop hoc phan va bo tieu chi II.2"
```

---

### Task 4: Endpoint trả bản phân rã DRS

**Files:**
- Create: `apps/api/src/modules/evaluations/risk-score.service.ts`
- Modify: `apps/api/src/modules/evaluations/evaluations.controller.ts`, `evaluations.module.ts`
- Test: `apps/api/src/modules/evaluations/risk-score.service.spec.ts`

**Interfaces:**
- Consumes: `computeRiskScore` (Task 1), model `Evaluation` (Task 2), `studentScope`.
- Produces: `RiskScoreService.forStudentTerm(user, studentId, term): Promise<RiskScoreBreakdown>`; endpoint `GET /evaluations/risk-score?studentId&term`.

- [ ] **Step 1: Viết test thất bại**

Tạo `apps/api/src/modules/evaluations/risk-score.service.spec.ts`:

```ts
import { RiskScoreService } from './risk-score.service';
import type { AuthUser } from '../../common/types/auth-user';

const user = { id: 'gv-1', roles: ['LECTURER'], departmentId: 'bm-1' } as AuthUser;

describe('RiskScoreService', () => {
  it('chuyển dòng Prisma sang đầu vào của hàm thuần rồi trả bản phân rã', async () => {
    const prisma = {
      evaluation: {
        findMany: jest.fn().mockResolvedValue([
          {
            academicScore: 3,
            attitudeScore: 3,
            absentSessions: 3,
            criteria: [{ criterion: 'P_DROPOUT_INTENT' }],
          },
        ]),
      },
    } as never;
    const service = new RiskScoreService(prisma);
    const result = await service.forStudentTerm(user, 'sv-1', 'SU25');

    // R_L 3 + R_A 3 + R_C 3 + R_P 9 = 18 -> cấp 4
    expect(result.drs).toBe(18);
    expect(result.drsLevel).toBe(4);
    expect(result.evaluationCount).toBe(1);
  });
});
```

- [ ] **Step 2: Chạy test cho chắc là đỏ**

Run: `pnpm --filter @fcare/api test -- risk-score.service.spec.ts`
Expected: FAIL — `Cannot find module './risk-score.service'`.

- [ ] **Step 3: Viết service**

Tạo `apps/api/src/modules/evaluations/risk-score.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import {
  computeRiskScore,
  type EvaluationInput,
  type RiskScoreBreakdown,
} from '@fcare/shared-types';
import type { AuthUser } from '../../common/types/auth-user';
import { studentScope } from '../../common/utils/dept-scope';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RiskScoreService {
  constructor(private readonly prisma: PrismaService) {}

  async forStudentTerm(
    user: AuthUser,
    studentId: string,
    term: string,
  ): Promise<RiskScoreBreakdown> {
    const rows = await this.prisma.evaluation.findMany({
      where: { studentId, term, student: studentScope(user) },
      select: {
        academicScore: true,
        attitudeScore: true,
        absentSessions: true,
        criteria: { select: { criterion: true } },
      },
    });

    const inputs: EvaluationInput[] = rows.map((row) => ({
      academicScore: row.academicScore,
      attitudeScore: row.attitudeScore,
      absentSessions: row.absentSessions,
      criteria: row.criteria.map((mark) => mark.criterion),
    }));

    return computeRiskScore(inputs);
  }
}
```

- [ ] **Step 4: Nối vào controller và module**

Trong `evaluations.controller.ts` thêm:

```ts
  @Get('risk-score')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Evaluation'))
  riskScore(
    @CurrentUser() user: AuthUser,
    @Query() query: RiskScoreQuery,
  ) {
    return this.riskScoreService.forStudentTerm(user, query.studentId, query.term);
  }
```

Route `risk-score` phải đứng **trước** mọi route `:id` để Nest không bắt nhầm nó thành tham số. Thêm `RiskScoreQuery` (hai trường `studentId` `@IsUUID()` và `term` `@IsString() @MaxLength(20)`, cả hai bắt buộc) vào `dto/evaluation.dto.ts`, và đăng ký `RiskScoreService` vào `providers` của `evaluations.module.ts` (cũng `exports` để Task 6 dùng lại).

- [ ] **Step 5: Chạy test cho xanh**

Run: `pnpm --filter @fcare/api test -- risk-score.service.spec.ts && pnpm --filter @fcare/api typecheck`
Expected: PASS, không lỗi type.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/evaluations
git commit -m "feat: endpoint tra ban phan ra diem rui ro DRS"
```

---

### Task 5: Ma trận người nhận theo flow.png

**Files:**
- Modify: `apps/api/src/modules/alerts/escalation.service.ts`
- Modify: `apps/api/src/modules/alerts/escalation.service.spec.ts`

**Interfaces:**
- Produces: `EscalationService.computeRecipientIds(studentId, level, raisedById)` — chữ ký giữ nguyên, chỉ đổi hành vi.

- [ ] **Step 1: Viết test thất bại**

Thêm vào `escalation.service.spec.ts`:

```ts
  it('cấp 1 gửi cho tất cả giảng viên đang dạy sinh viên', async () => {
    const ids = await service.computeRecipientIds('sv-1', 1, 'gv-raise');
    expect(ids).toEqual(['gv-day-1']);
  });

  it('cấp 2 thêm cán bộ CTSV', async () => {
    const ids = await service.computeRecipientIds('sv-1', 2, 'gv-raise');
    expect(ids).toEqual(expect.arrayContaining(['gv-day-1', 'sa-officer']));
  });

  it('cấp 3 thêm trưởng bộ môn', async () => {
    const ids = await service.computeRecipientIds('sv-1', 3, 'gv-raise');
    expect(ids).toEqual(expect.arrayContaining(['gv-day-1', 'sa-officer', 'tbm']));
  });

  it('cấp 4 thêm trưởng phòng Đào tạo và trưởng phòng CTSV', async () => {
    const ids = await service.computeRecipientIds('sv-1', 4, 'gv-raise');
    expect(ids).toEqual(
      expect.arrayContaining(['gv-day-1', 'sa-officer', 'tbm', 'dao-tao', 'sa-head']),
    );
  });

  it('người phát cảnh báo không tự nhận thông báo', async () => {
    const ids = await service.computeRecipientIds('sv-1', 4, 'gv-day-1');
    expect(ids).not.toContain('gv-day-1');
  });
```

Mock Prisma theo đúng kiểu file spec hiện có: `staff.findMany` trả về theo `where.roles.some.role.key.in` (`SA_OFFICER` → `sa-officer`, `HEAD_OF_DEPT` → `tbm`, `TRAINING_OFFICER` → `dao-tao`, `SA_HEAD` → `sa-head`) và trả `[{ id: 'gv-day-1' }]` khi `where.classSections` có mặt.

- [ ] **Step 2: Chạy test cho chắc là đỏ**

Run: `pnpm --filter @fcare/api test -- escalation.service.spec.ts`
Expected: FAIL — cấp 1 hiện trả mảng rỗng.

- [ ] **Step 3: Viết lại ma trận**

Thay toàn bộ thân `computeRecipientIds`:

```ts
  /**
   * Ma trận báo tin theo độ khẩn — flow.png "WORKFLOW XÁC ĐỊNH ĐỘ KHẨN CẤP":
   * - Cấp 1: tất cả giảng viên đang dạy sinh viên.
   * - Cấp 2: + cán bộ phòng CTSV.
   * - Cấp 3: + trưởng bộ môn của sinh viên.
   * - Cấp 4: + trưởng phòng Đào tạo và trưởng phòng CTSV.
   */
  async computeRecipientIds(
    studentId: string,
    level: number,
    raisedById: string,
  ): Promise<string[]> {
    const recipients = new Set<string>();

    const teachingLecturers = await this.prisma.staff.findMany({
      where: {
        isActive: true,
        classSections: { some: { enrollments: { some: { studentId } } } },
      },
      select: { id: true },
    });
    teachingLecturers.forEach((staff) => recipients.add(staff.id));

    if (level >= 2) {
      (await this.findActiveStaffByRoles(['SA_OFFICER'])).forEach((id) =>
        recipients.add(id),
      );
    }

    if (level >= 3) {
      const student = await this.prisma.student.findUnique({
        where: { id: studentId },
        select: { departmentId: true },
      });
      if (student) {
        (
          await this.findActiveStaffByRoles(['HEAD_OF_DEPT'], student.departmentId)
        ).forEach((id) => recipients.add(id));
      }
    }

    if (level >= 4) {
      (
        await this.findActiveStaffByRoles(['TRAINING_OFFICER', 'SA_HEAD'])
      ).forEach((id) => recipients.add(id));
    }

    recipients.delete(raisedById); // người phát cảnh báo không cần tự nhận thông báo
    return [...recipients];
  }
```

- [ ] **Step 4: Chạy test cho xanh**

Run: `pnpm --filter @fcare/api test -- escalation.service.spec.ts alerts.service.spec.ts`
Expected: PASS. Nếu `alerts.service.spec.ts` có ca cũ khẳng định "cấp 1 không gửi ai", sửa ca đó theo ma trận mới và ghi chú lý do trong test.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/alerts
git commit -m "feat: ma tran nguoi nhan thong bao theo flow.png"
```

---

### Task 6: Nhánh AI — ép cấp độ và gửi theo cấp đã xác nhận

**Files:**
- Modify: `apps/api/src/modules/student-analyses/analysis-output.ts` + `.spec.ts`
- Modify: `apps/api/src/modules/student-analyses/student-analysis-source.service.ts`
- Modify: `apps/api/src/modules/student-analyses/student-analyses.service.ts` + `.spec.ts`
- Modify: `apps/api/src/modules/student-analyses/dto/` (DTO của `send`)

**Interfaces:**
- Consumes: `RiskScoreService.forStudentTerm` (Task 4), `EscalationService.computeRecipientIds` (Task 5), `levelFromDrs`/`UrgencyLevel` (Task 1).
- Produces: `AcademicAnalysisOutput` có `forcedEscalation` và `suggestedLevel`; `sendVersion(user, versionId, dto: SendAnalysisDto)` với `dto.confirmedLevel: 1|2|3|4` và `dto.reason: string`.

- [ ] **Step 1: Viết test thất bại cho schema output**

Thêm vào `analysis-output.spec.ts`:

```ts
  it('chấp nhận forcedEscalation có đủ luật, trích dẫn và cấp', () => {
    const parsed = academicAnalysisOutputSchema.safeParse({
      ...validOutput,
      suggestedLevel: 4,
      forcedEscalation: {
        rule: 'NO_LONGER_WANTS_TO_STUDY',
        quote: 'em không còn muốn học nữa',
        level: 4,
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('từ chối forcedEscalation thiếu trích dẫn', () => {
    const parsed = academicAnalysisOutputSchema.safeParse({
      ...validOutput,
      suggestedLevel: 4,
      forcedEscalation: { rule: 'NO_LONGER_WANTS_TO_STUDY', quote: '', level: 4 },
    });
    expect(parsed.success).toBe(false);
  });
```

(`validOutput` là object hợp lệ đã có sẵn trong file spec; nếu chưa có thì tạo một hằng số từ các trường bắt buộc hiện tại.)

- [ ] **Step 2: Chạy test cho chắc là đỏ**

Run: `pnpm --filter @fcare/api test -- analysis-output.spec.ts`
Expected: FAIL — schema chưa biết hai trường mới.

- [ ] **Step 3: Mở rộng schema output**

Trong `analysis-output.ts`, thêm vào `academicAnalysisOutputSchema`:

```ts
export const FORCED_ESCALATION_RULES = {
  DROPOUT_INTENT: { level: 3, label: 'Có ý định nghỉ học' },
  NO_LONGER_WANTS_TO_STUDY: { level: 4, label: 'SV nói không còn mong muốn học' },
  NOT_ATTENDING_AND_NO_WORK: {
    level: 4,
    label: 'Không đi học / điểm danh đối phó và không làm bài',
  },
} as const;

  suggestedLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  forcedEscalation: z
    .object({
      rule: z.enum([
        'DROPOUT_INTENT',
        'NO_LONGER_WANTS_TO_STUDY',
        'NOT_ATTENDING_AND_NO_WORK',
      ]),
      // Trích NGUYÊN VĂN câu trong nhận xét của giảng viên làm bằng chứng.
      quote: z.string().min(1).max(500),
      level: z.union([z.literal(3), z.literal(4)]),
    })
    .nullable(),
```

- [ ] **Step 4: Bổ sung ba khối vào bản chụp nguồn**

Trong `student-analysis-source.service.ts`, `buildSnapshot` thêm vào `select` của student:

```ts
        careLogs: {
          orderBy: { createdAt: 'asc' },
          take: 50,
          select: {
            channel: true,
            content: true,
            outcome: true,
            nextAction: true,
            createdAt: true,
          },
        },
```

và trong khối `evaluations` thêm `absentSessions: true`, `note: true`, `criteria: { select: { criterion: true } }` (bỏ `issueGroup` nếu đang chọn). Sau khi dựng xong snapshot, thêm khối điểm:

```ts
    // Bảng phân rã DRS đi kèm snapshot để prompt AI và bản lưu giải trình
    // cùng nhìn một con số. Vẫn là hàm thuần, không truy vấn thêm.
    const riskScore = computeRiskScore(
      student.evaluations
        .filter((item) => item.term === focusTerm)
        .map((item) => ({
          academicScore: item.academicScore,
          attitudeScore: item.attitudeScore,
          absentSessions: item.absentSessions,
          criteria: item.criteria.map((mark) => mark.criterion),
        })),
    );
```

`riskScore` và `careLogs` phải nằm trong đối tượng dùng để tính `hashAnalysisSource` — đổi điểm mà hash không đổi thì bản nháp cũ sẽ bị coi là còn dùng được.

`content`, `outcome`, `nextAction` của `CareLog` và `note` của nhận xét là chữ người gõ → chạy qua `redactAnalysisText` và `containsForbiddenAnalysisPii` y như các trường chữ hiện có. Không có ngoại lệ.

- [ ] **Step 5: Viết test thất bại cho cấp độ cuối và việc gửi**

Thêm vào `student-analyses.service.spec.ts`:

```ts
  describe('resolveFinalLevel', () => {
    it('lấy mức cao nhất giữa DRS, ép từ dữ liệu và ép từ AI', () => {
      expect(service.resolveFinalLevel(2, 3, null)).toBe(3);
      expect(service.resolveFinalLevel(2, 1, 4)).toBe(4);
      expect(service.resolveFinalLevel(4, 3, 3)).toBe(4);
      expect(service.resolveFinalLevel(1, 1, null)).toBe(1);
    });

    it('bỏ qua ép từ AI khi trích dẫn không có thật trong nhận xét nguồn', () => {
      expect(
        service.aiForcedLevel(
          { rule: 'NO_LONGER_WANTS_TO_STUDY', quote: 'câu bịa', level: 4 },
          ['em vẫn đang cố gắng'],
        ),
      ).toBeNull();
      expect(
        service.aiForcedLevel(
          { rule: 'NO_LONGER_WANTS_TO_STUDY', quote: 'không còn muốn học', level: 4 },
          ['thưa cô em không còn muốn học nữa'],
        ),
      ).toBe(4);
    });
  });
```

- [ ] **Step 6: Chạy test cho chắc là đỏ**

Run: `pnpm --filter @fcare/api test -- student-analyses.service.spec.ts`
Expected: FAIL — hai hàm chưa tồn tại.

- [ ] **Step 7: Cài hai hàm và sửa `sendVersion`**

Thêm vào `student-analyses.service.ts`:

```ts
  /** Cấp cuối luôn tính ở server; không tin thẳng `suggestedLevel` của AI. */
  resolveFinalLevel(
    drsLevel: number,
    dataForcedLevel: number,
    aiForcedLevel: number | null,
  ): UrgencyLevel {
    return Math.max(drsLevel, dataForcedLevel, aiForcedLevel ?? 1) as UrgencyLevel;
  }

  /**
   * Chỉ chấp nhận ép cấp khi AI trích được nguyên văn một đoạn CÓ THẬT trong
   * nhận xét nguồn. Không kiểm được thì coi như không ép.
   */
  aiForcedLevel(
    forced: AcademicAnalysisOutput['forcedEscalation'],
    sourceNotes: string[],
  ): number | null {
    if (!forced) return null;
    const needle = forced.quote.trim().toLowerCase();
    const found = sourceNotes.some((note) =>
      note.toLowerCase().includes(needle),
    );
    return found ? forced.level : null;
  }
```

`sendVersion` nhận thêm `dto: SendAnalysisDto` (`confirmedLevel` 1..4 `@IsInt() @Min(1) @Max(4)`; `reason` `@IsString() @MaxLength(2000)`, và **bắt buộc ≥ 40 ký tự khi `confirmedLevel === 4`** — kiểm trong service, ném `BadRequestException` với thông báo tiếng Việt). Bên trong transaction đang có:

1. Bỏ lời gọi `this.resolveRecipients(...)`, thay bằng
   `this.escalation.computeRecipientIds(studentId, dto.confirmedLevel, user.id)`.
2. Tạo `Alert` ở cấp đã xác nhận: `level: dto.confirmedLevel`, `reason: dto.reason`, `raisedById: user.id`.
3. Truyền `alertId` vừa tạo xuống `processDelivery` để mỗi `Notification` mang **cả** `alertId` lẫn `analysisVersionId` — schema đã cho phép, nên vẫn đúng một dòng cho mỗi người nhận.

Tiêm `EscalationService` (export từ `AlertsModule`) và `RiskScoreService` (export từ `EvaluationsModule`, Task 4) vào `StudentAnalysesModule`.

- [ ] **Step 8: Chạy test cho xanh**

Run: `pnpm --filter @fcare/api test`
Expected: toàn bộ suite của API PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/student-analyses
git commit -m "feat: AI ep cap do co trich dan va gui thong bao theo cap da xac nhan"
```

---

### Task 7: Giao diện nhập nhận xét và bảng phân rã DRS

**Files:**
- Create: `apps/web/src/components/students/evaluation-form.tsx`
- Create: `apps/web/src/components/students/evaluation-list.tsx`
- Create: `apps/web/src/components/students/risk-score-panel.tsx`
- Modify: `apps/web/src/components/students/evaluations-tab.tsx` (rút còn phần ghép nối)
- Modify: `apps/web/src/components/students/evaluation-guidance.tsx`, `apps/web/src/lib/types.ts`
- Test: `apps/web/src/components/students/risk-score-panel.test.ts`

**Interfaces:**
- Consumes: `GET /evaluations/risk-score` (Task 4), `POST/PATCH /evaluations` (Task 3), `CRITERION_LABELS`/`CRITERION_POINTS`/`RiskScoreBreakdown` (Task 1).
- Produces: `<RiskScorePanel studentId term />`, `<EvaluationForm studentId term onSaved />`, `<EvaluationList items />`.

`evaluations-tab.tsx` đang 695 dòng, vượt ngưỡng 800 nếu nhét thêm — tách là một phần của task này, không phải việc dọn dẹp riêng.

- [ ] **Step 1: Viết test thất bại cho hàm hiển thị**

Tạo `apps/web/src/components/students/risk-score-panel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { levelBadge } from './risk-score-panel';

describe('levelBadge', () => {
  it('gắn nhãn tiếng Việt đúng cho từng cấp', () => {
    expect(levelBadge(1).label).toBe('Cấp 1 — Thấp');
    expect(levelBadge(2).label).toBe('Cấp 2 — Trung bình');
    expect(levelBadge(3).label).toBe('Cấp 3 — Cao');
    expect(levelBadge(4).label).toBe('Cấp 4 — Khẩn cấp');
  });

  it('dùng token màu, không hardcode mã màu', () => {
    expect(levelBadge(4).className).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});
```

- [ ] **Step 2: Chạy test cho chắc là đỏ**

Run: `pnpm --filter @fcare/web test -- risk-score-panel`
Expected: FAIL — chưa có file.

- [ ] **Step 3: Dựng `risk-score-panel.tsx`**

Xuất `levelBadge(level: 1|2|3|4): { label: string; className: string }` dùng class Tailwind trỏ vào biến trong `apps/web/src/styles/tokens.css`, và component đọc dữ liệu bằng TanStack Query:

```tsx
const { data } = useQuery({
  queryKey: ['risk-score', studentId, term],
  queryFn: () =>
    apiFetch<RiskScoreBreakdown>(
      `/evaluations/risk-score?studentId=${studentId}&term=${term}`,
    ),
});
```

Bảng hiển thị 5 dòng thành phần (R_L, R_A, R_C, R_H, R_P) kèm cột giải thích lấy từ `data.reasons`, dòng tổng `DRS`, badge cấp độ, và dòng "Tính trên N bản nhận xét". Khi `evaluationCount === 0` thì hiện trạng thái rỗng "Chưa có giảng viên nào nhận xét" thay vì bảng toàn số 0 — bảng 0 điểm dễ bị đọc nhầm là "sinh viên không có vấn đề gì".

- [ ] **Step 4: Dựng `evaluation-form.tsx`**

- Ô chọn lớp học phần: chỉ liệt kê lớp giảng viên đang dạy trong kỳ.
- Học lực và thái độ: hai nhóm **radio 5 dải** (đúng ghi chú cuối tài liệu), nhãn lấy từ `ACADEMIC_BAND_DESCRIPTIONS` / `ATTITUDE_BAND_DESCRIPTIONS`; giá trị gửi lên là điểm đại diện của dải (`10-9`→10, `8-7`→8, `6-5`→6, `4-3`→4, `2-1`→2).
- Ô số nguyên "Số buổi đã vắng" (để trống được).
- Hai nhóm checkbox: R_P (7 tiêu chí) và R_H (3 tiêu chí), mỗi ô hiện `+N điểm` lấy từ `CRITERION_POINTS` để giảng viên thấy được hậu quả trước khi tích.
- Ô nhận xét chữ, kèm dòng nhắc **không ghi số điện thoại, email, địa chỉ** — đây là đầu vào cho AI.

Sau khi lưu thành công, `invalidateQueries` cả `['evaluations', ...]` lẫn `['risk-score', ...]`.

- [ ] **Step 5: Rút gọn `evaluations-tab.tsx` và cập nhật kiểu**

`evaluations-tab.tsx` chỉ còn ghép `<RiskScorePanel/>`, `<EvaluationForm/>`, `<EvaluationList/>`. Trong `apps/web/src/lib/types.ts`: bỏ `issueGroup` khỏi kiểu `Evaluation`, thêm `classSectionId`, `absentSessions`, `criteria`. `evaluation-guidance.tsx` đổi nguồn nhóm vấn đề sang bảng ánh xạ tiêu chí → nhóm trong `shared-types`.

- [ ] **Step 6: Chạy test và kiểm tra kích thước file**

```bash
pnpm --filter @fcare/web test -- risk-score-panel
wc -l apps/web/src/components/students/*.tsx
```
Expected: PASS; không file nào vượt 400 dòng.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/students apps/web/src/lib/types.ts
git commit -m "feat: form nhan xet theo tieu chi va bang phan ra diem DRS"
```

---

### Task 8: Giao diện xác nhận cấp độ và E2E

**Files:**
- Modify: `apps/web/src/app/(dashboard)/student-analyses/` (trang duyệt bản nháp)
- Create: `apps/web/e2e/nhan-xet-drs.spec.ts`

**Interfaces:**
- Consumes: `POST /student-analyses/versions/:id/send` với `confirmedLevel` + `reason` (Task 6).

- [ ] **Step 1: Viết E2E thất bại**

Tạo `apps/web/e2e/nhan-xet-drs.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { loginAs } from './fixtures/auth';

test('giảng viên nhận xét sinh viên rồi gửi thông báo theo cấp đã xác nhận', async ({
  page,
}) => {
  await loginAs(page, 'lecturer');
  await page.goto('/students');
  await page.getByRole('link', { name: /SV001/ }).click();
  await page.getByRole('tab', { name: 'Nhận xét' }).click();

  await page.getByLabel('Lớp học phần').selectOption({ index: 1 });
  await page.getByRole('radio', { name: /học yếu, học đối phó/i }).check();
  await page.getByRole('radio', { name: /vắng rất nhiều/i }).check();
  await page.getByLabel('Số buổi đã vắng').fill('3');
  await page.getByRole('checkbox', { name: /Nguy cơ cấm thi/ }).check();
  await page.getByRole('button', { name: 'Lưu nhận xét' }).click();

  // R_L 3 + R_A 3 + R_C 3 + R_H 3 = 12 -> cấp 3
  await expect(page.getByTestId('drs-total')).toHaveText('12');
  await expect(page.getByTestId('drs-level')).toContainText('Cấp 3');
});
```

- [ ] **Step 2: Chạy E2E cho chắc là đỏ**

Run: `pnpm --filter @fcare/web test:e2e -- nhan-xet-drs`
Expected: FAIL — chưa có `data-testid`.

- [ ] **Step 3: Gắn testid và ô xác nhận cấp độ**

Thêm `data-testid="drs-total"` và `data-testid="drs-level"` vào `risk-score-panel.tsx`. Trên trang `student-analyses`:

- Hiện khối "Đề nghị ép cấp độ của AI": tên luật (từ `FORCED_ESCALATION_RULES[...].label`) và **câu trích dẫn nguyên văn** trong khung riêng. Không có đề nghị thì ẩn hẳn khối, đừng hiện "không có".
- Ô chọn `confirmedLevel` mặc định bằng cấp server đã tính, cho người dùng hạ hoặc nâng.
- Ô "Lý do" bắt buộc, và khi chọn cấp 4 thì hiện bộ đếm ký tự với ngưỡng 40, nút Gửi khóa cho tới khi đủ.
- Danh sách người nhận cập nhật lại mỗi khi đổi cấp (gọi lại `previewRecipients`), để người bấm nhìn thấy hậu quả trước khi gửi.

- [ ] **Step 4: Chạy E2E cho xanh**

Run: `pnpm --filter @fcare/web test:e2e -- nhan-xet-drs`
Expected: PASS.

- [ ] **Step 5: Cổng chất lượng cuối**

```bash
lsof -i :3000   # phải rỗng trước khi build
pnpm typecheck && pnpm lint && pnpm build && pnpm test
```
Expected: cả bốn lệnh xanh.

- [ ] **Step 6: Cập nhật tài liệu và bộ nhớ**

- `CLAUDE.md`: mục "Escalation cảnh báo" sửa lại ma trận người nhận cho khớp Task 5.
- Xóa hoặc viết lại memory `fcare-urgency-matrix-open-question` — hai câu hỏi treo trong đó đã được chốt (công thức DRS chính thức; ma trận theo `flow.png`).

- [ ] **Step 7: Commit**

```bash
git add apps/web CLAUDE.md
git commit -m "feat: man hinh xac nhan cap do khan va E2E luong nhan xet"
```

---

## Tự soát kế hoạch

**Phủ spec:** mục 3 → Task 2; mục 4 → Task 1 + Task 4; mục 5.1 → Task 6 Step 4; mục 5.2 → Task 6 Step 3+7; mục 5.3 → Task 5; mục 5.4 → Task 6 Step 7; mục 6 → Task 3 + Task 4; mục 7 → Task 7 + Task 8; mục 8 → test nằm trong từng task.

**Rủi ro còn lại cần theo dõi khi thi công:**
- Task 2 Step 1 là cổng chặn dữ liệu — nếu `khong_khop > 0` thì dừng, đừng tự quyết.
- Task 5 đổi hành vi gửi thật: cấp 1 từ chỗ không gửi ai thành gửi cho mọi giảng viên đang dạy. Nói với user trước khi deploy.
- Prompt gửi AI phải được cập nhật kèm `promptVersion` mới khi thêm `forcedEscalation`, nếu không bản nháp cũ và mới sẽ lẫn lộn trong lịch sử.
