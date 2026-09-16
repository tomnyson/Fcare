#!/usr/bin/env bash
#
# Dump toàn bộ CSDL Postgres của FCare ra file — dành cho cron của aaPanel.
#
#   aaPanel → Cron → Shell Script, chạy hằng ngày (ví dụ 02:00):
#     cd /www/wwwroot/fcare/infra/docker && ./backup.sh
#
# Dump định dạng custom (-Fc) để khôi phục bằng `pg_restore` như hướng dẫn
# trong docs/deploy-aapanel.md. File được ghi ra tên tạm rồi mới đổi tên,
# nên cron bị ngắt giữa chừng không để lại bản dump "trông như hợp lệ".
# Bản dump chứa dữ liệu sinh viên thật → chmod 600, nên đẩy về remote storage.
#
# Cờ:
#   --dir=PATH        thư mục chứa bản dump (mặc định $FCARE_BACKUP_DIR hoặc /www/backup)
#   --keep-days=N     xoá bản cũ hơn N ngày (mặc định $FCARE_BACKUP_KEEP_DAYS hoặc 14)
#   --compose=FILE    file compose khác (mặc định docker-compose.prod.yml)
#   --env-file=FILE   file env khác (mặc định .env.production)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.production"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
BACKUP_DIR="${FCARE_BACKUP_DIR:-/www/backup}"
KEEP_DAYS="${FCARE_BACKUP_KEEP_DAYS:-14}"

for arg in "$@"; do
  case "$arg" in
    --dir=*) BACKUP_DIR="${arg#*=}" ;;
    --keep-days=*) KEEP_DAYS="${arg#*=}" ;;
    --compose=*) COMPOSE_FILE="${arg#*=}" ;;
    --env-file=*) ENV_FILE="${arg#*=}" ;;
    -h | --help)
      sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Cờ không hiểu: $arg (xem ./backup.sh --help)" >&2
      exit 2
      ;;
  esac
done

log() { printf '\033[1;34m==> %s\033[0m\n' "$*"; }
die() {
  printf '\033[1;31mLỖI backup: %s\033[0m\n' "$*" >&2
  exit 1
}

compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

# Đọc một biến từ file env mà KHÔNG `source` nó: file chứa mật khẩu và secret,
# `source` một chuỗi có $(...) là chạy luôn lệnh đó.
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
[ -f "$ENV_FILE" ] || die "Thiếu $ENV_FILE."
[ -f "$COMPOSE_FILE" ] || die "Thiếu $COMPOSE_FILE."
[[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] || die "--keep-days phải là số nguyên, nhận: $KEEP_DAYS"

POSTGRES_USER="$(env_value POSTGRES_USER)"
POSTGRES_DB="$(env_value POSTGRES_DB)"
[ -n "$POSTGRES_USER" ] && [ -n "$POSTGRES_DB" ] ||
  die "$ENV_FILE thiếu POSTGRES_USER hoặc POSTGRES_DB."

[ -n "$(compose ps -q --status running postgres 2>/dev/null)" ] ||
  die "Container postgres không chạy — không có gì để dump."

mkdir -p "$BACKUP_DIR"
[ -w "$BACKUP_DIR" ] || die "Không ghi được vào $BACKUP_DIR."

# --- Dump --------------------------------------------------------------------

stamp="$(date +%Y%m%d-%H%M%S)"
final_path="$BACKUP_DIR/fcare-$stamp.dump"
tmp_path="$final_path.part"
trap 'rm -f "$tmp_path"' EXIT

log "Dump $POSTGRES_DB → $final_path"
# -T: không cấp TTY (cron không có TTY, và có TTY thì pg_dump ghi ra terminal).
compose exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" >"$tmp_path" ||
  die "pg_dump thất bại."
[ -s "$tmp_path" ] || die "Bản dump rỗng."

chmod 600 "$tmp_path"
mv "$tmp_path" "$final_path"
trap - EXIT
echo "Đã lưu: $final_path ($(du -h "$final_path" | cut -f1))"

# --- Dọn bản cũ --------------------------------------------------------------

removed="$(find "$BACKUP_DIR" -maxdepth 1 -name 'fcare-*.dump' -mtime "+$KEEP_DAYS" -print -delete 2>/dev/null || true)"
if [ -n "$removed" ]; then
  log "Đã xoá bản cũ hơn $KEEP_DAYS ngày:"
  echo "$removed"
fi

# Dọn luôn file .part bỏ dở của lần chạy trước (bị kill giữa chừng).
find "$BACKUP_DIR" -maxdepth 1 -name 'fcare-*.dump.part' -mmin +120 -delete 2>/dev/null || true

log "Xong — $(find "$BACKUP_DIR" -maxdepth 1 -name 'fcare-*.dump' | wc -l | tr -d ' ') bản đang giữ, tổng $(du -sh "$BACKUP_DIR" | cut -f1)"
