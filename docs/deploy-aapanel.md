# Triển khai FCare lên aaPanel

Mô hình: **Docker Compose chạy toàn bộ app**, aaPanel chỉ làm **Nginx reverse
proxy + SSL + backup**. Một tên miền duy nhất, API nằm ở `/api`.

```
Internet ──443──► Nginx (aaPanel) ─┬─ /      → 127.0.0.1:3000  web (Next standalone)
                                   └─ /api/  → 127.0.0.1:3001  api (NestJS)
                                                   │
                                        postgres + redis (chỉ loopback)
```

Vì sao một domain: cookie đăng nhập là `httpOnly` + `sameSite=lax` +
`secure` khi `NODE_ENV=production` (`apps/api/src/modules/auth/auth.controller.ts`).
Cùng site thì không phải đụng vào code auth.

---

## 1. Chuẩn bị máy chủ

Cấu hình tối thiểu: **4 GB RAM · 2 vCPU · 40 GB SSD**.

1. aaPanel → App Store → cài **Docker** và **Docker Compose**.
2. aaPanel → Security (Firewall): chỉ mở **80**, **443**, cổng SSH và cổng panel.
   Đóng 3000 / 3001 / 5432 / 6379 — stack đã bind loopback nhưng vẫn nên chặn.
3. Trỏ bản ghi A của `fcare.example.com` về IP máy chủ.
4. aaPanel → Website → Add site với đúng tên miền đó (không cần PHP).
5. aaPanel → site → SSL → Let's Encrypt → bật **Force HTTPS**.

### RAM khi build

`next build` từng bị OOM trên máy 8 GB. Ưu tiên **build ở máy dev / CI rồi push
image lên registry**, máy chủ chỉ `docker compose pull`. Nếu buộc phải build tại
chỗ, bật swap trước:

```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### Kiến trúc CPU

Query engine của Prisma được nhúng theo kiến trúc lúc build. Build trên Mac
Apple Silicon rồi đẩy sang VPS x86 là container chết ngay. Khi build ở máy dev,
luôn chỉ định nền tảng của máy chủ:

```bash
docker buildx build --platform linux/amd64 -f infra/docker/Dockerfile.api --target runtime -t <registry>/fcare-api:<tag> .
docker buildx build --platform linux/amd64 -f infra/docker/Dockerfile.web \
  --build-arg NEXT_PUBLIC_API_URL=https://fcare.example.com/api -t <registry>/fcare-web:<tag> .
```

## 2. Lấy mã nguồn và cấu hình

```bash
cd /www/wwwroot && git clone <repo> fcare && cd fcare/infra/docker
cp env.production.sample .env.production
openssl rand -base64 32   # chạy 2 lần cho JWT_ACCESS_SECRET và JWT_REFRESH_SECRET
openssl rand -hex 32      # SETTINGS_ENCRYPTION_KEY (mã hoá mật khẩu SMTP lưu DB)
nano .env.production      # điền PUBLIC_WEB_ORIGIN, mật khẩu Postgres, JWT, DEEPSEEK_API_KEY, SETTINGS_ENCRYPTION_KEY
chmod 600 .env.production
```

`PUBLIC_WEB_ORIGIN` phải là origin thật (`https://fcare.example.com`, không có
`/` cuối). Giá trị này vừa là `WEB_ORIGIN` cho CORS của API, vừa được **inline
vào bundle web lúc build** — đổi domain là phải build lại image web.

## 3. Khởi động stack

```bash
cd /www/wwwroot/fcare/infra/docker
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Thứ tự tự động: `postgres`/`redis` healthy → `migrate` chạy `prisma migrate
deploy` rồi thoát → `api` lên → `web` lên. Nếu `migrate` fail, `api` sẽ không
khởi động (đúng ý đồ: không cho app chạy trên schema cũ).

```bash
curl -f http://127.0.0.1:3001/api/health   # phải trả 200
```

## 4. Nginx trên aaPanel

aaPanel → Website → site → **Config**. Chèn vào trong `server { … }`, **đặt
trước** các `location` mặc định của panel:

```nginx
# Import Excel tối đa 10 MB (apps/api/src/modules/imports/imports.controller.ts).
client_max_body_size 12m;

# SSE thông báo realtime — Nginx buffer là mất realtime mà không báo lỗi,
# web sẽ âm thầm rơi về polling 120s.
location /api/notifications/stream {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding off;
    proxy_read_timeout 3600s;
}

location /api/ {
    # Giữ nguyên tiền tố /api: Nest đã setGlobalPrefix('api').
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # CsrfGuard yêu cầu header này ở mọi mutation dùng cookie — không được lọc.
    proxy_set_header X-Requested-With $http_x_requested_with;
    proxy_read_timeout 120s;
}

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    # KHÔNG để Nginx cache HTML của Next.js. Trang tĩnh (/login, /) trả
    # `Cache-Control: s-maxage=31536000` + `Vary: Accept-Encoding`; bật cache
    # (nút "Cache" trong Reverse proxy của aaPanel, hoặc proxy_cache cache_one)
    # là Nginx giữ HTML của build CŨ theo từng biến thể Accept-Encoding suốt
    # 1 năm → sau mỗi lần deploy, Chrome vẫn nhận trang cũ trỏ tới chunk JS đã
    # không còn (Google login "lúc có lúc không" chính là lỗi này).
    proxy_cache off;
    proxy_no_cache 1;
    proxy_cache_bypass 1;
}
```

Lưu → aaPanel tự `nginx -t && reload`.

**Nếu site được tạo bằng Reverse proxy của aaPanel:** vào Website → site →
Reverse proxy → tắt **Cache**. Nếu trước đó đã bật, xoá cache đang giữ rồi
reload, nếu không HTML cũ vẫn được trả tới khi hết hạn:

```bash
nginx -T 2>/dev/null | grep -n 'proxy_cache_path\|proxy_cache '   # tìm thư mục cache
rm -rf /www/server/nginx/proxy_cache_dir/*                          # đường dẫn mặc định của aaPanel
nginx -s reload
```

Kiểm tra sau khi sửa — hai lệnh phải trả cùng một `etag`:

```bash
curl -sI https://<domain>/login | grep -i etag
curl -sI -H 'Accept-Encoding: gzip, deflate, br, zstd' https://<domain>/login | grep -i etag
```

Cân nhắc chặn `/api/docs` (Swagger) khỏi Internet nếu không cần cho nghiệm thu:

```nginx
location /api/docs { allow <IP-cua-ban>; deny all; proxy_pass http://127.0.0.1:3001; }
```

## 5. Nạp dữ liệu từ máy dev

Trên máy dev (Postgres dev đang ở cổng 5433):

```bash
pg_dump -h localhost -p 5433 -U fcare -Fc fcare > fcare-$(date +%F).dump
scp fcare-*.dump root@<server>:/root/
```

Trên máy chủ — schema đã do `migrate` tạo, chỉ nạp phần dữ liệu:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml cp \
  /root/fcare-*.dump postgres:/tmp/fcare.dump
docker compose --env-file .env.production -f docker-compose.prod.yml exec postgres \
  pg_restore -U fcare -d fcare --data-only --disable-triggers /tmp/fcare.dump
docker compose --env-file .env.production -f docker-compose.prod.yml exec postgres \
  rm /tmp/fcare.dump
```

Kiểm tra:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
  run --rm migrate pnpm exec prisma migrate status   # phải báo up to date
```

**Sau khi restore, bắt buộc:**

- Đổi mật khẩu mọi tài khoản mang từ dev sang (hoặc xoá tài khoản demo).
- Không mang theo secret dev: JWT trên production là chuỗi mới, mọi phiên cũ tự
  hết hiệu lực.

## 6. Nghiệm thu

| Hạng mục | Cách kiểm tra | Kỳ vọng |
|---|---|---|
| Sức khoẻ API | `curl https://fcare.example.com/api/health` | 200 |
| Đăng nhập | Đăng nhập rồi ký cam kết | Vào được `/dashboard` |
| Cookie | DevTools → Application → Cookies | `fcare_access` có `HttpOnly` + `Secure` |
| Scope giảng viên | Đăng nhập LECTURER | Không thấy sinh viên lớp mình không dạy |
| Chặn PII | Xem response `/students` | Không có CCCD / điện thoại / email / địa chỉ |
| Nhận xét → cảnh báo | Lưu nhận xét, chờ AI | Hiện hộp "Gửi cảnh báo cho các bên liên quan?", **không tự gửi** |
| Nội dung gửi | Chọn "Tôi tự soạn nội dung" | Có xem trước lịch sử chăm sóc gửi kèm |
| SSE | Mở tab thông báo, để một máy khác gửi cảnh báo | Thông báo về trong vài giây |
| Import Excel | Tài khoản TRAINING_OFFICER upload file thật | Chạy được; LECTURER bị chặn |
| Email | ADMIN → Hệ thống → Cấu hình email → "Gửi mail thử" | Mail tới hộp thư `@fpt.edu.vn` đã nhập; thẻ trạng thái ghi lần thử gần nhất |

Chạy E2E trỏ vào server thật (từ máy dev):

```bash
E2E_BASE_URL=https://fcare.example.com E2E_API_URL=https://fcare.example.com \
  pnpm --filter @fcare/web exec playwright test --project=chromium
```

## 7. Vận hành

**Cấu hình email (SMTP)**

1. `SETTINGS_ENCRYPTION_KEY` (32 byte hex, sinh bằng `openssl rand -hex 32`) đặt
   trong `.env.production` của API — **không** đưa vào git. Thiếu khoá thì API vẫn
   chạy nhưng ADMIN không lưu được mật khẩu SMTP (lỗi `MAIL_ENCRYPTION_KEY_MISSING`).
2. Sau khi deploy, ADMIN vào **Hệ thống → Cấu hình email** (`/admin/mail`), nhập
   SMTP của trường (host, cổng, TLS, tài khoản, mật khẩu, người gửi), bấm
   **Gửi mail thử** tới một hộp thư `@fpt.edu.vn` rồi mới **Lưu**. Cấu hình áp
   dụng ngay, không cần restart. Chưa cấu hình → API dùng `SMTP_*` trong env.
3. Đổi hoặc mất `SETTINGS_ENCRYPTION_KEY` = mọi mật khẩu SMTP đã lưu không giải mã
   được; ADMIN phải nhập lại mật khẩu ở `/admin/mail`. Xoay khoá thì làm đúng thứ
   tự: đổi env → restart API → nhập lại mật khẩu.

**Cập nhật phiên bản**

```bash
cd /www/wwwroot/fcare/infra/docker && ./update.sh
```

Script làm đúng thứ tự bắt buộc: **dump DB → git pull → build lại → chờ
`/api/health` xanh**. Dump đứng trước vì migration của Prisma là forward-only —
đường lui duy nhất là bản dump của schema CŨ, chụp trước khi `migrate` chạy.
Hỏng ở bước nào script cũng dừng và in sẵn lệnh rollback; nó KHÔNG tự rollback
vì việc đó đụng dữ liệu thật.

```bash
./update.sh --help          # danh sách cờ
./update.sh --force         # build lại kể cả khi không có commit mới
./update.sh --branch=main   # ép máy chủ về đúng nhánh (CI/CD dùng cờ này)
```

## 8. Tự động triển khai (CI/CD qua SSH)

`.github/workflows/deploy.yml` chạy theo gitflow: push `develop` → môi trường
**staging**, push `main` → **production**. CI (lint · typecheck · test · build)
phải xanh thì mới SSH vào máy chủ chạy `update.sh`. Máy chủ tự `git pull`, CI
không đẩy file hay image nào lên — không cần registry, không mở thêm cổng.

Chuẩn bị cho **mỗi** môi trường ở Settings → Environments:

| Loại | Tên | Giá trị |
|---|---|---|
| Secret | `SSH_HOST` | IP hoặc tên miền máy chủ |
| Secret | `SSH_USER` | user deploy (thuộc nhóm `docker`) |
| Secret | `SSH_PASSWORD` | mật khẩu SSH của user deploy |
| Secret | `SSH_KNOWN_HOSTS` | `ssh-keyscan -p <cổng> <host>` |
| Variable | `SSH_PORT` | cổng SSH (mặc định 22) |
| Variable | `DEPLOY_PATH` | `/www/wwwroot/fcare` |
| Variable | `PUBLIC_URL` | `https://fcare.example.com` |

Trên máy chủ: repo clone sẵn ở `DEPLOY_PATH` với **deploy key chỉ đọc** (không
dùng tài khoản cá nhân), `.env.production` đã điền secret và `chmod 600` — file
này không bao giờ đi qua CI.

Workflow đăng nhập bằng **mật khẩu** (`sshpass -e`, mật khẩu truyền qua biến
`SSHPASS` nên không lộ ra dòng lệnh trên runner). `SSH_KNOWN_HOSTS` vì thế là
bắt buộc và workflow chạy `StrictHostKeyChecking=yes`: với xác thực mật khẩu,
ghim vân tay máy chủ là chốt chặn duy nhất — dùng `StrictHostKeyChecking=no` là
gửi thẳng mật khẩu cho bất kỳ máy nào giả danh host.

Mật khẩu yếu hơn khoá (không giới hạn được quyền, đi qua CI mỗi lần deploy):
khi máy chủ bật được khoá, đổi `SSH_PASSWORD` → `SSH_PRIVATE_KEY` rồi thay
`sshpass -e ssh` bằng `ssh -i ~/.ssh/deploy_key -o IdentitiesOnly=yes -o
BatchMode=yes`. Trong lúc còn dùng mật khẩu: đặt mật khẩu dài, bật fail2ban cho
`sshd` và cân nhắc đổi cổng SSH — runner của GitHub không có IP cố định nên
không whitelist IP được. Bật **Required reviewers** cho environment `production`
nếu muốn duyệt tay trước khi lên bản chính thức.

**Backup**: `infra/docker/backup.sh` dump Postgres (`-Fc`, khôi phục bằng
`pg_restore` như mục 5), đọc user/db từ `.env.production`, ghi file tạm rồi mới
đổi tên, `chmod 600`, giữ 14 ngày. aaPanel → Cron → **Shell Script**, chạy hằng
ngày lúc 02:00 (trước giờ deploy), nội dung:

```bash
cd /www/wwwroot/fcare/infra/docker && ./backup.sh
```

Chạy tay lần đầu để chắc cron có quyền docker và thư mục ghi được:

```bash
cd /www/wwwroot/fcare/infra/docker && ./backup.sh && ls -l /www/backup
```

Đổi thư mục hoặc số ngày giữ: `./backup.sh --dir=/mnt/backup --keep-days=30`
(hoặc đặt `FCARE_BACKUP_DIR`, `FCARE_BACKUP_KEEP_DAYS` trong cron). Bản dump chứa
dữ liệu sinh viên thật — đẩy về remote storage bằng cron riêng, đừng để duy nhất
trên máy chủ.

**Log & giám sát**

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f --tail=200 api
```

aaPanel → Monitor: bật cảnh báo RAM > 85% và disk > 80%.

## 9. Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| Container api restart liên tục, log `Cannot find module '/app/dist/main'` | Dùng image cũ trước bản vá | Build lại; đường dẫn đúng là `dist/src/main.js` |
| `PrismaClientInitializationError` … `libssl` | Image thiếu openssl | Build lại (Dockerfile đã `apk add openssl`) |
| Web trắng trang, console lỗi `localhost:3001` | Image web build thiếu `NEXT_PUBLIC_API_URL` | Build lại web với `--build-arg`/`PUBLIC_WEB_ORIGIN` đúng |
| Đăng nhập xong lại về trang login | Cookie `Secure` mà site chạy HTTP | Bật Force HTTPS |
| Đăng nhập báo "Vui lòng tick ô Tôi không phải người máy" nhưng không thấy ô tick | API có `RECAPTCHA_SECRET_KEY` nhưng image web build khi `RECAPTCHA_SITE_KEY` còn trống (site key inline lúc build) | Điền `RECAPTCHA_SITE_KEY` vào `.env.production` rồi `./update.sh --force`; kiểm tra `curl -s <site>/login \| grep -o 'recaptchaEnabled[^,]*'` phải là `true` |
| Mutation trả 403 `CSRF` | Nginx lọc mất `X-Requested-With` | Thêm `proxy_set_header X-Requested-With` |
| Thông báo chỉ về sau ~2 phút | Nginx buffer SSE | Thêm block `location /api/notifications/stream` |
| `Prisma Client did not initialize yet` | Image build thiếu bước generate trong `/out` | Build lại bằng Dockerfile hiện tại |
| `exec format error` khi start container | Image build cho kiến trúc khác (arm64 vs amd64) | Build lại với `--platform linux/amd64` |
| Job Deploy đỏ ở bước SSH, `Host key verification failed` | `SSH_KNOWN_HOSTS` sai hoặc máy chủ đổi khoá | Chạy lại `ssh-keyscan -p <cổng> <host>` rồi cập nhật secret |
| Job Deploy đỏ ở bước SSH, `Permission denied, please try again` | `SSH_PASSWORD` sai, hoặc `sshd` tắt `PasswordAuthentication` | Thử tay `ssh user@host`; nếu cần bật lại `PasswordAuthentication yes` trong `/etc/ssh/sshd_config` |
| `update.sh` dừng vì "Thư mục làm việc đang bẩn" | Có người sửa file trực tiếp trên máy chủ | `git status` xem sửa gì, rồi `git checkout -- <file>` hoặc commit lại |
