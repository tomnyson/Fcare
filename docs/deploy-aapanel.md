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
nano .env.production      # điền PUBLIC_WEB_ORIGIN, mật khẩu Postgres, JWT, DEEPSEEK_API_KEY
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
}
```

Lưu → aaPanel tự `nginx -t && reload`.

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

Chạy E2E trỏ vào server thật (từ máy dev):

```bash
E2E_BASE_URL=https://fcare.example.com E2E_API_URL=https://fcare.example.com \
  pnpm --filter @fcare/web exec playwright test --project=chromium
```

## 7. Vận hành

**Cập nhật phiên bản**

```bash
cd /www/wwwroot/fcare && git pull
cd infra/docker
docker compose --env-file .env.production -f docker-compose.prod.yml exec postgres \
  pg_dump -U fcare -Fc fcare > /root/backup-truoc-deploy.dump   # luôn dump trước
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Migration của Prisma là forward-only: rollback = khôi phục dump vừa tạo rồi
`git checkout` lại tag cũ và build lại.

**Backup**: aaPanel → Cron → Shell Script chạy hằng ngày, giữ 14 bản và đẩy về
remote storage:

```bash
cd /www/wwwroot/fcare/infra/docker
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U fcare -Fc fcare > /www/backup/fcare-$(date +\%F).dump
find /www/backup -name 'fcare-*.dump' -mtime +14 -delete
```

**Log & giám sát**

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f --tail=200 api
```

aaPanel → Monitor: bật cảnh báo RAM > 85% và disk > 80%.

## 8. Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| Container api restart liên tục, log `Cannot find module '/app/dist/main'` | Dùng image cũ trước bản vá | Build lại; đường dẫn đúng là `dist/src/main.js` |
| `PrismaClientInitializationError` … `libssl` | Image thiếu openssl | Build lại (Dockerfile đã `apk add openssl`) |
| Web trắng trang, console lỗi `localhost:3001` | Image web build thiếu `NEXT_PUBLIC_API_URL` | Build lại web với `--build-arg`/`PUBLIC_WEB_ORIGIN` đúng |
| Đăng nhập xong lại về trang login | Cookie `Secure` mà site chạy HTTP | Bật Force HTTPS |
| Mutation trả 403 `CSRF` | Nginx lọc mất `X-Requested-With` | Thêm `proxy_set_header X-Requested-With` |
| Thông báo chỉ về sau ~2 phút | Nginx buffer SSE | Thêm block `location /api/notifications/stream` |
| `Prisma Client did not initialize yet` | Image build thiếu bước generate trong `/out` | Build lại bằng Dockerfile hiện tại |
| `exec format error` khi start container | Image build cho kiến trúc khác (arm64 vs amd64) | Build lại với `--platform linux/amd64` |
