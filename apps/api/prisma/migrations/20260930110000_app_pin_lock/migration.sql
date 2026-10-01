-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "lockedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "pinFailedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pinHash" TEXT;

-- CreateTable
CREATE TABLE "security_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "idle_lock_minutes" INTEGER NOT NULL DEFAULT 15,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_settings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "security_settings" ADD CONSTRAINT "security_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

