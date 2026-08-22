---
name: design-taste
description: Use when building or restyling any FCare UI surface (pages, components, charts, empty states, emails). Encodes FPT Education brand taste — palette, typography, depth, motion, data-viz — plus an anti-template checklist so output looks designed, not generated.
---

# Design Taste — FCare / FPT Education

Mục tiêu: mọi surface trông **có chủ đích** — như sản phẩm nội bộ được đội design FPT chăm chút, không phải template Tailwind mặc định.

## 1. Nguồn sự thật

Token đã định nghĩa tại `apps/web/src/styles/tokens.css` — **luôn dùng token, không hardcode màu/spacing**. Tailwind theme map ở `apps/web/src/app/globals.css`.

| Vai trò | Token | Giá trị |
|---|---|---|
| Hành động chính, điểm nhấn | `--color-fpt-orange` | `#f27227` |
| Nền đậm (sidebar, header bảng) | `--color-fpt-blue-900` | `#0b2e4f` |
| Link, thông tin | `--color-fpt-blue` | `#0066b3` |
| Nền trang | `--color-surface` | `oklch(99% 0 0)` |
| Chữ chính / phụ | `--color-ink` / `--color-muted` | oklch 22% / 52% |
| Success / Warning / Danger | `--color-success/warning/danger` | xanh/vàng/đỏ đã chuẩn |
| Display / Body font | Be Vietnam Pro / Inter | `--font-display` / `--font-body` |

## 2. Ngôn ngữ thị giác FCare

- **Hướng style**: "institutional warm" — nền sáng, navy làm khung, cam là năng lượng. KHÔNG dark mode mặc định.
- **Cam là dấu nhấn, không phải màu nền**: mỗi màn hình tối đa 1–2 vùng cam đậm (CTA chính, badge trạng thái quan trọng). Cần nhấn phụ → dùng `--color-fpt-orange-50` làm wash.
- **Navy tạo cấu trúc**: sidebar, header bảng dữ liệu, footer — các "xương" của layout dùng `fpt-blue-900`; chữ trên navy dùng trắng/cam, không xám.
- **Màu ngữ nghĩa đúng nghĩa**: mức cảnh báo 1→4 đi từ `muted` → `warning` → `orange` → `danger`. Không dùng đỏ cho decoration.

## 3. Hierarchy & nhịp điệu

- Mỗi trang có đúng **một** tiêu đề display (Be Vietnam Pro, bold, `fpt-blue-900`); còn lại là Inter.
- Tương phản scale rõ: tiêu đề trang ≥ 1.5× tiêu đề section; số liệu trong StatCard lớn (2xl+, tabular-nums), nhãn nhỏ và muted.
- Spacing không đều tăm tắp: nhóm liên quan sát nhau (gap-2/3), giữa các nhóm giãn rõ (gap-6/8). Padding card 20–24px, không 16px đều mọi nơi.
- Bảng dữ liệu: header navy chữ trắng, hàng hover `fpt-orange-50/40`, số căn phải + `tabular-nums`, mã (MSSV, mã lớp) dùng font-medium.

## 4. Depth, states, motion

- Bóng dùng `--shadow-card` (đã pha blue tint) — không stack shadow Tailwind mặc định.
- Mọi phần tử tương tác PHẢI có đủ hover / focus-visible / active / disabled. Focus ring: `outline-2 outline-offset-2 outline-fpt-orange`.
- Motion chỉ trên `transform`/`opacity`, dùng `--duration-fast`/`--ease-out-expo`; hover card = nâng nhẹ (translateY(-1px) + shadow), KHÔNG scale to.
- Tôn trọng `prefers-reduced-motion` — mọi transition phải tắt được.

## 5. Trạng thái đặc biệt (nơi lộ rõ sự cẩu thả)

- **Empty state**: icon/emoji lớn + 1 câu giải thích + 1 hành động gợi ý. Không bao giờ chỉ "Không có dữ liệu."
- **Loading**: skeleton cùng hình khối với nội dung thật (bảng → skeleton hàng; card → skeleton card). Không spinner giữa trang trắng.
- **Error**: nói điều người dùng làm được ("Thử tải lại", "Liên hệ quản trị"), kèm mã lỗi nghiệp vụ nếu có.
- **Badge trạng thái** (sinh viên, cảnh báo): luôn pill + wash màu nhạt + chữ đậm cùng họ màu — không viền đơn.

## 6. Data-viz

- Tối đa 4 màu/biểu đồ, lấy từ palette semantic; đạt = `success`, trượt = `danger`, cấm thi = `warning`, còn lại navy/cam.
- Trục, grid line dùng `--color-border`; nhãn dùng `--color-muted`. Số phần trăm luôn 1 chữ số thập phân.
- Tỷ lệ quan trọng (pass rate) hiển thị to như một con số trước, biểu đồ minh họa sau.

## 7. Checklist trước khi hoàn thành UI

- [ ] Không hardcode màu/px — tất cả qua token
- [ ] Có ít nhất 4/10 phẩm chất: scale contrast, nhịp spacing chủ đích, depth/layer, typography có cá tính, màu ngữ nghĩa, states được thiết kế, bố cục có điểm phá, motion làm rõ luồng
- [ ] Hover/focus/active/disabled đầy đủ; focus-visible thấy rõ bằng bàn phím
- [ ] Empty/loading/error được thiết kế, không placeholder mặc định
- [ ] Chụp thử ở 320 / 768 / 1440 — không tràn ngang, touch target ≥ 44px
- [ ] Nhìn tổng thể: có tin được đây là screenshot sản phẩm thật của FPT không?

## 8. Cấm kỵ

- Gradient blob hero, card grid đều tăm tắp không hierarchy, gray-on-white + 1 màu accent rải ngẫu nhiên
- Emoji thay icon trong UI chính thức khi đã có hệ icon (được dùng ở empty state)
- Border-radius/shadow mỗi nơi một kiểu — chỉ dùng `--radius-card` và `--shadow-card`
- Dark mode tự phát khi sản phẩm chưa định nghĩa dark palette
