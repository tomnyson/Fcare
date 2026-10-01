-- AlterTable: gốc link "Xem chi tiết trên FCare" trong email; null → WEB_BASE_URL/WEB_ORIGIN.
ALTER TABLE "mail_settings" ADD COLUMN "public_web_url" TEXT;
