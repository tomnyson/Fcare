-- CreateEnum
CREATE TYPE "SystemErrorLevel" AS ENUM ('ERROR', 'FATAL');

-- CreateEnum
CREATE TYPE "SystemErrorSource" AS ENUM ('HTTP', 'QUEUE', 'PROCESS', 'APP');

-- CreateTable
CREATE TABLE "system_error_groups" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "week_start" TIMESTAMP(3) NOT NULL,
    "level" "SystemErrorLevel" NOT NULL,
    "source" "SystemErrorSource" NOT NULL,
    "context" TEXT,
    "route" TEXT,
    "status_code" INTEGER,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_error_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "webhook_url_encrypted" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "retention_days" INTEGER NOT NULL DEFAULT 30,
    "last_report_at" TIMESTAMP(3),
    "last_report_ok" BOOLEAN,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monitoring_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_error_groups_week_start_count_idx" ON "system_error_groups"("week_start", "count");

-- CreateIndex
CREATE INDEX "system_error_groups_last_seen_at_idx" ON "system_error_groups"("last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "system_error_groups_fingerprint_week_start_key" ON "system_error_groups"("fingerprint", "week_start");

-- AddForeignKey
ALTER TABLE "monitoring_settings" ADD CONSTRAINT "monitoring_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

