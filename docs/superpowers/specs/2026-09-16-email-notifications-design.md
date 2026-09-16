# Thiết kế Kỹ thuật: Tích hợp Gửi Email Thông báo Nội dung Chăm sóc & Cảnh báo Học vụ

- **Ngày tạo**: 2026-09-16
- **Trạng thái**: Bản thảo đã thống nhất (Approved by User)
- **Tác giả**: Antigravity & Pair Programming Engineer

---

## 1. Mục tiêu & Bối cảnh

### 1.1. Bối cảnh
Hệ thống **FCare** hiện đã có cơ chế gửi thông báo nội bộ thời gian thực (SSE) và chuông thông báo trong giao diện web khi phát sinh cảnh báo học vụ hoặc trao đổi nội bộ. Tuy nhiên, giảng viên và cán bộ không phải lúc nào cũng mở trực tiếp trang web FCare liên tục trong ngày làm việc.

### 1.2. Mục tiêu
Tích hợp tính năng **gửi email tự động** đến hòm thư của giảng viên (`@fpt.edu.vn` / `@fe.edu.vn`) khi có sự kiện chăm sóc và cảnh báo học vụ quan trọng, giúp giảng viên và ban quản lý nắm bắt kịp thời các ca sinh viên cần can thiệp mà không cần phải túc trực trên phần mềm.

---

## 2. Quy tắc Kích hoạt Gửi Email (Trigger Rules)

Theo thỏa thuận với người dùng, nhằm đảm bảo thông tin kịp thời nhưng không làm quá tải hộp thư (spam inbox) của giảng viên:

| Nhóm sự kiện | Điều kiện kích hoạt gửi email | Đối tượng nhận email |
|---|---|---|
| **Cảnh báo học vụ (Alerts)** | Mức 2 (Trung bình), Mức 3 (Cao), Mức 4 (Khẩn cấp) | Giảng viên đang dạy sinh viên, Trưởng bộ môn, Cán bộ CTSV (theo ma trận `EscalationService`). Không gửi cho người tự phát cảnh báo. |
| **Cảnh báo Mức 1** | *Không gửi email* (chỉ lưu và hiển thị trên chuông web) | — |
| **Nhật ký chăm sóc (`CareLog`)** | Khi có nhật ký chăm sóc mới được ghi nhận cho sinh viên | Các giảng viên đang trực tiếp giảng dạy sinh viên đó trong học kỳ hiện tại |
| **Thảo luận nội bộ (`DiscussionMessage`)** | Khi có tin nhắn trao đổi mới trong luồng sinh viên | Các giảng viên đứng lớp của sinh viên và các cán bộ đã tham gia thảo luận |

---

## 3. Kiến trúc Hệ thống (System Architecture)

### 3.1. Sơ đồ khối luồng xử lý
```
[User Action: Phát Cảnh báo / Ghi Nhật ký / Gửi Trao đổi]
                      │
                      ▼
            [Business Controller]
                      │
                      ▼
        [NotificationDispatchService]
         ├── 1. Lưu CSDL: Notification.createMany()
         ├── 2. Bắn sự kiện realtime SSE: NotificationEventsService.emit()
         └── 3. Bất đồng bộ: Đẩy job vào BullMQ Queue
                      │
                      ▼
               [BullMQ Queue] ──(Retry 3 lần nếu lỗi)
                      │
                      ▼
            [EmailConsumer / Worker]
                      │
                      ▼
        [EmailService (Nodemailer)]
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
 [Dev: Mailhog (Port 1025)]    [Prod: SMTP FPT/Office365]
```

### 3.2. Cấu trúc Mô-đun mới: `EmailModule`
Thư mục: `apps/api/src/modules/email/`
- **`email.module.ts`**: Đăng ký `EmailService`, nạp cấu hình `ConfigService`.
- **`email.service.ts`**:
  - Khởi tạo transporter qua thư viện `nodemailer`.
  - Hàm `sendMail(options: SendMailOptions): Promise<boolean>`.
  - Tự động tạo layout HTML Card trang nhã với nhận diện thương hiệu FPT/FCare.
- **`email-template.helpers.ts`**:
  - Hàm render template HTML email cho từng loại thông báo (Alert, CareLog, Discussion).

### 3.3. Cấu hình Biến môi trường (Environment Variables)
Tận dụng các biến đã định nghĩa sẵn trong `.env.example` và `docker-compose.yml`:
```env
# SMTP Configuration
SMTP_HOST=localhost       # Trong docker: mailhog
SMTP_PORT=1025            # Port SMTP Mailhog
SMTP_USER=                # (Tùy chọn cho prod)
SMTP_PASS=                # (Tùy chọn cho prod)
SMTP_FROM="FCare — Chăm sóc sinh viên <fcare-noreply@fpt.edu.vn>"
WEB_BASE_URL=http://localhost:3000
```

---

## 4. Thiết kế Giao diện Email (Email Template Specification)

### 4.1. Cấu trúc HTML Card (Responsive, Inline Styles)
Email sử dụng định dạng HTML tương thích tốt với mọi ứng dụng thư (Outlook, Gmail, Apple Mail, di động):
1. **Header**:
   - Banner màu xanh đậm FPT (`#16304E`) với tiêu đề **FCare — Hệ thống Chăm sóc & Giám sát Học vụ**.
2. **Thẻ thông tin sinh viên (Student Info Card)**:
   - Họ và tên, MSSV (in đậm).
   - Lớp học phần, Học kỳ hiện tại, Bộ môn.
3. **Khối nội dung chi tiết (Details Box)**:
   - **Với Cảnh báo**:
     - Badge mức độ:
       - Mức 2: Màu vàng cam (`#D97706`).
       - Mức 3: Màu cam đậm (`#EA580C`).
       - Mức 4: Màu đỏ khẩn cấp (`#DC2626`).
     - Lý do cảnh báo, người phát cảnh báo, thời gian.
   - **Với Nhật ký chăm sóc**:
     - Hình thức (Trực tiếp / Online), nội dung tiếp xúc, kết quả và kế hoạch tiếp theo, cán bộ thực hiện.
   - **Với Thảo luận**:
     - Người gửi, nội dung tin nhắn trao đổi.
4. **Nút hành động (Call To Action - Button)**:
   - Nút bấm màu cam FPT (`#F37021`): **"Xem chi tiết trên FCare"**.
   - Dẫn thẳng đến trang hồ sơ sinh viên (`/students/{studentId}`) hoặc chi tiết cảnh báo (`/alerts`).
5. **Footer**:
   - Ghi chú bảo mật PII: *"Email tự động từ hệ thống FCare. Vui lòng bảo mật thông tin học vụ sinh viên theo quy định của nhà trường."*

---

## 5. Xử lý Lỗi & Nguyên tắc Bảo mật (Error Handling & Security)

### 5.1. Xử lý trường hợp Giảng viên chưa có Email
- Bảng `Staff.email` có thể là `null` với một số tài khoản chưa cập nhật.
- **Quy tắc xử lý**:
  - `NotificationDispatchService` chỉ lọc và gửi email đến những nhân sự có `email` hợp lệ (kết thúc bằng `@fpt.edu.vn` hoặc `@fe.edu.vn`).
  - Những nhân sự chưa có email sẽ được ghi log cảnh báo (`Logger.warn`), vẫn nhận thông báo chuông trên web bình thường.
  - Tuyệt đối không throw Exception làm gián đoạn luồng nghiệp vụ chính của người dùng.

### 5.2. Chống nghẽn & Đảm bảo độ tin cậy
- Tác vụ gửi email chạy ngầm trong queue BullMQ (hoặc async Promise non-blocking khi không có Redis).
- Retry tối đa 3 lần với exponential backoff khi SMTP server bận hoặc timeout.

### 5.3. Tuân thủ Nguyên tắc Bảo mật PII (RULE 1)
- Nội dung email chỉ chứa: Họ tên, MSSV, lớp, mã môn, nội dung học vụ.
- **Tuyệt đối không đưa số CCCD, số điện thoại cá nhân hay địa chỉ nhà riêng của sinh viên vào nội dung email**.

---

## 6. Kế hoạch Kiểm thử & Xác minh (Verification Plan)

1. **Unit Tests (`email.service.spec.ts`)**:
   - Kiểm tra khởi tạo transporter thành công từ cấu hình môi trường.
   - Kiểm tra render đúng các template HTML cho Alert Mức 2-4, CareLog, Discussion.
   - Kiểm tra lọc bỏ các tài khoản không có email.
2. **Kiểm thử Tích hợp Mailhog**:
   - Chạy lệnh phát cảnh báo hoặc tạo thảo luận.
   - Mở giao diện Mailhog tại `http://localhost:8025`.
   - Kiểm tra email đến hộp thư trong Mailhog: tiêu đề, định dạng card HTML, nút bấm liên kết chính xác.
