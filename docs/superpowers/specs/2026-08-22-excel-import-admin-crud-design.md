# Thiết kế: Import Excel nghiệp vụ & Quản trị CRUD dữ liệu

- **Ngày**: 2026-08-22
- **Trạng thái**: Đã duyệt (user xác nhận 2026-08-22) — sẵn sàng viết kế hoạch triển khai
- **Nguồn dữ liệu**:
  - `docs/gradebook_20260504174543_hoactm_64_119_all_ (1).xlsx` (bảng điểm)
  - `docs/FPLTN-KH Phân công GV HK Summer 2026.xlsx` (kế hoạch phân công GV)

---

## 1. Mục tiêu

Quản trị viên nạp được dữ liệu học vụ thật vào FCare bằng cách import hai file Excel
trên, sau đó xem/sửa/xoá (CRUD) toàn bộ dữ liệu đó ngay trong ứng dụng — không phải
sửa file rồi import lại.

**Ngoài phạm vi** (không làm ở spec này):
- Nguồn dữ liệu điểm danh (`attendanceRate`) — hai file không có, xem §8.
- Thay đổi luật cảnh báo học vụ / escalation.
- Đồng bộ tự động với hệ thống nguồn (chỉ import thủ công theo file).

---

## 2. Kết quả kiểm tra file nguồn

### 2.1. `gradebook_…_all_ (1).xlsx`

| Chỉ số | Giá trị |
|---|---|
| Số sheet | 21 (mỗi sheet = 1 mã môn) |
| Dòng điểm | 316 |
| Sinh viên riêng biệt | 176 |
| Lớp riêng biệt | 17 |
| Tiền tố MSSV | `PK`, `PS`, `PI`, `TK` |
| PII | Chỉ MSSV + họ tên → **hợp lệ**, không vi phạm RULE 1 |

Cấu trúc mỗi sheet: header ở **dòng 1**, bốn cột cố định `#`, `Mã sinh viên`,
`Họ và tên`, `Lớp`; tiếp theo là N cột điểm thành phần thay đổi theo môn (4 → 19
cột) — **không lấy** theo quyết định §3; kết thúc bằng `Điểm tổng kết`, `Trạng thái`.

**Ba đặc điểm bắt buộc phải xử lý:**

1. **Thứ tự và vị trí cột không ổn định.** Vì số cột thành phần khác nhau giữa các
   môn, `Điểm tổng kết` nằm ở cột 17 trong `WEB2064`, cột 9 trong `SOF1021`, cột 24
   trong `WEB2072`. ⇒ **cấm parse theo chỉ số cột**, phải định vị theo tên header.
2. **Cột `Lớp` trộn hai loại mã**:
   - Lớp học phần: `WEB2064.01`, `WEB2064.02`, `SOF1021.01`, `PRO1132.02`, … (10 giá trị)
   - Lớp hành chính/khoá: `SD20301`, `WD20301`, `AI21301`, … (7 giá trị)

   Một sheet có thể chứa nhiều lớp (`WEB2064` có `.01` và `.02`; `PMA1011` có
   `SD20301` + `WD20301`).
3. **`Trạng thái` có nhãn ngoài từ điển hiện tại** — xuất hiện cả `Đạt`, `Trượt`,
   `Không đạt` và ô rỗng. `RESULT_BY_LABEL` trong `grades-excel.service.ts` chưa có
   `Không đạt`.

**Thiếu**: không có mã lớp học phần chuẩn, không có ngành/khoá, **không có % điểm danh**.

### 2.2. `FPLTN-KH Phân công GV HK Summer 2026.xlsx`

| Sheet | Dòng dữ liệu | Vai trò |
|---|---|---|
| `Lịch tool` | 93 | Lịch máy đọc được — **cột `Lecturer` đã ẩn danh hoá 100%** |
| `BL1+BL2` | 94 (header **dòng 8**) | Bản gốc, có GV thật nhưng **chỉ 18/94 dòng đã phân công** |
| `T.Kê` | 32 | Danh sách GV: username, họ tên, loại Full/Part — **và email** |
| `3.1.Môn-BM` | 449 | Danh mục môn học + bộ môn (nguồn master data tốt nhất) |
| `T.Kê 2`, `Ghi chú`, `Môn TC` | — | Thống kê/nháp/rỗng — **bỏ qua** |

Chi tiết cột:

- `Lịch tool`: B=`Class`, C=`Subject`, D=`Lecturer`, E=`Slot`, F=`Date` (mã thứ
  `246`/`357`), G=`Room`, H=`Block` (1/2), I=`Dept`, J=`NumStudent`,
  K=`TrainingTime` (`AM`/`PM`/`EV`). Cột A là object rỗng — bỏ.
  Toàn bộ 93 giá trị `Lecturer` khớp mẫu `^giangvien\d+$` (86 mã riêng biệt) →
  **không dùng để định danh GV thật**.
- `BL1+BL2` (header dòng 8): 2=`Ngành`, 3=`Kỳ`, 4=khoá ghép `MãMôn+Lớp`
  (vd `ITA107AI21301`), 5=`Mã môn`, 6=`Tên môn`, 7=`P.Pháp`, 8=`Bộ môn`, 10=`Lớp`,
  11=`Lớp gộp`, 12=`Phân công giảng viên`, 13=`Block`, 14=`Ca`, 15=`Thứ`,
  16=`Thứ học thực tế`, 17=`Phòng` (rỗng toàn bộ), 19=`Thời gian bắt đầu`,
  20=`Số lượng sinh viên`, 26=`Số giờ`. Có merge cell + formula ở các cột kiểm tra
  trùng lịch (22–25) → bỏ qua các cột này.
- `T.Kê`: A=username, F=`Loại GV` (Full/Part), G=họ tên, **I=email `@fe.edu.vn`**.
  Header dòng 1 chỉ có 8 ô và **lệch so với dữ liệu** (ô G header là `36`, dữ liệu
  là họ tên) → header sheet này không tin được, phải ánh xạ theo vị trí đã kiểm chứng.
- `3.1.Môn-BM` (header dòng 2): 2=`Mã gốc`, 3=`Mã môn`, 4=`Tên môn`, 5=`Nhóm môn`,
  6=`Bộ môn`, 7=`% đi học`, 8=`Số giờ thực tế`, 10=`Learning method`,
  11=`Số SV max/lớp`, 13=`Môn tiên quyết`, 16=`Hình thức thi`, 17=`Số TC`.

### 2.3. Lỗ hổng bảo mật phát hiện được

Cột email ở `T.Kê` nằm ở **cột I và không có header**. Hàm
`assertNoForbiddenColumns()` (`apps/api/src/modules/excel/excel-utils.ts`) chỉ dò
`FORBIDDEN_HEADER_PATTERN` trên **dòng header** ⇒ **cột email này lọt qua chốt chặn
hiện tại**. Đây là vi phạm RULE 1 tiềm tàng và là hạng mục P0 của spec này.

### 2.4. Đối chiếu hai file

- 21/21 mã môn trong gradebook **có** trong danh mục `3.1.Môn-BM`.
- 52/53 mã môn trong `Lịch tool` có trong danh mục — thiếu `_MAR2025` (mã tạm).
- 7 lớp xuất hiện ở **cả hai** file: `SD20301`, `WD20301`, `SA20301`, `GA20301`,
  `WD21301`, `AI21301`, `SA21301`.
- **Hai hệ mã bộ môn khác nhau trong cùng một workbook**:

  | `Lịch tool` (cột `Dept`) | `3.1.Môn-BM` (cột `Bộ môn`) |
  |---|---|
  | `CONG-NGHE-THONG-TIN` | `CNTT` |
  | `CO-BAN` | `Cơ bản` |
  | `NGON-NGU` | `Ngôn ngữ` |
  | `THUONG-MAI-DIEN-TU` | `TMĐT` |
  | `KINH-TE` | `Kinh tế` |
  | `THIET-KE-DO-HOA` | `TKĐH` |
  | `UNG-DUNG-PHAN-MEM` | `UDPM` |
  | `THUC-TAP-TN` | **không có đối ứng** → admin phải ánh xạ tay |

  Danh mục `3.1` còn 5 bộ môn không xuất hiện ở `Lịch tool`: `DLNHKS`, `Cơ Điện`,
  `Kbeauty`, `QHDN`, `GDQP`. Tổng 12 bộ môn thật.

### 2.5. Khoảng cách với hệ thống hiện tại

| # | Khoảng cách | Hệ quả |
|---|---|---|
| 1 | `ClassSection` chỉ có `code/subjectId/lecturerId/term` | Không có block, ca, thứ, phòng, sĩ số |
| 2 | `ClassSection.lecturerId` là **bắt buộc** | 76/94 lớp chưa phân công GV → không import được |
| 3 | `Staff` không có loại GV | Mất thông tin Full/Part |
| 4 | `Student.majorId` + `cohort` bắt buộc, gradebook không có | Phải suy ra hoặc chờ gán |
| 5 | Seed dùng 3 bộ môn giả `SE/AI/GD` | Phải re-seed sang 12 bộ môn thật |
| 6 | Cả `students-excel.service.ts` và `grades-excel.service.ts` đọc **sheet đầu tiên + cột cố định** | Không file nào trong hai file này chạy được |

---

## 3. Quyết định thiết kế đã chốt

| Quyết định | Lựa chọn | Lý do |
|---|---|---|
| Phạm vi điểm | **Chỉ lấy `Điểm tổng kết` + `Trạng thái`** (chốt 2026-08-22, thay quyết định trước) | Bỏ toàn bộ Lab/Quiz/ASM. Không thêm bảng thành phần điểm |
| Phạm vi lịch/danh mục | **Mở rộng đầy đủ** (block/ca/thứ/phòng, loại GV, danh mục môn) | Dữ liệu file 2 không mất |
| Sinh viên thiếu ngành/khoá | **Suy từ mã lớp, phần còn lại admin gán tay** | 168/176 SV suy được; 8 SV vào hàng chờ |
| Nguồn phân công GV | **Merge `BL1+BL2` (GV thật) + `Lịch tool` (lịch) + `T.Kê` (roster)**, cho phép lớp chưa có GV | Phản ánh đúng thực tế file chưa phân công xong |
| Luồng import | **Staging → xem trước → commit** | 449 môn vào nhầm bộ môn sẽ phá `deptFilter` (RULE 2) |

---

## 4. Kiến trúc

### 4.1. Tổng quan luồng

```
Upload .xlsx
   │
   ├─► [P0] Chốt PII: quét header  +  quét GIÁ TRỊ Ô mọi sheet
   │        (email / SĐT / CCCD)          ← cột email không header bị bắt ở đây
   │
   ├─► Parser theo loại file  ──►  ImportBatch (PENDING) + ImportRow[]
   │
   ├─► GET preview: sẽ tạo mới X · cập nhật Y · lỗi Z · N alias chưa ánh xạ
   │
   └─► POST commit  ──►  ghi DB trong 1 transaction  ──►  AuditLog
```

### 4.2. Bốn importer riêng biệt

Chạy theo thứ tự phụ thuộc; mỗi importer là một service độc lập, một file riêng
(theo quy ước 200–400 dòng/file):

| # | Importer | Sheet nguồn | Ghi vào |
|---|---|---|---|
| 1 | `catalog-importer` | `3.1.Môn-BM` | `Department` (12), `Subject` (449) |
| 2 | `lecturer-importer` | `T.Kê` | `Staff` (32) — **strip email**, set `lecturerType` |
| 3 | `schedule-importer` | `BL1+BL2` ⊕ `Lịch tool` | `ClassSection` (94) |
| 4 | `gradebook-importer` | 21 sheet | `Student`, `Enrollment` (chỉ `totalScore` + `result`) |

Importer 3 merge theo khoá `(mã môn, lớp, block)`: lấy trường lịch từ `Lịch tool`
(sạch hơn), lấy `lecturer` từ `BL1+BL2` (giá trị thật). Dòng nào `BL1+BL2` để trống
GV → `ClassSection.lecturerId = null`.

Importer 4 chỉ đọc **5 cột**: `Mã sinh viên`, `Họ và tên`, `Lớp`, `Điểm tổng kết`,
`Trạng thái` (bốn cột dữ liệu + cột `Lớp` để xác định lớp học phần). Mọi cột thành phần điểm
(Lab / Quiz / Workshop / ASM / Điểm thưởng) **bị bỏ qua hoàn toàn**.

Xử lý từng sheet độc lập:
1. Đọc header dòng 1, **định vị 5 cột cần lấy theo tên header**, không theo chỉ số.
   Đây vẫn là bắt buộc: `Điểm tổng kết` nằm ở cột 17 trong sheet `WEB2064` nhưng
   cột 9 trong `SOF1021` và cột 24 trong `WEB2072`.
2. Sheet nào thiếu `Mã sinh viên` hoặc `Điểm tổng kết` → bỏ qua cả sheet, ghi cảnh báo.
3. Với mỗi dòng: chuẩn hoá cột `Lớp` (§4.3), upsert `Student`, upsert `Enrollment`
   với `totalScore` = `Điểm tổng kết`, `result` = ánh xạ từ `Trạng thái`.

Ánh xạ `Trạng thái` → `EnrollmentResult`: `Đạt` → `PASS`, `Trượt`/`Không đạt` →
`FAIL`, rỗng → `IN_PROGRESS`. Tái dùng `RESULT_BY_LABEL` sẵn có trong
`grades-excel.service.ts`, bổ sung nhãn `Không đạt`.

### 4.3. Chuẩn hoá cột `Lớp` của gradebook

```
Nếu khớp /^[A-Z]{2}\d{5}$/          → lớp hành chính (vd SD20301)
    → Student.classCode = giá trị
    → Student.cohort    = 2 chữ số giữa  (SD20301 → "20")
    → Student.majorId   = tra ClassMajorRule theo 2 ký tự đầu
    → ClassSection.code = "<mãMôn>-<lớp>-<term>"

Ngược lại (vd WEB2064.02, WEB2072)  → lớp học phần
    → ClassSection.code = "<giá trị>-<term>"
    → Student.classCode = giá trị, cohort/majorId = null → vào hàng chờ gán
```

`ClassMajorRule` nạp sẵn 10 quy tắc, trích từ cột `Ngành` của `BL1+BL2`:

| Tiền tố | Ngành | | Tiền tố | Ngành |
|---|---|---|---|---|
| `AI` | `LTAI` | | `GA` | `LTGA` |
| `WD` | `LTWE` | | `GD` | `TKDH` |
| `SA` | `UDPM` | | `DM` | `DIGI` |
| `SD` | `PTPM` | | `MC` | `TTSK` |
| `LO` | `LOGI` | | `MS` | `MASA` |

> Lưu ý: `UDPM` vừa là mã ngành (`SA` → `UDPM`) vừa là mã bộ môn trong `3.1.Môn-BM`.
> Hai không gian tên khác nhau — không được dùng chung bảng tra.

Ước tính: **168/176 SV** suy được ngành + khoá, **8 SV** vào hàng chờ admin gán.

---

## 5. Thay đổi schema (Prisma 6 — giữ nguyên phiên bản, không nâng 7)

### 5.1. Bảng mới

Không thêm bảng điểm thành phần — theo quyết định §3, chỉ lưu điểm tổng kết vào
`Enrollment.totalScore` đã có sẵn.

```prisma
model DepartmentAlias {
  id           String @id @default(uuid())
  alias        String @unique   // vd "CONG-NGHE-THONG-TIN"
  departmentId String
  department   Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  @@map("department_aliases")
}

model ClassMajorRule {
  id          String @id @default(uuid())
  classPrefix String @unique    // vd "AI"
  majorId     String
  major       Major  @relation(fields: [majorId], references: [id], onDelete: Cascade)
  @@map("class_major_rules")
}

enum ImportKind   { CATALOG  LECTURER  SCHEDULE  GRADEBOOK }
enum ImportStatus { PENDING  COMMITTED  FAILED  CANCELLED }

model ImportBatch {
  id          String       @id @default(uuid())
  kind        ImportKind
  status      ImportStatus @default(PENDING)
  fileName    String
  term        String
  uploadedById String
  summary     Json         // { toCreate, toUpdate, errors, warnings }
  createdAt   DateTime     @default(now())
  committedAt DateTime?
  uploadedBy  Staff        @relation(fields: [uploadedById], references: [id])
  rows        ImportRow[]
  @@map("import_batches")
}

model ImportRow {
  id       String  @id @default(uuid())
  batchId  String
  sheet    String
  rowIndex Int
  payload  Json    // dữ liệu đã parse + chuẩn hoá, KHÔNG chứa PII
  error    String?
  batch    ImportBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  @@index([batchId])
  @@map("import_rows")
}
```

### 5.2. Sửa bảng có sẵn

```prisma
model ClassSection {
  // giữ nguyên: id, code, subjectId, term
  lecturerId   String?          // ĐỔI: nullable — 76/94 lớp chưa phân công
  block        Int?             // 1 | 2
  slot         String?          // S1..S6
  weekdays     String?          // "246" | "357"
  room         String?
  capacity     Int?
  trainingTime String?          // AM | PM | EV
  startDate    DateTime?
  totalHours   Int?
  // ĐỔI: code không còn @unique đơn lẻ
  @@unique([code, term])
}

model Staff {
  lecturerType String?          // FULL | PART
  username     String? @unique  // username nội bộ, vd "vandtb2" — KHÔNG phải email
}

model Subject {
  subjectGroup   String?        // Nhóm môn SU26
  hoursTotal     Int?           // Số giờ thực tế
  learningMethod String?        // TRA | BLE | ONL
  maxStudents    Int?
  examForm       String?
  attendanceRateRequired Float? // cột "% đi học" — file lưu dạng tỉ lệ (0.8), KHÔNG phải 80
}

model Student {
  majorId String?               // ĐỔI: nullable — hàng chờ gán ngành
  cohort  String?               // ĐỔI: nullable
  major   Major?  @relation(fields: [majorId], references: [id])  // ĐỔI: quan hệ thành optional
}
```

**Back-relation bắt buộc thêm vào các model có sẵn** (Prisma yêu cầu quan hệ hai chiều):

| Model | Trường thêm |
|---|---|
| `Department` | `aliases DepartmentAlias[]` |
| `Major` | `classMajorRules ClassMajorRule[]` |
| `Staff` | `importBatches ImportBatch[]` |

> ⚠️ `Student.majorId` và `departmentId`: `departmentId` **vẫn bắt buộc** vì là trục
> của `deptFilter` (RULE 2). Với 8 SV chờ gán, `departmentId` lấy từ bộ môn của môn
> học trong sheet đang import — không bao giờ để null, không bao giờ dùng
> placeholder "chưa xác định".

Số migration dự kiến: **3** (bảng mới · sửa `ClassSection` · sửa `Staff`/`Subject` + nới `Student`).

### 5.3. Re-seed danh mục

Seed hiện tại (`apps/api/prisma/seed.ts`) tạo 3 bộ môn giả `SE/AI/GD`. Thay bằng
12 bộ môn thật + 10 `ClassMajorRule` + 8 `DepartmentAlias`. Dữ liệu demo (tài khoản
đăng nhập, sinh viên mẫu) giữ nguyên nhưng gắn lại vào bộ môn thật.

---

## 6. API

Module mới `apps/api/src/modules/imports/`:

| Method | Endpoint | Quyền (CASL) |
|---|---|---|
| `POST` | `/imports/:kind/upload` | `can('import','Excel')` |
| `GET` | `/imports/:batchId/preview` | `can('import','Excel')` |
| `POST` | `/imports/:batchId/commit` | `can('import','Excel')` |
| `DELETE` | `/imports/:batchId` | `can('import','Excel')` |
| `GET` | `/imports` | `can('import','Excel')` |

`:kind` ∈ `catalog | lecturer | schedule | gradebook`.

**`term` là tham số bắt buộc khi upload.** File `BL1+BL2` có ghi học kỳ trong tiêu đề
(`SUMMER 2026 (11/05/2026 - 30/08/2026)`) nhưng ô đó bị merge và không đáng tin để
parse; **gradebook không chứa thông tin học kỳ ở bất kỳ đâu**. Vì vậy admin chọn học
kỳ từ dropdown khi upload (vd `SU26`), giá trị này đi vào `ImportBatch.term` và
xuống `ClassSection.term`. Không suy đoán học kỳ từ tên file.

Mở rộng module có sẵn:

| Method | Endpoint | Ghi chú |
|---|---|---|
| `GET/PATCH` | `/class-sections/:id/grades` | Bảng điểm tổng kết + trạng thái, sửa tại chỗ |
| `GET/POST/PATCH/DELETE` | `/department-aliases` | CRUD alias bộ môn |
| `GET/POST/PATCH/DELETE` | `/class-major-rules` | CRUD quy tắc lớp→ngành |
| `GET` | `/students?missingMajor=true` | Hàng chờ gán ngành |
| `GET` | `/class-sections?unassigned=true` | Lớp chưa phân công GV |

**Ràng buộc bắt buộc** (không có ngoại lệ):
- `LECTURER` **không bao giờ** có quyền `import`/`export` — giữ nguyên CASL hiện tại.
- Mọi query chạm sinh viên đi qua `deptFilter(user)`, kể cả lưới điểm và hàng chờ.
- Toàn bộ endpoint mới giữ envelope `{ success, data, error }` — không endpoint nào
  trong module `imports` trả `StreamableFile` hay SSE, nên **không dùng `@SkipEnvelope`**.
- Mọi `commit` ghi `AuditLog`.

---

## 7. Giao diện quản trị

| Màn hình | Thay đổi |
|---|---|
| `/import-export` | Thành luồng 4 bước: chọn loại file → upload → **xem trước** → xác nhận. Bảng lịch sử import bên dưới |
| `/master-data/[tab]` | Thêm tab `Ánh xạ bộ môn`, `Quy tắc lớp→ngành` |
| `/class-sections/[id]/grades` *(mới)* | Bảng điểm: MSSV · họ tên · `Điểm tổng kết` · `Trạng thái`, sửa tại chỗ |
| `/students` | Bộ lọc `Chưa gán ngành` + thao tác gán hàng loạt |
| `/admin/users` | Cột `Loại GV` (Full/Part) |

Tuân thủ `design-taste` + `frontend-patterns`: dùng token màu trong
`apps/web/src/styles/tokens.css`, không hardcode màu; TanStack Query + `apiFetch`;
trạng thái lọc đẩy lên URL search params.

---

## 8. Rủi ro & ràng buộc đã biết

| # | Rủi ro | Xử lý |
|---|---|---|
| 1 | `Lịch tool` ẩn danh 100% → 76/94 lớp hiện `Chưa phân công` | Không phải lỗi import. Bản xem trước phải nói rõ con số này để người dùng không tưởng hỏng |
| 2 | Gradebook **không có % điểm danh** → `attendanceRate` vẫn rỗng | Luật cảnh báo dựa trên điểm danh cần nguồn khác. **Ngoài phạm vi spec này**, cần xác nhận riêng |
| 3 | `THUC-TAP-TN` không có bộ môn đối ứng | Bản xem trước liệt kê alias chưa ánh xạ; admin gán trước khi commit |
| 4 | Re-seed 12 bộ môn thật thay 3 bộ môn giả | Dữ liệu demo hiện có phải chạy lại seed; tài liệu README cập nhật theo |
| 5 | `_MAR2025` là mã môn tạm, không có trong danh mục | Báo lỗi dòng, bỏ qua dòng, không chặn cả file |
| 6 | Đổi `ClassSection.code` từ `@unique` sang `@@unique([code, term])` | Migration phải kiểm tra trùng trước khi đổi; dữ liệu seed hiện tại không trùng |

---

## 9. Kiểm thử

Theo `tdd-workflow` — viết test trước, mục tiêu ≥ 80% coverage.

**Fixture**: cắt nhỏ từ chính hai file thật, giữ nguyên các ca hiểm:
- sheet có `Điểm tổng kết` ở vị trí cột khác nhau (`WEB2064` cột 17, `SOF1021` cột 9, `WEB2072` cột 24)
- sheet có cả hai dạng mã lớp (`PMA1011`)
- sheet `T.Kê` rút gọn **giữ nguyên cột email không header**
- dòng `BL1+BL2` để trống GV
- dòng có mã môn không tồn tại (`_MAR2025`)

**Unit**: định vị cột theo tên header · ánh xạ `Trạng thái` → `EnrollmentResult` · phân loại mã lớp ·
suy ngành/khoá · merge `BL1+BL2` ⊕ `Lịch tool` · tra alias bộ môn.

**Bảo mật (bắt buộc pass trước mọi thứ khác)**:
- `assertNoForbiddenValues()` **bắt được** email ở cột không header → test đỏ trước khi vá.
- `LECTURER` gọi mọi endpoint `/imports/*` → 403.
- Lưới điểm và hàng chờ gán ngành không rò rỉ sinh viên ngoài bộ môn.
- Response của mọi endpoint mới đi qua `PiiGuardInterceptor`.

**Integration**: upload → preview → commit từng loại file; commit hai lần cùng file
phải idempotent; commit lỗi giữa chừng phải rollback sạch.

**E2E** (`e2e-testing`, Playwright): admin đăng nhập → import danh mục → import GV →
import lịch → import điểm → sửa một điểm tổng kết → gán GV cho một lớp chưa phân công.

---

## 10. Thứ tự triển khai

| Giai đoạn | Nội dung | Chặn |
|---|---|---|
| **P0** | `assertNoForbiddenValues()` quét giá trị ô + test đỏ trước | Chặn toàn bộ P1–P4 |
| **P1** | 3 migration + re-seed 12 bộ môn, 10 rule, 8 alias | Chặn P2 |
| **P2** | Module `imports` + 4 importer + staging/preview/commit | Chặn P3 |
| **P3** | Màn hình quản trị (import 4 bước, lưới điểm, các tab master-data) | — |
| **P4** | E2E + kiểm tra ngân sách bundle (app < 300kB gzip) | — |

**Điều kiện hoàn thành**: `pnpm typecheck && pnpm lint && pnpm build && pnpm test`
xanh; import được cả hai file thật từ `docs/` mà không lọt bất kỳ giá trị PII nào.
