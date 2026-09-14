# Đặc tả thiết kế: Quản lý Học kỳ & Tự động chọn Kỳ hiện tại (Term Management)

**Ngày tạo:** 2026-09-14  
**Trạng thái:** Chờ phê duyệt (Pending Review)  
**Tác giả:** FCare Team  

---

## 1. Tổng quan (Overview)
Trong hệ thống FCare, các dữ liệu cốt lõi như Lớp học phần (`ClassSection`), Đánh giá sinh viên (`Evaluation`), Phân tích kỳ học (`StudentTermAnalysis`), và Báo cáo thống kê (`Statistics`) đều phân nhóm theo học kỳ (ví dụ: `SP25`, `SU25`, `FA25`).

Trước đây:
- Chưa có bảng danh mục Học kỳ chính thức; mã kỳ được nhập tay dạng chuỗi tự do.
- Người dùng khi vào các màn hình danh sách, thống kê, cảnh báo phải tự chọn kỳ thủ công hoặc lọc tất cả các kỳ.
- Không có cơ chế nhận biết kỳ nào đang diễn ra để ưu tiên hiển thị.

Tính năng **Quản lý Học kỳ & Tự động chọn Kỳ hiện tại** bổ sung:
1. Danh mục Học kỳ (`Term`) có cấu hình ngày bắt đầu/kết thúc do Admin quản lý.
2. Tự động xác định kỳ hiện tại (default active term) dựa trên ngày thực tế hoặc cờ ghi đè (override) của Admin.
3. Tự động áp dụng kỳ mặc định vào các màn hình Thống kê, Sinh viên, Cảnh báo và Form tạo Lớp học phần.

---

## 2. Quy tắc nghiệp vụ Học kỳ (Business Rules)
Trường Đại học FPT phân chia 3 học kỳ trong một năm học:
1. **Spring (Mùa Xuân - SP)**:
   - Khoảng thời gian: Đầu tháng 1 – Cuối tháng 4.
   - Đặc điểm: Trùng thời gian nghỉ Tết Nguyên Đán (~2 tuần).
   - Mã chuẩn: `SP{yy}` (ví dụ: `SP25`, `SP26`).
2. **Summer (Mùa Hè - SU)**:
   - Khoảng thời gian: Đầu tháng 5 – Cuối tháng 8.
   - Đặc điểm: Có đợt nghỉ hè ngắn (~6-7 ngày) vào đầu tháng 7.
   - Mã chuẩn: `SU{yy}` (ví dụ: `SU25`, `SU26`).
3. **Fall (Mùa Thu - FA)**:
   - Khoảng thời gian: Đầu tháng 9 – Cuối tháng 12.
   - Đặc điểm: Kết thúc bảo vệ đồ án/môn học trước kỳ nghỉ Tết Dương lịch.
   - Mã chuẩn: `FA{yy}` (ví dụ: `FA25`, `FA26`).

---

## 3. Kiến trúc Dữ liệu (Database Schema)

### 3.1 Bảng `terms` (`apps/api/prisma/schema.prisma`)
```prisma
enum TermSeason {
  SPRING
  SUMMER
  FALL
}

model Term {
  id                String      @id @default(uuid())
  code              String      @unique // vd: "SP25", "SU25", "FA25"
  name              String      // vd: "Spring 2025"
  season            TermSeason  // SPRING | SUMMER | FALL
  year              Int         // vd: 2025
  startDate         DateTime    // Ngày bắt đầu kỳ
  endDate           DateTime    // Ngày kết thúc kỳ
  isCurrentOverride Boolean     @default(false) // Ghi đè kỳ hiện tại bởi Admin
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt

  @@index([startDate, endDate])
  @@map("terms")
}
```

### 3.2 Tương thích ngược (Backward Compatibility)
- Các bảng hiện hữu (`class_sections`, `evaluations`, `student_term_analyses`, `import_batches`) tiếp tục lưu `term String` dạng mã chuẩn (`SP25`, `SU25`).
- Khi tạo/sửa Lớp học phần qua UI, frontend hiển thị Dropdown các kỳ từ bảng `terms`, đảm bảo không bị sai lệch dữ liệu.
- Script seed mẫu (`prisma/seed.ts`) khởi tạo sẵn dữ liệu các kỳ cho 2025 và 2026.

---

## 4. Backend API & Nghiệp vụ (`apps/api`)

### 4.1 Thuật toán xác định Kỳ hiện tại (`getCurrentTerm`)
Khi gọi endpoint `GET /api/terms/current`, thứ tự ưu tiên:
1. **Ưu tiên 1 (Admin Override)**: Tìm kỳ có `isCurrentOverride = true`.
2. **Ưu tiên 2 (Theo ngày thực tế)**: Tìm kỳ có `startDate <= now <= endDate`.
3. **Ưu tiên 3 (Khoảng nghỉ giao kỳ / Fallback)**:
   - Tìm kỳ có `startDate > now` sắp bắt đầu gần nhất.
   - Nếu không có, tìm kỳ có `endDate < now` vừa kết thúc gần nhất.
4. **Fallback cuối cùng**: Nếu DB chưa có kỳ nào, trả về `null`.

### 4.2 Danh sách Endpoints
- `GET /api/terms`: Lấy danh sách tất cả các kỳ (sắp xếp giảm dần theo năm và ngày bắt đầu). Quyền: Tất cả nhân sự đã đăng nhập (`read MasterData`).
- `GET /api/terms/current`: Lấy kỳ hiện tại / mặc định. Quyền: Tất cả nhân sự đã đăng nhập (`read MasterData`).
- `POST /api/terms`: Tạo kỳ học mới. Quyền: `update MasterData` (`ADMIN`, `TRAINING_OFFICER`).
- `PATCH /api/terms/:id`: Sửa thông tin kỳ (ngày bắt đầu/kết thúc, tên). Quyền: `update MasterData`.
- `POST /api/terms/:id/set-current`: Bật/tắt cờ ghi đè kỳ hiện tại. Khi bật một kỳ, hệ thống tắt cờ của các kỳ còn lại trong cùng một transaction. Quyền: `update MasterData`.
- `DELETE /api/terms/:id`: Xóa kỳ. Kiểm tra không được xóa nếu đã có `ClassSection` liên kết với mã kỳ này. Quyền: `update MasterData`.

---

## 5. Giao diện Frontend (`apps/web`)

### 5.1 Quản lý Học kỳ (`/terms`)
- Thêm tab `terms` vào `MASTER_DATA_TABS` (`apps/web/src/lib/master-data-tabs.ts`) tại đường dẫn `/terms`.
- Bảng hiển thị danh sách các kỳ với các cột: Mã kỳ, Tên kỳ, Mùa & Năm, Thời gian bắt đầu - kết thúc, Trạng thái (Badge "Kỳ hiện tại"), Thao tác (Đặt làm kỳ hiện tại, Sửa, Xóa).
- Modal Tạo / Sửa học kỳ với **Smart Seasonal Preset**:
  - Chọn Năm (mặc định năm nay) + Chọn Mùa (🌸 Xuân / ☀️ Hè / 🍂 Thu).
  - Tự động điền: Mã kỳ (`SP{yy}`), Tên kỳ, Ngày bắt đầu mặc định, Ngày kết thúc mặc định.
  - Cho phép Admin tinh chỉnh lại ngày bắt đầu/kết thúc thực tế.

### 5.2 Áp dụng Kỳ mặc định trên toàn hệ thống
- Tạo React Hook `useCurrentTerm()` dùng chung.
- **Thống kê (`/statistics`)**: Nếu URL chưa có `?term=`, tự động dùng `currentTerm.code` để load thống kê lớp/môn/giảng viên.
- **Danh sách sinh viên (`/students`)**: Bộ lọc học kỳ tự động chọn `currentTerm.code` làm giá trị ban đầu.
- **Cảnh báo học vụ (`/alerts`)**: Bộ lọc học kỳ tự động lọc theo `currentTerm.code`.
- **Hồ sơ sinh viên (`evaluations-tab.tsx`)**: Tab học kỳ ưu tiên chọn `currentTerm.code` nếu sinh viên có học trong kỳ đó.
- **Form Lớp học phần (`MasterDataView`)**: Đổi ô nhập mã kỳ tự do thành Dropdown `<Select>` lấy từ danh sách `terms`, mặc định chọn sẵn kỳ hiện tại.

---

## 6. Kế hoạch Kiểm thử & Xác minh (Verification)
1. **Backend Tests**:
   - `terms.service.spec.ts`: Kiểm thử CRUD, thuật toán ưu tiên kỳ hiện tại, transaction toggle override, ràng buộc `startDate < endDate`, và chặn xóa kỳ đã có lớp học phần.
2. **Frontend Tests**:
   - Helper test: Sinh mã kỳ và khoảng ngày dự kiến theo mùa/năm.
   - Filter test: Kiểm tra URL query param và fallback về `currentTerm.code`.
3. **Manual E2E Verification**:
   - Tạo kỳ mới bằng bộ chọn nhanh theo mùa.
   - Đổi kỳ hiện tại và kiểm tra các màn hình Thống kê, Sinh viên, Cảnh báo tự động nhận diện đúng kỳ.
