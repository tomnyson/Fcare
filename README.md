# FCare — Hệ thống chăm sóc & giám sát học vụ sinh viên

Hệ thống theo dõi, đánh giá, chăm sóc và cảnh báo sớm sinh viên cho FPT Education.

## Cấu trúc monorepo

```
apps/
  web/            # Next.js 15 (App Router) — giao diện người dùng
  api/            # NestJS 11 — REST API (Prisma + PostgreSQL)
packages/
  shared-types/   # Zod schemas + TypeScript types dùng chung FE/BE
  shared-config/  # tsconfig presets
  ui-kit/         # Component thương hiệu FPT (Button, SurfaceCard, Badge)
infra/
  docker/         # docker-compose: postgres, redis, mailhog + Dockerfiles
docs/             # Tài liệu yêu cầu nghiệp vụ
```

## Yêu cầu

- Node >= 22 (openai SDK v7 yêu cầu), pnpm >= 10
- Docker (cho Postgres/Redis khi chạy local)

## Chạy dev

```bash
pnpm install
docker compose -f infra/docker/docker-compose.yml up -d postgres redis
cp .env.example .env

# Khởi tạo database + dữ liệu demo
pnpm --filter @fcare/api db:migrate:dev
pnpm --filter @fcare/api db:seed

pnpm dev            # chạy đồng thời web (3000) + api (3001)
```

- Web: <http://localhost:3000> · API docs (Swagger): <http://localhost:3001/api/docs>

> **Port bị chiếm?** Nếu `docker compose up` báo `Bind for 0.0.0.0:5432 failed: port is already allocated`,
> một Postgres/Redis khác (container hoặc service local) đang giữ port. Đổi port host trong
> `infra/docker/.env` (`POSTGRES_PORT`, `REDIS_PORT`) rồi cập nhật `DATABASE_URL`/`REDIS_URL` trong `.env`
> cho khớp — không cần tắt dự án khác. Kiểm tra ai đang giữ port: `lsof -nP -iTCP:5432 -sTCP:LISTEN`.

### Tài khoản demo (mật khẩu chung: `Fcare@123`)

Danh mục bộ môn/ngành được seed từ 12 bộ môn thật (không còn 3 bộ môn giả
`SE`/`AI`/`GD`) — xem `apps/api/prisma/seed-data.ts` để biết đầy đủ mã bộ môn,
ngành, alias tra cứu và quy tắc lớp→ngành dùng khi import Excel.

| Mã NV | Vai trò | Phạm vi |
|---|---|---|
| `admin` | Quản trị hệ thống | Toàn hệ thống |
| `tbm.se`, `tbm.ai` | Trưởng bộ môn | Bộ môn Công nghệ thông tin (`CNTT`) |
| `gv.binh`, `gv.chi`, `gv.dung` | Giảng viên | Bộ môn Công nghệ thông tin (`CNTT`) |
| `dt.hoa` | Cán bộ Đào tạo | Toàn trường |
| `ctsv.lan` / `ctsv.truong` | CTSV / Trưởng phòng CTSV | Toàn trường |

## Chức năng chính

- **Xác thực & consent gate**: đăng nhập bằng mã NV, JWT httpOnly cookie (access 15' +
  refresh 7 ngày, xoay vòng); mỗi lần đăng nhập bắt buộc ký cam kết không chia sẻ dữ liệu.
- **RBAC (CASL)**: 6 vai trò; giảng viên/TBM bị scope theo bộ môn ở tầng service.
- **Sinh viên & học vụ**: hồ sơ sinh viên, lớp học phần, điểm, chuyên cần, cấm thi.
- **Đánh giá & chăm sóc**: điểm học lực/thái độ 1-10, nhóm vấn đề 1-4, nhật ký chăm sóc.
- **Cảnh báo 4 mức**: mức 2 báo TBM, mức 3 thêm Đào tạo, mức 4 thêm CTSV + mọi GV đang dạy
  (lý do ≥ 40 ký tự); gửi qua **BullMQ** (retry 3 lần, fallback đồng bộ khi Redis lỗi,
  idempotent theo unique `(alertId, recipientId)`).
- **Thông báo realtime**: Server-Sent Events `GET /api/notifications/stream` (auth cookie,
  heartbeat 25s) — web tự reconnect + refresh token; polling 120s làm lưới an toàn.
- **Thống kê**: tổng quan, tỷ lệ đạt/trượt/cấm thi theo lớp học phần, theo bộ môn.
- **Excel I/O**: import/export sinh viên + bảng điểm; file chứa cột PII cấm bị từ chối;
  mọi thao tác ghi audit log; rate limit riêng.
- **Quản trị**: tạo tài khoản, gán vai trò, khóa/mở khóa, cấp mật khẩu tạm (không có luồng
  reset mật khẩu qua email).
- **Email**: ADMIN cấu hình SMTP tại Hệ thống → Cấu hình email (`/admin/mail`), gửi mail thử
  trước khi lưu; chưa cấu hình thì dùng `SMTP_*` trong env (dev: MailHog :8025). Cần
  `SETTINGS_ENCRYPTION_KEY` (32 byte hex) để lưu mật khẩu SMTP; đổi khoá phải nhập lại.

## Làm việc với Claude Code

- `CLAUDE.md` — quy ước dự án: 4 rule bảo mật bắt buộc, guard chain, bảng định tuyến skill.
- `.claude/skills/design-taste/` — design system FPT (token, hierarchy, states, data-viz)
  cho mọi công việc UI.
- `.claude/skills/gitnexus/` + index GitNexus (chạy `gitnexus analyze` khi code đổi lớn) —
  knowledge graph để tra cứu kiến trúc, impact analysis trước khi sửa symbol.

## Kiểm thử

```bash
pnpm test                          # unit tests (jest)
pnpm --filter @fcare/api test:e2e  # e2e (cần Postgres đang chạy)
pnpm lint && pnpm typecheck && pnpm build
```

### Kiểm thử E2E

```bash
pnpm --filter @fcare/web test:e2e                        # cả 3 trình duyệt
pnpm --filter @fcare/web test:e2e -- --project=chromium  # nhanh, một trình duyệt
pnpm --filter @fcare/web test:e2e:ui                     # chế độ gỡ lỗi có giao diện
```

E2E cần Postgres + Redis đang chạy và DB đã seed. Đặt `E2E_BASE_URL` để chạy với
server có sẵn thay vì để Playwright tự khởi động `pnpm dev` (khi đó nhớ đặt cả
`E2E_API_URL` nếu API không nằm ở `http://localhost:3001`). Tài khoản dùng trong
test lấy từ `E2E_ADMIN_CODE` / `E2E_ADMIN_PASSWORD`, mặc định là tài khoản demo
`admin` / `Fcare@123`.

Bộ test dùng chung một DB dev và các luồng phụ thuộc nhau theo thứ tự import, nên
`playwright.config.ts` chạy `workers: 1`, `fullyParallel: false` — đừng bật song song.

Global setup sinh hai file `.xlsx` phái sinh vào `apps/web/e2e/.artifacts/` (đã
gitignore) từ file nguồn trong `docs/`: một bản **đã xoá ô PII** cho các luồng
import thành công, một bản gắn nhãn bộ môn lạ để kiểm cảnh báo "chưa có ánh xạ".
File nguồn giữ nguyên email và được dùng cho test chứng minh RULE 1 từ chối cả file.

Bộ 3 file đầu kỳ trong `docs/tailieu/` được dùng THẲNG bản gốc (đã kiểm: không có
email/SĐT/CCCD ở sheet nào) — xem `apps/web/e2e/term-import-flow.spec.ts`. Thiếu
bất kỳ file nguồn nào thì global setup dừng ngay với thông báo tên file.

### Thứ tự import bắt buộc

**File phân công GV (một file, 3 sheet — tick chung được, hệ thống tự sắp thứ tự):**

1. Danh mục môn học → 2. Danh sách giảng viên → 3. Lịch và phân công lớp.
   Sau đó là 4. Bảng điểm (file gradebook riêng).

**Bộ file nhà trường gửi đầu mỗi kỳ (`docs/tailieu/`) — ba file vật lý khác nhau,
mỗi loại phải tải riêng một lần, KHÔNG tick chung:**

1. `Danh_sach_lop_*.xlsx` → **Đầu kỳ 1/3 — Danh sách lớp**: tạo lớp học phần kèm
   giảng viên, block, ca học, phòng, ngày bắt đầu. Mã lớp học phần được ghép từ
   cặp *(Tên lớp, Mã môn)* vì riêng "Tên lớp" không duy nhất.
2. `DSSV lớp môn *.xlsx` → **Đầu kỳ 2/3 — Sinh viên lớp môn**: tạo hồ sơ sinh viên
   và ghi danh vào lớp học phần. Dòng nào chưa có lớp học phần tương ứng sẽ bị bỏ
   qua chứ không tự tạo lớp (lớp tạo ở bước này sẽ thiếu giảng viên, ca, phòng).
3. `LHCT *.xlsx` → **Đầu kỳ 3/3 — Điểm và chuyên cần**: ghi điểm tổng kết, kết quả,
   cấm thi và chuyên cần (`absentSessions` / `totalSessions` + `attendanceRate`)
   vào ghi danh đã có. Các dòng của lớp thi lại cuối kỳ (`TL_EOS test_*`) được bỏ
   qua kèm cảnh báo ở bản xem trước — đó không phải lớp trong kế hoạch giảng dạy.

Ô "Học kỳ" phải điền đúng kỳ của bộ file (ví dụ `SU26`): lớp học phần được tra
theo cặp *(mã lớp, học kỳ)*, điền lệch kỳ thì bước 2/3 và 3/3 bỏ qua toàn bộ dòng.

Chạy sai thứ tự sẽ khiến nhiều dòng bị bỏ qua vì môn học, giảng viên hoặc lớp học
phần chưa tồn tại.

## Nguyên tắc bảo mật dữ liệu (bắt buộc)

Theo tài liệu "Cơ sở dữ liệu và cơ chế bảo mật thông tin trong ứng dụng FCare":

- **CẤM lưu/hiển thị** CCCD/CMND, số điện thoại, email, địa chỉ của sinh viên và nhân viên/giảng viên.
  - Schema không có các trường này; `PiiGuardInterceptor` lọc mọi key khớp mẫu khỏi response;
    import Excel từ chối file chứa cột cấm.
- Giảng viên chỉ quản lý sinh viên thuộc bộ môn của mình (`deptFilter` ở mọi query).
- Chỉ Trưởng bộ môn, Cán bộ Đào tạo, Cán bộ CTSV (và admin) được import/export Excel.
- Đăng nhập phải ký cam kết không chia sẻ dữ liệu (consent gate — chặn toàn bộ API tới khi ký).
- Chống CSRF bằng custom header cho cookie-auth; helmet; rate limiting toàn cục; audit log.
# Fcare
