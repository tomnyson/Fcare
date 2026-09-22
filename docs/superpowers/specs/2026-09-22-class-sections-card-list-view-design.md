# Thiết Kế: Chuyển Đổi Chế Độ Xem Thẻ / Danh Sách (Card / List View) Trang Lớp Học Phần

Tài liệu thiết kế tính năng cho phép người dùng chuyển đổi linh hoạt giữa giao diện **Dạng Thẻ (Card / Grid)** và **Dạng Bảng Danh Sách (List / Table)** trên trang [Lớp học phần](file:///Applications/work/Fcare/apps/web/src/app/(dashboard)/class-sections/page.tsx).

---

## 1. Mục tiêu & Trải nghiệm người dùng

- **Mục tiêu**: Cung cấp cho giảng viên, cán bộ quản lý 2 góc nhìn linh hoạt:
  - **Dạng Thẻ (Card)**: Trực quan, xem nhanh thông tin lớp theo từng khối thẻ, tối ưu khi duyệt theo lớp học trực quan.
  - **Dạng Danh sách (List / Table)**: Mật độ thông tin cao, dễ quét hàng loạt lớp, xem tổng quan lịch học, phòng học, sĩ số và số cảnh báo một cách nhanh chóng.
- **Trạng thái mặc định**:
  - Mặc định là Dạng Thẻ nếu người dùng lần đầu truy cập.
  - Tự động ghi nhớ lựa chọn của người dùng vào `localStorage` (`fcare_classes_view_mode`) và đồng bộ lên URL query parameter `?view=card` hoặc `?view=list`.

---

## 2. Thiết kế Giao diện Nút Chuyển Đổi (View Toggle)

- **Vị trí**: Đặt tại khu vực `actions` của `PageHeader` (cùng hàng với chip Học kỳ hiện tại).
- **Cấu trúc nút**: Segmented Button Group gồm 2 nút chuyển đổi:
  - `[ ⊞ Thẻ ]`: Biểu tượng Grid + chữ "Thẻ"
  - `[ ☰ Danh sách ]`: Biểu tượng List + chữ "Danh sách"
- **Style**:
  - Khối bọc có bo góc `rounded-lg`, nền viền `border border-border bg-surface p-0.5`.
  - Nút đang được chọn (Active): Nền xanh thương hiệu `bg-fpt-blue-900 text-white font-semibold shadow-sm`.
  - Nút không chọn: Màu chữ `text-ink/80 hover:text-ink hover:bg-white/60`.

---

## 3. Cấu hình Phân trang theo từng Chế độ

| Tiêu chí | Chế độ Thẻ (Card View) | Chế độ Danh sách (List / Table View) |
|---|---|---|
| **Số mục mặc định** | 24 thẻ / trang (vừa 8 hàng lưới 3 cột) | **10 dòng / trang** (đồng bộ chuẩn toàn hệ thống) |
| **Các mức tùy chọn** | 12, 24, 48 | 10, 20, 50, 100 |
| **Vị trí phân trang** | 2 đầu (trên & dưới lưới thẻ) | 2 đầu (trên & dưới bảng, gắn liền docked vào `<DataTable>`) |
| **Giao diện phân trang** | Chuẩn FCare (bộ chọn + đếm số lượng + cụm nút segmented) | Chuẩn FCare (bộ chọn + đếm số lượng + cụm nút segmented) |

---

## 4. Thiết kế Cột cho Dạng Bảng Danh Sách (List View)

Sử dụng `<DataTable fitViewport ...>` với các cột:
1. **Mã lớp**: Font mono đậm (`section.code`), liên kết hoặc hiển thị nổi bật.
2. **Môn học**: Tên môn (`section.subject?.name`) kèm mã môn & số tín chỉ (`section.subject?.code` - X tín chỉ).
3. **Kỳ & Block**: Kỳ `section.term` kèm huy hiệu Block (nếu có, ví dụ `Block 1`, `Block 2`).
4. **Lịch học**: Thứ trong tuần (ví dụ: `Thứ 2, 4, 6`).
5. **Ca học**: Thời gian & ca học (ví dụ: `Ca 2 (09:15 - 11:15)`).
6. **Phòng**: Tên phòng học (ví dụ: `P.302`) hoặc `Chưa xếp`.
7. **Giảng viên**: Họ tên giảng viên phụ trách hoặc `—`.
8. **Sĩ số**: `X / Y sinh viên` (có thể lọc hoặc kiểm tra quá tải).
9. **Cảnh báo**:
   - Có cảnh báo: Badge màu đỏ nhấp nháy (`Badge tone="danger" pulse`) hiển thị `X cảnh báo`.
   - Bình thường: Badge xanh lá (`Badge tone="success"`) hiển thị `Bình thường`.
10. **Thao tác**:
    - Nút phụ: `[Bảng điểm]` dẫn sang `/class-sections/[id]/grades`.
    - Nút chính: `[Xem SV (X)]` dẫn sang `/students?term=...&sectionId=...`.

---

## 5. Kế hoạch Kiểm thử & Xác thực

1. **Kiểm thử chuyển đổi giao diện**:
   - Bấm nút "Danh sách": Giao diện chuyển mượt mà sang bảng `<DataTable>` với 10 dòng/trang và phân trang 2 đầu.
   - Bấm nút "Thẻ": Giao diện quay lại lưới thẻ 3 cột.
2. **Kiểm thử lưu trạng thái**:
   - Reload trang: Giữ nguyên chế độ đã chọn từ URL hoặc localStorage.
   - Chia sẻ link kèm `?view=list`: Người nhận mở ra trực tiếp dạng bảng.
3. **Kiểm thử tìm kiếm & bộ lọc**:
   - Tìm kiếm mã môn, mã lớp, lọc học kỳ, block, cảnh báo: Cả 2 chế độ đều phản hồi đồng bộ và giữ nguyên phân trang.
4. **Automated Tests**:
   - Chạy `pnpm --filter @fcare/web test` và `pnpm typecheck`.
