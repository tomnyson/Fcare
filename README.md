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

- Node >= 20, pnpm >= 10
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
- **Quản trị**: tạo tài khoản, gán vai trò, khóa/mở khóa, cấp mật khẩu tạm (không có email
  trong hệ thống → không có luồng reset qua email).

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

### Thứ tự import bắt buộc

1. Danh mục môn học → 2. Danh sách giảng viên → 3. Lịch và phân công lớp → 4. Bảng điểm.

Chạy sai thứ tự sẽ khiến nhiều dòng bị bỏ qua vì môn học hoặc giảng viên chưa tồn tại.

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
