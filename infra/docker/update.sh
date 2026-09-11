#!/usr/bin/env bash
#
# Cập nhật FCare trên máy chủ: dump DB → git pull → build lại image → chờ khoẻ.
#
#   cd /www/wwwroot/fcare/infra/docker && ./update.sh
#
# Thứ tự CỐ Ý: dump TRƯỚC khi pull. Migration của Prisma là forward-only, nên
# bản dump là đường lui duy nhất — mà muốn lui thì phải có bản dump của schema
# CŨ, chụp trước khi `migrate` chạy.
#
# Script tự thoát ở lỗi đầu tiên và KHÔNG tự rollback: rollback đụng dữ liệu
# thật nên phải do người quyết định. Khi hỏng, script in sẵn lệnh cần chạy.
#
# Cờ:
#   --no-backup     bỏ qua bước dump (chỉ dùng khi vừa dump tay xong)
#   --force         build lại kể cả khi không có commit mới
#   --no-pull       chỉ build lại mã nguồn đang có, không chạm git
#   --branch=NAME   checkout + pull đúng nhánh này (CI/CD gitflow dùng cờ này)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.production"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
BACKUP_DIR="${FCARE_BACKUP_DIR:-/www/backup}"
BACKUP_KEEP_DAYS="${FCARE_BACKUP_KEEP_DAYS:-14}"
HEALTH_RETRIES="${FCARE_HEALTH_RETRIES:-40}"
HEALTH_DELAY="${FCARE_HEALTH_DELAY:-5}"

do_backup=1
do_pull=1
force=0
branch_override=''
for arg in "$@"; do
  case "$arg" in
    --no-backup) do_backup=0 ;;
    --no-pull) do_pull=0 ;;
    --force) force=1 ;;
    --branch=*) branch_override="${arg#*=}" ;;
    -h | --help)
      sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Cờ không hiểu: $arg (xem ./update.sh --help)" >&2
      exit 2
      ;;
  esac
done

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() {
  printf '\n\033[1;31mLỖI: %s\033[0m\n' "$*" >&2
  exit 1
}

compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

# Đọc một biến từ .env.production mà KHÔNG `source` nó: file này chứa mật khẩu
# và secret, `source` một chuỗi có $(...) là chạy luôn lệnh đó.
env_value() {
  local key="$1" line
  line="$(grep -m1 -E "^[[:space:]]*${key}=" "$ENV_FILE" || true)"
  line="${line#*=}"
  line="${line%\"}"
  line="${line#\"}"
  line="${line%\'}"
  line="${line#\'}"
  printf '%s' "$line"
}

# --- Tiền kiểm ---------------------------------------------------------------

command -v docker >/dev/null || die "Chưa cài docker."
docker compose version >/dev/null 2>&1 || die "Chưa cài plugin docker compose."
[ -f "$ENV_FILE" ] || die "Thiếu $ENV_FILE — copy từ env.production.sample rồi điền secret."
[ -f "$COMPOSE_FILE" ] || die "Thiếu $COMPOSE_FILE."

POSTGRES_USER="$(env_value POSTGRES_USER)"
POSTGRES_DB="$(env_value POSTGRES_DB)"
[ -n "$POSTGRES_USER" ] && [ -n "$POSTGRES_DB" ] ||
  die "$ENV_FILE thiếu POSTGRES_USER hoặc POSTGRES_DB."

cd "$REPO_DIR"

if [ "$do_pull" -eq 1 ]; then
  git rev-parse --git-dir >/dev/null 2>&1 || die "$REPO_DIR không phải git repo."
  # Sửa file tay trên máy chủ rồi pull đè là mất luôn phần sửa đó mà không ai
  # biết. Dừng lại để người vận hành tự quyết.
  if [ -n "$(git status --porcelain)" ]; then
    git status --short
    die "Thư mục làm việc đang bẩn. Commit, stash hoặc khôi phục trước khi cập nhật."
  fi
fi

# --- 1. Dump DB --------------------------------------------------------------

backup_path=''
if [ "$do_backup" -eq 1 ]; then
  log "Dump cơ sở dữ liệu trước khi đổi mã nguồn"
  if [ -z "$(compose ps -q postgres 2>/dev/null)" ]; then
    echo "Postgres chưa chạy — bỏ qua dump (lần triển khai đầu tiên)."
  else
    mkdir -p "$BACKUP_DIR"
    backup_path="$BACKUP_DIR/fcare-truoc-deploy-$(date +%Y%m%d-%H%M%S).dump"
    # -T: không cấp TTY, nếu không `pg_dump` ghi thẳng ra terminal thay vì file.
    compose exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" >"$backup_path" ||
      die "Dump thất bại — DỪNG, không cập nhật khi chưa có đường lui."
    [ -s "$backup_path" ] || die "Bản dump rỗng: $backup_path"
    echo "Đã lưu: $backup_path ($(du -h "$backup_path" | cut -f1))"
    find "$BACKUP_DIR" -name 'fcare-*.dump' -mtime "+$BACKUP_KEEP_DAYS" -delete 2>/dev/null || true
  fi
fi

# --- 2. Lấy mã nguồn mới -----------------------------------------------------

previous_commit="$(git rev-parse --short HEAD 2>/dev/null || echo 'không rõ')"
if [ "$do_pull" -eq 1 ]; then
  log "Lấy mã nguồn mới"
  branch="${branch_override:-$(git rev-parse --abbrev-ref HEAD)}"
  git fetch --prune origin "$branch"
  # CI truyền --branch để máy chủ luôn ở đúng nhánh của môi trường (gitflow:
  # develop → staging, main → production), kể cả khi ai đó checkout tay sang
  # nhánh khác để xem code.
  if [ "$(git rev-parse --abbrev-ref HEAD)" != "$branch" ]; then
    echo "Chuyển nhánh: $(git rev-parse --abbrev-ref HEAD) → $branch"
    git checkout "$branch"
  fi
  git pull --ff-only origin "$branch"
  new_commit="$(git rev-parse --short HEAD)"
  if [ "$new_commit" = "$previous_commit" ] && [ "$force" -eq 0 ]; then
    log "Không có commit mới ($previous_commit). Không cần build lại."
    echo "Muốn build lại bằng mọi giá: ./update.sh --force"
    exit 0
  fi
  echo "$previous_commit → $new_commit"
  git --no-pager log --oneline "$previous_commit..HEAD" 2>/dev/null || true
fi

# --- 3. Build + khởi động lại ------------------------------------------------

log "Build image và khởi động lại stack"
# `migrate` chạy `prisma migrate deploy` rồi thoát; `api` chỉ lên khi nó thành
# công, nên không có chuyện app chạy trên schema cũ.
compose up -d --build

# --- 4. Nghiệm thu -----------------------------------------------------------

log "Chờ API khoẻ"
for attempt in $(seq 1 "$HEALTH_RETRIES"); do
  if curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:3001/api/health; then
    echo "API khoẻ sau ${attempt} lần thử."
    api_ok=1
    break
  fi
  sleep "$HEALTH_DELAY"
done

if [ "${api_ok:-0}" -ne 1 ]; then
  compose logs --tail=60 migrate api >&2 || true
  printf '\n\033[1;31mAPI không khoẻ sau %ss.\033[0m\n' "$((HEALTH_RETRIES * HEALTH_DELAY))" >&2
  cat >&2 <<ROLLBACK

Cách lui về bản cũ:
  cd $REPO_DIR && git checkout $previous_commit
  cd $SCRIPT_DIR && docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
ROLLBACK
  if [ -n "$backup_path" ]; then
    cat >&2 <<ROLLBACK_DB
Nếu migration đã đổi schema, khôi phục dữ liệu từ bản dump vừa tạo:
  docker compose --env-file .env.production -f docker-compose.prod.yml cp \\
    $backup_path postgres:/tmp/rollback.dump
  docker compose --env-file .env.production -f docker-compose.prod.yml exec postgres \\
    pg_restore -U $POSTGRES_USER -d $POSTGRES_DB --clean --if-exists /tmp/rollback.dump
ROLLBACK_DB
  fi
  exit 1
fi

if ! curl -fsS -o /dev/null --max-time 10 http://127.0.0.1:3000; then
  echo "Cảnh báo: web ở 127.0.0.1:3000 chưa trả lời. Xem: docker compose logs web" >&2
fi

log "Xong"
compose ps
echo
echo "Dọn image cũ khi rảnh đĩa: docker image prune -f"
