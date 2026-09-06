# Thiết kế: Module thống kê đa chiều & Chat nội bộ theo sinh viên

Ngày: 2026-09-05 · Trạng thái: đã duyệt thiết kế, chờ viết kế hoạch triển khai

## 1. Mục tiêu

Bổ sung hai năng lực cho FCare:

1. **Thống kê đa chiều** — xem số liệu học vụ theo lớp học phần, theo bộ môn, theo môn học và theo giáo viên, có lọc theo học kỳ, trong một trang riêng.
2. **Chat nội bộ** — cho phép giảng viên trao đổi với giảng viên khác, với cán bộ CTSV hoặc Đào tạo về tình trạng một sinh viên cụ thể.

Hai phần dùng chung một tài liệu nhưng triển khai theo hai giai đoạn tách rời.

## 2. Ràng buộc bắt buộc

Bốn RULE trong `CLAUDE.md` có hiệu lực tuyệt đối với cả hai module:

- **RULE 1 — cấm PII.** Không thêm cột/field CCCD, SĐT, email, địa chỉ ở bất kỳ đâu. Chat là ô nhập text tự do nên cần thêm một lớp chặn mới (mục 4.5).
- **RULE 2 — scope sinh viên.** Mọi truy vấn chạm sinh viên đi qua `studentScope(user)`; đã load bản ghi rồi thì dùng `isStudentInScope(...)`. Lớp học phần dùng `sectionScope(user)`. Không so `departmentId` bằng tay.
- **RULE 3 — Excel I/O theo vai trò.** Không module nào ở đây thêm luồng Excel, nên RULE 3 không đổi.
- **RULE 4 — consent gate.** Endpoint mới đều đi qua guard chain mặc định, không dùng `@SkipConsent`.

Quy ước kiến trúc phải giữ: envelope `{ success, data, error }`; realtime dùng SSE, **không** đổi sang WebSocket; Prisma pin v6.

## 3. Phần 1 — Module thống kê

### 3.1 Hiện trạng

`apps/api/src/modules/statistics/` đã có `overview`, `classes` (theo lớp học phần) và `departments` (theo bộ môn), đều đã tôn trọng `studentScope`/`sectionScope`. Web chưa có trang riêng: `dashboard/page.tsx` nhúng thẳng ba truy vấn này.

Thiếu: chiều **môn học**, chiều **giáo viên**, bộ lọc học kỳ trên giao diện, và một nơi để xem đầy đủ.

### 3.2 Tách file

`statistics.service.ts` hiện ~200 dòng; thêm hai chiều nữa sẽ vượt ngưỡng dễ đọc. Tách theo chiều, mỗi service một trách nhiệm, controller inject cả bốn:

| File | Nội dung |
|---|---|
| `statistics.service.ts` | giữ `overview` |
| `dimensions/class-stats.service.ts` | chuyển nguyên `classes`, **không sửa logic** |
| `dimensions/department-stats.service.ts` | chuyển nguyên `departments`, **không sửa logic** |
| `dimensions/subject-stats.service.ts` | mới |
| `dimensions/lecturer-stats.service.ts` | mới |

Việc chuyển hai hàm cũ là thao tác cơ học: test hiện có trong `statistics.service.spec.ts` được tách theo, nội dung assert giữ nguyên để chứng minh không đổi hành vi.

### 3.3 Chiều "theo môn học" — `GET /statistics/subjects?term=`

Mỗi dòng là một `Subject`, tổng hợp trên các `Enrollment` thuộc lớp học phần nằm trong `sectionScope(user)` (và khớp `term` nếu có).

Trả về mỗi môn: `id`, `code`, `name`, `credits`, `department { code, name }`, `sectionCount`, `total` (lượt đăng ký), `pass`, `fail`, `inProgress`, `examBanned`, `passRate` (làm tròn 1 chữ số, `null` khi chưa có kết quả nào), `avgScore` (trung bình `totalScore`, `null` khi chưa có điểm).

Môn không có lớp học phần nào trong phạm vi người xem thì **không xuất hiện** — không trả dòng rỗng, vì sự tồn tại của môn kèm số 0 vẫn là thông tin ngoài phạm vi.

### 3.4 Chiều "theo giáo viên" — `GET /statistics/lecturers?term=`

Mỗi dòng là một `Staff` có lớp học phần. Trả về: `id`, `staffCode`, `fullName`, `department { code, name } | null`, `sectionCount`, `total`, `pass`, `fail`, `inProgress`, `examBanned`, `passRate`, `evaluationCount` (số `Evaluation` giảng viên đã nhập trong kỳ được lọc).

**Phạm vi** — thêm helper vào `apps/api/src/common/utils/dept-scope.ts`:

```ts
export function lecturerStatsScope(user: AuthUser): Prisma.StaffWhereInput
```

- Người xem được cả bộ môn (`seesWholeDepartment`) → giảng viên thuộc bộ môn đó.
- Vai trò toàn trường (không `isDeptScoped`) → tất cả.
- Còn lại (thuần LECTURER) → `{ id: user.id }`: chỉ thấy đúng dòng của chính mình.

Quyết định này là có chủ đích: bảng thống kê không được biến thành bảng xếp hạng giảng viên, nhưng giảng viên vẫn cần số liệu lớp mình dạy để tự nhìn.

### 3.5 Giao diện

Trang mới `apps/web/src/app/(dashboard)/statistics/page.tsx`:

- Bốn tab: Lớp học phần · Bộ môn · Môn học · Giáo viên.
- Tab và học kỳ lưu trên URL (`?tab=subjects&term=SU25`) qua `useSearchParams` + `Suspense`, đúng như `/students` và `/alerts` — gửi link là gửi đúng cái mình đang xem.
- Bộ lọc học kỳ tái dùng `components/ui/filter-bar.tsx`; bảng tái dùng `DataTable`.
- Sidebar (`components/dashboard/sidebar.tsx`) thêm mục "Thống kê" ở `TOP_ITEMS`, `visible: () => true` — cả sáu vai trò đều đã `can('read', 'Statistics')` trong `ability.factory.ts`.
- `dashboard/page.tsx` **giữ nguyên**, chỉ thêm liên kết "Xem thống kê chi tiết →". Không refactor thứ đang chạy tốt.
- Không có export Excel thống kê — ngoài phạm vi yêu cầu.

### 3.6 Kiểm thử phần 1

Mỗi dimension service một file spec theo mẫu `statistics.service.spec.ts` (mock `PrismaService`, assert vào `where` đã dựng). Trọng tâm:

- Thuần LECTURER gọi `/statistics/lecturers` → `where` chứa đúng `{ id: user.id }`.
- TBM → `where` chứa bộ môn mình, không phải toàn trường.
- `subjects` luôn kèm `sectionScope(user)`; bộ lọc `term` không nuốt mất scope (mẫu test đã có ở `alerts.service.spec.ts`).
- Web: unit test cho hàm đọc/ghi tham số tab + term, theo mẫu `alert-filters.test.ts`.

## 4. Phần 2 — Chat nội bộ theo sinh viên

### 4.1 Hình dạng

Một sinh viên = một luồng thảo luận. Không có chat 1-1 ngoài ngữ cảnh sinh viên, không có phòng nhóm. Lý do: phạm vi đọc của luồng khớp sẵn với `studentScope`, không phải nghĩ ra luật phân quyền thứ hai.

**Phân biệt với `CareLog`**: `CareLog` là hồ sơ chăm sóc chính thức, một chiều, có `outcome`/`nextAction`, dùng để đối chiếu nghiệp vụ. Chat là trao đổi giữa cán bộ. Hai thứ giữ tách nhau; không nhét chat vào `CareLog`.

### 4.2 Schema

Hai model mới. **Không** có bảng thread hay participants — luồng chính là `studentId`, tránh một bảng chỉ để chứa một khóa ngoại.

```prisma
model DiscussionMessage {
  id        String    @id @default(uuid())
  studentId String
  authorId  String
  body      String
  deletedAt DateTime? // thu hồi mềm: giữ vết, UI hiện "tin nhắn đã thu hồi"
  createdAt DateTime  @default(now())

  student Student @relation(fields: [studentId], references: [id], onDelete: Cascade)
  author  Staff   @relation(fields: [authorId], references: [id])

  @@index([studentId, createdAt])
  @@map("discussion_messages")
}

model DiscussionRead {
  studentId  String
  staffId    String
  lastReadAt DateTime

  student Student @relation(fields: [studentId], references: [id], onDelete: Cascade)
  staff   Staff   @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@id([studentId, staffId])
  @@map("discussion_reads")
}
```

Thêm vào `Notification` một cột `discussionMessageId String?` + quan hệ, đúng cách `analysisVersionId` đã được thêm trước đây, kèm `@@unique([discussionMessageId, recipientId])` để retry không sinh thông báo trùng.

### 4.3 API — `apps/api/src/modules/discussions/`

| Endpoint | Việc |
|---|---|
| `GET /discussions/:studentId/messages?before=&limit=` | Danh sách tin, phân trang cuộn ngược theo `createdAt` |
| `POST /discussions/:studentId/messages` | Gửi tin (`{ body }`) |
| `DELETE /discussions/messages/:id` | Tác giả tự thu hồi (đặt `deletedAt`) |
| `POST /discussions/:studentId/read` | Đánh dấu đã đọc tới thời điểm hiện tại |
| `GET /discussions/unread-count` | Số luồng đang có tin chưa đọc, cho badge |

Không có sửa tin: thu hồi rồi gửi lại là đủ, và bớt một trạng thái phải đồng bộ.

### 4.4 Phân quyền

- Thêm subject CASL `'Discussion'` vào `Subjects` trong `ability.factory.ts`; cả sáu vai trò `can(['read', 'create'], 'Discussion')`. Giảng viên **có** quyền này — đây chính là nhu cầu gốc.
- Quyền CASL chỉ là cửa đầu. Cửa thật là phạm vi: mọi thao tác gọi `isStudentInScope(prisma, user, studentId)`; ngoài phạm vi trả **404** kèm thông điệp như `care-logs` ("Không tìm thấy sinh viên trong phạm vi quản lý của bạn"), **không** trả 403 — 403 sẽ xác nhận sinh viên đó có tồn tại.
- Hệ quả đã được chấp nhận khi chốt thiết kế: giảng viên không dạy sinh viên đó thì không vào được luồng, kể cả khi được nhắc tên. Không có cơ chế mời thêm người — mời thêm sẽ là một ngoại lệ của RULE 2 và phải sửa tài liệu nghiệp vụ trước.
- Thu hồi tin: chỉ tác giả (`authorId === user.id`), kể cả ADMIN cũng không sửa lời người khác.

### 4.5 Chặn PII trong nội dung tin (RULE 1)

Chat là chỗ đầu tiên hệ thống mở một ô text tự do để bàn về sinh viên, nên cần lớp chặn thứ tư bên cạnh ba lớp đã có:

- Util dùng chung `apps/api/src/common/utils/pii-text.ts`, hàm `assertNoPii(text: string): void`.
- Bắt: số điện thoại Việt Nam (`0|+84` + 9–10 số, chấp nhận dấu cách/chấm/gạch), email (`\S+@\S+\.\S+`), dãy 9–12 chữ số liền kiểu CCCD/CMND.
- Vi phạm → `BadRequestException` với `code: 'PII_IN_MESSAGE'` và thông điệp tiếng Việt nói rõ loại thông tin bị chặn.
- Chấp nhận rằng bộ lọc theo mẫu sẽ có báo nhầm (ví dụ mã lớp dài toàn số). Chặn nhầm rẻ hơn lọt PII; thông điệp lỗi phải giúp người dùng viết lại.

**Việc cần làm tiếp, không thuộc phạm vi lần này**: `CareLog.content`, `Alert.reason`, `Evaluation.note` cũng là text tự do và hiện chưa qua lớp chặn nào. Sau khi `assertNoPii` ổn định ở discussions, cân nhắc áp cho ba chỗ đó — nhưng phải xử lý dữ liệu cũ đã nhập trước, nên tách thành việc riêng.

### 4.6 Realtime — không mở stream mới

Không thêm endpoint SSE thứ hai. Khi có tin mới:

1. Tính danh sách người nhận = những người **đã tham gia luồng** (từng gửi tin chưa thu hồi, hoặc có bản ghi `DiscussionRead`), trừ chính người gửi.
2. Tạo `Notification` cho từng người, `targetUrl` trỏ tới tab trao đổi của sinh viên.
3. `NotificationEventsService` phát sự kiện; `/notifications/stream` đang chạy tự đẩy về; chuông thông báo hoạt động sẵn không phải sửa gì.

Web nhận event có `discussionMessageId` thì invalidate query `['discussions', studentId]`.

Hai hệ quả đã cân nhắc: (a) người đủ quyền xem sinh viên nhưng chưa từng mở luồng sẽ không được báo tin mới — họ vẫn đọc được luồng khi mở, và đây là cách duy nhất tránh bắn thông báo cho toàn bộ cán bộ CTSV mỗi lần có tin; (b) `NotificationEventsService` là pub/sub in-process nên nhiều instance API sẽ không chia sẻ sự kiện — đây là giới hạn **đã có sẵn** của hệ thống thông báo hiện tại, không phải do module này sinh ra, và polling 120s phía web vẫn là lưới đỡ.

### 4.7 Giao diện

- Component mới `apps/web/src/components/students/discussion-tab.tsx`, cắm thành tab thứ năm "Trao đổi" trong `app/(dashboard)/students/[id]/page.tsx` cạnh Đăng ký / Đánh giá / Chăm sóc / Cảnh báo.
- Danh sách tin theo thời gian tăng dần, tin của mình canh phải; mỗi tin hiện họ tên + mã NV + vai trò người gửi và thời điểm.
- Ô soạn tin ở dưới; lỗi `PII_IN_MESSAGE` hiện ngay tại ô soạn, giữ nguyên nội dung đã gõ để người dùng sửa chứ không mất bài.
- Nút thu hồi chỉ hiện trên tin của mình; tin đã thu hồi hiện dòng xám "Tin nhắn đã thu hồi".
- Mở tab → gọi `POST read`; badge số chưa đọc trên nhãn tab.
- Trạng thái rỗng: một dòng mời bắt đầu trao đổi, không để khoảng trắng trơ.

### 4.8 Kiểm thử phần 2

- Service spec: ngoài phạm vi → 404 ở cả đọc, gửi và đánh dấu đã đọc; thu hồi tin người khác → bị từ chối; danh sách người nhận thông báo loại đúng người gửi và người đã thu hồi hết tin.
- `assertNoPii`: unit test cho SĐT có/không dấu cách, email, dãy 9–12 số, và các chuỗi hợp lệ không được báo nhầm (mã sinh viên, mã lớp, điểm số).
- Web: test hàm gộp/nhóm tin và hàm tính số chưa đọc; Playwright cho luồng gửi — nhận giữa hai tài khoản.

## 5. Thứ tự triển khai

**Giai đoạn 1 — Thống kê.** Tách file (giữ nguyên hành vi, test cũ phải xanh) → `subjects` → `lecturers` + `lecturerStatsScope` → trang `/statistics` + sidebar → link từ dashboard.

**Giai đoạn 2 — Chat.** Migration 2 bảng + cột `discussionMessageId` → `assertNoPii` → service + controller + CASL → phát thông báo → tab giao diện.

Giai đoạn 1 không phụ thuộc giai đoạn 2 và ngược lại; hoàn thành giai đoạn 1 là đã dùng được.

## 6. Ngoài phạm vi

Export Excel bảng thống kê · biểu đồ (chỉ có bảng số) · chat 1-1 ngoài ngữ cảnh sinh viên · phòng chat theo nhóm/bộ môn · đính kèm tệp trong chat · nhắc tên `@` · mời người ngoài phạm vi vào luồng · áp `assertNoPii` cho `CareLog`/`Alert`/`Evaluation` · chuyển SSE sang WebSocket.
