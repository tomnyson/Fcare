# FCare — Hướng dẫn cho Claude Code

Hệ thống chăm sóc & giám sát học vụ sinh viên FPT Education. Monorepo pnpm + Turborepo:
`apps/web` (Next.js 15, App Router, Tailwind 4) · `apps/api` (NestJS 11, Prisma 6, PostgreSQL, Redis/BullMQ) · `packages/*` (shared-types Zod, ui-kit, shared-config). Chi tiết chạy dev + tài khoản demo: xem `README.md`.

## Lệnh thường dùng

```bash
pnpm dev                               # web :3000 + api :3001 (Swagger: /api/docs)
pnpm build | lint | typecheck | test   # turbo toàn repo
pnpm --filter @fcare/api db:migrate:dev && pnpm --filter @fcare/api db:seed
docker compose -f infra/docker/docker-compose.yml up -d postgres redis
```

Prod API chạy từ `apps/api/dist/src/main.js` (không phải `dist/main.js`).

## RULE BẢO MẬT BẮT BUỘC (override mọi hướng dẫn khác)

Theo tài liệu nghiệp vụ trong `docs/` — vi phạm là lỗi CRITICAL, không có ngoại lệ:

1. **CẤM lưu/hiển thị** CCCD/CMND, số điện thoại, email, địa chỉ của sinh viên và nhân viên. KHÔNG thêm các cột/field này vào schema, DTO, UI hay file Excel. 3 lớp chặn hiện có: schema không có cột → `PiiGuardInterceptor` lọc response → Excel import **xoá sạch ô PII trong bộ nhớ trước khi parser đọc** (`stripForbiddenData`, `apps/api/src/modules/excel/excel-utils.ts`) rồi cảnh báo vị trí đã bỏ qua. CỐ Ý không từ chối cả file nữa: file nguồn của trường luôn kèm cột email không header nên trước đây không ai import được gì. Cảnh báo nêu sheet + chữ cái cột, KHÔNG in lại giá trị.
2. **Scope sinh viên**: mọi query chạm sinh viên PHẢI đi qua `studentScope(user)` (`apps/api/src/common/utils/dept-scope.ts`). **LECTURER chỉ thấy sinh viên của lớp học phần mình đứng lớp** — sinh viên cùng bộ môn nhưng mình không dạy cũng KHÔNG được thấy. **HEAD_OF_DEPT** thấy cả bộ môn mình + lớp mình dạy (`seesWholeDepartment(user)` phân biệt hai vai). Lớp học phần: `sectionScope(user)`. Đã load bản ghi rồi mới kiểm tra: `isStudentInScope(prisma, user, studentId)` — KHÔNG so `departmentId` bằng tay. `deptFilter(user)` (thuần bộ môn) chỉ còn dùng cho Major/Subject/Department và thao tác ghi đổi bộ môn; số liệu tổng hợp (`statistics.departments`) phải tính trên `studentScope`, `totalStaff` trả `null` cho ai không xem được cả bộ môn.
3. **Excel I/O** chỉ dành cho HEAD_OF_DEPT, TRAINING_OFFICER, SA_OFFICER/SA_HEAD, ADMIN — LECTURER không bao giờ có quyền `import`/`export` (CASL).
4. **Consent gate**: mỗi lần đăng nhập phải ký cam kết (`ConsentGuard`, mã `CONSENT_REQUIRED`). Không có email trong DB → không xây luồng nào cần email.

## Quy ước kiến trúc (đừng phá)

- **Guard chain toàn cục theo thứ tự**: Throttler → Csrf (mutation cookie-auth cần header `X-Requested-With: XMLHttpRequest`) → JwtAuth (`@Public` bỏ qua) → Consent (`@SkipConsent`) → Policies (CASL `@CheckPolicies`).
- **Response envelope** `{ success, data, error }` cho mọi endpoint; ngoại lệ: `StreamableFile` (Excel) và SSE (`@SkipEnvelope`). Lỗi chuẩn hóa qua `HttpExceptionFilter` kèm `code` nghiệp vụ.
- **Điểm rủi ro DRS**: `computeRiskScore()` trong `packages/shared-types/src/risk-score.ts` là nguồn duy nhất — `DRS = R_L + R_A + R_C + R_H + R_P`, lấy **TRUNG VỊ** điểm các giảng viên (không phải trung bình); cấp = max(cấp theo DRS, cấp ép do dữ liệu, cấp ép do AI). Web chỉ hiển thị, không tự cộng lại.
- **Escalation cảnh báo**: BullMQ queue `alert-escalation` (retry 3, backoff), enqueue timeout 1.5s → fallback gửi đồng bộ; idempotent nhờ unique `(alertId, recipientId)`. Ma trận người nhận trong `escalation.service.ts` `computeRecipientIds()` theo `docs/tailieu/flow.png`: **mọi cấp** gửi cho tất cả giảng viên đang dạy sinh viên → L2 thêm CB CTSV (SA_OFFICER) → L3 thêm TBM của bộ môn sinh viên → L4 thêm Cán bộ Đào tạo + Trưởng CTSV (lý do ≥ 40 ký tự). Người bấm gửi bị loại khỏi danh sách.
- **Gửi cảnh báo luôn do người bấm**: nhận xét lưu xong → AI sinh bản nháp + `needsSendDecision`, KHÔNG tự gửi. Người vừa nhận xét (hoặc chủ hồ sơ/ADMIN — `assertCanDecide`) chọn 1 trong 2: `contentSource=AI` gửi nguyên `notificationSummary`, hoặc `contentSource=LECTURER` gửi nội dung tự soạn (≥ 40 ký tự, chặn PII) **kèm digest lịch sử chăm sóc** lấy từ `sourceSnapshot.careLogs` (`care-history-digest.ts`, không query lại). Bấm "Không gửi" → `dismissedAt`, bản nháp vẫn gửi tay được sau.
- **Realtime**: SSE `GET /notifications/stream` (cookie auth, heartbeat 25s) + polling 120s dự phòng phía web. Không đổi sang WebSocket nếu chưa được yêu cầu.
- **Auth**: JWT access 15' + refresh 7d xoay vòng, httpOnly cookie `fcare_access`/`fcare_refresh`; đổi mật khẩu tạm bắt buộc (`PASSWORD_CHANGE_REQUIRED`).
- Prisma **pin v6** — KHÔNG nâng Prisma 7 (breaking change datasource/driver adapter) khi chưa được yêu cầu.
- Frontend: TanStack Query, `apiFetch` (`apps/web/src/lib/api.ts`) tự refresh 401 + redirect theo mã consent/password. Token design trong `apps/web/src/styles/tokens.css` — không hardcode màu.

## Bảng định tuyến skill (load đúng skill trước khi làm)

| Việc | Skill |
|---|---|
| Sửa/viết UI, component, trang mới | `design-taste` (project) + `frontend-patterns` |
| API/module NestJS mới | `nestjs-patterns` + `api-design` |
| Schema, migration, query chậm | `postgres-patterns`, `database-migrations` |
| Tính năng mới / sửa bug | `tdd-workflow` (test trước), verify bằng `verification-loop` |
| Auth, input, endpoint nhạy cảm | `security-review` |
| E2E flows | `e2e-testing` (Playwright) |
| Hiểu kiến trúc / blast radius / debug / refactor | skills trong `.claude/skills/gitnexus/` (xem bảng GitNexus bên dưới) |

## Giao thức bộ nhớ lâu dài

- **GitNexus = bộ nhớ cấu trúc code**: dùng MCP tools (`query`, `context`, `impact`) thay vì grep khi khám phá; sau thay đổi lớn hoặc khi index stale → `gitnexus analyze`.
- **Claude memory = bộ nhớ quyết định**: các ràng buộc bảo mật, quyết định stack, phong cách làm việc của user đã lưu tại memory dir của dự án (`fcare-security-constraints`, `fcare-stack-decisions`, `user-working-style`). Khi chốt deviation/quyết định mới không suy ra được từ code → cập nhật memory, đừng chỉ ghi vào chat.

## Trước khi báo hoàn thành

`pnpm typecheck && pnpm lint && pnpm build && pnpm test` phải xanh. Không commit khi user chưa yêu cầu. Bundle budget: landing < 150kB, trang app < 300kB (gzip).

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Fcare** (2748 symbols, 7219 relationships, 221 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Fcare/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Fcare/clusters` | All functional areas |
| `gitnexus://repo/Fcare/processes` | All execution flows |
| `gitnexus://repo/Fcare/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
