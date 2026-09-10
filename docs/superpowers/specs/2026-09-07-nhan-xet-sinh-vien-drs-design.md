# Thiết kế: Chức năng nhận xét sinh viên & điểm rủi ro DRS

Ngày: 2026-09-07
Nguồn nghiệp vụ: `docs/tailieu/cochedokhan.md` (Phần II.1, II.2), `docs/tailieu/flow.png`

## 1. Bối cảnh

Hệ thống đã có một phần nửa trái của flow: bảng `evaluations` ghi nhận xét của
giảng viên (học lực 1-10, thái độ 1-10, **một** nhóm vấn đề 1-4, ghi chú), và
hàm `suggestUrgencyLevel()` trong `packages/shared-types/src/evaluations.ts` đề
xuất độ khẩn 1-4 bằng một bộ luật do hệ thống tự đặt — tài liệu cũ không có công
thức.

Tài liệu II.2 nay ban hành công thức chính thức. Khoảng cách so với code hiện tại:

| Tài liệu II.2 đòi | Hiện trạng |
|---|---|
| R_P: 7 tiêu chí cộng điểm, chọn nhiều | 1 nhóm vấn đề (1-4), chọn một |
| R_C: điểm chuyên cần theo số buổi vắng | không có |
| R_H: 3 tiêu chí tình hình học tập thực tế | không có |
| Tổng hợp nhiều giảng viên bằng **trung vị** | mỗi nhận xét đứng riêng |
| `DRS = R_L + R_A + R_C + R_H + R_P`, thang 0-4/5-8/9-12/≥13 | bộ luật tự chế |
| Quy tắc **ép cấp độ** từ nhận xét chữ | không có |
| Ma trận người nhận theo flow.png | ma trận khác trong `escalation.service.ts` |

Nửa phải của flow (AI sinh nội dung thông báo → người duyệt/sửa → chọn người nhận
→ gửi) đã có sẵn đường ray là pipeline `student-analyses`.

## 2. Quyết định đã chốt

1. **Phạm vi**: làm cả ba mảng (form nhận xét, động cơ DRS, nhánh AI + thông báo),
   **dùng lại hạ tầng cũ** — không dựng module song song với `student-analyses`.
2. **Ma trận người nhận**: theo `flow.png`, viết lại `escalation.service.ts`.
3. **Ép cấp độ**: **AI tự quyết định** từ nhận xét chữ của giảng viên.
4. **Đơn vị nhận xét**: một bản cho mỗi `(giảng viên, lớp học phần, học kỳ)`.
5. **Mô hình dữ liệu**: chuẩn hóa — bảng con `evaluation_criteria` dùng enum, không
   dùng cột JSON. Điểm DRS **không lưu thành cột**; nó là hàm thuần của dữ liệu
   nguồn. Bản chụp phục vụ giải trình đã có chỗ trong
   `StudentTermAnalysisVersion.sourceSnapshot`.

### Ba chỗ tài liệu không đủ nghĩa — quy ước đã chốt

1. **R_P "dùng trung vị nếu nhiều GV cùng 1 tiêu chí"**: tiêu chí là checkbox điểm
   cố định nên trung vị vô nghĩa. Hiểu là **hợp nhất tiêu chí rồi cộng điểm**, đúng
   như mục R_H đã ghi rõ ("chỉ lấy 1"). Trung vị chỉ áp dụng cho R_L và R_A.
2. **R_C "nếu tất cả GV đều vắng 2 → +9"**: chỉ áp dụng khi có **từ 2 bản nhận xét
   có ghi số buổi vắng trở lên**. Một giảng viên đơn lẻ tích "vắng 2 buổi" không
   được đẩy sinh viên lên thẳng cấp 3.
3. **Ép cấp độ là mức SÀN, không thay thế DRS**: cấp cuối = `max(cấp từ DRS, cấp bị
   ép)`. Tài liệu tự vênh ở đây — "vắng cả 3 buổi" vừa ghi ép mức 9/Cao vừa ghi
   R_C +12 (tương đương cấp 4); lấy max là cách duy nhất không mất thông tin.

## 3. Mô hình dữ liệu

### 3.1 Sửa `Evaluation`

```prisma
model Evaluation {
  id             String   @id @default(uuid())
  studentId      String
  lecturerId     String
  classSectionId String              // MỚI — bắt buộc
  term           String
  academicScore  Int                 // 1..10  → R_L
  attitudeScore  Int                 // 1..10  → R_A
  absentSessions Int?                // MỚI — số buổi vắng GV ghi nhận → R_C; null = chưa nhận xét chuyên cần
  note           String?             // nhận xét chữ — đầu vào cho AI ép cấp độ
  // issueGroup: BỎ, thay bằng criteria[]
  criteria       EvaluationCriterionMark[]
  ...
  @@unique([lecturerId, classSectionId, studentId])
  @@index([studentId, term])
}
```

`term` giữ lại vì mọi truy vấn đều lọc theo `(studentId, term)` và không muốn join
`class_sections` mỗi lần, nhưng nó **trùng** với `classSection.term`. Khóa unique cố
tình không chứa `term` để không cho phép hai bản cùng lớp khác kỳ; đổi lại, tầng
service phải kiểm `dto.term === classSection.term` khi ghi, và test phải phủ ca lệch.

### 3.2 Bảng con tiêu chí

```prisma
enum EvaluationCriterion {
  // R_P — vấn đề cá nhân
  P_NOT_FIT_MAJOR       // +2  Không phù hợp chuyên ngành
  P_PART_TIME_JOB       // +2  Đi làm thêm ảnh hưởng việc học
  P_OTHER_ACTIVITIES    // +1  Hoạt động cá nhân khác
  P_FAMILY_HARDSHIP     // +2  Khó khăn gia đình / cuộc sống
  P_FINANCIAL_HARDSHIP  // +2  Khó khăn tài chính
  P_PSYCHOLOGICAL       // +3  Vấn đề tâm lý / mất động lực
  P_DROPOUT_INTENT      // +9  Có ý định nghỉ học
  // R_H — tình hình học tập thực tế
  H_NO_QUIZ_CMS         // +2  Không làm Quiz trên CMS / học Udemy
  H_EXAM_BAN_RISK       // +3  Nguy cơ cấm thi
  H_NO_RESPONSE         // +4  Không phản hồi giảng viên hoặc CTSV
}

model EvaluationCriterionMark {
  id           String              @id @default(uuid())
  evaluationId String
  criterion    EvaluationCriterion
  evaluation   Evaluation @relation(fields: [evaluationId], references: [id], onDelete: Cascade)

  @@unique([evaluationId, criterion])
  @@map("evaluation_criteria")
}
```

Bảng điểm của từng tiêu chí là **hằng số trong `shared-types`**, không lưu DB — đổi
bảng điểm là đổi quy định, phải qua code review và migration của tài liệu, không
phải sửa dữ liệu.

### 3.3 Migration & backfill

1. Thêm enum + bảng `evaluation_criteria`.
2. Backfill `criteria` từ `issueGroup` cũ: `1→P_NOT_FIT_MAJOR`, `2→P_PART_TIME_JOB`,
   `3→P_OTHER_ACTIVITIES`, `4→P_PSYCHOLOGICAL`.
3. Thêm `absentSessions` (nullable, không cần backfill).
4. Thêm `classSectionId`: backfill bằng join `lecturerId + term + enrollments.studentId`.
   Trường hợp một giảng viên dạy sinh viên ở nhiều lớp trong cùng kỳ → gán lớp có
   `code` nhỏ nhất. **Trước khi chạy phải đếm số dòng không khớp** (`SELECT count(*)`
   theo điều kiện join); nếu > 0 thì dừng và báo, không tự xóa dữ liệu.
5. Đổi cột thành `NOT NULL` + thêm unique key, rồi `DROP COLUMN issue_group`.

Bốn nhóm vấn đề của II.1 vẫn tồn tại ở tầng hiển thị (`ISSUE_GROUP_SUGGESTIONS`
đang dùng cho ô "Giải pháp gợi ý"), suy ra từ tiêu chí bằng một bảng ánh xạ
`criterion → nhóm` trong `shared-types`, không lưu DB.

## 4. Động cơ tính điểm

Toàn bộ nằm trong `packages/shared-types/src/risk-score.ts`, **hàm thuần, không
chạm Prisma** — test được không cần DB, và web lẫn API dùng chung một nguồn.

Đầu vào: danh sách nhận xét của một `(sinh viên, học kỳ)`:

```ts
interface EvaluationInput {
  academicScore: number;
  attitudeScore: number;
  absentSessions: number | null;
  criteria: EvaluationCriterion[];
}
```

### 4.1 R_L và R_A — trung vị rồi quy dải

```
median(scores)  // lẻ → phần tử giữa; chẵn → trung bình hai phần tử giữa
scoreBand(median)  // hàm đã có, tự làm tròn
bandPoint: 10-9 → 0 | 8-7 → 1 | 6-5 → 2 | 4-3 → 3 | 2-1 → 4
```

### 4.2 R_C — chuyên cần

```
absentPoint(n) = n < 2 ? 0 : n === 2 ? 2 : 3

marks = các absentSessions khác null
marks rỗng                              → 0
marks.length >= 2 và mọi n >= 3         → 12
marks.length >= 2 và mọi n >= 2         → 9
ngược lại                               → max(absentPoint(n))
```

Thứ tự kiểm tra quan trọng: điều kiện "đều >= 3" phải xét trước "đều >= 2", nếu không
một lớp toàn vắng 3 buổi sẽ ăn 9 điểm thay vì 12.

### 4.3 R_P và R_H — hợp nhất rồi cộng

```
R_P = tổng điểm của HỢP các tiêu chí P_* đã tích trên mọi nhận xét
R_H = tổng điểm của HỢP các tiêu chí H_* đã tích trên mọi nhận xét
```

### 4.4 DRS và cấp độ

```
DRS = R_L + R_A + R_C + R_H + R_P

0–4   → cấp 1 (Thấp)
5–8   → cấp 2 (Trung bình)
9–12  → cấp 3 (Cao)
>= 13 → cấp 4 (Khẩn cấp)
```

### 4.5 Luật ép cấp độ

Bốn luật của mục II.2.5, tách theo nguồn kích hoạt:

| Luật | Cấp sàn | Nguồn |
|---|:---:|---|
| Vắng tất cả các buổi của giảng viên đều 3 buổi | 3 | **thuần dữ liệu** — tính ngay trong hàm thuần |
| Có ý định nghỉ học | 3 | AI đọc nhận xét chữ (hoặc tiêu chí `P_DROPOUT_INTENT`) |
| SV nói không còn mong muốn học | 4 | AI đọc nhận xét chữ |
| Không đi học / điểm danh đối phó và không làm bài | 4 | AI đọc nhận xét chữ |

Hàm thuần trả về `drsLevel` và `dataForcedLevel`. Ba luật còn lại đến từ AI ở bước
sau. Cấp cuối cùng: `max(drsLevel, dataForcedLevel, aiForcedLevel ?? 1)`.

Đầu ra của hàm là một bản phân rã đầy đủ để hiển thị và để chụp vào snapshot:

```ts
interface RiskScoreBreakdown {
  components: { RL: number; RA: number; RC: number; RH: number; RP: number };
  drs: number;
  drsLevel: 1 | 2 | 3 | 4;
  dataForcedLevel: 1 | 3;
  evaluationCount: number;
  medianAcademic: number;
  medianAttitude: number;
  triggeredCriteria: EvaluationCriterion[];
  reasons: string[];   // giải thích từng thành phần bằng tiếng Việt
}
```

`suggestUrgencyLevel()` cũ bị thay thế; `URGENCY_RULES` xóa bỏ, và ghi chú "công
thức do hệ thống tự đề xuất" trong file cũ được gỡ vì Trường đã ban hành công thức.

## 5. Luồng AI và thông báo

Tái sử dụng nguyên pipeline `student-analyses`:
`createVersion` (QUEUED) → `processGeneration` (→ DRAFT) → `updateDraft` (giảng viên
sửa = nhánh "Thông tin khác" trong flow) → `previewRecipients` → `sendVersion` →
`processDelivery` (SENT + bắn thông báo). Ba chỗ sửa:

### 5.1 Bản chụp nguồn bổ sung ba khối

`buildSnapshot()` thêm: bảng phân rã DRS (mục 4.5), **lịch sử chăm sóc** (`CareLog`
— flow.png ghi rõ "Dữ liệu lịch sử chăm sóc sinh viên X"), và **nhận xét chữ** của
các giảng viên. Điểm môn học đã có sẵn.

Nhận xét chữ là chỗ dễ lọt PII nhất (số điện thoại phụ huynh, địa chỉ nhà). Bắt buộc
đi qua `redactAnalysisText` và `containsForbiddenAnalysisPii` như dữ liệu hiện tại —
không có ngoại lệ.

### 5.2 Output AI mở rộng

`analysis-output.ts` thêm hai trường:

```ts
forcedEscalation: z.object({
  rule: z.enum(['DROPOUT_INTENT', 'NO_LONGER_WANTS_TO_STUDY', 'NOT_ATTENDING_AND_NO_WORK']),
  quote: z.string().min(1).max(500),   // trích nguyên văn câu trong nhận xét làm bằng chứng
  level: z.union([z.literal(3), z.literal(4)]),
}).nullable(),
suggestedLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
```

**Ràng buộc an toàn**: `quote` phải là chuỗi con thật sự có trong nhận xét đã chụp
(kiểm ở tầng server sau khi parse). Không trích được → coi như không ép. Cấp cuối
tính ở server bằng `max(...)`, **không tin thẳng `suggestedLevel`** của AI —
trường đó chỉ dùng để đối chiếu và hiển thị.

`aiOriginal`, `model`, `promptVersion` đã lưu sẵn nên mọi lần ép cấp độ đều giải
trình được về sau.

### 5.3 Người nhận theo cấp độ

`student-analyses` hiện có `resolveRecipients` riêng, không biết cấp độ. Bỏ nó, gọi
`EscalationService.computeRecipientIds(studentId, level, actorId)`, và viết lại ma
trận theo flow.png:

| Cấp | Người nhận (cộng dồn) |
|:---:|---|
| 1 | Tất cả giảng viên đang dạy sinh viên |
| 2 | + Cán bộ CTSV (`SA_OFFICER`) |
| 3 | + Trưởng bộ môn của sinh viên (`HEAD_OF_DEPT`) |
| 4 | + Trưởng phòng Đào tạo (`TRAINING_OFFICER`) và Trưởng phòng CTSV (`SA_HEAD`) |

Khác biệt lớn nhất so với hiện tại: **cấp 1 nay có gửi thông báo** (cho tất cả giảng
viên đang dạy), trước đây cấp 1 không gửi ai. Lượng thông báo sẽ tăng đáng kể — cần
nói trước với người dùng khi bàn giao.

### 5.4 Chốt chặn người thật

`sendVersion` là đường ghi duy nhất và nhận `confirmedLevel` do giảng viên bấm — AI
không bao giờ tự gửi. Khi gửi:

- Tạo một `Alert` ở cấp đã xác nhận, để có vòng đời `OPEN → ACKNOWLEDGED → RESOLVED`.
- `Notification` mang **cả** `alertId` lẫn `analysisVersionId` (schema đã cho phép),
  nên mỗi người nhận vẫn chỉ một dòng thông báo, không nhân đôi.
- Cấp 4 giữ nguyên ràng buộc lý do ≥ 40 ký tự.

## 6. API

| Endpoint | Thay đổi |
|---|---|
| `POST /evaluations` | body thêm `classSectionId`, `absentSessions?`, `criteria: EvaluationCriterion[]`; bỏ `issueGroup` |
| `PATCH /evaluations/:id` | như trên, tiêu chí ghi đè toàn bộ (xóa rồi tạo lại trong transaction) |
| `GET /evaluations?studentId&term` | trả kèm `criteria` |
| `GET /evaluations/risk-score?studentId&term` | **mới** — trả `RiskScoreBreakdown` |
| `POST /student-analyses/versions/:id/send` | body thêm `confirmedLevel`, `reason` |

Giảng viên chỉ được nhận xét lớp học phần **mình đứng lớp**: kiểm `classSectionId`
thuộc `sectionScope(user)` trước khi ghi, ngoài `studentScope(user)` đang có.

CASL không cần chủ thể mới — `Evaluation` đã có sẵn `create`/`update` cho `LECTURER`.

## 7. Giao diện

`evaluations-tab.tsx` đang 695 dòng, vượt ngưỡng cho phép, và lần này còn phình
thêm. Tách khi làm:

- `evaluation-form.tsx` — chọn lớp học phần, hai nhóm radio 5 dải cho học lực và
  thái độ (đúng ghi chú cuối tài liệu: "quy về dạng radio"), ô số buổi vắng, hai
  nhóm checkbox R_P và R_H có hiện điểm cộng từng ô, ô nhận xét chữ.
- `evaluation-list.tsx` — danh sách nhận xét của các giảng viên.
- `risk-score-panel.tsx` — **mới**, đặt đầu tab: bảng phân rã R_L/R_A/R_C/R_H/R_P,
  tổng DRS, badge cấp độ, số bản nhận xét đã có, và câu giải thích từng thành phần.
  Đây là thứ trả lời được câu "vì sao sinh viên này bị cấp 3", nên nó là màn hình
  quan trọng nhất của tính năng.
- `evaluation-guidance.tsx` — giữ, đổi nguồn nhóm vấn đề sang bảng ánh xạ tiêu chí.
- Trang `student-analyses`: hiện `forcedEscalation` (tên luật + câu trích dẫn), ô
  chọn `confirmedLevel` trước khi gửi, và preview người nhận đổi theo cấp đang chọn.

Màu theo `tokens.css`, không hardcode.

## 8. Kế hoạch kiểm thử

Viết test trước (TDD), theo thứ tự:

1. `packages/shared-types/src/risk-score.spec.ts` — trọng tâm. Bảng ca kiểm cho từng
   thành phần; biên cấp độ 4/5, 8/9, 12/13; trung vị lẻ và chẵn; luật "tất cả GV vắng
   2/vắng 3"; một giảng viên đơn lẻ **không** kích hoạt luật đó; hợp nhất tiêu chí
   trùng giữa hai giảng viên; `dataForcedLevel`.
2. `evaluations.service.spec.ts` — scope sinh viên, giảng viên không nhận xét được
   lớp mình không dạy, khóa `(GV, lớp, SV, kỳ)`, cập nhật tiêu chí ghi đè.
3. `escalation.service.spec.ts` — bốn cấp theo bảng mục 5.3, và cấp 1 nay có người nhận.
4. `analysis-output.spec.ts` — schema `forcedEscalation`; từ chối khi `quote` không
   nằm trong nhận xét nguồn.
5. `student-analyses.service.spec.ts` — `max(drs, dataForced, aiForced)`; `sendVersion`
   tạo `Alert` và mỗi người nhận đúng một `Notification`.
6. E2E Playwright: giảng viên nhập nhận xét → thấy bảng DRS → sinh nháp AI → sửa →
   xác nhận cấp → trưởng bộ môn nhận được thông báo.

## 9. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| AI quyết định ép cấp độ → điểm rủi ro không tái lập được, khó giải trình khi sinh viên khiếu nại | Cao | Bắt buộc trích dẫn nguyên văn và kiểm chuỗi con ở server; lưu `aiOriginal` + `model` + `promptVersion`; người thật vẫn phải xác nhận cấp trước khi gửi |
| Backfill `classSectionId` không khớp hết | Trung bình | Đếm số dòng không khớp trước khi chạy; dừng nếu > 0 thay vì tự xóa |
| Cấp 1 nay gửi thông báo cho toàn bộ giảng viên đang dạy → nhiễu | Trung bình | Báo trước khi bàn giao; nếu nhiễu thật thì gom theo ngày ở lớp `NotificationDispatchService` |
| Nhận xét chữ lọt PII vào prompt AI | Cao | `redactAnalysisText` + `containsForbiddenAnalysisPii` bắt buộc, đã có sẵn |

## 10. Ngoài phạm vi

- Bảng điểm tiêu chí cấu hình được từ giao diện quản trị (hiện là hằng số trong code).
- Gộp thông báo theo ngày.
- Xuất Excel bảng điểm DRS.
