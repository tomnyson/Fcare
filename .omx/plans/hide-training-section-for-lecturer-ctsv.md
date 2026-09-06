# Kế hoạch ẩn khu vực Đào tạo với Giảng viên và Cán bộ CTSV

## Requirements Summary

- Diễn giải yêu cầu: `Giảng viên` (`LECTURER`) và `Cán bộ CTSV` (`SA_OFFICER`) không nhìn thấy khu vực **Đào tạo**.
- Ẩn trọn nhóm điều hướng, gồm tiêu đề `Đào tạo` và sáu liên kết `/master-data/*`, ở cả sidebar desktop và mobile. Hiện nhóm này được render vô điều kiện tại `apps/web/src/components/dashboard/sidebar.tsx:104-117`.
- Không chỉ ẩn liên kết: nếu hai role trên mở trực tiếp `/master-data` hoặc `/master-data/[tab]`, ứng dụng phải chuyển họ về `/dashboard`. Hiện route chưa kiểm tra role tại `apps/web/src/app/(dashboard)/master-data/page.tsx:1-5` và `apps/web/src/app/(dashboard)/master-data/[tab]/page.tsx:11-23`.
- Giữ nguyên khả năng xem Đào tạo của `ADMIN`, `HEAD_OF_DEPT`, `TRAINING_OFFICER`, và `SA_HEAD`. Với tài khoản nhiều role, quyền được cộng gộp: chỉ cần có một role được phép thì khu vực vẫn hiển thị.
- Không thay đổi CASL/API trong phạm vi này. `LECTURER` và `SA_OFFICER` vẫn cần quyền đọc dữ liệu danh mục tại `apps/api/src/casl/ability.factory.ts:65-98`, vì các endpoint `/majors`, `/departments`, `/class-sections` còn được dùng ở các luồng ngoài màn hình Đào tạo như `apps/web/src/app/(dashboard)/students/page.tsx:75` và `apps/web/src/app/(dashboard)/import-export/page.tsx:55`.
- Không thay đổi quyền Import/Export; `SA_OFFICER` vẫn thấy mục này theo `apps/web/src/components/dashboard/sidebar.tsx:29-35`.

## Acceptance Criteria

1. Khi chỉ có role `LECTURER`, sidebar không chứa text `Đào tạo` và không có bất kỳ link nào bắt đầu bằng `/master-data/`.
2. Khi chỉ có role `SA_OFFICER`, sidebar không chứa text `Đào tạo` và không có bất kỳ link nào bắt đầu bằng `/master-data/`.
3. Khi role là `ADMIN`, `HEAD_OF_DEPT`, `TRAINING_OFFICER`, hoặc `SA_HEAD`, nhóm `Đào tạo` và toàn bộ tab hiện tại vẫn hiển thị như trước.
4. Tài khoản `LECTURER + TRAINING_OFFICER` vẫn nhìn thấy Đào tạo; role được phép phải thắng role bị ẩn.
5. `LECTURER` hoặc `SA_OFFICER` truy cập `/master-data`, `/master-data/departments`, hoặc một tab mapping như `/master-data/department-aliases` đều được chuyển tới `/dashboard` trước khi nội dung danh mục xuất hiện.
6. Các role được phép vẫn truy cập trực tiếp mọi tab hợp lệ; hành vi redirect tab không hợp lệ tại `apps/web/src/app/(dashboard)/master-data/[tab]/page.tsx:16-19` không đổi.
7. `SA_OFFICER` vẫn truy cập được Import/Export; trang Sinh viên và các bộ lọc phụ thuộc dữ liệu danh mục vẫn tải bình thường.
8. Không có thay đổi quyền `read MasterData` ở API và không có thay đổi schema/database.

## Implementation Steps

1. Tập trung ma trận quyền xem khu vực Đào tạo trong `apps/web/src/lib/master-data-tabs.ts`.
   - Thêm danh sách role được phép theo hướng allow-list: `ADMIN`, `HEAD_OF_DEPT`, `TRAINING_OFFICER`, `SA_HEAD`.
   - Thêm helper thuần, ví dụ `canViewTrainingArea(roles)`, dùng phép `some` để giữ semantics cộng gộp quyền cho tài khoản nhiều role.
   - Đặt helper cạnh `MASTER_DATA_TABS` để sidebar và route guard dùng chung một nguồn quyết định, tránh hai ma trận role lệch nhau.

2. Khóa hành vi helper bằng unit test mới `apps/web/src/lib/master-data-tabs.test.ts`.
   - Test riêng `LECTURER` và `SA_OFFICER` trả về `false`.
   - Test từng role được phép trả về `true`.
   - Test mảng nhiều role `['LECTURER', 'TRAINING_OFFICER']` trả về `true` và mảng rỗng trả về `false`.

3. Áp dụng helper cho toàn bộ nhóm Đào tạo trong `apps/web/src/components/dashboard/sidebar.tsx:93-119`.
   - Tính một cờ duy nhất từ `user.roles`.
   - Bọc chung tiêu đề, divider mobile, và danh sách `MASTER_DATA_TABS`; không lọc từng link riêng để tránh còn header/divider rỗng.
   - Không thay đổi `TOP_ITEMS`, `BOTTOM_ITEMS`, hoặc điều kiện `canUseExcelIo`.

4. Thêm route guard dùng chung tại `apps/web/src/app/(dashboard)/master-data/layout.tsx`.
   - Dùng `useMe()` hiện có và cùng `canViewTrainingArea` helper.
   - Với role không được phép, không render `children`, thực hiện `router.replace('/dashboard')`, và hiển thị trạng thái chuyển trang ngắn trong thời gian redirect để không lóe nội dung/dữ liệu Đào tạo.
   - Với role được phép, render nguyên vẹn route index, tab CRUD, và hai mapping tab. Không sửa `MasterDataView`/`MappingView`, vì các component này đã giới hạn thao tác quản lý bằng `MANAGER_ROLES` tại `apps/web/src/components/master-data/master-data-view.tsx:27-28` và `apps/web/src/components/master-data/mapping-view.tsx:23-25`.

5. Bổ sung kiểm thử điều hướng theo role.
   - Mở rộng `apps/web/e2e/fixtures/auth.ts:8-40` với fixture đăng nhập `SA_OFFICER` dùng tài khoản seed `ctsv.lan` từ `apps/api/prisma/seed.ts:43`.
   - Thêm spec tập trung, ví dụ `apps/web/e2e/training-visibility.spec.ts`: xác nhận Lecturer và CTSV không thấy menu, truy cập URL trực tiếp bị chuyển về dashboard; xác nhận Admin vẫn thấy menu và mở được một tab.
   - Nếu môi trường E2E không có seed CTSV, cho phép override bằng biến `E2E_SA_OFFICER_CODE`/`E2E_SA_OFFICER_PASSWORD` giống fixture Lecturer hiện tại.

## Risks and Mitigations

- **Nhầm “Cán bộ CTSV” với `SA_HEAD`:** yêu cầu gọi đúng nhãn `Cán bộ CTSV`, nên kế hoạch chỉ ẩn `SA_OFFICER`; `SA_HEAD` tiếp tục xem read-only. Ghi rõ ma trận role trong unit test để thay đổi sau này là có chủ đích.
- **Ẩn menu nhưng vẫn truy cập bằng bookmark:** nested layout guard áp dụng cho cả `/master-data` và mọi `/master-data/[tab]`.
- **Lóe nội dung hoặc phát request trước redirect:** guard không render `children` khi role không hợp lệ; chỉ hiển thị trạng thái chuyển trang.
- **Làm hỏng bộ lọc/Import-Export:** không thu hồi `read MasterData` ở API, không sửa các endpoint danh mục, và có smoke test cho các luồng tái sử dụng.
- **Ma trận role lệch giữa sidebar và route:** cả hai dùng cùng helper thuần và cùng unit test.
- **Blast radius:** GitNexus đánh giá thay đổi `Sidebar` là `LOW`, có một caller trực tiếp là `DashboardLayout` tại `apps/web/src/app/(dashboard)/layout.tsx:8-29`; cần chạy lại impact trước khi sửa từng symbol thực tế nếu phạm vi implementation thay đổi.

## Verification Steps

1. Chạy unit test web: `pnpm --filter @fcare/web test`.
2. Chạy lint và typecheck web: `pnpm --filter @fcare/web lint` và `pnpm --filter @fcare/web typecheck`.
3. Chạy E2E tập trung: `pnpm --filter @fcare/web test:e2e -- training-visibility.spec.ts`.
4. Smoke test các regression liên quan: Lecturer mở trang Sinh viên; CTSV mở Import/Export; Admin mở `/master-data/class-sections` và vẫn thấy thao tác quản lý.
5. Kiểm tra responsive ở desktop và mobile: không còn tiêu đề/divider rỗng khi nhóm Đào tạo bị ẩn.
6. Trước khi commit, chạy GitNexus `detect_changes(scope: "all")` và xác nhận chỉ luồng Dashboard navigation/master-data access cùng các test dự kiến bị ảnh hưởng.

## Assumptions / Scope Boundaries

- Cụm “phần tạo tạo” được hiểu là lỗi gõ của “phần Đào tạo”, dựa trên nhãn thật trong sidebar tại `apps/web/src/components/dashboard/sidebar.tsx:105`.
- `Cán bộ CTSV` chỉ là `SA_OFFICER`; `Trưởng phòng CTSV` (`SA_HEAD`) nằm ngoài yêu cầu.
- Đây là thay đổi quyền nhìn thấy/truy cập màn hình Đào tạo, không phải thay đổi quyền đọc dữ liệu nền ở API.
- Không đổi nội dung, cấu trúc tab, CRUD, import/export, hay phân quyền các role không được nêu.
